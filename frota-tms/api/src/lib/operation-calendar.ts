import {
  federalOptionalDays,
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
}): OperationCalendarDay[] {
  const hits = hitsBetween(args.from, args.to);
  const byDate = new Map<string, OperationCalendarClosure[]>();
  for (const row of args.closures) {
    const date = row.date.slice(0, 10);
    if (date < args.from || date > args.to) continue;
    const list = byDate.get(date) ?? [];
    list.push(row.closure);
    byDate.set(date, list);
  }

  const days: OperationCalendarDay[] = [];
  for (const date of [...new Set([...hits.keys(), ...byDate.keys()])].sort()) {
    const items = [
      ...(hits.get(date) ?? []).map(hitItem),
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
