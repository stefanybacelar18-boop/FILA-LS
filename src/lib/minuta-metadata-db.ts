import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildMetadataMap,
  computePrevisoesDescarregamento,
  EXPEDICAO_SETTINGS_KEY,
  mergeMetadataIntoEntries,
  normalizeMinutaKey,
  shouldAutoPrioritize,
  type ExpedicaoDiaria,
  type MinutaMetadata,
} from "./minuta-intelligence";
import type { QueueEntry } from "./types";
import { isActiveQueueStatus } from "./constants";
import { readPriorityMap, saveEntryPrioridade } from "./queue-priorities";
import { getTodayStartISO, getManausDateYmd } from "./queue-day";
import { sortQueueEntries } from "./queue";

export const PREVISAO_MANUAL_SETTINGS_KEY = "previsao_manual_ids";

type PrevisaoManualMap = Record<string, true>;

const METADATA_COLUMNS = "minuta,volume_motos,menor_vencimento,updated_at";

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
    expedicao?: ExpedicaoDiaria | null;
    manualIds?: Set<string>;
  }
): Promise<number> {
  const expedicao = prefetched?.expedicao ?? (await readExpedicaoDiaria(supabase));
  if (!expedicao || expedicao.motos <= 0) return 0;

  let enriched = prefetched?.enriched;
  if (!enriched) {
    const rows =
      prefetched?.entries ??
      (
        await supabase
          .from("queue_entries")
          .select("*")
          .is("deleted_at", null)
          .gte("created_at", getTodayStartISO())
      ).data ??
      [];
    enriched = await enrichQueueWithMinutaMetadata(
      supabase,
      rows as QueueEntry[]
    );
  }

  const sorted = sortQueueEntries(enriched);
  const active = sorted.filter((e) => isActiveQueueStatus(e.status));
  const previsoes = computePrevisoesDescarregamento(active, expedicao.motos);
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
  manualIds: ReadonlySet<string>
): (T & { previsao_automatica?: boolean })[] {
  return entries.map((entry) => {
    if (manualIds.has(entry.id) || (entry.volume_motos ?? 0) <= 0) {
      return { ...entry, previsao_automatica: false };
    }
    const auto = previsoes.get(entry.id);
    if (!auto) return { ...entry, previsao_automatica: false };
    return {
      ...entry,
      previsao_descarregamento: auto,
      previsao_automatica: true,
    };
  });
}

export async function readExpedicaoDiaria(
  supabase: SupabaseClient
): Promise<ExpedicaoDiaria | null> {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", EXPEDICAO_SETTINGS_KEY)
    .maybeSingle();

  if (error || !data?.value || typeof data.value !== "object") return null;
  const v = data.value as { motos?: number; updated_at?: string };
  if (typeof v.motos !== "number") return null;
  return { motos: v.motos, updated_at: v.updated_at ?? new Date().toISOString() };
}

export async function saveExpedicaoDiaria(
  supabase: SupabaseClient,
  motos: number
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("settings").upsert(
    {
      key: EXPEDICAO_SETTINGS_KEY,
      value: { motos, updated_at: new Date().toISOString() },
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
  const [metadata, priorityMap] = await Promise.all([
    prefetched?.metadata ?? readMinutaMetadataForEntries(supabase, entries),
    prefetched?.priorityMap ?? readPriorityMap(supabase),
  ]);

  const map = buildMetadataMap(metadata);
  const manualPriorityIds = new Set(
    Object.entries(priorityMap)
      .filter(([, enabled]) => enabled)
      .map(([id]) => id)
  );
  return mergeMetadataIntoEntries(entries, map, manualPriorityIds);
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
  const manualMap = await readPriorityMap(supabase);

  const toSync = entries.filter((entry) => {
    if (!isActiveQueueStatus(entry.status)) return false;
    if (entry.volume_motos == null) return false;
    if (manualMap[entry.id]) return false;
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
): Promise<{ upserted: number; error: string | null }> {
  if (rows.length === 0) return { upserted: 0, error: null };

  const payload = rows.map((r) => ({
    minuta: normalizeMinutaKey(r.minuta),
    volume_motos: r.volume_motos,
    menor_vencimento: r.menor_vencimento,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("minuta_metadata").upsert(payload, {
    onConflict: "minuta",
  });

  if (error) return { upserted: 0, error: error.message };
  return { upserted: payload.length, error: null };
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
