import type { QueueEntry } from "./types";

/** Campos de texto da fila — null no Supabase não pode derrubar a UI. */
const STRING_FIELDS = [
  "nome",
  "telefone",
  "placa",
  "transportadora",
  "empresa",
  "tipo_carga",
  "minuta",
  "token",
] as const satisfies readonly (keyof QueueEntry)[];

type StringField = (typeof STRING_FIELDS)[number];

/** Normaliza um registro da fila antes de renderizar ou processar no cliente. */
export function sanitizeQueueEntry<T extends Partial<QueueEntry>>(entry: T): T {
  const out = { ...entry } as T & Partial<Record<StringField, string>>;

  for (const key of STRING_FIELDS) {
    const value = entry[key];
    if (value == null || typeof value !== "string") {
      (out as Record<StringField, string>)[key] = "";
    }
  }

  return out;
}

export function sanitizeQueueEntries<T extends Partial<QueueEntry>>(entries: T[]): T[] {
  return entries.map(sanitizeQueueEntry);
}
