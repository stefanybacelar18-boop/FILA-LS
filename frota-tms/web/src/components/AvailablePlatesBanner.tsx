import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Truck } from 'lucide-react'
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

function Metric({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number
  tone?: 'default' | 'lsl' | 'ag'
}) {
  return (
    <div
      className={cn(
        'min-w-[6.5rem] flex-1 rounded-lg border px-3 py-2.5',
        tone === 'lsl' && 'border-slate-800/30 bg-slate-900 text-white',
        tone === 'ag' && 'border-teal-700/25 bg-teal-700/10',
        tone === 'default' && 'border-[var(--color-border)] bg-[var(--color-surface)]',
      )}
    >
      <p
        className={cn(
          'text-[11px] font-semibold tracking-wide uppercase',
          tone === 'lsl' ? 'text-white/70' : 'text-[var(--color-text-muted)]',
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 font-display text-2xl font-bold tabular-nums',
          tone === 'lsl' ? 'text-white' : 'text-[var(--color-text)]',
        )}
      >
        {value}
      </p>
    </div>
  )
}

/** Faixa visível: quantas placas livres para montar roteiros (Admin) */
export function AvailablePlatesBanner({ className }: { className?: string }) {
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
  const typeLine =
    data && data.trucks + data.carretas > 0
      ? [
          data.trucks > 0 ? `${data.trucks} truck${data.trucks === 1 ? '' : 's'}` : null,
          data.carretas > 0 ? `${data.carretas} carreta${data.carretas === 1 ? '' : 's'}` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : null

  return (
    <section
      className={cn(
        'mb-5 overflow-hidden rounded-[var(--radius)] border border-[var(--color-primary)]/20 bg-[var(--color-surface)] shadow-[var(--shadow-sm)]',
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-primary-muted)] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--color-primary)] text-white">
            <Truck className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-text)]">
              Placas disponíveis para roteiros
            </h2>
            {!isLoading && (
              <p className="text-xs text-[var(--color-text-muted)]">
                Capacidade total ≈ {capacity} motos
                {typeLine ? ` · ${typeLine}` : ''}
              </p>
            )}
          </div>
        </div>
        <Link
          to="/frota"
          className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-primary)] hover:underline"
        >
          Ver frota
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      <div className="space-y-4 px-4 py-4">
        {isLoading ? (
          <p className="text-sm text-[var(--color-text-muted)]">Carregando…</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Metric label="Total livres" value={count} />
              <Metric label="LSL" value={byOwner?.LSL ?? 0} tone="lsl" />
              <Metric label="AG" value={byOwner?.AG ?? 0} tone="ag" />
            </div>

            {byCapacity.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold tracking-wide text-[var(--color-text-muted)] uppercase">
                  Por capacidade de motos
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[28rem] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-text-muted)]">
                        <th className="pb-2 pr-3 font-medium">Capacidade</th>
                        <th className="pb-2 pr-3 font-medium">Placas</th>
                        <th className="pb-2 pr-3 font-medium">LSL</th>
                        <th className="pb-2 font-medium">AG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byCapacity.map((row) => (
                        <tr
                          key={row.capacityMotos}
                          className="border-b border-[var(--color-border)]/70 last:border-0"
                        >
                          <td className="py-2.5 pr-3 font-medium tabular-nums">
                            {row.capacityMotos}{' '}
                            <span className="font-normal text-[var(--color-text-muted)]">motos</span>
                          </td>
                          <td className="py-2.5 pr-3 font-semibold tabular-nums text-[var(--color-primary)]">
                            {row.count}
                          </td>
                          <td className="py-2.5 pr-3 tabular-nums">
                            {row.lsl ? (
                              <span className="inline-flex min-w-[1.75rem] justify-center rounded bg-slate-900 px-1.5 py-0.5 text-xs font-semibold text-white">
                                {row.lsl}
                              </span>
                            ) : (
                              <span className="text-[var(--color-text-muted)]">—</span>
                            )}
                          </td>
                          <td className="py-2.5 tabular-nums">
                            {row.ag ? (
                              <span className="inline-flex min-w-[1.75rem] justify-center rounded bg-teal-700/15 px-1.5 py-0.5 text-xs font-semibold text-teal-900 dark:text-teal-200">
                                {row.ag}
                              </span>
                            ) : (
                              <span className="text-[var(--color-text-muted)]">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
