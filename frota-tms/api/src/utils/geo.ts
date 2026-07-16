/** Company base */
export const BASE_LAT = -12.809004;
export const BASE_LNG = -38.428719;

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

export function distanceFromBase(lat: number, lng: number): number {
  return haversineKm(BASE_LAT, BASE_LNG, lat, lng);
}

export function estimateTravelDays(distanceKm: number): number {
  return Math.max(1, Math.ceil((distanceKm * 2) / 450));
}

export function avgTravelDaysFromDistance(distanceKm: number): number {
  const days = (distanceKm * 2) / 400;
  return Math.max(1, Math.round(days * 10) / 10);
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
