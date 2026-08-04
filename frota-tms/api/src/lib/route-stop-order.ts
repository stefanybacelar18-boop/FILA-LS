import {
  PAD_LAT,
  PAD_LNG,
  haversineKm,
  travelFromPadByCity,
} from '../utils/geo.js';

export type GeoOrderableStop = {
  city: string;
  /** Ordem de referência (ex.: arquivo Chronus) para desempate. */
  order?: number;
};

function coordsForCity(city: string): { lat: number; lng: number } | null {
  const travel = travelFromPadByCity(city);
  if (!travel) return null;
  return { lat: travel.lat, lng: travel.lng };
}

/**
 * Ordena paradas por proximidade geográfica a partir do PAD (vizinho mais próximo).
 * Concessionárias na mesma cidade compartilham coordenadas — usa `order` como desempate.
 * Cidades sem mapa ficam no final, na ordem original.
 */
export function orderStopsNearestFromPad<T extends GeoOrderableStop>(stops: T[]): (T & { order: number })[] {
  if (stops.length <= 1) {
    return stops.map((stop, order) => ({ ...stop, order }));
  }

  type PoolItem = { stop: T; coords: { lat: number; lng: number } | null; refOrder: number };

  const pool: PoolItem[] = stops.map((stop, index) => ({
    stop,
    coords: coordsForCity(stop.city),
    refOrder: stop.order ?? index,
  }));

  const withCoords = pool.filter((item) => item.coords);
  const withoutCoords = pool
    .filter((item) => !item.coords)
    .sort((a, b) => a.refOrder - b.refOrder);

  const ordered: PoolItem[] = [];
  let current = { lat: PAD_LAT, lng: PAD_LNG };
  const remaining = [...withCoords];

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    let bestRefOrder = Infinity;

    for (let i = 0; i < remaining.length; i += 1) {
      const item = remaining[i]!;
      const coords = item.coords!;
      const distance = haversineKm(current.lat, current.lng, coords.lat, coords.lng);
      if (
        distance < bestDistance ||
        (distance === bestDistance && item.refOrder < bestRefOrder)
      ) {
        bestDistance = distance;
        bestRefOrder = item.refOrder;
        bestIndex = i;
      }
    }

    const [picked] = remaining.splice(bestIndex, 1);
    ordered.push(picked);
    current = picked.coords!;
  }

  ordered.push(...withoutCoords);

  return ordered.map((item, order) => ({
    ...item.stop,
    order,
  }));
}
