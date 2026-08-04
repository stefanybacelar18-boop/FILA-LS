import { ChevronRight, Package, Truck } from 'lucide-react'
import { Badge } from './ui/Badge'
import { formatDate } from '../lib/format'
import { cn } from '../lib/cn'
import { isExpiryCityExcluded } from '../lib/chronus-rules'
import {
  chronusPlateFromNotes,
  expiryUrgency,
  formatExpiryCell,
  routeLoadUrgency,
  totalMotoCountFromDestinations,
  urgencyBadgeTone,
  urgencyLabel,
  type RouteLoadDestination,
} from '../lib/route-priority'
import {
  routeFleetRequirement,
} from '../lib/chronus-plate-hint'

export type { RouteLoadDestination }

function sortDestinations(items: RouteLoadDestination[]) {
  return [...items].sort((a, b) => {
    const aExcluded = isExpiryCityExcluded(a.city)
    const bExcluded = isExpiryCityExcluded(b.city)
    if (aExcluded !== bExcluded) return aExcluded ? 1 : -1
    const aUrgency = expiryUrgency(a.minExpiryDate, a.city)
    const bUrgency = expiryUrgency(b.minExpiryDate, b.city)
    const rank = (u: ReturnType<typeof expiryUrgency>) =>
      u === 'expired' ? 0 : u === 'urgent' ? 1 : u === 'soon' ? 2 : u === 'normal' ? 3 : 4
    const urgencyDiff = rank(aUrgency) - rank(bUrgency)
    if (urgencyDiff !== 0) return urgencyDiff
    const aTime = a.minExpiryDate ? new Date(a.minExpiryDate).getTime() : Infinity
    const bTime = b.minExpiryDate ? new Date(b.minExpiryDate).getTime() : Infinity
    if (aTime !== bTime) return aTime - bTime
    return (a.order ?? 0) - (b.order ?? 0)
  })
}

function urgencyAccentClass(urgency: ReturnType<typeof routeLoadUrgency>) {
  switch (urgency) {
    case 'expired':
      return 'border-l-[var(--color-danger)] bg-[var(--color-danger)]/[0.04]'
    case 'urgent':
      return 'border-l-amber-500 bg-amber-500/[0.05]'
    case 'soon':
      return 'border-l-blue-500/70 bg-blue-500/[0.03]'
    default:
      return 'border-l-[var(--color-border)]'
  }
}

function expiryTextClass(urgency: ReturnType<typeof expiryUrgency>) {
  switch (urgency) {
    case 'expired':
      return 'font-semibold text-[var(--color-danger)]'
    case 'urgent':
      return 'font-semibold text-amber-700 dark:text-amber-300'
    case 'soon':
      return 'font-medium text-blue-700 dark:text-blue-300'
    default:
      return 'text-[var(--color-text)]'
  }
}

export function RouteLoadTable({
  destinations,
  compact = false,
}: {
  destinations: RouteLoadDestination[]
  compact?: boolean
}) {
  if (destinations.length === 0) return null
  const sorted = sortDestinations(destinations)

  return (
    <div className={cn('overflow-x-auto', compact ? 'mt-3' : 'mt-4')}>
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            <th className="pb-2 pr-3 font-semibold">Cidade</th>
            <th className="pb-2 pr-3 font-semibold">Concessionária</th>
            <th className="pb-2 pr-3 text-right font-semibold">Motos</th>
            <th className="pb-2 text-right font-semibold">Vencimento</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((d, idx) => {
            const excluded = isExpiryCityExcluded(d.city)
            const cell = formatExpiryCell(d.minExpiryDate, d.city)
            return (
              <tr
                key={`${d.city}-${d.dealershipName ?? ''}-${idx}`}
                className={cn(
                  'border-b border-[var(--color-border)]/50 last:border-0',
                  excluded && 'opacity-60',
                )}
              >
                <td className="py-2.5 pr-3 align-top font-medium text-[var(--color-text)]">
                  {d.city}
                </td>
                <td className="py-2.5 pr-3 align-top text-[var(--color-text-muted)]">
                  {d.dealershipName ?? '—'}
                </td>
                <td className="py-2.5 pr-3 align-top text-right tabular-nums text-[var(--color-text)]">
                  {d.motoCount != null ? d.motoCount : '—'}
                </td>
                <td className={cn('py-2.5 text-right align-top tabular-nums', expiryTextClass(cell.urgency))}>
                  {cell.label}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function RouteLoadCard({
  name,
  loadDate,
  destinations,
  priorityExpiryDate,
  notes,
  totalMotoCount,
  requiredFleetOwner,
  requiredCapacityMotos,
  onClick,
  className,
}: {
  name: string
  loadDate: string
  destinations: RouteLoadDestination[]
  priorityExpiryDate?: string | null
  notes?: string | null
  totalMotoCount?: number | null
  requiredFleetOwner?: 'LSL' | 'AG' | null
  requiredCapacityMotos?: number | null
  onClick?: () => void
  className?: string
}) {
  const urgency = routeLoadUrgency(priorityExpiryDate, destinations)
  const motos = totalMotoCount ?? totalMotoCountFromDestinations(destinations)
  const fleetReq = routeFleetRequirement({
    requiredFleetOwner,
    requiredCapacityMotos,
    notes,
  })
  const Wrapper = onClick ? 'button' : 'div'

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'w-full rounded-xl border border-[var(--color-border)] border-l-4 bg-[var(--color-surface)] p-4 text-left transition',
        urgencyAccentClass(urgency),
        onClick && 'hover:border-[var(--color-primary)]/35 hover:shadow-sm',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-[var(--color-text)]">{name}</h3>
            {(urgency === 'expired' || urgency === 'urgent') && (
              <Badge tone={urgencyBadgeTone(urgency)}>{urgencyLabel(urgency)}</Badge>
            )}
            {fleetReq.label && (
              <Badge tone={fleetReq.fleetOwner === 'LSL' ? 'primary' : 'info'}>
                {fleetReq.label}
              </Badge>
            )}
            {priorityExpiryDate && (
              <Badge tone={urgencyBadgeTone(expiryUrgency(priorityExpiryDate))}>
                Venc. {formatDate(priorityExpiryDate)}
              </Badge>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--color-text-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5 shrink-0" />
              {motos != null ? (
                <strong className="font-semibold text-[var(--color-text)]">{motos} motos</strong>
              ) : (
                'Motos —'
              )}
            </span>
            <span>
              <strong className="font-semibold text-[var(--color-text)]">{destinations.length}</strong>{' '}
              destino{destinations.length === 1 ? '' : 's'}
            </span>
            <span>
              Saída <strong className="font-semibold text-[var(--color-text)]">{formatDate(loadDate)} 06:00</strong>
            </span>
            {fleetReq.label && (
              <span className="inline-flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5 shrink-0" />
                Veículo:{' '}
                <strong className="font-semibold text-[var(--color-text)]">{fleetReq.label}</strong>
              </span>
            )}
            {!fleetReq.fleetOwner && !fleetReq.capacityMotos && chronusPlateFromNotes(notes) && (
              <span className="inline-flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5 shrink-0" />
                Placa Chronus:{' '}
                <strong className="font-semibold text-[var(--color-text)]">
                  {chronusPlateFromNotes(notes)}
                </strong>
              </span>
            )}
          </div>
        </div>
        {onClick && (
          <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-[var(--color-text-muted)]" />
        )}
      </div>

      <RouteLoadTable destinations={destinations} compact />
    </Wrapper>
  )
}
