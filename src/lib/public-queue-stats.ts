import type { SupabaseClient } from "@supabase/supabase-js";
import { isActiveQueueStatus } from "./constants";
import { countAusentes, countFinalizadasNoDiaOperacional } from "./queue-counters";
import { isEntryClosedToday } from "./queue-day";
import type { QueueEntry } from "./types";

export interface PublicQueueStats {
  aguardando: number;
  ausentes: number;
  finalizados: number;
}

export function computePublicQueueStats(
  operationalEntries: QueueEntry[],
  finalizadosHoje: QueueEntry[]
): PublicQueueStats {
  return {
    aguardando: operationalEntries.filter((e) => isActiveQueueStatus(e.status)).length,
    ausentes: countAusentes(operationalEntries),
    finalizados: countFinalizadasNoDiaOperacional(finalizadosHoje),
  };
}

/** Contagem de finalizados do dia — só campos mínimos para stats. */
export async function loadFinalizadosHojeForStats(
  admin: SupabaseClient
): Promise<QueueEntry[]> {
  const { data, error } = await admin
    .from("queue_entries")
    .select("id, status, finished_at, updated_at, created_at")
    .is("deleted_at", null)
    .eq("status", "finalizado")
    .order("finished_at", { ascending: false, nullsFirst: false })
    .limit(300);

  if (error) return [];

  return ((data ?? []) as QueueEntry[]).filter((entry) => isEntryClosedToday(entry));
}
