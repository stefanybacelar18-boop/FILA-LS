import type { SupabaseClient } from "@supabase/supabase-js";
import type { QueueEntry } from "./types";

const SETTINGS_KEY = "queue_priorities";

export type PriorityMap = Record<string, boolean>;

export async function readPriorityMap(
  supabase: SupabaseClient
): Promise<PriorityMap> {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();

  if (error || !data?.value || typeof data.value !== "object") {
    return {};
  }

  return data.value as PriorityMap;
}

export async function writePriorityMap(
  supabase: SupabaseClient,
  map: PriorityMap
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("settings").upsert(
    {
      key: SETTINGS_KEY,
      value: map,
    },
    { onConflict: "key" }
  );

  return { error: error?.message ?? null };
}

export async function setEntryPriorityFallback(
  supabase: SupabaseClient,
  entryId: string,
  prioridade: boolean
): Promise<{ error: string | null }> {
  const map = await readPriorityMap(supabase);
  if (prioridade) {
    map[entryId] = true;
  } else {
    delete map[entryId];
  }
  return writePriorityMap(supabase, map);
}

export function mergePrioritiesIntoEntries(
  entries: QueueEntry[],
  map: PriorityMap
): QueueEntry[] {
  return entries.map((entry) => ({
    ...entry,
    prioridade: Boolean(entry.prioridade) || Boolean(map[entry.id]),
  }));
}

export function entryHasPrioridade(entry: {
  prioridade?: boolean | null;
}): boolean {
  return Boolean(entry.prioridade);
}

export async function saveEntryPrioridade(
  supabase: SupabaseClient,
  entryId: string,
  prioridade: boolean
): Promise<{ error: string | null; prioridade: boolean }> {
  const { data, error } = await supabase
    .from("queue_entries")
    .update({ prioridade })
    .eq("id", entryId)
    .select("id, prioridade")
    .maybeSingle();

  if (!error) {
    return { error: null, prioridade: Boolean(data?.prioridade) || prioridade };
  }

  const missingColumn =
    isMissingColumnError(error.message) || /prioridade/i.test(error.message);

  if (missingColumn) {
    const fallback = await setEntryPriorityFallback(supabase, entryId, prioridade);
    if (fallback.error) {
      return { error: fallback.error, prioridade: false };
    }
    return { error: null, prioridade };
  }

  return { error: error.message, prioridade: false };
}

function isMissingColumnError(message: string): boolean {
  return /column .* does not exist|Could not find the .* column/i.test(message);
}
