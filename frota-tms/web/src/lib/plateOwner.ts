/** Placas LSL = as que a Operação (AG) não visualiza. Demais = AG.
 * Fallback quando o cadastro ainda não enviou `owner`. */
export const LSL_PLATES = [
  'EZU2D86',
  'EOE1F87',
  'SVS9H87',
  'SVG0H96',
  'TKX7D86',
  'BPQ1E82',
  'EOE1F81',
  'SUC6B93',
  'TME3H94',
  'UEV4A13',
] as const

export type PlateOwner = 'LSL' | 'AG'

function normalizePlate(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

const lslSet = new Set(LSL_PLATES.map(normalizePlate))

export function parsePlateOwner(value: string | null | undefined): PlateOwner | null {
  if (value === 'LSL' || value === 'AG') return value
  return null
}

export function plateOwner(plate: string, storedOwner?: string | null): PlateOwner {
  return parsePlateOwner(storedOwner) ?? (lslSet.has(normalizePlate(plate)) ? 'LSL' : 'AG')
}
