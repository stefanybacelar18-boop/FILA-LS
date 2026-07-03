import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isEnumStatusError,
  statusForDatabase,
  statusForDatabaseLegacy,
} from "./constants";

function isMissingColumnError(message: string): boolean {
  return /column .* does not exist|Could not find the .* column/i.test(message);
}

type UpdateResult = {
  error: string | null;
  data?: { id: string; status?: string; prioridade?: boolean };
};

/** Atualiza campos da fila (sem prioridade — use saveEntryPrioridade) */
export async function updateQueueEntryFields(
  supabase: SupabaseClient,
  entryId: string,
  payload: Record<string, unknown>
): Promise<UpdateResult> {
  const { data, error } = await supabase
    .from("queue_entries")
    .update(payload)
    .eq("id", entryId)
    .select("id, status")
    .maybeSingle();

  if (!error && data) {
    return { error: null, data: data as UpdateResult["data"] };
  }

  if (error && isMissingColumnError(error.message)) {
    if ("previsao_descarregamento" in payload) {
      return {
        error:
          "A coluna previsao_descarregamento não existe no Supabase. Abra o SQL Editor e rode o arquivo supabase/migracao-previsao.sql.",
      };
    }
    if ("closed_by_user_id" in payload) {
      const { closed_by_user_id, ...rest } = payload;
      void closed_by_user_id;
      if (Object.keys(rest).length === 0) {
        return { error: null };
      }
      return updateQueueEntryFields(supabase, entryId, rest);
    }
  }

  return {
    error: error?.message ?? "Nenhum registro atualizado. Verifique permissões ou ID.",
  };
}

/** Resolve status para insert/update com fallback automático se enum não migrado */
export async function writeQueueStatus(
  supabase: SupabaseClient,
  entryId: string,
  status: string,
  extra: Record<string, unknown> = {}
): Promise<UpdateResult> {
  const rest = { ...extra };
  delete rest.prioridade;

  let dbStatus = statusForDatabase(status);
  let result = await updateQueueEntryFields(supabase, entryId, {
    status: dbStatus,
    ...rest,
  });

  if (
    result.error &&
    isEnumStatusError(result.error) &&
    dbStatus !== statusForDatabaseLegacy(status)
  ) {
    dbStatus = statusForDatabaseLegacy(status);
    result = await updateQueueEntryFields(supabase, entryId, {
      status: dbStatus,
      ...rest,
    });
  }

  return result;
}

export async function insertQueueEntry(
  supabase: SupabaseClient,
  payload: Record<string, unknown>
): Promise<{ data: { token: string; id: string } | null; error: string | null }> {
  const status = (payload.status as string) ?? statusForDatabase("aguardando_descarregamento");
  let row = { ...payload, status: statusForDatabase(status) };

  let { data, error } = await supabase
    .from("queue_entries")
    .insert(row)
    .select("token, id")
    .single();

  if (error && isEnumStatusError(error.message)) {
    row = { ...payload, status: statusForDatabaseLegacy(status) };
    ({ data, error } = await supabase
      .from("queue_entries")
      .insert(row)
      .select("token, id")
      .single());
  }

  return {
    data: data as { token: string; id: string } | null,
    error: error?.message ?? null,
  };
}
