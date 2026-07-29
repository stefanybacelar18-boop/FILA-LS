import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ChevronDown, ChevronUp, Truck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { cn } from '../lib/cn'

export interface AvailabilitySummary {
  count: number
  capacityMotos: number
  trucks: number
  carretas: number
  plates: string[]
  byCapacity?: { capacityMotos: number; count: number; lsl?: number; ag?: number }[]
  byOwner?: { LSL: number; AG: number }
}

/** Faixa: placas livres para montar roteiros (Admin). Compacta por padrão. */
export function AvailablePlatesBanner({
  className,
  defaultOpen = false,
}: {
  className?: string
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const { data, isLoading } = useQuery({
    queryKey: ['vehicles-availability-summary'],
    queryFn: async () =>
      (await api.get<AvailabilitySummary>('/vehicles/availability-summary')).data,
    refetchInterval: 30_000,
  })

  const count = data?.count ?? 0
  const capacity = data?.capacityMotos ?? 0
  const byCapacity = data?.byCapacity ?? []
  const byOwner = data?.byOwner
  const summaryLine = isLoading
    ? 'Carregando…'
    : [
        `${count} livre${count === 1 ? '' : 's'}`,
        `≈ ${capacity} motos`,
        byOwner ? `LSL ${byOwner.LSL}` : null,
        byOwner ? `AG ${byOwner.AG}` : null,
      ]
        .filter(Boolean)
        .join(' · ')

  return (
    <section
      className={cn(
        'mb-4 overflow-hidden rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)]',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-primary)] text-white">
          <Truck className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--color-text)]">Placas disponíveis</p>
          <p className="truncate text-xs text-[var(--color-text-muted)]">{summaryLine}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            to="/frota"
            className="hidden text-xs font-medium text-[var(--color-primary)] hover:underline sm:inline"
          >
            Frota
            <ArrowRight className="ml-0.5 inline h-3 w-3" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
            aria-expanded={open}
          >
            {open ? 'Ocultar' : 'Detalhes'}
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {open && !isLoading && (
        <div className="space-y-3 border-t border-[var(--color-border)] px-3 py-3">
          <div className="flex flex-wrap gap-3 text-sm">
            <span>
              <span className="text-[var(--color-text-muted)]">Total </span>
              <strong className="tabular-nums">{count}</strong>
            </span>
            <span>
              <span className="text-[var(--color-text-muted)]">LSL </span>
              <strong className="tabular-nums">{byOwner?.LSL ?? 0}</strong>
            </span>
            <span>
              <span className="text-[var(--color-text-muted)]">AG </span>
              <strong className="tabular-nums">{byOwner?.AG ?? 0}</strong>
            </span>
            <span>
              <span className="text-[var(--color-text-muted)]">Capacidade ≈ </span>
              <strong className="tabular-nums">{capacity}</strong>
              <span className="text-[var(--color-text-muted)]"> motos</span>
            </span>
          </div>

          {byCapacity.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[24rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-text-muted)]">
                    <th className="pb-1.5 pr-3 font-medium">Capacidade</th>
                    <th className="pb-1.5 pr-3 font-medium">Placas</th>
                    <th className="pb-1.5 pr-3 font-medium">LSL</th>
                    <th className="pb-1.5 font-medium">AG</th>
                  </tr>
                </thead>
                <tbody>
                  {byCapacity.map((row) => (
                    <tr
                      key={row.capacityMotos}
                      className="border-b border-[var(--color-border)]/70 last:border-0"
                    >
                      <td className="py-1.5 pr-3 tabular-nums">
                        {row.capacityMotos}{' '}
                        <span className="text-[var(--color-text-muted)]">motos</span>
                      </td>
                      <td className="py-1.5 pr-3 font-medium tabular-nums text-[var(--color-primary)]">
                        {row.count}
                      </td>
                      <td className="py-1.5 pr-3 tabular-nums text-[var(--color-text-muted)]">
                        {row.lsl || '—'}
                      </td>
                      <td className="py-1.5 tabular-nums text-[var(--color-text-muted)]">
                        {row.ag || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
