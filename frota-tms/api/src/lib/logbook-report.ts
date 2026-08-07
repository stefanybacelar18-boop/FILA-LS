/** Relatório de bordo RB-LSL-01B-01 — paradas, pernoite, refeições */
export const LOGBOOK_REPORT_FORM_CODE = 'RB-LSL-01B-01';
export const MAX_LOGBOOK_STOPS = 10;

export type LogbookStopEntry = {
  order: number;
  dealershipId?: string | null;
  dealershipName: string;
  city: string;
  plannedMotoCount?: number | null;
  kmArrival?: number | null;
  arrivalTime?: string | null;
  departureTime?: string | null;
  boxQty?: number | null;
  motoQty?: number | null;
};

export type PernoiteEntry = {
  date?: string | null;
  arrival?: string | null;
  cityHotel?: string | null;
  arrivalTime?: string | null;
  departureTime?: string | null;
};

export type MealEntry = {
  date?: string | null;
  city?: string | null;
  startTime?: string | null;
  endTime?: string | null;
};

export type TimedEntry = {
  local?: string | null;
  date?: string | null;
  start?: string | null;
  end?: string | null;
  total?: string | null;
};

export type MaintenanceReport = {
  local?: string | null;
  kmArrival?: number | null;
  service?: string | null;
  arrivalTime?: string | null;
  departureTime?: string | null;
  mecanica?: boolean;
  hidraulica?: boolean;
  eletrica?: boolean;
  lavagem?: boolean;
  borracharia?: boolean;
  bau?: boolean;
};

export type LogbookReportExtras = {
  pernoites: PernoiteEntry[];
  meals: MealEntry[];
  restTimes: TimedEntry[];
  waitTimes: TimedEntry[];
  maintenance: MaintenanceReport;
};

export function emptyStop(order: number): LogbookStopEntry {
  return {
    order,
    dealershipName: '',
    city: '',
  };
}

export function emptyReportExtras(): LogbookReportExtras {
  return {
    pernoites: [{}, {}, {}],
    meals: [{}, {}, {}],
    restTimes: [{}, {}, {}],
    waitTimes: [{}, {}, {}],
    maintenance: {},
  };
}

export function parseStopsJson(raw: string | null | undefined): LogbookStopEntry[] {
  if (!raw) return Array.from({ length: MAX_LOGBOOK_STOPS }, (_, i) => emptyStop(i + 1));
  try {
    const parsed = JSON.parse(raw) as LogbookStopEntry[];
    if (!Array.isArray(parsed)) return Array.from({ length: MAX_LOGBOOK_STOPS }, (_, i) => emptyStop(i + 1));
    const rows = parsed.map((row, i) => ({
      ...emptyStop(i + 1),
      ...row,
      order: i + 1,
    }));
    while (rows.length < MAX_LOGBOOK_STOPS) rows.push(emptyStop(rows.length + 1));
    return rows.slice(0, MAX_LOGBOOK_STOPS);
  } catch {
    return Array.from({ length: MAX_LOGBOOK_STOPS }, (_, i) => emptyStop(i + 1));
  }
}

export function parseReportExtrasJson(raw: string | null | undefined): LogbookReportExtras {
  const base = emptyReportExtras();
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as Partial<LogbookReportExtras>;
    return {
      pernoites: padRows(parsed.pernoites, 3),
      meals: padRows(parsed.meals, 3),
      restTimes: padRows(parsed.restTimes, 3),
      waitTimes: padRows(parsed.waitTimes, 3),
      maintenance: { ...base.maintenance, ...(parsed.maintenance ?? {}) },
    };
  } catch {
    return base;
  }
}

function padRows<T>(rows: T[] | undefined, n: number): T[] {
  const out = [...(rows ?? [])];
  while (out.length < n) out.push({} as T);
  return out.slice(0, n);
}

export function buildInitialStops(input: {
  routeDealerships?: {
    order: number;
    motoCount: number | null;
    dealershipId: string;
    dealership: { name: string; city: string };
  }[];
  tripDealership: { name: string; city: string };
}): LogbookStopEntry[] {
  const fromRoute =
    input.routeDealerships?.map((rd, i) => ({
      order: i + 1,
      dealershipId: rd.dealershipId,
      dealershipName: rd.dealership.name,
      city: rd.dealership.city,
      plannedMotoCount: rd.motoCount,
    })) ?? [
      {
        order: 1,
        dealershipName: input.tripDealership.name,
        city: input.tripDealership.city,
        plannedMotoCount: null,
      },
    ];

  const rows: LogbookStopEntry[] = fromRoute.map((row, i) => ({
    ...emptyStop(i + 1),
    ...row,
    order: i + 1,
    plannedMotoCount: row.plannedMotoCount ?? null,
  }));
  while (rows.length < MAX_LOGBOOK_STOPS) rows.push(emptyStop(rows.length + 1));
  return rows.slice(0, MAX_LOGBOOK_STOPS);
}

export function validateStopsForSubmit(stops: LogbookStopEntry[]): string | null {
  const filled = stops.filter((s) => s.dealershipName.trim() || s.city.trim());
  if (filled.length === 0) return 'Informe ao menos uma parada (concessionária/cidade).';
  for (const stop of filled) {
    if (!stop.dealershipName.trim()) return `Parada ${stop.order}: informe a concessionária.`;
    if (!stop.city.trim()) return `Parada ${stop.order}: informe a cidade.`;
    if (stop.motoQty == null && stop.boxQty == null) {
      return `Parada ${stop.order}: informe a quantidade de motos (caixa ou motor).`;
    }
  }
  return null;
}
