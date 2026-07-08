import type { SupabaseClient } from "@supabase/supabase-js";
import type { QueueEntry } from "@/lib/types";
import { filterOperationalPanelEntries, OPERATIONAL_PANEL_DB_STATUSES } from "@/lib/constants";
import { sanitizeQueueEntries } from "@/lib/sanitize-queue-entry";

const FETCH_TIMEOUT_MS = 25_000;

function operationalQueueUrl(bypassCache = false): string {
  if (bypassCache) {
    return `/api/queue/operational?_=${Date.now()}`;
  }
  return "/api/queue/operational";
}

/** Fila operacional enriquecida via API (prioridade, minuta, previsão). */
export async function fetchEnrichedOperationalQueue(
  supabaseFallback?: SupabaseClient,
  options?: { bypassCache?: boolean }
): Promise<QueueEntry[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(operationalQueueUrl(options?.bypassCache), {
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

    return sanitizeQueueEntries(json.data ?? []);
  } catch (err) {
    console.warn("[fetchEnrichedOperationalQueue]", err);
    if (supabaseFallback) {
      return fetchActiveQueueToday(supabaseFallback);
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Leitura direta no Supabase (sem enriquecimento) — fila ativa até finalizar. */
export async function fetchActiveQueueToday(
  supabase: SupabaseClient
): Promise<QueueEntry[]> {
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "get_active_queue_summary"
  );

  if (!rpcError && rpcData != null) {
    return sanitizeQueueEntries(
      filterOperationalPanelEntries(rpcData as QueueEntry[])
    );
  }

  const { data, error } = await supabase
    .from("queue_entries")
    .select("*")
    .is("deleted_at", null)
    .in("status", [...OPERATIONAL_PANEL_DB_STATUSES])
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("[fetchActiveQueueToday]", error.message);
    return [];
  }

  return sanitizeQueueEntries(
    filterOperationalPanelEntries((data as QueueEntry[]) ?? [])
  );
}

/** Fila do dia via API autenticada (staff). */
export async function fetchStaffQueueToday(options?: {
  includeClosedToday?: boolean;
  bypassCache?: boolean;
}): Promise<{ data: QueueEntry[]; error?: string }> {
  const params = new URLSearchParams();
  if (options?.includeClosedToday !== false) {
    params.set("scope", "all");
  }
  if (options?.bypassCache) {
    params.set("_", String(Date.now()));
  }

  const query = params.toString();
  const res = await fetch(
    query ? `/api/queue/today?${query}` : "/api/queue/today",
    { cache: "no-store" }
  );
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    data?: QueueEntry[];
  };

  if (!res.ok) {
    return { data: [], error: json.error ?? "Erro ao carregar fila" };
  }

  return { data: sanitizeQueueEntries(json.data ?? []) };
}
