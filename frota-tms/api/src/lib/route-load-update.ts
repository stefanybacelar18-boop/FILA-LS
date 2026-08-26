import { isExpiryCityExcluded } from './chronus-import';
import { hasActivePriority } from './route-priority.js';

export type RouteLoadDestinationInput = {
  dealershipId: string;
  motoCount?: number | null;
  minExpiryDate?: string | null;
  order?: number;
};

export function calendarDateUtc(value: string | null | undefined): Date | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return new Date(`${day}T12:00:00.000Z`);
}

export function expiryDay(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const day = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

export function summarizeRouteLoad(
  destinations: Array<{
    motoCount?: number | null;
    minExpiryDate?: string | Date | null;
    city?: string | null;
  }>,
): {
  totalMotoCount: number | null;
  priorityExpiryDate: string | null;
  hasPriority: boolean;
} {
  let total = 0;
  let hasMoto = false;
  const expiries: string[] = [];

  for (const dest of destinations) {
    if (dest.motoCount != null) {
      hasMoto = true;
      total += dest.motoCount;
    }
    const day = expiryDay(dest.minExpiryDate);
    if (day && !isExpiryCityExcluded(dest.city ?? '')) {
      expiries.push(day);
    }
  }

  expiries.sort();
  const priorityExpiryDate = expiries[0] ?? null;
  return {
    totalMotoCount: hasMoto ? total : null,
    priorityExpiryDate,
    hasPriority: hasActivePriority({ priorityExpiryDate }),
  };
}

export function uniqueDealershipIds(ids: string[]): string[] | { error: string } {
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id) return { error: 'Concessionária inválida' };
    if (seen.has(id)) return { error: 'Concessionária repetida no roteiro' };
    seen.add(id);
  }
  return ids;
}

export function destinationRowsForWrite(
  destinations: RouteLoadDestinationInput[],
): Array<{
  dealershipId: string;
  order: number;
  motoCount: number | null;
  minExpiryDate: Date | null;
}> {
  return destinations.map((dest, index) => ({
    dealershipId: dest.dealershipId,
    order: dest.order ?? index,
    motoCount: dest.motoCount ?? null,
    minExpiryDate: calendarDateUtc(dest.minExpiryDate ?? null),
  }));
}
