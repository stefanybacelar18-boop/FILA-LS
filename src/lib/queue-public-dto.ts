import type { QueueEntry } from "@/lib/types";

/** Campos expostos em fila pública / TV / motorista — sem PII e sem placas (LGPD). */
export type PublicQueueEntry = Pick<
  QueueEntry,
  | "id"
  | "minuta"
  | "tipo_veiculo"
  | "status"
  | "prioridade"
  | "doca"
  | "previsao_descarregamento"
  | "posicao_fila"
  | "called_at"
  | "started_unload_at"
  | "finished_at"
  | "created_at"
  | "updated_at"
  | "deleted_at"
  | "transportadora"
  | "retorno_racks_vazios"
  | "volume_motos"
  | "menor_vencimento"
  | "prioridade_automatica"
  | "previsao_automatica"
>;

function toSanitizedPublicFields(entry: QueueEntry): PublicQueueEntry {
  return {
    id: entry.id,
    minuta: entry.minuta,
    tipo_veiculo: entry.tipo_veiculo,
    status: entry.status,
    prioridade: entry.prioridade,
    doca: entry.doca,
    previsao_descarregamento: entry.previsao_descarregamento,
    posicao_fila: entry.posicao_fila,
    called_at: entry.called_at,
    started_unload_at: entry.started_unload_at,
    finished_at: entry.finished_at,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
    deleted_at: entry.deleted_at,
    transportadora: entry.transportadora,
    retorno_racks_vazios: entry.retorno_racks_vazios,
    volume_motos: entry.volume_motos,
    menor_vencimento: entry.menor_vencimento,
    prioridade_automatica: entry.prioridade_automatica,
    previsao_automatica: entry.previsao_automatica,
  };
}

export function toPublicQueueEntry(entry: QueueEntry): PublicQueueEntry {
  return toSanitizedPublicFields(entry);
}

/** Motorista autenticado — mesmos campos da fila pública (sem placas). */
export function toMotoristaQueueEntry(
  entry: QueueEntry
): PublicQueueEntry & { driver_user_id: string | null } {
  return {
    ...toSanitizedPublicFields(entry),
    driver_user_id: entry.driver_user_id,
  };
}

export function toPublicQueueEntries(entries: QueueEntry[]): PublicQueueEntry[] {
  return entries.map(toPublicQueueEntry);
}
