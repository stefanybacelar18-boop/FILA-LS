import { addDays } from 'date-fns';
import type { FleetOwner } from '../utils/geo';
import { operationalReturnDays } from '../utils/geo';
import {
  calendarHits,
  loadDateHits,
  type BrazilCalendarHit,
  type BrazilCalendarKind,
} from './brazil-calendar';

export type StoreCalendarStatus = 'APTO' | 'ATENCAO' | 'RISCO' | 'PENDENTE';

export type StoreHour = {
  weekday: number;
  closed: boolean;
  openTime: string | null;
  closeTime: string | null;
};

export type StoreClosureKind = 'FECHADO' | 'ABRE' | 'HORARIO_REDUZIDO';

export type StoreClosure = {
  date: string;
  kind: StoreClosureKind;
  openTime?: string | null;
  closeTime?: string | null;
  note?: string | null;
};

export type CalendarStopInput = {
  id: string;
  name: string;
  city: string;
  state: string;
  avgTravelDays: number;
};

export type StopCalendarResult = {
  dealershipId: string;
  name: string;
  city: string;
  state: string;
  status: StoreCalendarStatus;
  arrivalDates: string[];
  reasons: string[];
};

export type RouteCalendarAssessment = {
  status: StoreCalendarStatus;
  blocked: boolean;
  summary: string;
  loadReasons: string[];
  stops: StopCalendarResult[];
};

const STATUS_RANK: Record<StoreCalendarStatus, number> = {
  APTO: 0,
  PENDENTE: 1,
  ATENCAO: 2,
  RISCO: 3,
};

function statusFromRank(rank: number): StoreCalendarStatus {
  if (rank >= STATUS_RANK.RISCO) return 'RISCO';
  if (rank >= STATUS_RANK.ATENCAO) return 'ATENCAO';
  if (rank >= STATUS_RANK.PENDENTE) return 'PENDENTE';
  return 'APTO';
}

export function formatCalendarDate(dateIso: string): string {
  const [year, month, day] = dateIso.split('-');
  if (!year || !month || !day) return dateIso;
  return `${day}/${month}/${year}`;
}

export function arrivalDateKeys(routeDateIso: string, travelDays: number): string[] {
  const span = Math.max(0, Math.min(6, Math.ceil(Number.isFinite(travelDays) ? travelDays : 0)));
  const start = new Date(`${routeDateIso.slice(0, 10)}T12:00:00.000Z`);
  const keys: string[] = [];
  for (let i = 0; i <= span; i += 1) {
    keys.push(addDays(start, i).toISOString().slice(0, 10));
  }
  return keys;
}

function travelSpan(stop: CalendarStopInput, owner?: FleetOwner | null): number {
  const operational = operationalReturnDays(stop.city, owner);
  if (operational != null) return operational;
  return Math.max(0, Math.ceil(stop.avgTravelDays));
}

function hitLabel(hit: BrazilCalendarHit): string {
  if (hit.kind === 'PONTO_FACULTATIVO_FEDERAL') return `ponto facultativo federal (${hit.name})`;
  if (hit.kind === 'FERIADO_MUNICIPAL') return `feriado municipal (${hit.name})`;
  if (hit.kind === 'FERIADO_ESTADUAL') return `feriado estadual (${hit.name})`;
  return `feriado nacional (${hit.name})`;
}

function isLegalClosure(kind: BrazilCalendarKind): boolean {
  return kind === 'FERIADO_NACIONAL' || kind === 'FERIADO_ESTADUAL' || kind === 'FERIADO_MUNICIPAL';
}

type Raise = (status: StoreCalendarStatus, reason: string) => void;

function assessDate(args: {
  date: string;
  city: string;
  state: string;
  closure: StoreClosure | undefined;
  raise: Raise;
}) {
  const { date, city, state, closure, raise } = args;
  const label = formatCalendarDate(date);
  const hits = calendarHits(date, state, city);
  const legal = hits.filter((hit) => isLegalClosure(hit.kind));
  const optional = hits.filter((hit) => hit.kind === 'PONTO_FACULTATIVO_FEDERAL');

  if (closure?.kind === 'FECHADO') {
    const note = closure.note?.trim();
    raise('RISCO', `${label}: loja fechada${note ? ` (${note})` : ''}`);
    return;
  }

  if (closure?.kind === 'ABRE') {
    if (legal.length > 0) {
      raise('ATENCAO', `${label}: ${legal.map(hitLabel).join(', ')}. A loja informou que abre.`);
    }
    return;
  }

  if (legal.length > 0) {
    raise('RISCO', `${label}: ${legal.map(hitLabel).join(', ')}`);
  }

  if (closure?.kind === 'HORARIO_REDUZIDO') {
    const hoursLabel =
      closure.openTime && closure.closeTime ? ` ${closure.openTime}–${closure.closeTime}` : '';
    const note = closure.note?.trim() ? ` (${closure.note.trim()})` : '';
    raise('ATENCAO', `${label}: horário reduzido${hoursLabel}${note}`);
  }

  if (optional.length > 0) {
    raise(
      'ATENCAO',
      `${label}: ${optional.map(hitLabel).join(', ')}. Confirme se a loja abre.`,
    );
  }
}

export function assessRouteCalendar(input: {
  routeDate: Date | string;
  stops: CalendarStopInput[];
  owner?: FleetOwner | null;
  /** Mantido para quem ainda envia o horário antigo. A decisão usa só feriado. */
  hoursByDealership?: Map<string, StoreHour[]>;
  closuresByDealership?: Map<string, StoreClosure[]>;
}): RouteCalendarAssessment {
  const routeDateIso =
    typeof input.routeDate === 'string'
      ? input.routeDate.slice(0, 10)
      : input.routeDate.toISOString().slice(0, 10);
  const closuresByDealership = input.closuresByDealership ?? new Map<string, StoreClosure[]>();

  const loadReasons: string[] = [];
  let loadRank = 0;
  const raiseLoad: Raise = (next, reason) => {
    loadReasons.push(reason);
    loadRank = Math.max(loadRank, STATUS_RANK[next]);
  };
  for (const hit of loadDateHits(routeDateIso)) {
    const label = formatCalendarDate(routeDateIso);
    if (isLegalClosure(hit.kind)) {
      raiseLoad('RISCO', `${label}: carga no ${hitLabel(hit)}`);
    } else {
      raiseLoad('ATENCAO', `${label}: carga em ${hitLabel(hit)}. Confirme se o PAD abre.`);
    }
  }

  const stops = input.stops.map((stop) => {
    const closures = closuresByDealership.get(stop.id) ?? [];
    const arrivalDates = arrivalDateKeys(routeDateIso, travelSpan(stop, input.owner));
    const reasons: string[] = [];
    let rank = 0;
    const raise: Raise = (next, reason) => {
      reasons.push(reason);
      rank = Math.max(rank, STATUS_RANK[next]);
    };
    for (const date of arrivalDates) {
      assessDate({
        date,
        city: stop.city,
        state: stop.state,
        closure: closures.find((item) => item.date === date),
        raise,
      });
    }
    return {
      dealershipId: stop.id,
      name: stop.name,
      city: stop.city,
      state: stop.state,
      status: statusFromRank(rank),
      arrivalDates,
      reasons,
    };
  });

  let rank = loadRank;
  for (const stop of stops) {
    rank = Math.max(rank, STATUS_RANK[stop.status]);
  }
  const status = statusFromRank(rank);
  const summary = [
    ...loadReasons,
    ...stops.flatMap((stop) => stop.reasons.map((reason) => `${stop.name} (${stop.city}): ${reason}`)),
  ].join(' · ');

  return {
    status,
    blocked: status === 'RISCO',
    summary,
    loadReasons,
    stops,
  };
}

export function calendarBlockMessage(assessment: RouteCalendarAssessment): string | null {
  if (!assessment.blocked) return null;
  const detail = assessment.summary || 'A chegada pode coincidir com loja fechada.';
  return `Risco de loja fechada. ${detail} Para liberar mesmo assim, informe uma justificativa.`;
}

export function readCalendarOverride(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const value = (body as { calendarOverrideReason?: unknown }).calendarOverrideReason;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length >= 10 ? trimmed : null;
}

type HourRow = {
  dealershipId: string;
  weekday: number;
  closed: boolean;
  openTime: string | null;
  closeTime: string | null;
};

type ClosureRow = {
  dealershipId: string;
  date: Date;
  kind: string;
  openTime: string | null;
  closeTime: string | null;
  note: string | null;
};

export type StoreCalendarReader = {
  dealershipHour: {
    findMany: (args: { where: { dealershipId: { in: string[] } } }) => Promise<HourRow[]>;
  };
  dealershipClosure: {
    findMany: (args: { where: { dealershipId: { in: string[] } } }) => Promise<ClosureRow[]>;
  };
};

function closureKind(value: string): StoreClosureKind | null {
  if (value === 'FECHADO' || value === 'ABRE' || value === 'HORARIO_REDUZIDO') return value;
  return null;
}

export async function fetchStoreCalendars(db: StoreCalendarReader, dealershipIds: string[]) {
  const ids = [...new Set(dealershipIds.filter(Boolean))];
  const hoursByDealership = new Map<string, StoreHour[]>();
  const closuresByDealership = new Map<string, StoreClosure[]>();
  if (ids.length === 0) return { hoursByDealership, closuresByDealership };

  const [hours, closures] = await Promise.all([
    db.dealershipHour.findMany({ where: { dealershipId: { in: ids } } }),
    db.dealershipClosure.findMany({ where: { dealershipId: { in: ids } } }),
  ]);
  for (const hour of hours) {
    const list = hoursByDealership.get(hour.dealershipId) ?? [];
    list.push({
      weekday: hour.weekday,
      closed: hour.closed,
      openTime: hour.openTime,
      closeTime: hour.closeTime,
    });
    hoursByDealership.set(hour.dealershipId, list);
  }
  for (const closure of closures) {
    const kind = closureKind(closure.kind);
    if (!kind) continue;
    const list = closuresByDealership.get(closure.dealershipId) ?? [];
    list.push({
      date: closure.date.toISOString().slice(0, 10),
      kind,
      openTime: closure.openTime,
      closeTime: closure.closeTime,
      note: closure.note,
    });
    closuresByDealership.set(closure.dealershipId, list);
  }
  return { hoursByDealership, closuresByDealership };
}

export async function assessStoredRoute(
  db: StoreCalendarReader,
  input: {
    routeDate: Date | string;
    stops: CalendarStopInput[];
    owner?: FleetOwner | null;
  },
): Promise<RouteCalendarAssessment> {
  const store = await fetchStoreCalendars(
    db,
    input.stops.map((stop) => stop.id),
  );
  return assessRouteCalendar({ ...input, ...store });
}
