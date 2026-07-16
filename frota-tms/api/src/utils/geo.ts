/** Company base (Salvador metro area) */
export const BASE_LAT = -12.809004;
export const BASE_LNG = -38.428719;

const EARTH_RADIUS_KM = 6371;

/** Haversine distance in kilometers between two WGS84 points */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Distance from company base to a city coordinate */
export function distanceFromBase(lat: number, lng: number): number {
  return haversineKm(BASE_LAT, BASE_LNG, lat, lng);
}

/**
 * Estimate round-trip travel days from one-way distance.
 * Assume ~450 km/day effective (ida+volta).
 */
export function estimateTravelDays(distanceKm: number): number {
  return Math.max(1, Math.ceil((distanceKm * 2) / 450));
}

/**
 * Average travel days for dealership seed (1 decimal, min 1).
 * Round-trip at ~400 km/day.
 */
export function avgTravelDaysFromDistance(distanceKm: number): number {
  const days = (distanceKm * 2) / 400;
  return Math.max(1, Math.round(days * 10) / 10);
}

export const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  SALVADOR: { lat: -12.9777, lng: -38.5016 },
  'LAURO DE FREITAS': { lat: -12.8944, lng: -38.3273 },
  CAMACARI: { lat: -12.6975, lng: -38.3239 },
  'FEIRA DE SANTANA': { lat: -12.2664, lng: -38.9663 },
  ALAGOINHAS: { lat: -12.1356, lng: -38.419 },
  ITABUNA: { lat: -14.7876, lng: -39.2781 },
  JEQUIE: { lat: -13.8588, lng: -40.0851 },
  'VITORIA DA CONQUISTA': { lat: -14.8615, lng: -40.8442 },
  ARACAJU: { lat: -10.9472, lng: -37.0731 },
  ESTANCIA: { lat: -11.2659, lng: -37.445 },
  'SAO FRANCISCO DO CONDE': { lat: -12.6056, lng: -38.68 },
  'DIAS DAVILA': { lat: -12.572, lng: -38.297 },
  'SIMOES FILHO': { lat: -12.7847, lng: -38.404 },
  CANDEIAS: { lat: -12.6683, lng: -38.5083 },
  ILHEUS: { lat: -14.788, lng: -39.049 },
  'PORTO SEGURO': { lat: -16.449, lng: -39.064 },
};

export function normalizeCityKey(city: string): string {
  return city
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}
