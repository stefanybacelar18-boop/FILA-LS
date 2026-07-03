import type { QueueEntry, QueueStatus } from "./types";
import { isActiveQueueStatus, normalizeQueueStatus } from "./constants";

export function compareQueueOrder(
  a: QueueEntry & { menor_vencimento?: string | null },
  b: QueueEntry & { menor_vencimento?: string | null }
): number {
  const priA = a.prioridade ? 1 : 0;
  const priB = b.prioridade ? 1 : 0;
  if (priB !== priA) return priB - priA;

  const vencA = a.menor_vencimento
    ? new Date(`${a.menor_vencimento}T00:00:00`).getTime()
    : Number.POSITIVE_INFINITY;
  const vencB = b.menor_vencimento
    ? new Date(`${b.menor_vencimento}T00:00:00`).getTime()
    : Number.POSITIVE_INFINITY;
  if (vencA !== vencB) return vencA - vencB;

  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

export function countVehiclesAhead(
  entry: QueueEntry,
  allEntries: QueueEntry[]
): number {
  if (!isActiveQueueStatus(entry.status)) return 0;

  const sorted = [...allEntries]
    .filter((e) => isActiveQueueStatus(e.status))
    .sort(compareQueueOrder);

  const idx = sorted.findIndex((e) => e.id === entry.id);
  return idx >= 0 ? idx : -1;
}

/** Posição na fila calculada pela ordem real (prioridade → vencimento → check-in). */
export function resolveQueuePosition(
  entry: QueueEntry,
  allEntries: QueueEntry[]
): number | null {
  const ahead = countVehiclesAhead(entry, allEntries);
  if (ahead < 0) return null;
  return ahead + 1;
}

export function getNextToCall(entries: QueueEntry[]): QueueEntry | null {
  const waiting = entries
    .filter((e) => isActiveQueueStatus(e.status))
    .sort(compareQueueOrder);

  return waiting.find((e) => !e.called_at) ?? waiting[0] ?? null;
}

export function getRecentlyCalled(entries: QueueEntry[]): QueueEntry[] {
  return entries
    .filter((e) => isActiveQueueStatus(e.status) && e.called_at)
    .sort(
      (a, b) =>
        new Date(b.called_at!).getTime() - new Date(a.called_at!).getTime()
    );
}

export function isDriverCalled(entry: QueueEntry): boolean {
  return isActiveQueueStatus(entry.status) && Boolean(entry.called_at);
}

export { computeDashboardStats } from "./dashboard-stats";

export function getStatusTimestampUpdates(newStatus: QueueStatus): Partial<QueueEntry> {
  const now = new Date().toISOString();
  switch (newStatus) {
    case "finalizado":
      return { finished_at: now };
    case "aguardando_descarregamento":
      return { finished_at: null };
    case "ausente":
      return { finished_at: null };
    default:
      return {};
  }
}

/** Data/hora em que a operação foi encerrada (finalizado ou ausente). */
export function resolveEntryFinishedAt(
  entry: Pick<QueueEntry, "status" | "finished_at" | "updated_at">
): string | null {
  if (entry.finished_at) return entry.finished_at;
  const status = normalizeQueueStatus(entry.status);
  if (status === "finalizado" || status === "ausente") return entry.updated_at;
  return null;
}

export function sortQueueEntries(entries: QueueEntry[]): QueueEntry[] {
  const statusOrder: Record<QueueStatus, number> = {
    aguardando_descarregamento: 0,
    ausente: 1,
    finalizado: 2,
  };

  return [...entries].sort((a, b) => {
    const orderA = statusOrder[normalizeQueueStatus(a.status)];
    const orderB = statusOrder[normalizeQueueStatus(b.status)];
    if (orderA !== orderB) return orderA - orderB;
    return compareQueueOrder(a, b);
  });
}

export { isActiveQueueStatus, normalizeQueueStatus };
