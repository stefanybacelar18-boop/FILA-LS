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

export function pernoiteNights(trip: {
  departureAt: Date;
  expectedReturn: Date;
  returnedAt?: Date | null;
}): number {
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

export function isPernoite(trip: {
  departureAt: Date;
  expectedReturn: Date;
  returnedAt?: Date | null;
}): boolean {
  return pernoiteNights(trip) > 0;
}
