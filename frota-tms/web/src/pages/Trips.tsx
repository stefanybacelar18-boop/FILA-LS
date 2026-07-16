import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Trip } from '../types'
import {
  PageHeader,
  SearchInput,
  Select,
  PlateBadge,
  Spinner,
  EmptyState,
  Badge,
} from '../components/ui'
import { tripStatusLabels } from '../lib/labels'
import { formatDate, formatDateTime } from '../lib/format'
import { cn } from '../lib/cn'

export function Trips() {
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')

  const { data = [], isLoading } = useQuery({
    queryKey: ['trips', status],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (status) params.status = status
      return (await api.get<Trip[]>('/trips', { params })).data
    },
  })

  const filtered = data.filter((t) => {
    if (!q) return true
    const s = q.toLowerCase()
    return (
      t.vehicle.plate.toLowerCase().includes(s) ||
      t.dealership.name.toLowerCase().includes(s) ||
      (t.driverName ?? '').toLowerCase().includes(s) ||
      (t.route?.name ?? '').toLowerCase().includes(s)
    )
  })

  return (
    <div>
      <PageHeader title="Viagens" description="Acompanhamento de saídas e retornos" />

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <SearchInput value={q} onChange={setQ} placeholder="Filtrar por placa, destino, motorista…" />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={Object.entries(tripStatusLabels).map(([value, label]) => ({ value, label }))}
          placeholder="Todos os status"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="Nenhuma viagem encontrada" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Placa</th>
                <th>Destino</th>
                <th>Roteiro</th>
                <th>Saída</th>
                <th>Previsão</th>
                <th>Retorno</th>
                <th>Status</th>
                <th>Responsável</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const overdue = t.overdue || t.status === 'ATRASADO'
                return (
                  <tr
                    key={t.id}
                    className={cn(overdue && 'bg-red-500/5')}
                  >
                    <td>
                      <PlateBadge plate={t.vehicle.plate} color={t.color ?? 'red'} />
                    </td>
                    <td>{t.dealership.name}</td>
                    <td>{t.route?.name ?? '—'}</td>
                    <td>{formatDateTime(t.departureAt)}</td>
                    <td className={cn(overdue && 'font-semibold text-[var(--color-danger)]')}>
                      {formatDate(t.expectedReturn)}
                    </td>
                    <td>{t.returnedAt ? formatDateTime(t.returnedAt) : '—'}</td>
                    <td>
                      <Badge tone={overdue ? 'danger' : t.status === 'RETORNOU' ? 'success' : 'info'}>
                        {tripStatusLabels[t.status]}
                      </Badge>
                    </td>
                    <td>{t.assignedBy.name}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
