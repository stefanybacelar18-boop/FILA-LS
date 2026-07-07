import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildMetadataMap,
  computePrevisoesDescarregamento,
  EXPEDICAO_SETTINGS_KEY,
  formatMinutaCapacidadeAviso,
  mergeMetadataIntoEntries,
  normalizeEstoqueExpedicaoConfig,
  normalizeMinutaKey,
  shouldAutoPrioritize,
  type CapacityAllocation,
  type EstoqueExpedicaoConfig,
  type MinutaMetadata,
} from "./minuta-intelligence";
import type { QueueEntry } from "./types";
import { isActiveQueueStatus, ACTIVE_QUEUE_DB_STATUSES } from "./constants";
import {
  readPriorityMap,
  readDismissedAutoPriorityIds,
  saveEntryPrioridade,
} from "./queue-priorities";
import { getManausDateYmd } from "./queue-day";
import { sortQueueEntries } from "./queue";

export const PREVISAO_MANUAL_SETTINGS_KEY = "previsao_manual_ids";

type PrevisaoManualMap = Record<string, true>;

const METADATA_COLUMNS = "minuta,volume_motos,menor_vencimento,updated_at";

export type MinutaImportStats = {
  created: number;
  updated: number;
  unchanged: number;
  totalInFile: number;
  /** Novas + atualizadas (gravadas no banco). */
  upserted: number;
  error: string | null;
};

function minutaMetadataEquals(
  existing: Pick<MinutaMetadata, "volume_motos" | "menor_vencimento">,
  incoming: Pick<MinutaMetadata, "volume_motos" | "menor_vencimento">
): boolean {
  return (
    existing.volume_motos === incoming.volume_motos &&
    (existing.menor_vencimento ?? null) === (incoming.menor_vencimento ?? null)
  );
}

export async function readMinutaMetadataByKeys(
  supabase: SupabaseClient,
  keys: string[]
): Promise<Map<string, MinutaMetadata>> {
  const map = new Map<string, MinutaMetadata>();
  const unique = [...new Set(keys.filter((k) => k.length >= 2))];
  if (unique.length === 0) return map;

  const chunkSize = 100;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const slice = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("minuta_metadata")
      .select(METADATA_COLUMNS)
      .in("minuta", slice);

    if (error) {
      if (/minuta_metadata|does not exist|Could not find/i.test(error.message)) {
        return map;
      }
      throw new Error(error.message);
    }

    for (const row of data ?? []) {
      const meta = row as MinutaMetadata;
      map.set(meta.minuta, meta);
    }
  }

  return map;
}

export async function readPrevisaoManualIds(
  supabase: SupabaseClient
): Promise<Set<string>> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", PREVISAO_MANUAL_SETTINGS_KEY)
    .maybeSingle();

  if (!data?.value || typeof data.value !== "object") return new Set();
  return new Set(Object.keys(data.value as PrevisaoManualMap));
}

export async function setPrevisaoManual(
  supabase: SupabaseClient,
  entryId: string,
  manual: boolean
): Promise<void> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", PREVISAO_MANUAL_SETTINGS_KEY)
    .maybeSingle();

  const current =
    data?.value && typeof data.value === "object"
      ? { ...(data.value as PrevisaoManualMap) }
      : ({} as PrevisaoManualMap);

  if (manual) current[entryId] = true;
  else delete current[entryId];

  await supabase.from("settings").upsert(
    { key: PREVISAO_MANUAL_SETTINGS_KEY, value: current },
    { onConflict: "key" }
  );
}

function samePrevisaoDay(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return getManausDateYmd(new Date(a)) === getManausDateYmd(new Date(b));
}

/** Busca metadata só das minutas presentes na fila (rápido). */
export async function readMinutaMetadataForEntries(
  supabase: SupabaseClient,
  entries: QueueEntry[]
): Promise<MinutaMetadata[]> {
  const keys = [
    ...new Set(
      entries
        .map((e) => normalizeMinutaKey(e.minuta))
        .filter((k) => k.length >= 2)
    ),
  ];

  if (keys.length === 0) return [];

  const { data, error } = await supabase
    .from("minuta_metadata")
    .select(METADATA_COLUMNS)
    .in("minuta", keys);

  if (error) {
    if (/minuta_metadata|does not exist|Could not find/i.test(error.message)) {
      return [];
    }
    throw new Error(error.message);
  }

  return (data ?? []) as MinutaMetadata[];
}

export async function readAllMinutaMetadata(
  supabase: SupabaseClient
): Promise<MinutaMetadata[]> {
  const { data, error } = await supabase.from("minuta_metadata").select(METADATA_COLUMNS);

  if (error) {
    if (/minuta_metadata|does not exist|Could not find/i.test(error.message)) {
      return [];
    }
    throw new Error(error.message);
  }

  return (data ?? []) as MinutaMetadata[];
}

export async function countMinutaMetadata(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from("minuta_metadata")
    .select("*", { count: "exact", head: true });

  if (error) {
    if (/minuta_metadata|does not exist|Could not find/i.test(error.message)) return 0;
    throw new Error(error.message);
  }

  return count ?? 0;
}

/** Recalcula e grava previsões automáticas para a fila ativa de hoje. */
export async function recalculateQueuePrevisoes(
  supabase: SupabaseClient,
  prefetched?: {
    entries?: QueueEntry[];
    enriched?: ReturnType<typeof mergeMetadataIntoEntries<QueueEntry>>;
    expedicao?: EstoqueExpedicaoConfig | null;
    manualIds?: Set<string>;
  }
): Promise<number> {
  const expedicao = prefetched?.expedicao ?? (await readExpedicaoDiaria(supabase));
  if (!expedicao || expedicao.capacidade_estoque <= 0) return 0;

  let enriched = prefetched?.enriched;
  if (!enriched) {
    const rows =
      prefetched?.entries ??
      (
        await supabase
          .from("queue_entries")
          .select("*")
          .is("deleted_at", null)
          .in("status", [...ACTIVE_QUEUE_DB_STATUSES])
      ).data ??
      [];
    enriched = await enrichQueueWithMinutaMetadata(
      supabase,
      rows as QueueEntry[]
    );
  }

  const sorted = sortQueueEntries(enriched);
  const active = sorted.filter((e) => isActiveQueueStatus(e.status));
  const previsoes = computePrevisoesDescarregamento(active, expedicao);
  const manualIds = prefetched?.manualIds ?? (await readPrevisaoManualIds(supabase));

  const updates = active.filter((entry) => {
    if (manualIds.has(entry.id)) return false;
    if ((entry.volume_motos ?? 0) <= 0) return false;
    const auto = previsoes.get(entry.id) ?? null;
    return !samePrevisaoDay(entry.previsao_descarregamento, auto);
  });

  if (updates.length === 0) return 0;

  const results = await Promise.all(
    updates.map((entry) =>
      supabase
        .from("queue_entries")
        .update({ previsao_descarregamento: previsoes.get(entry.id) ?? null })
        .eq("id", entry.id)
    )
  );

  return results.filter((r) => !r.error).length;
}

export function overlayAutoPrevisoes<T extends QueueEntry>(
  entries: T[],
  previsoes: Map<string, string>,
  manualIds: ReadonlySet<string>,
  allocations?: Map<string, CapacityAllocation>
): (T & {
  previsao_automatica?: boolean;
  ultrapassa_capacidade?: boolean;
  empurrada_por_capacidade?: boolean;
  motos_com_espaco?: number;
  capacidade_aviso?: string | null;
})[] {
  return entries.map((entry) => {
    if (manualIds.has(entry.id) || (entry.volume_motos ?? 0) <= 0) {
      return { ...entry, previsao_automatica: false };
    }
    const auto = previsoes.get(entry.id);
    if (!auto) return { ...entry, previsao_automatica: false };

    const allocation = allocations?.get(entry.id);
    const ultrapassa = allocation?.ultrapassa_capacidade ?? false;
    const empurrada = allocation?.empurrada_por_capacidade ?? false;
    const motosComEspaco = allocation?.motos_com_espaco;
    const capacidadeAviso =
      allocation != null
        ? formatMinutaCapacidadeAviso(
            allocation.volume_motos,
            allocation.motos_com_espaco,
            allocation.ultrapassa_capacidade,
            allocation.empurrada_por_capacidade,
            allocation.vagas_no_dia_recusado
          )
        : null;

    return {
      ...entry,
      previsao_descarregamento: auto,
      previsao_automatica: true,
      ultrapassa_capacidade: ultrapassa,
      empurrada_por_capacidade: empurrada,
      motos_com_espaco: motosComEspaco,
      capacidade_aviso: capacidadeAviso,
    };
  });
}

export async function readExpedicaoDiaria(
  supabase: SupabaseClient
): Promise<EstoqueExpedicaoConfig | null> {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", EXPEDICAO_SETTINGS_KEY)
    .maybeSingle();

  if (error || !data?.value || typeof data.value !== "object") return null;
  return normalizeEstoqueExpedicaoConfig(data.value as Record<string, unknown>);
}

export async function saveExpedicaoDiaria(
  supabase: SupabaseClient,
  config: {
    capacidade_estoque: number;
    expedicao: number;
    motos_no_estoque?: number;
  }
): Promise<{ error: string | null }> {
  const capacidade_estoque = Math.max(0, Math.round(config.capacidade_estoque));
  const expedicao = Math.max(0, Math.round(config.expedicao));
  const motos_no_estoque = Math.max(0, capacidade_estoque - expedicao);

  const value: Record<string, unknown> = {
    capacidade_estoque,
    expedicao,
    motos_no_estoque,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("settings").upsert(
    {
      key: EXPEDICAO_SETTINGS_KEY,
      value,
    },
    { onConflict: "key" }
  );
  return { error: error?.message ?? null };
}

export async function enrichQueueWithMinutaMetadata(
  supabase: SupabaseClient,
  entries: QueueEntry[],
  prefetched?: { metadata?: MinutaMetadata[]; priorityMap?: Awaited<ReturnType<typeof readPriorityMap>> }
): Promise<ReturnType<typeof mergeMetadataIntoEntries<QueueEntry>>> {
  const [metadata, priorityMap, dismissedAutoIds] = await Promise.all([
    prefetched?.metadata ?? readMinutaMetadataForEntries(supabase, entries),
    prefetched?.priorityMap ?? readPriorityMap(supabase),
    readDismissedAutoPriorityIds(supabase),
  ]);

  const map = buildMetadataMap(metadata);
  const manualPriorityIds = new Set(
    Object.entries(priorityMap)
      .filter(([, enabled]) => enabled)
      .map(([id]) => id)
  );
  return mergeMetadataIntoEntries(entries, map, manualPriorityIds, dismissedAutoIds);
}

/** Sincroniza prioridade no banco conforme vencimento (amanhã) para minutas importadas. */
export async function syncAutoPriorities(
  supabase: SupabaseClient,
  entries: Array<
    QueueEntry & {
      menor_vencimento?: string | null;
      prioridade_automatica?: boolean;
    }
  >
): Promise<number> {
  const [manualMap, dismissedAutoIds] = await Promise.all([
    readPriorityMap(supabase),
    readDismissedAutoPriorityIds(supabase),
  ]);

  const toSync = entries.filter((entry) => {
    if (!isActiveQueueStatus(entry.status)) return false;
    if (entry.volume_motos == null) return false;
    if (manualMap[entry.id]) return false;
    if (dismissedAutoIds.has(entry.id)) return false;
    const should = Boolean(entry.prioridade_automatica);
    return Boolean(entry.prioridade) !== should;
  });

  if (toSync.length === 0) return 0;

  const results = await Promise.all(
    toSync.map((entry) =>
      saveEntryPrioridade(supabase, entry.id, Boolean(entry.prioridade_automatica))
    )
  );

  return results.filter((r) => !r.error).length;
}

export async function upsertMinutaMetadataBatch(
  supabase: SupabaseClient,
  rows: MinutaMetadata[]
): Promise<MinutaImportStats> {
  const empty: MinutaImportStats = {
    created: 0,
    updated: 0,
    unchanged: 0,
    totalInFile: 0,
    upserted: 0,
    error: null,
  };

  if (rows.length === 0) return empty;

  const normalized = rows
    .map((r) => ({
      minuta: normalizeMinutaKey(r.minuta),
      volume_motos: r.volume_motos,
      menor_vencimento: r.menor_vencimento ?? null,
    }))
    .filter((r) => r.minuta.length >= 2);

  if (normalized.length === 0) return empty;

  const existingMap = await readMinutaMetadataByKeys(
    supabase,
    normalized.map((r) => r.minuta)
  );

  const now = new Date().toISOString();
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const toWrite: Array<{
    minuta: string;
    volume_motos: number;
    menor_vencimento: string | null;
    updated_at: string;
  }> = [];

  for (const row of normalized) {
    const existing = existingMap.get(row.minuta);
    if (!existing) {
      created += 1;
      toWrite.push({ ...row, updated_at: now });
      continue;
    }

    if (minutaMetadataEquals(existing, row)) {
      unchanged += 1;
      continue;
    }

    updated += 1;
    toWrite.push({ ...row, updated_at: now });
  }

  if (toWrite.length > 0) {
    const { error } = await supabase.from("minuta_metadata").upsert(toWrite, {
      onConflict: "minuta",
    });

    if (error) {
      return {
        created: 0,
        updated: 0,
        unchanged: 0,
        totalInFile: normalized.length,
        upserted: 0,
        error: error.message,
      };
    }
  }

  return {
    created,
    updated,
    unchanged,
    totalInFile: normalized.length,
    upserted: created + updated,
    error: null,
  };
}

export async function getMinutaMetadataByKey(
  supabase: SupabaseClient,
  minuta: string
): Promise<MinutaMetadata | null> {
  const key = normalizeMinutaKey(minuta);
  if (!key) return null;

  const { data, error } = await supabase
    .from("minuta_metadata")
    .select(METADATA_COLUMNS)
    .eq("minuta", key)
    .maybeSingle();

  if (error || !data) return null;
  return data as MinutaMetadata;
}

export async function applyAutoPriorityForMinuta(
  supabase: SupabaseClient,
  entryId: string,
  minuta: string
): Promise<void> {
  const meta = await getMinutaMetadataByKey(supabase, minuta);
  if (!meta) return;
  await saveEntryPrioridade(
    supabase,
    entryId,
    shouldAutoPrioritize(meta.menor_vencimento)
  );
}
