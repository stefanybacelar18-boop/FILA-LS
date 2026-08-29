import { differenceInCalendarDays, endOfDay, format, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { operationalDateKey, parseOperationalDateTime } from './timezone';

export interface PayrollPeriod {
  start: Date;
  end: Date;
  label: string;
}

/** Período folha: dia 16 do mês anterior até dia 15 do mês vigente (inclusive). */
export function payrollPeriodForDate(ref = new Date()): PayrollPeriod {
  const day = ref.getDate();
  const year = ref.getFullYear();
  const month = ref.getMonth();

  if (day >= 16) {
    const start = startOfDay(new Date(year, month, 16));
    const end = endOfDay(new Date(year, month + 1, 15));
    return {
      start,
      end,
      label: formatPayrollPeriodLabel(start, end),
    };
  }

  const start = startOfDay(new Date(year, month - 1, 16));
  const end = endOfDay(new Date(year, month, 15));
  return {
    start,
    end,
    label: formatPayrollPeriodLabel(start, end),
  };
}

/** Desloca N períodos de folha (negativo = anterior). */
export function payrollPeriodOffset(ref: Date, offset: number): PayrollPeriod {
  if (offset === 0) return payrollPeriodForDate(ref);
  const anchor = offset > 0 ? payrollPeriodForDate(ref).end : payrollPeriodForDate(ref).start;
  const shifted = new Date(anchor);
  shifted.setDate(shifted.getDate() + (offset > 0 ? 1 : -1));
  return payrollPeriodForDate(shifted);
}

export function formatPayrollPeriodLabel(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear();
  const startFmt = format(start, sameYear ? "d 'de' MMMM" : "d 'de' MMMM 'de' yyyy", { locale: ptBR });
  const endFmt = format(end, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
  return `${startFmt} a ${endFmt}`;
}

/** Quase sempre voltam no dia seguinte: 1 pernoite por roteiro, salvo ajuste manual. */
export const DEFAULT_PERNOITE_CAP = 1;
export const MAX_MANUAL_PERNOITE_NIGHTS = 3;

export type PernoiteTripDates = {
  departureAt: Date;
  expectedReturn: Date;
  returnedAt?: Date | null;
  pernoiteNightsOverride?: number | null;
};

/** Noites de calendário entre saída e retorno (sem teto nem override). */
export function pernoiteNights(trip: PernoiteTripDates): number {
  const depKey = operationalDateKey(trip.departureAt);
  const returnRef = trip.returnedAt ?? trip.expectedReturn;
  const retKey = operationalDateKey(returnRef);
  return Math.max(
    0,
    differenceInCalendarDays(
      parseOperationalDateTime(retKey, '12:00:00'),
      parseOperationalDateTime(depKey, '12:00:00'),
    ),
  );
}

export function clampManualPernoiteNights(nights: number): number {
  if (!Number.isFinite(nights)) return DEFAULT_PERNOITE_CAP;
  return Math.max(0, Math.min(MAX_MANUAL_PERNOITE_NIGHTS, Math.trunc(nights)));
}

/** Valor automático: calendário limitado a 1 pernoite por roteiro. */
export function defaultPernoiteNights(trip: PernoiteTripDates): number {
  return Math.min(pernoiteNights(trip), DEFAULT_PERNOITE_CAP);
}

/**
 * Noites usadas no RH: override do admin, senão teto de 1.
 * Não altera datas da viagem.
 */
export function resolvedPernoiteNights(trip: PernoiteTripDates): number {
  if (trip.pernoiteNightsOverride != null && Number.isFinite(trip.pernoiteNightsOverride)) {
    return clampManualPernoiteNights(trip.pernoiteNightsOverride);
  }
  return defaultPernoiteNights(trip);
}

/** Grava override só quando o valor difere do padrão (teto 1). */
export function pernoiteOverrideToStore(
  trip: PernoiteTripDates,
  nights: number,
): number | null {
  const clamped = clampManualPernoiteNights(nights);
  return clamped === defaultPernoiteNights(trip) ? null : clamped;
}

export function isPernoite(trip: PernoiteTripDates): boolean {
  return resolvedPernoiteNights(trip) > 0;
}
