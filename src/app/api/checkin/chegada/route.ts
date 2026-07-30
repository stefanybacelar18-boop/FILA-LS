import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isWithinGeofence, normalizeGeofenceConfig } from "@/lib/geofence";
import { DEFAULT_GEOFENCE, isEmViagemStatus } from "@/lib/constants";
import { skipGeofence } from "@/lib/dev-flags";
import { rateLimitAllow, rateLimitRetryAfterSec } from "@/lib/rate-limit";
import { writeQueueStatus } from "@/lib/queue-db";
import {
  readPrevisaoManualIds,
  recalculateQueuePrevisoes,
} from "@/lib/minuta-metadata-db";
import { invalidateEnrichedQueueCache } from "@/lib/queue-enrich";
import type { QueueEntry } from "@/lib/types";

function parseChegadaBody(body: unknown): {
  chegada_lat: number;
  chegada_lng: number;
  device_id: string;
  user_agent?: string;
} | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const lat = Number(o.chegada_lat);
  const lng = Number(o.chegada_lng);
  const deviceId = typeof o.device_id === "string" ? o.device_id.trim() : "";
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !deviceId) return null;
  const userAgent = typeof o.user_agent === "string" ? o.user_agent.slice(0, 500) : undefined;
  return { chegada_lat: lat, chegada_lng: lng, device_id: deviceId, user_agent: userAgent };
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Confirma chegada no pátio do PAD — entra na fila de descarregamento. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const rateKey = `chegada:${user.id}:${ip}`;
  if (!rateLimitAllow(rateKey, 12, 60_000)) {
    return NextResponse.json(
      { error: "rate_limit", message: "Muitas tentativas. Aguarde um momento." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimitRetryAfterSec(rateKey, 60_000)) },
      }
    );
  }

  const raw = await request.json().catch(() => null);
  const parsed = parseChegadaBody(raw);
  if (!parsed) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const { chegada_lat, chegada_lng, device_id, user_agent } = parsed;

  const [{ data: profile }, { data: geofenceSetting }, { data: entriesRaw }] =
    await Promise.all([
      supabase.from("profiles").select("role").eq("id", user.id).single(),
      supabase.from("settings").select("value").eq("key", "geofence").single(),
      supabase
        .from("queue_entries")
        .select("id, status, token, previsao_descarregamento, created_at")
        .eq("driver_user_id", user.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  if (!profile || profile.role !== "motorista") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const emViagem = (entriesRaw as QueueEntry[] | null)?.find((e) =>
    isEmViagemStatus(e.status)
  );
  if (!emViagem) {
    return NextResponse.json(
      { error: "sem_viagem", message: "Nenhuma viagem em andamento para confirmar chegada." },
      { status: 404 }
    );
  }

  const geofence = normalizeGeofenceConfig(geofenceSetting?.value ?? DEFAULT_GEOFENCE);

  if (!skipGeofence() && !isWithinGeofence(chegada_lat, chegada_lng, geofence)) {
    return NextResponse.json(
      { error: "outside_geofence", message: geofence.name },
      { status: 403 }
    );
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  const chegadaAt = new Date().toISOString();
  const result = await writeQueueStatus(admin, emViagem.id, "aguardando_descarregamento", {
    chegada_pad_at: chegadaAt,
    chegada_lat,
    chegada_lng,
  });

  if (result.error) {
    return NextResponse.json(
      { error: "update_failed", detail: result.error },
      { status: 500 }
    );
  }

  await admin.from("checkin_audit_log").insert({
    driver_user_id: user.id,
    queue_entry_id: emViagem.id,
    action: "chegada_pad",
    device_id,
    ip_address: ip,
    user_agent: user_agent ?? null,
    lat: chegada_lat,
    lng: chegada_lng,
    metadata: { token: emViagem.token },
  });

  invalidateEnrichedQueueCache();

  const manualIds = await readPrevisaoManualIds(admin);
  manualIds.add(emViagem.id);
  void recalculateQueuePrevisoes(admin, { manualIds }).catch(() => {});

  return NextResponse.json({
    token: emViagem.token,
    chegada_pad_at: chegadaAt,
    previsao_descarregamento: emViagem.previsao_descarregamento,
  });
}
