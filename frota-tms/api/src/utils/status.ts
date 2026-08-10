import { VehicleStatus } from '../types/enums';
import { differenceInCalendarDays, addDays } from 'date-fns';
import {
  operationalDateKey,
  operationalTodayKey,
  parseOperationalDateTime,
} from './timezone';

/** Color indicator for vehicle plate based on status and return forecast */
export function vehicleColor(
  status: VehicleStatus | string,
  expectedReturn?: Date | null
): 'green' | 'yellow' | 'blue' | 'orange' | 'red' | 'black' {
  if (status === VehicleStatus.EM_MANUTENCAO || status === VehicleStatus.BLOQUEADO) return 'black';
  if (status === VehicleStatus.EM_CARREGAMENTO) return 'yellow';
  if (status === VehicleStatus.DISPONIVEL) return 'green';
  if (status === VehicleStatus.EM_VIAGEM && expectedReturn) {
    const todayKey = operationalTodayKey();
    const retKey = operationalDateKey(expectedReturn);
    const days = differenceInCalendarDays(
      parseOperationalDateTime(retKey, '12:00:00'),
      parseOperationalDateTime(todayKey, '12:00:00'),
    );
    if (days < 0) return 'red';
    if (days === 0) return 'blue';
    if (days === 1) return 'orange';
    return 'green';
  }
  if (status === VehicleStatus.EM_VIAGEM) return 'red';
  return 'green';
}

export function daysUntilExpiry(expiryDate: Date): number {
  const todayKey = operationalTodayKey();
  const expiryKey = operationalDateKey(expiryDate);
  return differenceInCalendarDays(
    parseOperationalDateTime(expiryKey, '12:00:00'),
    parseOperationalDateTime(todayKey, '12:00:00'),
  );
}

export function priorityColor(days: number): 'green' | 'yellow' | 'orange' | 'red' | 'expired' {
  if (days < 0) return 'expired';
  if (days < 7) return 'red';
  if (days < 15) return 'orange';
  if (days <= 30) return 'yellow';
  return 'green';
}

/**
 * Saída oficial de toda viagem: data do roteiro às 06:00 (fuso operacional).
 */
export function routeDepartureAt(routeDate: Date | string): Date {
  const raw = typeof routeDate === 'string' ? routeDate : routeDate.toISOString();
  return parseOperationalDateTime(raw.slice(0, 10), '06:00:00');
}

export function expectedReturnDate(departure: Date, avgTravelDays: number): Date {
  const days = Math.max(0, Math.ceil(avgTravelDays));
  return addDays(departure, days);
}

/**
 * Atraso = dia da previsão já passou (calendário operacional).
 */
export function isOverdue(expectedReturn: Date, returnedAt?: Date | null): boolean {
  if (returnedAt) return false;
  return operationalDateKey(expectedReturn) < operationalTodayKey();
}
