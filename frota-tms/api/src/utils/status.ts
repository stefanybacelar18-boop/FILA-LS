import { VehicleStatus } from '../types/enums';
import { differenceInCalendarDays, startOfDay, addDays, isBefore } from 'date-fns';

/** Color indicator for vehicle plate based on status and return forecast */
export function vehicleColor(
  status: VehicleStatus | string,
  expectedReturn?: Date | null
): 'green' | 'yellow' | 'blue' | 'orange' | 'red' | 'black' {
  if (status === VehicleStatus.EM_MANUTENCAO || status === VehicleStatus.BLOQUEADO) return 'black';
  if (status === VehicleStatus.EM_CARREGAMENTO) return 'yellow';
  if (status === VehicleStatus.DISPONIVEL) return 'green';
  if (status === VehicleStatus.EM_VIAGEM && expectedReturn) {
    const today = startOfDay(new Date());
    const ret = startOfDay(expectedReturn);
    const days = differenceInCalendarDays(ret, today);
    if (days < 0) return 'red';
    if (days === 0) return 'blue';
    if (days === 1) return 'orange';
    return 'red';
  }
  if (status === VehicleStatus.EM_VIAGEM) return 'red';
  return 'green';
}

export function daysUntilExpiry(expiryDate: Date): number {
  return differenceInCalendarDays(startOfDay(expiryDate), startOfDay(new Date()));
}

export function priorityColor(days: number): 'green' | 'yellow' | 'orange' | 'red' | 'expired' {
  if (days < 0) return 'expired';
  if (days < 7) return 'red';
  if (days < 15) return 'orange';
  if (days <= 30) return 'yellow';
  return 'green';
}

export function expectedReturnDate(departure: Date, avgTravelDays: number): Date {
  return addDays(departure, Math.ceil(avgTravelDays));
}

export function isOverdue(expectedReturn: Date, returnedAt?: Date | null): boolean {
  if (returnedAt) return false;
  return isBefore(expectedReturn, new Date());
}
