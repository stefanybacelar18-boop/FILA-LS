import { filterOperationalPanelEntries, isActiveQueueStatus } from "./constants";
import { compareQueueOrder } from "./queue";
import { entryHasPrioridade } from "./queue-priorities";
import type { QueueEntry } from "./types";

/** Exibe "Em vencimento" — prioridade manual (admin) ou automática (NF). */
export function shouldShowEmVencimentoBadge(
  entry: Pick<QueueEntry, "id" | "status" | "prioridade" | "prioridade_automatica">,
  movedUpIds?: ReadonlySet<string>
): boolean {
  if (!isActiveQueueStatus(entry.status)) return false;
  if (movedUpIds?.has(entry.id)) return true;
  return entryHasPrioridade(entry) || Boolean(entry.prioridade_automatica);
}

/**
 * Minutas que subiram na fila por prioridade/vencimento (vs. ordem pura de check-in).
 * Mesma lógica visual do painel empilhador/admin.
 */
export function computeEmVencimentoEntryIds(entries: QueueEntry[]): Set<string> {
  const active = filterOperationalPanelEntries(entries).filter((e) =>
    isActiveQueueStatus(e.status)
  );
  if (active.length === 0) return new Set();

  const byOrder = [...active].sort(compareQueueOrder);
  const byCheckin = [...active].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const checkinIndex = new Map(byCheckin.map((entry, index) => [entry.id, index]));

  const moved = new Set<string>();
  byOrder.forEach((entry, orderIdx) => {
    const checkinIdx = checkinIndex.get(entry.id) ?? orderIdx;
    if (
      entryHasPrioridade(entry) ||
      Boolean(entry.prioridade_automatica) ||
      orderIdx < checkinIdx
    ) {
      moved.add(entry.id);
    }
  });

  return moved;
}
