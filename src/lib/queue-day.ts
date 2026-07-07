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

function ymdToUtcDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** 0 = domingo … 6 = sábado (UTC, alinhado a YYYY-MM-DD). */
export function getWeekdayYmd(ymd: string): number {
  return ymdToUtcDate(ymd).getUTCDay();
}

export function isWeekendYmd(ymd: string): boolean {
  const w = getWeekdayYmd(ymd);
  return w === 0 || w === 6;
}

/** Soma dias úteis (seg–sex); offset 0 retorna o mesmo dia. */
export function addBusinessDays(ymd: string, businessDays: number): string {
  if (businessDays <= 0) return ymd;
  let current = ymd;
  let remaining = businessDays;
  while (remaining > 0) {
    current = addManausDays(current, 1);
    if (!isWeekendYmd(current)) remaining -= 1;
  }
  return current;
}

/** Próximo dia útil após a data informada. */
export function nextBusinessDayYmd(ymd: string): string {
  return addBusinessDays(ymd, 1);
}

/** Base do planejamento: hoje se dia útil, senão a próxima segunda. */
export function getOperationalPlanningBaseYmd(
  date: Date = new Date(),
  timeZone = OPERATIONAL_TIMEZONE
): string {
  let ymd = getManausDateYmd(date, timeZone);
  while (isWeekendYmd(ymd)) {
    ymd = addManausDays(ymd, 1);
  }
  return ymd;
}

/** Converte offset de dia útil (0 = base) em YYYY-MM-DD. */
export function businessDayOffsetToYmd(baseYmd: string, offset: number): string {
  if (offset <= 0) return baseYmd;
  return addBusinessDays(baseYmd, offset);
}

/** Meio-dia no fuso operacional para armazenar previsão sem ambiguidade. */
export function manausDayStartISO(ymd: string): string {
  return new Date(`${ymd}T12:00:00${OPERATIONAL_UTC_OFFSET}`).toISOString();
}

/** Início do dia civil no fuso operacional (meia-noite São Paulo). */
export function getTodayStartISO(timeZone = OPERATIONAL_TIMEZONE): string {
  const ymd = getManausDateYmd(new Date(), timeZone);
  return ymdToDayStartISO(ymd);
}

/** Início do dia YYYY-MM-DD no fuso operacional. */
export function ymdToDayStartISO(ymd: string): string {
  return new Date(`${ymd}T00:00:00${OPERATIONAL_UTC_OFFSET}`).toISOString();
}

/** Fim do dia YYYY-MM-DD no fuso operacional. */
export function ymdToDayEndISO(ymd: string): string {
  return new Date(`${ymd}T23:59:59.999${OPERATIONAL_UTC_OFFSET}`).toISOString();
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
