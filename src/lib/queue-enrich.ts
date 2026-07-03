import type { SupabaseClient } from "@supabase/supabase-js";
import { mergePrioritiesIntoEntries, readPriorityMap } from "./queue-priorities";
import {
  enrichQueueWithMinutaMetadata,
  overlayAutoPrevisoes,
  readExpedicaoDiaria,
  readPrevisaoManualIds,
} from "./minuta-metadata-db";
import { computePrevisoesDescarregamento } from "./minuta-intelligence";
import { sortQueueEntries } from "./queue";
import { filterOperationalPanelEntries, shouldShowInQueuePanel } from "./constants";
import { getTodayStartISO } from "./queue-day";
import type { QueueEntry } from "./types";

export type EnrichedQueueEntry = QueueEntry & {
  prioridade_automatica?: boolean;
  previsao_automatica?: boolean;
};

const ENRICH_CACHE_MS = 10_000;

type EnrichCacheSlot = {
  expiresAt: number;
  data?: EnrichedQueueEntry[];
  inFlight?: Promise<EnrichedQueueEntry[]>;
};

const enrichCache = new Map<string, EnrichCacheSlot>();

function enrichCacheKey(includeInactive: boolean): string {
  return includeInactive ? "all" : "operational";
}

/** Carrega fila do dia, enriquece com metadata, prioridade e previsão automática. */
export async function loadEnrichedQueueEntries(
  admin: SupabaseClient,
  options?: { includeInactive?: boolean; bypassCache?: boolean }
): Promise<EnrichedQueueEntry[]> {
  const includeInactive = options?.includeInactive ?? false;
  const bypassCache = options?.bypassCache ?? false;
  const cacheKey = enrichCacheKey(includeInactive);

  if (!bypassCache) {
    const slot = enrichCache.get(cacheKey);
    if (slot) {
      if (slot.data && slot.expiresAt > Date.now()) {
        return slot.data;
      }
      if (slot.inFlight) {
        return slot.inFlight;
      }
    }
  }

  const inFlight = loadEnrichedQueueEntriesUncached(admin, includeInactive)
    .then((data) => {
      enrichCache.set(cacheKey, {
        expiresAt: Date.now() + ENRICH_CACHE_MS,
        data,
      });
      return data;
    })
    .catch((err) => {
      const current = enrichCache.get(cacheKey);
      if (current?.inFlight === inFlight) {
        enrichCache.delete(cacheKey);
      }
      throw err;
    });

  enrichCache.set(cacheKey, {
    expiresAt: Date.now() + ENRICH_CACHE_MS,
    inFlight,
  });

  return inFlight;
}

export function invalidateEnrichedQueueCache(): void {
  enrichCache.clear();
}

async function loadEnrichedQueueEntriesUncached(
  admin: SupabaseClient,
  includeInactive: boolean
): Promise<EnrichedQueueEntry[]> {
  const { data, error } = await admin
    .from("queue_entries")
    .select("*")
    .is("deleted_at", null)
    .gte("created_at", getTodayStartISO())
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as QueueEntry[];

  const [priorityMap, expedicao, manualPrevisaoIds] = await Promise.all([
    readPriorityMap(admin),
    readExpedicaoDiaria(admin),
    readPrevisaoManualIds(admin),
  ]);

  const merged = mergePrioritiesIntoEntries(rows, priorityMap);
  const enriched = await enrichQueueWithMinutaMetadata(admin, merged, {
    priorityMap,
  });
  const sortedEnriched = sortQueueEntries(enriched);

  const withPrevisao =
    expedicao && expedicao.motos > 0
      ? overlayAutoPrevisoes(
          sortedEnriched,
          computePrevisoesDescarregamento(sortedEnriched, expedicao.motos),
          manualPrevisaoIds
        )
      : sortedEnriched;

  const filtered = includeInactive
    ? withPrevisao.filter((e) => shouldShowInQueuePanel(e, true))
    : filterOperationalPanelEntries(withPrevisao);

  return sortQueueEntries(filtered) as EnrichedQueueEntry[];
}

/** Fila básica do dia (sem metadata) — fallback quando enriquecimento falha. */
export async function loadBasicOperationalQueue(
  admin: SupabaseClient
): Promise<QueueEntry[]> {
  const { data, error } = await admin
    .from("queue_entries")
    .select("*")
    .is("deleted_at", null)
    .gte("created_at", getTodayStartISO())
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return filterOperationalPanelEntries((data ?? []) as QueueEntry[]);
}
