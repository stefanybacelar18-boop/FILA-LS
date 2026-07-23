import { VehicleStatus } from '../types/enums';
import { differenceInCalendarDays, startOfDay, addDays } from 'date-fns';

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
    return 'green';
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

/**
 * Saída oficial de toda viagem: data do roteiro às 06:00.
 * Usa o calendário YYYY-MM-DD do valor persistido (evita fuso “virar” o dia).
 */
export function routeDepartureAt(routeDate: Date | string): Date {
  const raw = typeof routeDate === 'string' ? routeDate : routeDate.toISOString();
  const datePart = raw.slice(0, 10);
  return new Date(`${datePart}T06:00:00`);
}

export function expectedReturnDate(departure: Date, avgTravelDays: number): Date {
  // 0 = retorno no mesmo dia (cidades próximas / regra operacional)
  const days = Math.max(0, Math.ceil(avgTravelDays));
  return addDays(departure, days);
}

/**
 * Atraso = dia da previsão já passou (calendário).
 * Previsão "hoje" permanece em Hoje o dia inteiro — não marca atraso só porque
 * o horário da previsão (ex.: 06:00) já passou.
 */
export function isOverdue(expectedReturn: Date, returnedAt?: Date | null): boolean {
  if (returnedAt) return false;
  return differenceInCalendarDays(startOfDay(expectedReturn), startOfDay(new Date())) < 0;
}
