/** Veículos quase nunca saem 100% cheios — usa 80% da capacidade nominal. */
export const USEFUL_CAPACITY_FACTOR = 0.8;

export function usefulCapacityMotos(nominalCapacity: number): number {
  return Number(nominalCapacity) * USEFUL_CAPACITY_FACTOR;
}

export function sumUsefulCapacityMotos(capacities: Iterable<number>): number {
  let sum = 0;
  for (const c of capacities) sum += usefulCapacityMotos(c);
  return Math.round(sum);
}
