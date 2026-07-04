import type { QueueEntry, QueueStatus } from "./types";
import {
  isActiveQueueStatus,
  isAusenteQueueStatus,
  normalizeQueueStatus,
} from "./constants";

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

  const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
  const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
  return aTime - bTime;
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

/** Próximo chamável — ausentes ficam no topo mas são pulados até voltarem. */
export function getNextToCall(entries: QueueEntry[]): QueueEntry | null {
  const waiting = entries
    .filter((e) => isActiveQueueStatus(e.status))
    .sort(compareQueueOrder);

  return waiting.find((e) => !e.called_at) ?? null;
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
      return { finished_at: now, called_at: null };
    case "aguardando_descarregamento":
      return { finished_at: null, called_at: null };
    case "ausente":
      return { finished_at: null, called_at: null };
    default:
      return {};
  }
}

/** Data/hora em que a operação foi encerrada (somente finalizado). */
export function resolveEntryFinishedAt(
  entry: Pick<QueueEntry, "status" | "finished_at" | "updated_at">
): string | null {
  const status = normalizeQueueStatus(entry.status);
  if (status === "finalizado") return entry.finished_at ?? entry.updated_at;
  if (entry.finished_at) return entry.finished_at;
  return null;
}

/** Ausentes sempre no topo; ativos em seguida; finalizados por último. */
export function sortQueueEntries(entries: QueueEntry[]): QueueEntry[] {
  const ausentes = entries.filter((e) => isAusenteQueueStatus(e.status));
  const active = entries.filter((e) => isActiveQueueStatus(e.status));
  const finalizados = entries.filter(
    (e) => normalizeQueueStatus(e.status) === "finalizado"
  );
  const other = entries.filter(
    (e) =>
      !isActiveQueueStatus(e.status) &&
      !isAusenteQueueStatus(e.status) &&
      normalizeQueueStatus(e.status) !== "finalizado"
  );

  return [
    ...ausentes.sort(
      (a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
    ),
    ...active.sort(compareQueueOrder),
    ...finalizados.sort(
      (a, b) =>
        new Date(b.finished_at ?? b.updated_at ?? 0).getTime() -
        new Date(a.finished_at ?? a.updated_at ?? 0).getTime()
    ),
    ...other,
  ];
}

export { isActiveQueueStatus, isAusenteQueueStatus, normalizeQueueStatus };
