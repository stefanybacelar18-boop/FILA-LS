/** Fuso operacional da LSL (Bahia / Sergipe). */
export const OPS_TIMEZONE = 'America/Bahia';
export const OPS_TZ_OFFSET = '-03:00';

/** YYYY-MM-DD no calendário operacional. */
export function operationalDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: OPS_TIMEZONE }).format(date);
}

export function operationalTodayKey(): string {
  return operationalDateKey(new Date());
}

/** Data/hora no fuso operacional (ex.: saída às 06:00). */
export function parseOperationalDateTime(datePart: string, time = '06:00:00'): Date {
  return new Date(`${datePart.slice(0, 10)}T${time}${OPS_TZ_OFFSET}`);
}

/** Data de roteiro normalizada (meio-dia UTC evita virada de dia). */
export function normalizeRouteDateInput(value: string | Date): Date {
  const raw = typeof value === 'string' ? value : value.toISOString();
  return new Date(`${raw.slice(0, 10)}T12:00:00.000Z`);
}
