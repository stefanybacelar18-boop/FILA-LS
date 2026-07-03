import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeQueueStatus } from "./constants";
import type { QueueEntry } from "./types";

const TERMINAL_STATUSES = ["finalizado", "ausente"] as const;

function enrichFromHistory(
  entries: QueueEntry[],
  historyMap: Map<string, string>
): QueueEntry[] {
  return entries.map((entry) => {
    if (entry.finished_at) return entry;

    const fromHistory = historyMap.get(entry.id);
    if (fromHistory) return { ...entry, finished_at: fromHistory };

    const status = normalizeQueueStatus(entry.status);
    if (status === "finalizado" || status === "ausente") {
      return { ...entry, finished_at: entry.updated_at };
    }

    return entry;
  });
}

/** Enriquece finished_at só para exibição — sem gravar no banco. */
export function enrichEntriesWithFinishedAtReadOnly(entries: QueueEntry[]): QueueEntry[] {
  return entries.map((entry) => {
    if (entry.finished_at) return entry;
    const status = normalizeQueueStatus(entry.status);
    if (status === "finalizado" || status === "ausente") {
      return { ...entry, finished_at: entry.updated_at };
    }
    return entry;
  });
}

/** Preenche finished_at a partir do queue_history (somente leitura). */
export async function enrichEntriesWithFinishedAt(
  admin: SupabaseClient,
  entries: QueueEntry[]
): Promise<QueueEntry[]> {
  const needsHistory = entries.filter(
    (e) =>
      !e.finished_at &&
      TERMINAL_STATUSES.includes(
        normalizeQueueStatus(e.status) as (typeof TERMINAL_STATUSES)[number]
      )
  );

  const historyMap = new Map<string, string>();

  if (needsHistory.length > 0) {
    const ids = needsHistory.map((e) => e.id);
    const { data: historyRows } = await admin
      .from("queue_history")
      .select("queue_entry_id, new_status, created_at")
      .in("queue_entry_id", ids)
      .in("new_status", [...TERMINAL_STATUSES])
      .order("created_at", { ascending: false });

    for (const row of historyRows ?? []) {
      if (!historyMap.has(row.queue_entry_id)) {
        historyMap.set(row.queue_entry_id, row.created_at);
      }
    }
  }

  return enrichFromHistory(entries, historyMap);
}
