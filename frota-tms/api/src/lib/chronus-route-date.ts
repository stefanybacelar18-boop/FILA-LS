import { addDays } from 'date-fns';
import { operationalDateKey, OPS_TIMEZONE, parseOperationalDateTime } from '../utils/timezone';

export function operationalWeekdayShort(date: Date): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: OPS_TIMEZONE, weekday: 'short' }).format(date);
}

function nextOperationalNoon(from: Date): Date {
  const key = operationalDateKey(from);
  return addDays(parseOperationalDateTime(key, '12:00:00'), 1);
}

/**
 * Data do carregamento Chronus: dia seguinte, pulando domingo.
 * Sábado só entra se `saturdayWork` (expediente no sábado).
 * Sexta sem expediente → segunda.
 */
export function routeDateFromImport(
  baseDate = new Date(),
  opts: { saturdayWork?: boolean } = {},
): Date {
  let d = nextOperationalNoon(baseDate);
  const skipSaturday = !opts.saturdayWork;
  for (let i = 0; i < 4; i += 1) {
    const wd = operationalWeekdayShort(d);
    if (wd === 'Sun' || (skipSaturday && wd === 'Sat')) {
      d = addDays(d, 1);
      continue;
    }
    break;
  }
  return d;
}

export function fridayLoadChoices(importDate = new Date()): {
  isFriday: boolean
  saturday: string
  monday: string
} {
  const noon = parseOperationalDateTime(operationalDateKey(importDate), '12:00:00');
  const saturday = addDays(noon, 1);
  let monday = addDays(noon, 1);
  while (operationalWeekdayShort(monday) !== 'Mon') {
    monday = addDays(monday, 1);
  }
  return {
    isFriday: operationalWeekdayShort(noon) === 'Fri',
    saturday: saturday.toISOString().slice(0, 10),
    monday: monday.toISOString().slice(0, 10),
  };
}

export function parseExplicitRouteDate(raw: string | undefined | null): Date | null {
  const day = String(raw ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return new Date(`${day}T12:00:00.000Z`);
}
