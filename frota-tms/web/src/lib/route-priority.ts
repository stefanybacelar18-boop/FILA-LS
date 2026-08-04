import { addDays, startOfDay } from 'date-fns'
import { formatDate } from './format'
import { isExpiryCityExcluded } from './chronus-rules'

/** Urgência do vencimento para priorização visual e operacional. */
export type ExpiryUrgency = 'expired' | 'urgent' | 'soon' | 'normal' | 'excluded' | 'none'

export type RouteLoadDestination = {
  city: string
  dealershipName?: string
  motoCount?: number | null
  minExpiryDate?: string | null
  order?: number
}

function dayStart(value: string | Date): Date {
  return startOfDay(typeof value === 'string' ? new Date(value) : value)
}

/** Vencido ou vence hoje/amanhã (dentro de 1 dia). */
export function isUrgentExpiry(date: string | null | undefined): boolean {
  if (!date) return false
  const today = dayStart(new Date())
  const expiry = dayStart(date)
  return expiry <= addDays(today, 1)
}

/** Prioridade ativa: vencimento urgente ou flag manual sem data. */
export function hasActivePriority(route: {
  hasPriority?: boolean
  priorityExpiryDate?: string | Date | null
}): boolean {
  if (route.priorityExpiryDate) return isUrgentExpiry(String(route.priorityExpiryDate).slice(0, 10))
  return !!route.hasPriority
}

export function expiryUrgency(
  date: string | null | undefined,
  city?: string,
): ExpiryUrgency {
  if (city && isExpiryCityExcluded(city)) return 'excluded'
  if (!date) return 'none'
  const today = dayStart(new Date())
  const expiry = dayStart(date)
  if (expiry < today) return 'expired'
  if (expiry <= addDays(today, 1)) return 'urgent'
  if (expiry <= addDays(today, 3)) return 'soon'
  return 'normal'
}

export function urgencyLabel(urgency: ExpiryUrgency): string {
  switch (urgency) {
    case 'expired':
      return 'Vencido'
    case 'urgent':
      return 'Vence em 1 dia'
    case 'soon':
      return 'Atenção'
    case 'excluded':
      return 'Desconsiderado'
    default:
      return ''
  }
}

export function urgencyBadgeTone(
  urgency: ExpiryUrgency,
): 'danger' | 'warning' | 'info' | 'default' {
  if (urgency === 'expired') return 'danger'
  if (urgency === 'urgent') return 'warning'
  if (urgency === 'soon') return 'info'
  return 'default'
}

export function routeLoadUrgency(
  priorityExpiryDate: string | null | undefined,
  destinations: RouteLoadDestination[],
): ExpiryUrgency {
  if (priorityExpiryDate) {
    const routeUrgency = expiryUrgency(priorityExpiryDate)
    if (routeUrgency === 'expired' || routeUrgency === 'urgent') return routeUrgency
  }

  let best: ExpiryUrgency = 'none'
  for (const d of destinations) {
    const u = expiryUrgency(d.minExpiryDate, d.city)
    if (u === 'expired') return 'expired'
    if (u === 'urgent') best = 'urgent'
    else if (u === 'soon' && best !== 'urgent') best = 'soon'
    else if (u === 'normal' && best === 'none') best = 'normal'
  }
  return best
}

/** Roteiros aguardando placa: menor vencimento primeiro. */
export function compareRoutesByLoadPriority(
  a: {
    priorityExpiryDate?: string | null
    date: string
    createdAt?: string
  },
  b: {
    priorityExpiryDate?: string | null
    date: string
    createdAt?: string
  },
): number {
  const ae = a.priorityExpiryDate ? new Date(a.priorityExpiryDate).getTime() : Infinity
  const be = b.priorityExpiryDate ? new Date(b.priorityExpiryDate).getTime() : Infinity
  if (ae !== be) return ae - be

  const da = new Date(a.date).getTime()
  const db = new Date(b.date).getTime()
  if (da !== db) return da - db

  if (a.createdAt && b.createdAt) {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  }
  return 0
}

export function totalMotoCountFromDestinations(
  destinations: RouteLoadDestination[],
): number | null {
  if (destinations.length === 0) return null
  let sum = 0
  let hasAny = false
  for (const d of destinations) {
    if (d.motoCount != null) {
      sum += d.motoCount
      hasAny = true
    }
  }
  return hasAny ? sum : null
}

export function chronusPlateFromNotes(notes?: string | null): string | null {
  if (!notes) return null
  const match = notes.match(/Placa Chronus:\s*(.+)/i)
  return match?.[1]?.trim() ?? null
}

export function formatExpiryCell(
  date: string | null | undefined,
  city?: string,
): { label: string; urgency: ExpiryUrgency } {
  const urgency = expiryUrgency(date, city)
  if (urgency === 'excluded') return { label: 'Desconsiderado', urgency }
  if (!date) return { label: '—', urgency: 'none' }
  return { label: formatDate(date), urgency }
}
