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

export type MotoristaQueueEntry = PublicQueueEntry & { is_mine?: true };

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

/** Motorista autenticado — campos públicos; `is_mine` só na própria linha. */
export function toMotoristaQueueEntry(
  entry: QueueEntry,
  viewerUserId?: string | null
): MotoristaQueueEntry {
  const base = toSanitizedPublicFields(entry);
  if (viewerUserId && entry.driver_user_id === viewerUserId) {
    return { ...base, is_mine: true };
  }
  return base;
}

export function toPublicQueueEntries(entries: QueueEntry[]): PublicQueueEntry[] {
  return entries.map(toPublicQueueEntry);
}

export function isMotoristaOwnEntry(
  entry: Pick<MotoristaQueueEntry, "is_mine">
): boolean {
  return entry.is_mine === true;
}
