/** Cidades cujo vencimento N.F. não entra na prioridade (desacordo comercial). */
export function isExpiryCityExcluded(city: string): boolean {
  const c = city.trim().toUpperCase()
  return c.includes('POMBAL') || c.startsWith('EUCLIDES')
}
