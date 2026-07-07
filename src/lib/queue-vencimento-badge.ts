import { isActiveQueueStatus } from "./constants";
import { entryHasPrioridade } from "./queue-priorities";
import type { QueueEntry } from "./types";

/** Exibe "Em vencimento" — prioridade manual (admin) ou automática (NF). */
export function shouldShowEmVencimentoBadge(
  entry: Pick<QueueEntry, "status" | "prioridade" | "prioridade_automatica">
): boolean {
  if (!isActiveQueueStatus(entry.status)) return false;
  return entryHasPrioridade(entry) || Boolean(entry.prioridade_automatica);
}
