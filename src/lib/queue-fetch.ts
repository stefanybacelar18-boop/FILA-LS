import type { SupabaseClient } from "@supabase/supabase-js";
import type { QueueEntry } from "@/lib/types";
import { filterOperationalPanelEntries, ACTIVE_QUEUE_DB_STATUSES } from "@/lib/constants";

const FETCH_TIMEOUT_MS = 25_000;
let inFlight: Promise<QueueEntry[]> | null = null;

/** Fila operacional enriquecida via API (prioridade, minuta, previsão). */
export async function fetchEnrichedOperationalQueue(
  supabaseFallback?: SupabaseClient
): Promise<QueueEntry[]> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch("/api/queue/operational", {
        cache: "no-store",
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        data?: QueueEntry[];
      };

      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }

      return json.data ?? [];
    } catch (err) {
      console.warn("[fetchEnrichedOperationalQueue]", err);
      if (supabaseFallback) {
        return fetchActiveQueueToday(supabaseFallback);
      }
      return [];
    } finally {
      clearTimeout(timer);
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Leitura direta no Supabase (sem enriquecimento) — fila ativa até finalizar. */
export async function fetchActiveQueueToday(
  supabase: SupabaseClient
): Promise<QueueEntry[]> {
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "get_active_queue_summary"
  );

  if (!rpcError && rpcData != null) {
    return filterOperationalPanelEntries(rpcData as QueueEntry[]);
  }

  const { data, error } = await supabase
    .from("queue_entries")
    .select("*")
    .is("deleted_at", null)
    .in("status", [...ACTIVE_QUEUE_DB_STATUSES])
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("[fetchActiveQueueToday]", error.message);
    return [];
  }

  return filterOperationalPanelEntries((data as QueueEntry[]) ?? []);
}
