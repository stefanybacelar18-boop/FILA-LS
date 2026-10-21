import { addDays } from 'date-fns';

export type BrazilCalendarKind =
  | 'FERIADO_NACIONAL'
  | 'FERIADO_ESTADUAL'
  | 'PONTO_FACULTATIVO_FEDERAL';

export type BrazilCalendarHit = {
  date: string;
  name: string;
  kind: BrazilCalendarKind;
  /** BR, ou a UF quando o feriado é estadual. */
  scope: string;
};

/**
 * Data magna da Bahia: Constituição do Estado, art. 6º, § 3º.
 * Data magna de Sergipe: Constituição do Estado, art. 269 (EC 20/2000).
 * O PAD da frota fica na Bahia, então 2 de julho também fecha a carga.
 */
const STATE_MAGNA: Record<string, { month: number; day: number; name: string }> = {
  BA: { month: 7, day: 2, name: 'Independência da Bahia' },
  SE: { month: 7, day: 8, name: 'Independência de Sergipe' },
};

/**
 * Emendas publicadas na Portaria MGI nº 11.460/2025.
 * O ano seguinte só entra quando sair a portaria nova. Não são feriado.
 */
const FEDERAL_BRIDGE_DAYS: Record<string, string> = {
  '2026-04-20': 'Emenda de Tiradentes',
  '2026-06-05': 'Emenda de Corpus Christi',
};

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Domingo de Páscoa, calendário gregoriano. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utcDate(year, month, day);
}

function fixed(year: number, month: number, day: number, name: string, kind: BrazilCalendarKind, scope: string): BrazilCalendarHit {
  return { date: dateKey(utcDate(year, month, day)), name, kind, scope };
}

export function nationalHolidays(year: number): BrazilCalendarHit[] {
  const easter = easterSunday(year);
  const hits: BrazilCalendarHit[] = [
    fixed(year, 1, 1, 'Confraternização Universal', 'FERIADO_NACIONAL', 'BR'),
    {
      date: dateKey(addDays(easter, -2)),
      name: 'Paixão de Cristo',
      kind: 'FERIADO_NACIONAL',
      scope: 'BR',
    },
    fixed(year, 4, 21, 'Tiradentes', 'FERIADO_NACIONAL', 'BR'),
    fixed(year, 5, 1, 'Dia do Trabalho', 'FERIADO_NACIONAL', 'BR'),
    fixed(year, 9, 7, 'Independência do Brasil', 'FERIADO_NACIONAL', 'BR'),
    fixed(year, 10, 12, 'Nossa Senhora Aparecida', 'FERIADO_NACIONAL', 'BR'),
    fixed(year, 11, 2, 'Finados', 'FERIADO_NACIONAL', 'BR'),
    fixed(year, 11, 15, 'Proclamação da República', 'FERIADO_NACIONAL', 'BR'),
    fixed(year, 12, 25, 'Natal', 'FERIADO_NACIONAL', 'BR'),
  ];
  if (year >= 2024) {
    hits.push(fixed(year, 11, 20, 'Dia Nacional de Zumbi e da Consciência Negra', 'FERIADO_NACIONAL', 'BR'));
  }
  return hits;
}

export function federalOptionalDays(year: number): BrazilCalendarHit[] {
  const easter = easterSunday(year);
  const hits: BrazilCalendarHit[] = [
    { date: dateKey(addDays(easter, -48)), name: 'Carnaval', kind: 'PONTO_FACULTATIVO_FEDERAL', scope: 'BR' },
    { date: dateKey(addDays(easter, -47)), name: 'Carnaval', kind: 'PONTO_FACULTATIVO_FEDERAL', scope: 'BR' },
    {
      date: dateKey(addDays(easter, -46)),
      name: 'Quarta-feira de Cinzas',
      kind: 'PONTO_FACULTATIVO_FEDERAL',
      scope: 'BR',
    },
    {
      date: dateKey(addDays(easter, 60)),
      name: 'Corpus Christi',
      kind: 'PONTO_FACULTATIVO_FEDERAL',
      scope: 'BR',
    },
    fixed(year, 12, 24, 'Véspera de Natal', 'PONTO_FACULTATIVO_FEDERAL', 'BR'),
    fixed(year, 12, 31, 'Véspera de Ano-Novo', 'PONTO_FACULTATIVO_FEDERAL', 'BR'),
  ];
  for (const [date, name] of Object.entries(FEDERAL_BRIDGE_DAYS)) {
    if (date.startsWith(String(year))) {
      hits.push({ date, name, kind: 'PONTO_FACULTATIVO_FEDERAL', scope: 'BR' });
    }
  }
  return hits;
}

export function stateHoliday(year: number, state: string): BrazilCalendarHit | null {
  const uf = state.trim().toUpperCase();
  const magna = STATE_MAGNA[uf];
  if (!magna) return null;
  return fixed(year, magna.month, magna.day, magna.name, 'FERIADO_ESTADUAL', uf);
}

function yearOf(dateIso: string): number {
  return Number(dateIso.slice(0, 4));
}

export function calendarHits(dateIso: string, state?: string | null): BrazilCalendarHit[] {
  const year = yearOf(dateIso);
  if (!Number.isInteger(year)) return [];
  const hits = [...nationalHolidays(year), ...federalOptionalDays(year)];
  const stateHit = stateHoliday(year, state ?? '');
  if (stateHit) hits.push(stateHit);
  return hits.filter((hit) => hit.date === dateIso);
}

/** Carga sai do PAD na Bahia. 2 de julho entra; feriado de outro estado, não. */
export function loadDateHits(dateIso: string): BrazilCalendarHit[] {
  return calendarHits(dateIso, 'BA');
}
