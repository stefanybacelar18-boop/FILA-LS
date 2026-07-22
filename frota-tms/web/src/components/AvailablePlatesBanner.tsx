import { useQuery } from '@tanstack/react-query'
import { Truck } from 'lucide-react'
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

  return (
    <div
      className={cn(
        'mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--color-primary)]/25 bg-[var(--color-primary-muted)] px-4 py-3.5',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--color-primary)] text-white">
          <Truck className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-[var(--color-primary)] uppercase">
            Placas disponíveis para roteiros
          </p>
          {isLoading ? (
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">Carregando…</p>
          ) : (
            <>
              <p className="mt-0.5 font-display text-3xl font-bold text-[var(--color-text)]">
                {count}
                <span className="ml-2 text-base font-medium text-[var(--color-text-muted)]">
                  {count === 1 ? 'placa' : 'placas'}
                </span>
              </p>
              <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">
                Capacidade total ≈ {capacity} motos
                {data && data.trucks + data.carretas > 0
                  ? ` · ${data.trucks} truck${data.trucks === 1 ? '' : 's'}${
                      data.carretas > 0
                        ? ` · ${data.carretas} carreta${data.carretas === 1 ? '' : 's'}`
                        : ''
                    }`
                  : ''}
              </p>

              {byOwner && (byOwner.LSL > 0 || byOwner.AG > 0) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-800/20 bg-slate-800 px-2 py-1 text-xs font-medium text-white">
                    LSL <strong>{byOwner.LSL}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-teal-700/25 bg-teal-700/10 px-2 py-1 text-xs font-medium text-teal-900 dark:text-teal-200">
                    AG <strong>{byOwner.AG}</strong>
                  </span>
                </div>
              )}

              {byCapacity.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {byCapacity.map((row) => (
                    <span
                      key={row.capacityMotos}
                      className="inline-flex flex-col gap-0.5 rounded-md border border-[var(--color-primary)]/20 bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)]"
                      title={`${row.count} veículo(s) com ${row.capacityMotos} motos`}
                    >
                      <span>
                        <span className="font-semibold text-[var(--color-primary)]">{row.count}</span>
                        <span className="text-[var(--color-text-muted)]"> × </span>
                        <span className="font-medium">{row.capacityMotos} motos</span>
                      </span>
                      {(row.lsl || row.ag) && (
                        <span className="text-[10px] text-[var(--color-text-muted)]">
                          {row.lsl ? `LSL ${row.lsl}` : ''}
                          {row.lsl && row.ag ? ' · ' : ''}
                          {row.ag ? `AG ${row.ag}` : ''}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <Link
        to="/frota"
        className="shrink-0 text-sm font-medium text-[var(--color-primary)] hover:underline"
      >
        Ver frota
      </Link>
    </div>
  )
}
