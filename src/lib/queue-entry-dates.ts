import type { QueueEntry } from "./types";
import { resolveEntryFinishedAt } from "./queue";
import { formatQueueDay, formatQueueTime } from "./utils";

export function formatEntryArrivalDay(entry: Pick<QueueEntry, "created_at">): string {
  return formatQueueDay(entry.created_at);
}

export function formatEntryArrivalTime(entry: Pick<QueueEntry, "created_at">): string {
  return formatQueueTime(entry.created_at);
}

export function formatEntryFinishedDay(
  entry: Pick<QueueEntry, "status" | "finished_at" | "updated_at">
): string {
  const finishedAt = resolveEntryFinishedAt(entry);
  return finishedAt ? formatQueueDay(finishedAt) : "—";
}

export function formatEntryFinishedTime(
  entry: Pick<QueueEntry, "status" | "finished_at" | "updated_at">
): string {
  const finishedAt = resolveEntryFinishedAt(entry);
  return finishedAt ? formatQueueTime(finishedAt) : "";
}
