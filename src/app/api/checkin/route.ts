import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isWithinGeofence } from "@/lib/geofence";
import { canCheckInAgain, hasActiveCheckIn } from "@/lib/checkin-rules";
import { validateCheckInBody } from "@/lib/checkin-validation";
import { COOLDOWN_MESSAGE, DEFAULT_GEOFENCE, skipCheckinLimits } from "@/lib/constants";
import { insertQueueEntry } from "@/lib/queue-db";
import { applyAutoPriorityForMinuta, recalculateQueuePrevisoes } from "@/lib/minuta-metadata-db";
import type { GeofenceConfig, Profile, QueueEntry } from "@/lib/types";

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const validated = validateCheckInBody(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const form = validated.data;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "motorista") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { data: geofenceSetting } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "geofence")
    .single();

  const geofence = (geofenceSetting?.value as GeofenceConfig) ?? DEFAULT_GEOFENCE;
  const skipGeofence = process.env.NEXT_PUBLIC_SKIP_GEOFENCE === "true";

  if (
    !skipGeofence &&
    (!form.checkin_lat ||
      !form.checkin_lng ||
      !isWithinGeofence(form.checkin_lat, form.checkin_lng, geofence))
  ) {
    return NextResponse.json(
      { error: "outside_geofence", message: geofence.name },
      { status: 403 }
    );
  }

  const { data: existingEntries } = await supabase
    .from("queue_entries")
    .select("id, status, token, created_at, driver_user_id, placa_cavalo")
    .or(`driver_user_id.eq.${user.id},placa_cavalo.eq.${form.placa_cavalo}`)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(15);

  const entries = (existingEntries ?? []) as QueueEntry[];

  if (!skipCheckinLimits() && !profile.checkin_liberado) {
    const active = hasActiveCheckIn(entries);
    if (active) {
      return NextResponse.json(
        { error: "active_checkin", token: active.token },
        { status: 409 }
      );
    }
  }

  const lastEntry = entries[0] ?? null;
  const cooldown = canCheckInAgain(lastEntry, profile as Profile);
  if (!cooldown.allowed) {
    return NextResponse.json(
      { error: "cooldown", message: COOLDOWN_MESSAGE },
      { status: 403 }
    );
  }

  const placaDisplay = form.placa_cavalo;
  const ip = getClientIp(request);

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "insert_failed", detail: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." },
      { status: 500 }
    );
  }

  const { data: entry, error: insertError } = await insertQueueEntry(admin, {
    driver_user_id: user.id,
    minuta: form.minuta,
    nome: form.nome,
    cpf: "",
    telefone: form.telefone.replace(/\D/g, ""),
    placa: placaDisplay,
    placa_cavalo: form.placa_cavalo,
    placa_carreta: form.placa_carreta,
    placa_segunda_carreta: form.placa_segunda_carreta || null,
    tipo_veiculo: form.tipo_veiculo,
    transportadora: form.transportadora,
    empresa: form.empresa,
    tipo_carga: form.tipo_carga,
    retorno_racks_vazios: form.retorno_racks_vazios,
    observacoes: form.observacoes || null,
    checkin_lat: form.checkin_lat,
    checkin_lng: form.checkin_lng,
    device_id: form.device_id,
    user_agent: form.user_agent,
    ip_address: ip,
    status: "aguardando_descarregamento",
  });

  if (insertError || !entry) {
    return NextResponse.json(
      { error: "insert_failed", detail: insertError },
      { status: 500 }
    );
  }

  await admin.from("checkin_audit_log").insert({
    driver_user_id: user.id,
    queue_entry_id: entry.id,
    action: "checkin",
    device_id: form.device_id,
    ip_address: ip,
    user_agent: form.user_agent,
    lat: form.checkin_lat,
    lng: form.checkin_lng,
    metadata: { minuta: form.minuta, placa_cavalo: form.placa_cavalo },
  });

  if (profile.checkin_liberado) {
    await admin
      .from("profiles")
      .update({ checkin_liberado: false })
      .eq("id", user.id);
  }

  await applyAutoPriorityForMinuta(admin, entry.id, form.minuta).catch(() => {});
  await recalculateQueuePrevisoes(admin).catch(() => {});

  return NextResponse.json({ token: entry.token });
}
