import type { QueueEntry } from "./types";

export function entryRetornoRacksVazios(entry: Pick<QueueEntry, "retorno_racks_vazios">): boolean {
  return entry.retorno_racks_vazios === true;
}
