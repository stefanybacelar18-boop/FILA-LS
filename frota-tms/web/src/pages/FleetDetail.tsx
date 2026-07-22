import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { api } from '../lib/api'
import type { Trip, Vehicle, VehicleHistory } from '../types'
import { PageHeader, PlateBadge, Spinner, Badge, EmptyState } from '../components/ui'
import { formatDate, formatDateTime } from '../lib/format'
import { tripStatusLabels, vehicleStatusLabels, vehicleTypeLabels } from '../lib/labels'
import { plateOwner } from '../lib/plateOwner'

interface VehicleHistoryResponse {
  vehicle: Vehicle
  history: VehicleHistory[]
  trips: Trip[]
}

export function FleetDetail() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, error } = useQuery({
    queryKey: ['history', 'vehicle', id],
    queryFn: async () => (await api.get<VehicleHistoryResponse>(`/history/vehicle/${id}`)).data,
    enabled: !!id,
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error || !data) {
    return <p className="text-[var(--color-danger)]">Veículo não encontrado.</p>
  }

  const { vehicle, history, trips } = data

  return (
    <div>
      <div className="mb-4">
        <Link
          to="/frota"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar à frota
        </Link>
      </div>

      <PageHeader
        title={vehicle.plate}
        description={`${vehicle.brand} ${vehicle.model} · ${vehicleTypeLabels[vehicle.type]} · ${vehicle.year}`}
        actions={
          <PlateBadge
            plate={vehicle.plate}
            color={
              vehicle.color ??
              (vehicle.status === 'EM_VIAGEM'
                ? 'blue'
                : vehicle.status === 'EM_MANUTENCAO' || vehicle.status === 'BLOQUEADO'
                  ? 'black'
                  : vehicle.status === 'EM_CARREGAMENTO'
                    ? 'yellow'
                    : 'green')
            }
          />
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Info
          label="Frota"
          value={vehicle.owner ?? plateOwner(vehicle.plate)}
        />
        <Info label="Situação" value={vehicleStatusLabels[vehicle.status]} />
        <Info label="Capacidade" value={`${vehicle.capacityMotos} motos`} />
        <Info label="Motorista padrão" value={vehicle.defaultDriver ?? '—'} />
        <Info label="Viagens" value={String(trips.length)} />
      </div>

      {(vehicle.maintenanceHold || vehicle.status === 'EM_MANUTENCAO') && (
        <div className="mb-5 rounded-[var(--radius)] border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
          <p className="font-medium text-amber-800 dark:text-amber-200">
            Bloqueio longo — só volta a carregar após liberação em Manutenção
          </p>
          {vehicle.blockReason && (
            <p className="mt-1 text-[var(--color-text-muted)]">Motivo: {vehicle.blockReason}</p>
          )}
          {vehicle.blockedAt && (
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Desde {formatDateTime(vehicle.blockedAt)}
              {vehicle.blockedBy?.name ? ` · por ${vehicle.blockedBy.name}` : ''}
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <h2 className="border-b border-[var(--color-border)] px-4 py-3 font-display text-sm font-semibold">
            Linha do tempo
          </h2>
          {history.length === 0 ? (
            <EmptyState title="Sem histórico" />
          ) : (
            <ol className="space-y-0 p-4">
              {history.map((h, i) => (
                <li key={h.id} className="relative flex gap-3 pb-5 last:pb-0">
                  {i < history.length - 1 && (
                    <span className="absolute top-3 left-[7px] h-full w-px bg-[var(--color-border)]" />
                  )}
                  <span className="relative z-10 mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-[var(--color-primary)] bg-[var(--color-surface)]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="primary">{h.action}</Badge>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {formatDateTime(h.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">
                      {h.fromStatus && h.toStatus
                        ? `${vehicleStatusLabels[h.fromStatus as keyof typeof vehicleStatusLabels] ?? h.fromStatus} → ${vehicleStatusLabels[h.toStatus as keyof typeof vehicleStatusLabels] ?? h.toStatus}`
                        : h.toStatus
                          ? vehicleStatusLabels[h.toStatus as keyof typeof vehicleStatusLabels] ?? h.toStatus
                          : null}
                    </p>
                    {h.details && (
                      <p className="text-sm text-[var(--color-text-muted)]">{h.details}</p>
                    )}
                    {h.user && (
                      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">por {h.user.name}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <h2 className="border-b border-[var(--color-border)] px-4 py-3 font-display text-sm font-semibold">
            Viagens
          </h2>
          {trips.length === 0 ? (
            <EmptyState title="Nenhuma viagem" />
          ) : (
            <div className="table-wrap border-0">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Destino</th>
                    <th>Saída</th>
                    <th>Retorno</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {trips.map((t) => (
                    <tr key={t.id}>
                      <td>{t.dealership.name}</td>
                      <td>{formatDate(t.departureAt)}</td>
                      <td>{formatDate(t.returnedAt ?? t.expectedReturn)}</td>
                      <td>
                        <Badge tone={t.status === 'ATRASADO' ? 'danger' : t.status === 'RETORNOU' ? 'success' : 'info'}>
                          {tripStatusLabels[t.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-0.5 font-display font-semibold">{value}</p>
    </div>
  )
}
