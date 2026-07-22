/** Visibilidade por perfil: o que a OPERAÇÃO NÃO vê (Admin vê tudo). */

export const OPERATOR_HIDDEN_DRIVER_NAMES = [
  'SILVIO GOMES CAMARA',
  'ROSENILDO DA SILVA GOMES',
  'JEFFERSON SOUZA ALMEIDA',
  'LUIZ DOS ANJOS NASCIMENTO',
  'JOBERVAL LUIS SANTOS DA PURIFICAÇÃO',
  'SAMUEL DA CONCEICAO SANTOS',
  'RICARDO DE JESUS ARAUJO',
] as const;

export const OPERATOR_HIDDEN_PLATES = [
  'EZU2D86',
  'EOE1F87',
  'SVS9H87',
  'TKX7D86',
  'BPQ1E82',
  'EOE1581',
  'SUC6B93',
  'TME3H94',
] as const;

export function normalizePlate(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function normalizeDriverName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

const hiddenPlates = new Set(OPERATOR_HIDDEN_PLATES.map(normalizePlate));
const hiddenDrivers = new Set(OPERATOR_HIDDEN_DRIVER_NAMES.map(normalizeDriverName));

export function isPlateHiddenFromOperator(plate: string): boolean {
  return hiddenPlates.has(normalizePlate(plate));
}

export function isDriverHiddenFromOperator(name: string): boolean {
  return hiddenDrivers.has(normalizeDriverName(name));
}

export function filterPlatesForRole<T extends { plate: string }>(
  role: string | undefined,
  items: T[],
): T[] {
  if (role !== 'OPERACAO') return items;
  return items.filter((v) => !isPlateHiddenFromOperator(v.plate));
}

export function filterDriversForRole<T extends { name: string }>(
  role: string | undefined,
  items: T[],
): T[] {
  if (role !== 'OPERACAO') return items;
  return items.filter((d) => !isDriverHiddenFromOperator(d.name));
}

/** Viagens com vehicle.plate e driverName opcional */
export function filterTripsForRole<T extends { driverName?: string | null; vehicle: { plate: string } }>(
  role: string | undefined,
  items: T[],
): T[] {
  if (role !== 'OPERACAO') return items;
  return items.filter((t) => {
    if (isPlateHiddenFromOperator(t.vehicle.plate)) return false;
    if (t.driverName && isDriverHiddenFromOperator(t.driverName)) return false;
    return true;
  });
}
