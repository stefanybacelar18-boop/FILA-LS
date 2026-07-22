/** Placas LSL = as que a Operação (AG) não visualiza. Demais = AG. */
export const LSL_PLATES = [
  'EZU2D86',
  'EOE1F87',
  'SVS9H87',
  'TKX7D86',
  'BPQ1E82',
  'EOE1581',
  'SUC6B93',
  'TME3H94',
] as const

export type PlateOwner = 'LSL' | 'AG'

function normalizePlate(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

const lslSet = new Set(LSL_PLATES.map(normalizePlate))

export function plateOwner(plate: string): PlateOwner {
  return lslSet.has(normalizePlate(plate)) ? 'LSL' : 'AG'
}
