/**
 * PAD (ponto de saída da frota) — coordenadas oficiais.
 * Distância PAD ↔ concessionária para referência;
 * dias de retorno preferem faixas operacionais (0 / 1 / 3 dias).
 */
export const PAD_LAT = -12.809004;
export const PAD_LNG = -38.428719;

/** @deprecated use PAD_LAT */
export const BASE_LAT = PAD_LAT;
/** @deprecated use PAD_LNG */
export const BASE_LNG = PAD_LNG;

/** Velocidade média operacional (km/dia) para ida+volta */
export const TRAVEL_KM_PER_DAY = 400;

const EARTH_RADIUS_KM = 6371;

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

export function distanceFromPad(lat: number, lng: number): number {
  return Math.round(haversineKm(PAD_LAT, PAD_LNG, lat, lng) * 10) / 10;
}

/** @deprecated use distanceFromPad */
export function distanceFromBase(lat: number, lng: number): number {
  return distanceFromPad(lat, lng);
}

/**
 * Dias médios de viagem (ida+volta) a partir da distância PAD→destino.
 * Fallback quando a cidade não está nas faixas operacionais abaixo.
 * Fórmula: (distanceKm * 2) / 400, mínimo 1 dia.
 */
export function avgTravelDaysFromDistance(distanceKm: number): number {
  const days = (distanceKm * 2) / TRAVEL_KM_PER_DAY;
  return Math.max(1, Math.round(days * 10) / 10);
}

/**
 * Faixas operacionais de previsão de retorno (regra de negócio).
 * 0 = mesmo dia · 1 = dia seguinte · 3 = três dias.
 */
export const SAME_DAY_RETURN_CITIES = new Set([
  'CAMACARI',
  'LAURO',
  'LAURO DE FREITAS',
  'SALVADOR',
  'CANDEIAS',
  'SANTO AMARO',
  'FEIRA DE SANTANA',
  'SANTO ESTEVAO',
  'SANTO ANTONIO',
  'SANTO ANTONIO DE JESUS',
  'VALENCA',
  'CRUZ',
  'CRUZ DAS ALMAS',
  'SERRINHA',
  'RIBEIRA DO POMBAL',
  'EUCLIDES',
  'EUCLIDES DA CUNHA',
  'ALAGOINHAS',
  'E RIOS',
  'E.RIOS',
  'ENTRE RIOS',
  'ESTANCIA',
  'ARACAJU',
  'NOSSA SENHORA DO SOCORRO',
  'JEQUIE',
]);

export const NEXT_DAY_RETURN_CITIES = new Set([
  'ILHEUS',
  'ITABUNA',
  'IPIAU',
  'SENHOR DO BONFIM',
  'C FORMOSO',
  'C.FORMOSO',
  'CAMPO FORMOSO',
  'JACOBINA',
  'IRECE',
  'ITAPETINGA',
  'VITORIA DA CONQUISTA',
  'VITORIA DA CONSQUISTA',
  'TOBIAS',
  'TOBIAS BARRETO',
  'LAGARTO',
  'ITABAIANA',
  'GLORIA',
  'NOSSA SENHORA DA GLORIA',
  'IPIRA',
  'ITABERABA',
  'SEABRA',
  'MACAUBAS',
]);

export const THREE_DAY_RETURN_CITIES = new Set([
  'EUNAPOLIS',
  'PORTO',
  'PORTO SEGURO',
  'ITAMARAJU',
  'TEXEIRA',
  'TEIXEIRA',
  'TEIXEIRA DE FREITAS',
  'BRUMADO',
  'GUANAMBI',
  'BOM JESUS DA LAPA',
  'BOM JESUS DA LAAPA',
  'SANTA MARIA DA VITORIA',
]);

/** Normaliza apelidos operacionais → chave canônica do mapa / faixas. */
export function resolveCityAlias(cityKey: string): string {
  const key = cityKey.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  if (key === 'LAURO') return 'LAURO DE FREITAS';
  if (key === 'SANTO ANTONIO') return 'SANTO ANTONIO DE JESUS';
  if (key === 'CRUZ') return 'CRUZ DAS ALMAS';
  if (key === 'EUCLIDES') return 'EUCLIDES DA CUNHA';
  if (key === 'E RIOS' || key === 'ERIOS') return 'ENTRE RIOS';
  if (key === 'C FORMOSO' || key === 'CFORMOSO') return 'CAMPO FORMOSO';
  if (key === 'VITORIA DA CONSQUISTA') return 'VITORIA DA CONQUISTA';
  if (key === 'TOBIAS') return 'TOBIAS BARRETO';
  if (key === 'GLORIA') return 'NOSSA SENHORA DA GLORIA';
  if (key === 'PORTO') return 'PORTO SEGURO';
  if (key === 'TEXEIRA' || key === 'TEIXEIRA') return 'TEIXEIRA DE FREITAS';
  if (key === 'BOM JESUS DA LAAPA') return 'BOM JESUS DA LAPA';
  return key;
}

/**
 * Dias de retorno pela regra operacional (0 / 1 / 3).
 * `null` = usar fórmula por distância.
 */
export function operationalReturnDays(city: string): number | null {
  const raw = normalizeCityKey(city);
  const key = resolveCityAlias(raw);
  const candidates = [raw, key, raw.replace(/\./g, ' ').replace(/\s+/g, ' ').trim()];

  for (const c of candidates) {
    if (SAME_DAY_RETURN_CITIES.has(c)) return 0;
    if (NEXT_DAY_RETURN_CITIES.has(c)) return 1;
    if (THREE_DAY_RETURN_CITIES.has(c)) return 3;
  }
  if (key.startsWith('LAURO ')) return 0;
  if (key.startsWith('SANTO ANTONIO')) return 0;
  if (key.startsWith('CRUZ DAS')) return 0;
  if (key.startsWith('EUCLIDES')) return 0;
  if (key.startsWith('ENTRE RIOS')) return 0;
  if (key.startsWith('CAMPO FORMOSO')) return 1;
  if (key.startsWith('VITORIA DA CONQUISTA')) return 1;
  if (key.startsWith('NOSSA SENHORA DA GLORIA')) return 1;
  if (key.startsWith('TOBIAS')) return 1;
  if (key.startsWith('PORTO SEGURO')) return 3;
  if (key.startsWith('TEIXEIRA')) return 3;
  if (key.startsWith('BOM JESUS DA LAPA')) return 3;
  return null;
}

export function isSameDayReturnCity(city: string): boolean {
  return operationalReturnDays(city) === 0;
}

function applyOperationalTravelDays(city: string, travel: PadTravel): PadTravel {
  const days = operationalReturnDays(city);
  if (days !== null) {
    return { ...travel, avgTravelDays: days };
  }
  return travel;
}

/** @deprecated use avgTravelDaysFromDistance */
export function estimateTravelDays(distanceKm: number): number {
  return Math.max(1, Math.ceil(avgTravelDaysFromDistance(distanceKm)));
}

export type PadTravel = {
  distanceKm: number;
  avgTravelDays: number;
  lat: number;
  lng: number;
  source: 'coords' | 'city' | 'stored';
};

/** Resolve coordenadas da cidade (mapa local) e calcula distância/dias a partir do PAD. */
export function travelFromPadByCity(city: string): PadTravel | null {
  const key = resolveCityAlias(normalizeCityKey(city));
  const coords = CITY_COORDS[key] ?? CITY_COORDS[normalizeCityKey(city)];
  if (!coords) return null;
  const distanceKm = distanceFromPad(coords.lat, coords.lng);
  return applyOperationalTravelDays(city, {
    distanceKm,
    avgTravelDays: avgTravelDaysFromDistance(distanceKm),
    lat: coords.lat,
    lng: coords.lng,
    source: 'city',
  });
}

/**
 * Calcula (ou reaproveita) distância/dias PAD→concessionária.
 * Prioridade: coordenadas da cidade mapeada; senão valores já persistidos.
 * Aplica regra operacional de retorno no mesmo dia quando couber.
 */
export function resolveTravelFromPad(input: {
  city: string;
  distanceKm?: number | null;
  avgTravelDays?: number | null;
}): PadTravel {
  const fromCity = travelFromPadByCity(input.city);
  if (fromCity) return fromCity;
  const distanceKm = Math.max(0, Number(input.distanceKm ?? 0));
  const avgTravelDays =
    input.avgTravelDays != null && Number(input.avgTravelDays) >= 0
      ? Number(input.avgTravelDays)
      : avgTravelDaysFromDistance(distanceKm || 1);
  return applyOperationalTravelDays(input.city, {
    distanceKm,
    avgTravelDays,
    lat: PAD_LAT,
    lng: PAD_LNG,
    source: 'stored',
  });
}

/** Approximate city centers (BA / SE) */
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
  'BOM JESUS DA LAPA': { lat: -13.255, lng: -43.418 },
  BRUMADO: { lat: -14.2038, lng: -41.6713 },
  'CAMPO FORMOSO': { lat: -10.507, lng: -40.321 },
  'CRUZ DAS ALMAS': { lat: -12.67, lng: -39.1019 },
  'ENTRE RIOS': { lat: -11.9419, lng: -38.0842 },
  EUNAPOLIS: { lat: -16.3715, lng: -39.5801 },
  GUANAMBI: { lat: -14.2231, lng: -42.7799 },
  IPIAU: { lat: -14.1365, lng: -39.7353 },
  IPIRA: { lat: -12.1585, lng: -39.737 },
  IRECE: { lat: -11.3042, lng: -41.8558 },
  ITABAIANA: { lat: -10.685, lng: -37.4253 },
  ITABERABA: { lat: -12.5242, lng: -40.307 },
  ITAMARAJU: { lat: -17.0392, lng: -39.5311 },
  ITAPETINGA: { lat: -15.2489, lng: -40.2479 },
  JACOBINA: { lat: -11.1808, lng: -40.5185 },
  LAGARTO: { lat: -10.9172, lng: -37.65 },
  'NOSSA SENHORA DA GLORIA': { lat: -10.2183, lng: -37.4203 },
  'NOSSA SENHORA DO SOCORRO': { lat: -10.855, lng: -37.1261 },
  'SANTA MARIA DA VITORIA': { lat: -13.3897, lng: -44.1886 },
  'SANTO AMARO': { lat: -12.5466, lng: -38.712 },
  'SANTO ANTONIO DE JESUS': { lat: -12.9689, lng: -39.2611 },
  'SANTO ESTEVAO': { lat: -12.4303, lng: -39.2514 },
  SEABRA: { lat: -12.4172, lng: -41.7703 },
  'SENHOR DO BONFIM': { lat: -10.4614, lng: -40.1892 },
  SERRINHA: { lat: -11.6642, lng: -39.0075 },
  'TEIXEIRA DE FREITAS': { lat: -17.5399, lng: -39.742 },
  'TOBIAS BARRETO': { lat: -11.1874, lng: -38.0033 },
  VALENCA: { lat: -13.3703, lng: -39.072 },
  'RIBEIRA DO POMBAL': { lat: -10.8344, lng: -38.5358 },
  'EUCLIDES DA CUNHA': { lat: -10.5078, lng: -39.0158 },
  'CABACEIRAS DO PARAGUACU': { lat: -12.5358, lng: -39.1903 },
  UNA: { lat: -15.2933, lng: -39.0753 },
  BELMONTE: { lat: -15.8611, lng: -38.8828 },
  CANAVIEIRAS: { lat: -15.675, lng: -38.9472 },
  'PORTO DA FOLHA': { lat: -9.9164, lng: -37.2783 },
  MACAUBAS: { lat: -13.0189, lng: -42.6989 },
};

export const SE_CITIES = new Set([
  'ARACAJU',
  'ESTANCIA',
  'ITABAIANA',
  'LAGARTO',
  'NOSSA SENHORA DA GLORIA',
  'NOSSA SENHORA DO SOCORRO',
  'TOBIAS BARRETO',
  'PORTO DA FOLHA',
]);

export function normalizeCityKey(city: string): string {
  return city
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

export function inferState(city: string): string {
  return SE_CITIES.has(normalizeCityKey(city)) ? 'SE' : 'BA';
}
