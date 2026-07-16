import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { ReturnsPanel, Trip } from '../types'
import {
  PageHeader,
  PlateBadge,
  Spinner,
  EmptyState,
  Button,
  ConfirmModal,
  Badge,
} from '../components/ui'
import { formatDate, formatDateTime } from '../lib/format'
import { cn } from '../lib/cn'

function TripSection({
  title,
  trips,
  tone,
  onReturn,
}: {
  title: string
  trips: Trip[]
  tone: string
  onReturn: (trip: Trip) => void
}) {
  return (
    <section className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <h2 className={cn('font-display text-sm font-semibold', tone)}>{title}</h2>
        <Badge>{trips.length}</Badge>
      </div>
      {trips.length === 0 ? (
        <EmptyState title="Nenhuma viagem" className="py-8" />
      ) : (
        <div className="table-wrap border-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>Placa</th>
                <th>Destino</th>
                <th>Previsão</th>
                <th>Saída</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {trips.map((t) => (
                <tr key={t.id} className={cn(t.overdue && 'bg-red-500/5')}>
                  <td>
                    <PlateBadge plate={t.vehicle.plate} color={t.color ?? 'red'} />
                  </td>
                  <td>
                    <div className="font-medium">{t.dealership.name}</div>
                    <div className="text-xs text-[var(--color-text-muted)]">{t.route?.name}</div>
                  </td>
                  <td className={cn(t.overdue && 'font-semibold text-[var(--color-danger)]')}>
                    {formatDate(t.expectedReturn)}
                  </td>
                  <td>{formatDateTime(t.departureAt)}</td>
                  <td>
                    <Button size="sm" onClick={() => onReturn(t)}>
                      Retornou
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function Returns() {
  const qc = useQueryClient()
  const [confirmTrip, setConfirmTrip] = useState<Trip | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['returns'],
    queryFn: async () => (await api.get<ReturnsPanel>('/trips/returns')).data,
  })

  const returnMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/trips/${id}/return`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['returns'] })
      void qc.invalidateQueries({ queryKey: ['trips'] })
      void qc.invalidateQueries({ queryKey: ['vehicles'] })
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
      setConfirmTrip(null)
    },
  })

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Retornos"
        description="Veículos com retorno previsto hoje, amanhã, em 2 dias ou em atraso"
      />

      <div className="grid gap-4">
        <TripSection
          title="Atraso"
          trips={data.overdue}
          tone="text-[var(--color-danger)]"
          onReturn={setConfirmTrip}
        />
        <TripSection
          title="Hoje"
          trips={data.today}
          tone="text-blue-600"
          onReturn={setConfirmTrip}
        />
        <TripSection
          title="Amanhã"
          trips={data.tomorrow}
          tone="text-orange-600"
          onReturn={setConfirmTrip}
        />
        <TripSection
          title="Em 2 dias"
          trips={data.in2Days}
          tone="text-[var(--color-text-muted)]"
          onReturn={setConfirmTrip}
        />
      </div>

      <ConfirmModal
        open={!!confirmTrip}
        onClose={() => setConfirmTrip(null)}
        onConfirm={() => confirmTrip && returnMutation.mutate(confirmTrip.id)}
        title="Confirmar retorno"
        message={`Confirma o retorno da placa ${confirmTrip?.vehicle.plate}? O veículo voltará para disponível.`}
        confirmLabel="Confirmar retorno"
        loading={returnMutation.isPending}
      />
    </div>
  )
}
