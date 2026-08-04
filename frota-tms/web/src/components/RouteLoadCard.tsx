import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { formatDate } from '../lib/format'
import { cn } from '../lib/cn'
import { isExpiryCityExcluded } from '../lib/chronus-rules'
import {
  chronusPlateFromNotes,
  expiryUrgency,
  formatExpiryCell,
  routeLoadUrgency,
  totalMotoCountFromDestinations,
  urgencyLabel,
  type RouteLoadDestination,
} from '../lib/route-priority'
import { routeFleetRequirement } from '../lib/chronus-plate-hint'

export type { RouteLoadDestination }

function sortDestinations(items: RouteLoadDestination[]) {
  return [...items].sort((a, b) => {
    const orderA = a.order ?? Number.MAX_SAFE_INTEGER
    const orderB = b.order ?? Number.MAX_SAFE_INTEGER
    if (orderA !== orderB) return orderA - orderB

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
    return 0
  })
}

function urgencyCardClass(urgency: ReturnType<typeof routeLoadUrgency>) {
  switch (urgency) {
    case 'expired':
      return 'border-[var(--color-danger)]/45 border-l-4 border-l-[var(--color-danger)] bg-[var(--color-danger)]/[0.07] ring-1 ring-[var(--color-danger)]/10'
    case 'urgent':
      return 'border-amber-400/55 border-l-4 border-l-amber-500 bg-amber-500/[0.07] ring-1 ring-amber-500/10'
    default:
      return 'border-[var(--color-border)] border-l-[3px] border-l-[var(--color-border)]'
  }
}

function urgencyExpiryPillClass(urgency: ReturnType<typeof routeLoadUrgency>) {
  switch (urgency) {
    case 'expired':
      return 'bg-[var(--color-danger)]/12 font-semibold text-[var(--color-danger)]'
    case 'urgent':
      return 'bg-amber-500/15 font-semibold text-amber-800 dark:text-amber-200'
    default:
      return 'text-[var(--color-text-muted)]'
  }
}

function urgencyStatusPillClass(urgency: 'expired' | 'urgent') {
  return urgency === 'expired'
    ? 'bg-[var(--color-danger)] text-white'
    : 'bg-amber-500 text-amber-950'
}

function expiryTextClass(urgency: ReturnType<typeof expiryUrgency>) {
  switch (urgency) {
    case 'expired':
      return 'font-medium text-[var(--color-danger)]'
    case 'urgent':
      return 'font-medium text-amber-700 dark:text-amber-300'
    default:
      return 'text-[var(--color-text-muted)]'
  }
}

export function RouteLoadTable({
  destinations,
  className,
}: {
  destinations: RouteLoadDestination[]
  className?: string
}) {
  if (destinations.length === 0) return null

  const sorted = sortDestinations(destinations)
  const active = sorted.filter((d) => !isExpiryCityExcluded(d.city))
  const excluded = sorted.filter((d) => isExpiryCityExcluded(d.city))

  return (
    <div className={cn('mt-4 border-t border-[var(--color-border)]/60 pt-3', className)}>
      <div className="hidden gap-3 px-1 pb-1 text-xs text-[var(--color-text-muted)] sm:grid sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_3.5rem_5.5rem]">
        <span>Cidade</span>
        <span>Concessionária</span>
        <span className="text-right">Motos</span>
        <span className="text-right">Venc.</span>
      </div>

      <ul className="divide-y divide-[var(--color-border)]/40">
        {active.map((d, idx) => {
          const cell = formatExpiryCell(d.minExpiryDate, d.city)
          return (
            <li
              key={`${d.city}-${d.dealershipName ?? ''}-${idx}`}
              className={cn(
                'grid gap-1 px-1 py-2.5 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_3.5rem_5.5rem] sm:items-baseline sm:gap-3',
                cell.urgency === 'expired' && 'rounded-lg bg-[var(--color-danger)]/[0.05]',
                cell.urgency === 'urgent' && 'rounded-lg bg-amber-500/[0.06]',
              )}
            >
              <span className="text-sm font-medium text-[var(--color-text)]">{d.city}</span>
              <span className="text-sm text-[var(--color-text-muted)] sm:truncate">
                {d.dealershipName ?? '—'}
              </span>
              <span className="text-sm tabular-nums text-[var(--color-text)] sm:text-right">
                {d.motoCount != null ? (
                  d.motoCount
                ) : (
                  <span className="text-[var(--color-text-muted)]">—</span>
                )}
              </span>
              <span
                className={cn('text-sm tabular-nums sm:text-right', expiryTextClass(cell.urgency))}
              >
                {cell.label}
              </span>
            </li>
          )
        })}
      </ul>

      {excluded.length > 0 && (
        <p className="mt-2 px-1 text-xs leading-relaxed text-[var(--color-text-muted)]">
          Fora do vencimento:{' '}
          {excluded
            .map((d) => (d.motoCount != null ? `${d.city} (${d.motoCount})` : d.city))
            .join(' · ')}
        </p>
      )}
    </div>
  )
}

function MetaItem({ children }: { children: ReactNode }) {
  return <span className="text-sm text-[var(--color-text-muted)]">{children}</span>
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
  const legacyPlate = !fleetReq.fleetOwner && chronusPlateFromNotes(notes)
  const Wrapper = onClick ? 'button' : 'div'

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'group w-full rounded-2xl border bg-[var(--color-surface)] p-4 text-left transition sm:p-5',
        urgencyCardClass(urgency),
        onClick &&
          'hover:border-[var(--color-primary)]/25 hover:bg-[var(--color-surface-2)]/30',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold tracking-tight text-[var(--color-text)]">
                {name}
              </h3>
              {(urgency === 'expired' || urgency === 'urgent') && (
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
                    urgencyStatusPillClass(urgency),
                  )}
                >
                  {urgencyLabel(urgency)}
                </span>
              )}
            </div>
            {priorityExpiryDate && (
              <span
                className={cn(
                  'shrink-0 rounded-md px-2 py-0.5 text-sm tabular-nums',
                  urgencyExpiryPillClass(urgency),
                )}
              >
                Venc. {formatDate(priorityExpiryDate)}
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <MetaItem>
              <span className="font-medium text-[var(--color-text)]">
                {motos != null ? `${motos} motos` : 'Motos —'}
              </span>
            </MetaItem>
            <span className="text-[var(--color-text-muted)]/40">·</span>
            <MetaItem>
              {destinations.length} destino{destinations.length === 1 ? '' : 's'}
            </MetaItem>
            <span className="text-[var(--color-text-muted)]/40">·</span>
            <MetaItem>Saída {formatDate(loadDate)} 06h</MetaItem>
            {(fleetReq.fleetOwner || fleetReq.capacityMotos != null) && (
              <>
                <span className="text-[var(--color-text-muted)]/40">·</span>
                <MetaItem>
                  <span
                    className={cn(
                      'rounded-md px-1.5 py-0.5 text-xs font-medium',
                      fleetReq.fleetOwner === 'LSL'
                        ? 'bg-[var(--color-primary-muted)] text-[var(--color-primary)]'
                        : 'bg-[var(--color-surface-2)] text-[var(--color-text)]',
                    )}
                  >
                    {fleetReq.fleetOwner ?? '—'}
                    {fleetReq.capacityMotos != null ? ` ${fleetReq.capacityMotos}` : ''}
                  </span>
                </MetaItem>
              </>
            )}
            {legacyPlate && (
              <>
                <span className="text-[var(--color-text-muted)]/40">·</span>
                <MetaItem>Chronus {legacyPlate}</MetaItem>
              </>
            )}
          </div>
        </div>

        {onClick && (
          <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-text-muted)]/60 transition group-hover:text-[var(--color-text-muted)]" />
        )}
      </div>

      <RouteLoadTable destinations={destinations} />
    </Wrapper>
  )
}
