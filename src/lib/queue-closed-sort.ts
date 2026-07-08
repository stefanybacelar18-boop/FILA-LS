import type { QueueEntry } from "./types";

/** Finalizados/ausentes encerrados — mais recentes primeiro. */
export function sortClosedEntries(entries: QueueEntry[]): QueueEntry[] {
  return [...entries].sort(
    (a, b) =>
      new Date(b.finished_at ?? b.updated_at ?? 0).getTime() -
      new Date(a.finished_at ?? a.updated_at ?? 0).getTime()
  );
}
