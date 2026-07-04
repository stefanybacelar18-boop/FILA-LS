/** Fuso operacional LSL (pátio) — São Paulo. */
export const OPERATIONAL_TIMEZONE = "America/Sao_Paulo";

/** Offset fixo do fuso operacional (BRT, sem horário de verão). */
const OPERATIONAL_UTC_OFFSET = "-03:00";

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

/** Meio-dia no fuso operacional para armazenar previsão sem ambiguidade. */
export function manausDayStartISO(ymd: string): string {
  return new Date(`${ymd}T12:00:00${OPERATIONAL_UTC_OFFSET}`).toISOString();
}

/** Início do dia civil no fuso operacional (meia-noite São Paulo). */
export function getTodayStartISO(timeZone = OPERATIONAL_TIMEZONE): string {
  const ymd = getManausDateYmd(new Date(), timeZone);
  return new Date(`${ymd}T00:00:00${OPERATIONAL_UTC_OFFSET}`).toISOString();
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
