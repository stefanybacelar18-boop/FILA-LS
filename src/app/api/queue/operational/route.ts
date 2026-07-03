import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  invalidateEnrichedQueueCache,
  loadBasicOperationalQueue,
  loadEnrichedQueueEntries,
} from "@/lib/queue-enrich";
import { withTimeout } from "@/lib/async-timeout";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const LOAD_TIMEOUT_MS = 18_000;

/** Fila operacional enriquecida — público (TV, tracker) e motorista autenticado. */
export async function GET() {
  try {
    const admin = createAdminClient();
    let entries;
    let fallback = false;

    try {
      entries = await withTimeout(
        loadEnrichedQueueEntries(admin),
        LOAD_TIMEOUT_MS,
        "Carregar fila"
      );
    } catch (err) {
      invalidateEnrichedQueueCache();
      console.warn("[queue/operational] enrich fallback:", err);
      entries = await withTimeout(
        loadBasicOperationalQueue(admin),
        10_000,
        "Carregar fila básica"
      );
      fallback = true;
    }

    return NextResponse.json({
      data: entries,
      meta: { scope: "operational_active", fallback },
    });
  } catch (err) {
    invalidateEnrichedQueueCache();
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
