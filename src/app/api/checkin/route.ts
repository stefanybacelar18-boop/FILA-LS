import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canCheckInAgain, hasActiveCheckIn } from "@/lib/checkin-rules";
import { validateCheckInBody } from "@/lib/checkin-validation";
import {
  ACTIVE_QUEUE_DB_STATUSES,
  COOLDOWN_MESSAGE,
  DEFAULT_GEOFENCE,
  isActiveQueueStatus,
  skipCheckinLimits,
} from "@/lib/constants";
import { rateLimitAllow, rateLimitRetryAfterSec } from "@/lib/rate-limit";
import { insertQueueEntry } from "@/lib/queue-db";
import { applyAutoPriorityForMinuta } from "@/lib/minuta-metadata-db";
import { invalidateEnrichedQueueCache } from "@/lib/queue-enrich";
import { forecastDescarregamentoFromCheckIn } from "@/lib/trip-forecast";
import { normalizeGeofenceConfig } from "@/lib/geofence";
import type { Profile, QueueEntry } from "@/lib/types";

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const rateKey = `checkin:${user.id}:${ip}`;
  if (!rateLimitAllow(rateKey, 8, 60_000)) {
    return NextResponse.json(
      { error: "rate_limit", message: "Muitas tentativas. Aguarde um momento." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimitRetryAfterSec(rateKey, 60_000)) },
      }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }
  const validated = validateCheckInBody(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const form = validated.data;

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      {
        error: "insert_failed",
        ...(isProd()
          ? {}
          : { detail: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." }),
      },
      { status: 500 }
    );
  }

  const [{ data: profile }, { data: geofenceSetting }, { data: myEntriesRaw }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("role, checkin_liberado")
        .eq("id", user.id)
        .single(),
      supabase.from("settings").select("value").eq("key", "geofence").single(),
      supabase
        .from("queue_entries")
        .select("id, status, token, created_at, driver_user_id")
        .eq("driver_user_id", user.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(15),
    ]);

  if (!profile || profile.role !== "motorista") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const geofence = normalizeGeofenceConfig(
    geofenceSetting?.value ?? DEFAULT_GEOFENCE
  );

  // Check-in remoto (Belém): GPS do pátio não é obrigatório; grava posição se enviada.
  void geofence;

  if (!skipCheckinLimits()) {
    const [{ data: activePlacaRows }, { data: viagemPlacaRows }] = await Promise.all([
      admin
        .from("queue_entries")
        .select("id, driver_user_id, status")
        .eq("placa_cavalo", form.placa_cavalo)
        .is("deleted_at", null)
        .in("status", [...ACTIVE_QUEUE_DB_STATUSES])
        .limit(5),
      admin
        .from("queue_entries")
        .select("id, driver_user_id, status")
        .eq("placa_cavalo", form.placa_cavalo)
        .is("deleted_at", null)
        .eq("status", "em_viagem")
        .limit(5),
    ]);

    const placaRows = [...(activePlacaRows ?? []), ...(viagemPlacaRows ?? [])];

    const placaBlocked = placaRows.find(
      (row) =>
        row.driver_user_id !== user.id &&
        (isActiveQueueStatus(String(row.status)) || String(row.status) === "em_viagem")
    );

    if (placaBlocked) {
      return NextResponse.json(
        {
          error: "placa_em_uso",
          message: "Esta placa já possui um check-in ativo na fila.",
        },
        { status: 409 }
      );
    }
  }

  const myEntries = (myEntriesRaw ?? []) as QueueEntry[];

  if (!skipCheckinLimits() && !profile.checkin_liberado) {
    const active = hasActiveCheckIn(myEntries);
    if (active) {
      return NextResponse.json(
        { error: "active_checkin", token: active.token },
        { status: 409 }
      );
    }
  }

  const lastEntry = myEntries[0] ?? null;
  const cooldown = canCheckInAgain(lastEntry, profile as Profile);
  if (!skipCheckinLimits() && !cooldown.allowed) {
    return NextResponse.json(
      { error: "cooldown", message: COOLDOWN_MESSAGE },
      { status: 403 }
    );
  }

  const placaDisplay = form.placa_cavalo;
  const previsaoDescarregamento = forecastDescarregamentoFromCheckIn();

  const { data: entry, error: insertError, migrationRequired } = await insertQueueEntry(admin, {
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
    checkin_lat: form.checkin_lat && form.checkin_lat !== 0 ? form.checkin_lat : null,
    checkin_lng: form.checkin_lng && form.checkin_lng !== 0 ? form.checkin_lng : null,
    device_id: form.device_id,
    user_agent: form.user_agent,
    ip_address: ip,
    status: "em_viagem",
    previsao_descarregamento: previsaoDescarregamento,
  });

  if (insertError || !entry) {
    if (migrationRequired) {
      return NextResponse.json(
        {
          error: "migration_required",
          message:
            "O banco de dados ainda não foi atualizado para o check-in de viagem. No Supabase → SQL Editor, execute o arquivo supabase/migracao-em-viagem.sql e tente novamente.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        error: "insert_failed",
        message: "Não foi possível registrar o check-in. Tente novamente ou avise a operação.",
        ...(isProd() ? {} : { detail: insertError }),
      },
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
  invalidateEnrichedQueueCache();

  let warning: string | undefined;
  const minutaKey = form.minuta.trim();
  if (minutaKey) {
    const { data: metaRow } = await admin
      .from("minuta_metadata")
      .select("minuta")
      .eq("minuta", minutaKey)
      .maybeSingle();
    if (!metaRow) {
      const { count: metadataCount } = await admin
        .from("minuta_metadata")
        .select("*", { count: "exact", head: true });
      if ((metadataCount ?? 0) > 0) {
        warning = "minuta_nao_importada";
      }
    }
  }

  return NextResponse.json({ token: entry.token, warning });
}
