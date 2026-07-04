import { isActiveQueueStatus, isAusenteQueueStatus, normalizeQueueStatus } from "./constants";
import { isEntryClosedToday } from "./queue-day";
import type { QueueEntry } from "./types";

/** Minuta ainda aguardando descarregamento (ativa ou ausente) — fila viva, não zera à meia-noite. */
export function isAguardandoDescarregamento(entry: QueueEntry): boolean {
  return isActiveQueueStatus(entry.status) || isAusenteQueueStatus(entry.status);
}

export function countAguardandoDescarregamento(entries: QueueEntry[]): number {
  return entries.filter(isAguardandoDescarregamento).length;
}

/** Finalizadas no dia operacional (São Paulo) — zera quando a operação reinicia. */
export function isFinalizadaNoDiaOperacional(entry: QueueEntry): boolean {
  return (
    normalizeQueueStatus(entry.status) === "finalizado" && isEntryClosedToday(entry)
  );
}

export function countFinalizadasNoDiaOperacional(entries: QueueEntry[]): number {
  return entries.filter(isFinalizadaNoDiaOperacional).length;
}
