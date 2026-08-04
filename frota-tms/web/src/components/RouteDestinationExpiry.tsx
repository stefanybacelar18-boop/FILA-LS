import { Badge } from './ui/Badge'
import { formatDate, toInputDate } from '../lib/format'
import { cn } from '../lib/cn'
import { isExpiryCityExcluded } from '../lib/chronus-rules'

export type RouteDestinationExpiryItem = {
  city: string
  name?: string
  minExpiryDate?: string | null
  motoCount?: number
}

function sortDestinations(items: RouteDestinationExpiryItem[]) {
  return [...items].sort((a, b) => {
    const aExcluded = isExpiryCityExcluded(a.city)
    const bExcluded = isExpiryCityExcluded(b.city)
    if (aExcluded !== bExcluded) return aExcluded ? 1 : -1
    if (aExcluded) return a.city.localeCompare(b.city, 'pt-BR')
    const aTime = a.minExpiryDate ? new Date(a.minExpiryDate).getTime() : Infinity
    const bTime = b.minExpiryDate ? new Date(b.minExpiryDate).getTime() : Infinity
    return aTime - bTime
  })
}

function expiryTone(
  excluded: boolean,
  minExpiryDate: string | null | undefined,
): 'muted' | 'default' | 'danger' {
  if (excluded) return 'muted'
  if (!minExpiryDate) return 'muted'
  if (toInputDate(minExpiryDate) <= toInputDate(new Date())) return 'danger'
  return 'default'
}

export function RouteDestinationExpiryList({
  items,
  className,
  showHeader = true,
}: {
  items: RouteDestinationExpiryItem[]
  className?: string
  showHeader?: boolean
}) {
  if (items.length === 0) return null

  const sorted = sortDestinations(items)

  return (
    <div className={cn('mt-2', className)}>
      {showHeader && (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
          <span>Concessionária</span>
          <span className="text-right">Vencimento</span>
        </div>
      )}
      <ul>
        {sorted.map((d) => {
        const excluded = isExpiryCityExcluded(d.city)
        const tone = expiryTone(excluded, d.minExpiryDate)
        return (
          <li
            key={`${d.city}-${d.name ?? ''}`}
            className={cn(
              'grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 border-t border-[var(--color-border)]/50 py-2 text-sm first:border-t-0 first:pt-0',
              excluded && 'opacity-70',
            )}
          >
            <span className="min-w-0 text-[var(--color-text-muted)]">
              <span className={excluded ? 'line-through decoration-[var(--color-border)]' : undefined}>
                {d.city}
              </span>
              {d.name ? ` · ${d.name}` : ''}
              {d.motoCount != null ? ` (${d.motoCount} motos)` : ''}
            </span>
            <span
              className={cn(
                'shrink-0 text-right text-xs tabular-nums',
                tone === 'danger' && 'font-semibold text-[var(--color-danger)]',
                tone === 'default' && 'font-medium text-[var(--color-text)]',
                tone === 'muted' && 'text-[var(--color-text-muted)]',
              )}
            >
              {excluded
                ? 'Desconsiderado'
                : d.minExpiryDate
                  ? formatDate(d.minExpiryDate)
                  : '—'}
            </span>
          </li>
        )
      })}
      </ul>
    </div>
  )
}

export function RouteExpiryBadge({
  expiryDate,
  className,
}: {
  expiryDate: string | null | undefined
  className?: string
}) {
  if (!expiryDate) return null
  const past = toInputDate(expiryDate) <= toInputDate(new Date())
  return (
    <Badge tone={past ? 'danger' : 'warning'} className={className}>
      Venc. {formatDate(expiryDate)}
    </Badge>
  )
}

export function routeDestinationCities(items: RouteDestinationExpiryItem[]): string[] {
  return [...new Set(items.map((d) => d.city))]
}
