import type { QueueEntry } from "@/lib/types";

/** Campos expostos em fila pública / TV — sem PII */
export type PublicQueueEntry = Pick<
  QueueEntry,
  | "id"
  | "minuta"
  | "placa"
  | "placa_cavalo"
  | "placa_carreta"
  | "placa_segunda_carreta"
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

export function toPublicQueueEntry(entry: QueueEntry): PublicQueueEntry {
  return {
    id: entry.id,
    minuta: entry.minuta,
    placa: entry.placa,
    placa_cavalo: entry.placa_cavalo,
    placa_carreta: entry.placa_carreta,
    placa_segunda_carreta: entry.placa_segunda_carreta,
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

/** Motorista autenticado — inclui driver_user_id para destacar posição própria */
export function toMotoristaQueueEntry(entry: QueueEntry): PublicQueueEntry & {
  driver_user_id: string | null;
} {
  return {
    ...toPublicQueueEntry(entry),
    driver_user_id: entry.driver_user_id,
  };
}

export function toPublicQueueEntries(entries: QueueEntry[]): PublicQueueEntry[] {
  return entries.map(toPublicQueueEntry);
}
