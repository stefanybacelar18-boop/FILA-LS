import { operationalDateKey } from '../utils/timezone';

/** Quantas viagens anteriores aparecem em Definir placa. */
export const LAST_TRIPS_PER_VEHICLE = 3;

export type PlateLastTripStop = {
  order: number;
  dealership: { city: string; name: string };
};

export type PlateLastTripSource = {
  id: string;
  vehicleId: string;
  driverName: string | null;
  departureAt: Date | string;
  returnedAt: Date | string | null;
  status: string;
  route: {
    name: string;
    date: Date | string;
    dealerships: PlateLastTripStop[];
  } | null;
  dealership: { city: string; name: string } | null;
};

export type PlateLastTripView = {
  id: string;
  routeName: string | null;
  routeDate: string;
  driverName: string | null;
  status: string;
  returnedAt: string | null;
  cities: string[];
};

function dayKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return operationalDateKey(date);
}

function timeOf(value: Date | string): number {
  const time = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isNaN(time) ? 0 : time;
}

function citiesOf(trip: PlateLastTripSource): string[] {
  const stops = [...(trip.route?.dealerships ?? [])].sort((a, b) => a.order - b.order);
  const fromRoute = stops.map((stop) => stop.dealership.city.trim()).filter(Boolean);
  const raw = fromRoute.length > 0 ? fromRoute : trip.dealership?.city.trim() ? [trip.dealership.city.trim()] : [];
  const seen = new Set<string>();
  const cities: string[] = [];
  for (const city of raw) {
    const key = city.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cities.push(city);
  }
  return cities;
}

function toView(trip: PlateLastTripSource): PlateLastTripView {
  return {
    id: trip.id,
    routeName: trip.route?.name ?? null,
    routeDate: dayKey(trip.route?.date ?? trip.departureAt),
    driverName: trip.driverName?.trim() || null,
    status: trip.status,
    returnedAt: trip.returnedAt ? dayKey(trip.returnedAt) : null,
    cities: citiesOf(trip),
  };
}

/**
 * Últimas viagens de cada placa, da mais recente para a mais antiga.
 * Viagem cancelada não entra na decisão.
 */
export function plateLastTripsByVehicle(
  trips: PlateLastTripSource[],
  limit = LAST_TRIPS_PER_VEHICLE,
): Map<string, PlateLastTripView[]> {
  const grouped = new Map<string, PlateLastTripSource[]>();
  for (const trip of trips) {
    if (trip.status === 'CANCELADO') continue;
    const list = grouped.get(trip.vehicleId) ?? [];
    list.push(trip);
    grouped.set(trip.vehicleId, list);
  }

  const result = new Map<string, PlateLastTripView[]>();
  for (const [vehicleId, list] of grouped) {
    list.sort((a, b) => timeOf(b.departureAt) - timeOf(a.departureAt));
    result.set(vehicleId, list.slice(0, limit).map(toView));
  }
  return result;
}
