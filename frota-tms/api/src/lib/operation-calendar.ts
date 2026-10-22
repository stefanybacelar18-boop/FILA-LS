import { normalizeCityKey, resolveCityAlias } from '../utils/geo';
import {
  federalOptionalDays,
  municipalHolidays,
  nationalHolidays,
  stateHoliday,
  type BrazilCalendarHit,
} from './brazil-calendar';

export type OperationCalendarTone = 'risk' | 'warn' | 'info';

export type OperationCalendarItem = {
  tone: OperationCalendarTone;
  label: string;
};

export type OperationCalendarClosure = {
  name: string;
  city: string;
  state: string;
  kind: 'FECHADO' | 'ABRE' | 'HORARIO_REDUZIDO';
  note?: string | null;
  openTime?: string | null;
  closeTime?: string | null;
};

export type OperationCalendarDay = {
  date: string;
  tone: OperationCalendarTone;
  items: OperationCalendarItem[];
};

export type OperationCalendarCity = {
  city: string;
  state: string;
};

const TONE_RANK: Record<OperationCalendarTone, number> = { info: 1, warn: 2, risk: 3 };

function hitsBetween(from: string, to: string): Map<string, BrazilCalendarHit[]> {
  const years = new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))]);
  const map = new Map<string, BrazilCalendarHit[]>();
  for (const year of years) {
    if (!Number.isInteger(year)) continue;
    const hits = [
      ...nationalHolidays(year),
      ...federalOptionalDays(year),
      stateHoliday(year, 'BA'),
      stateHoliday(year, 'SE'),
    ].filter((hit): hit is BrazilCalendarHit => hit != null);
    for (const hit of hits) {
      if (hit.date < from || hit.date > to) continue;
      const list = map.get(hit.date) ?? [];
      list.push(hit);
      map.set(hit.date, list);
    }
  }
  return map;
}

function hitItem(hit: BrazilCalendarHit): OperationCalendarItem {
  if (hit.kind === 'FERIADO_NACIONAL') {
    return { tone: 'risk', label: `Feriado nacional — ${hit.name}. Segura a carga.` };
  }
  if (hit.kind === 'FERIADO_ESTADUAL' && hit.scope === 'BA') {
    return {
      tone: 'risk',
      label: `Feriado estadual — ${hit.name}. Segura a carga e destino na Bahia.`,
    };
  }
  if (hit.kind === 'FERIADO_ESTADUAL') {
    return { tone: 'risk', label: `Feriado estadual — ${hit.name}. Segura destino em Sergipe.` };
  }
  return {
    tone: 'warn',
    label: `Ponto facultativo — ${hit.name}. A viagem segue. Confirme se a loja abre.`,
  };
}

function formatPlaces(places: string[]): string {
  const sorted = [...places].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (sorted.length <= 6) return sorted.join(', ');
  return `${sorted.slice(0, 6).join(', ')} e mais ${sorted.length - 6}`;
}

function municipalBetween(from: string, to: string, cities: OperationCalendarCity[]) {
  const years = new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))]);
  const seen = new Set<string>();
  const unique = cities.filter((city) => {
    const key = `${city.state.trim().toUpperCase()}|${resolveCityAlias(normalizeCityKey(city.city))}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const grouped = new Map<string, Map<string, string[]>>();
  for (const year of years) {
    if (!Number.isInteger(year)) continue;
    for (const city of unique) {
      const uf = city.state.trim().toUpperCase();
      for (const hit of municipalHolidays(year, city.city, uf)) {
        if (hit.date < from || hit.date > to) continue;
        const byName = grouped.get(hit.date) ?? new Map<string, string[]>();
        const place = `${city.city}/${uf}`;
        const list = byName.get(hit.name) ?? [];
        if (!list.includes(place)) list.push(place);
        byName.set(hit.name, list);
        grouped.set(hit.date, byName);
      }
    }
  }
  return grouped;
}

function closureItem(closure: OperationCalendarClosure): OperationCalendarItem {
  const place = `${closure.name} (${closure.city}/${closure.state})`;
  const note = closure.note?.trim() ? ` ${closure.note.trim()}.` : '';
  if (closure.kind === 'FECHADO') {
    return { tone: 'risk', label: `${place} fechada.${note} Segura a carga para essa loja.` };
  }
  if (closure.kind === 'ABRE') {
    return { tone: 'info', label: `${place} informou que abre.${note}` };
  }
  const hours =
    closure.openTime && closure.closeTime ? ` ${closure.openTime}–${closure.closeTime}` : '';
  return { tone: 'warn', label: `${place} em horário reduzido${hours}.${note}` };
}

export function buildOperationCalendar(args: {
  from: string;
  to: string;
  closures: { date: string; closure: OperationCalendarClosure }[];
  cities?: OperationCalendarCity[];
}): OperationCalendarDay[] {
  const hits = hitsBetween(args.from, args.to);
  const municipal = municipalBetween(args.from, args.to, args.cities ?? []);
  const byDate = new Map<string, OperationCalendarClosure[]>();
  for (const row of args.closures) {
    const date = row.date.slice(0, 10);
    if (date < args.from || date > args.to) continue;
    const list = byDate.get(date) ?? [];
    list.push(row.closure);
    byDate.set(date, list);
  }

  const days: OperationCalendarDay[] = [];
  for (const date of [...new Set([...hits.keys(), ...municipal.keys(), ...byDate.keys()])].sort()) {
    const municipalItems = [...(municipal.get(date)?.entries() ?? [])]
      .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
      .map(([name, places]) => ({
        tone: 'risk' as const,
        label: `Feriado municipal — ${name}. Segura lojas em ${formatPlaces(places)}.`,
      }));
    const items = [
      ...(hits.get(date) ?? []).map(hitItem),
      ...municipalItems,
      ...(byDate.get(date) ?? [])
        .sort(
          (a, b) =>
            a.city.localeCompare(b.city, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'),
        )
        .map(closureItem),
    ];
    if (items.length === 0) continue;
    const tone = items.reduce<OperationCalendarTone>(
      (current, item) => (TONE_RANK[item.tone] > TONE_RANK[current] ? item.tone : current),
      'info',
    );
    days.push({ date, tone, items });
  }
  return days;
}
