import { addDays, startOfDay } from 'date-fns';

function dayStart(value: string | Date): Date {
  return startOfDay(typeof value === 'string' ? new Date(value) : value);
}

/** Vencido ou vence hoje/amanhã (dentro de 1 dia). */
export function isUrgentExpiry(date: string | Date | null | undefined): boolean {
  if (!date) return false;
  const today = dayStart(new Date());
  const expiry = dayStart(date);
  return expiry <= addDays(today, 1);
}

export function hasActivePriority(
  route: { hasPriority?: boolean; priorityExpiryDate?: string | Date | null },
): boolean {
  if (route.priorityExpiryDate) return isUrgentExpiry(route.priorityExpiryDate);
  return !!route.hasPriority;
}
