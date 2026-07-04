/** Fuso operacional LSL (pátio). */
export const OPERATIONAL_TIMEZONE = "America/Manaus";

/** Data YYYY-MM-DD no fuso operacional. */
export function getManausDateYmd(
  date: Date = new Date(),
  timeZone = OPERATIONAL_TIMEZONE
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Soma dias civis a uma data YYYY-MM-DD (fuso operacional). */
export function addManausDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return utc.toISOString().slice(0, 10);
}

/** Meio-dia Manaus (UTC−4) para armazenar previsão sem ambiguidade de fuso. */
export function manausDayStartISO(ymd: string): string {
  return new Date(`${ymd}T12:00:00-04:00`).toISOString();
}

/** Início do dia civil no fuso operacional (meia-noite Manaus). */
export function getTodayStartISO(timeZone = OPERATIONAL_TIMEZONE): string {
  const ymd = getManausDateYmd(new Date(), timeZone);
  return new Date(`${ymd}T00:00:00-04:00`).toISOString();
}

/** Entrada pertence ao dia operacional atual. */
export function isQueueEntryFromToday(
  createdAt: string,
  timeZone = OPERATIONAL_TIMEZONE
): boolean {
  return new Date(createdAt) >= new Date(getTodayStartISO(timeZone));
}

/** Momento em que a minuta foi encerrada (somente finalizado). */
export function resolveEntryClosedAt(entry: {
  status: string;
  finished_at?: string | null;
  updated_at: string;
}): string | null {
  if (entry.status === "finalizado") return entry.finished_at ?? entry.updated_at;
  return null;
}

/** Minuta finalizada no dia operacional atual. Ausente permanece na fila operacional. */
export function isEntryClosedToday(
  entry: {
    status: string;
    finished_at?: string | null;
    updated_at: string;
  },
  timeZone = OPERATIONAL_TIMEZONE
): boolean {
  const closedAt = resolveEntryClosedAt(entry);
  if (!closedAt) return false;
  return new Date(closedAt) >= new Date(getTodayStartISO(timeZone));
}

/** Data legível no fuso operacional (ex.: "terça-feira, 2 de julho"). */
export function formatManausDateLabel(
  date: Date = new Date(),
  timeZone = OPERATIONAL_TIMEZONE
): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}
