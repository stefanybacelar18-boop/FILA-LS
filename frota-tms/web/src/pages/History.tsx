import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Dealership, Trip, User } from '../types'
import {
  PageHeader,
  Select,
  Input,
  PlateBadge,
  Spinner,
  EmptyState,
  Badge,
} from '../components/ui'
import { tripStatusLabels, vehicleTypeLabels } from '../lib/labels'
import { formatDate, formatDateTime } from '../lib/format'

export function History() {
  const [dealershipId, setDealershipId] = useState('')
  const [userId, setUserId] = useState('')
  const [vehicleType, setVehicleType] = useState('')
  const [plate, setPlate] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const { data: dealerships = [] } = useQuery({
    queryKey: ['dealerships'],
    queryFn: async () => (await api.get<Dealership[]>('/dealerships')).data,
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<User[]>('/auth/users')).data,
    retry: false,
  })

  const { data = [], isLoading, isFetching } = useQuery({
    queryKey: ['history', 'trips', dealershipId, userId, vehicleType, plate, from, to],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (dealershipId) params.dealershipId = dealershipId
      if (userId) params.userId = userId
      if (vehicleType) params.vehicleType = vehicleType
      if (plate) params.plate = plate
      if (from) params.from = from
      if (to) params.to = to
      return (await api.get<Trip[]>('/history/trips', { params })).data
    },
  })

  return (
    <div>
      <PageHeader title="Histórico" description="Consulta de viagens com filtros avançados" />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Select
          label="Concessionária"
          value={dealershipId}
          onChange={(e) => setDealershipId(e.target.value)}
          options={dealerships.map((d) => ({ value: d.id, label: d.name }))}
          placeholder="Todas"
        />
        <Select
          label="Usuário (responsável)"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          options={users.map((u) => ({ value: u.id, label: u.name }))}
          placeholder="Todos"
        />
        <Select
          label="Tipo de veículo"
          value={vehicleType}
          onChange={(e) => setVehicleType(e.target.value)}
          options={Object.entries(vehicleTypeLabels).map(([value, label]) => ({ value, label }))}
          placeholder="Todos"
        />
        <Input
          label="Placa"
          value={plate}
          onChange={(e) => setPlate(e.target.value.toUpperCase())}
          placeholder="Filtrar placa"
        />
        <Input label="De" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="Até" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {isLoading || isFetching ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : data.length === 0 ? (
        <EmptyState title="Nenhum registro no período" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Placa</th>
                <th>Tipo</th>
                <th>Destino</th>
                <th>Saída</th>
                <th>Previsão</th>
                <th>Retorno</th>
                <th>Status</th>
                <th>Responsável</th>
              </tr>
            </thead>
            <tbody>
              {data.map((t) => (
                <tr key={t.id}>
                  <td>
                    <PlateBadge plate={t.vehicle.plate} color={t.color ?? 'green'} />
                  </td>
                  <td>{vehicleTypeLabels[t.vehicle.type]}</td>
                  <td>{t.dealership.name}</td>
                  <td>{formatDateTime(t.departureAt)}</td>
                  <td>{formatDate(t.expectedReturn)}</td>
                  <td>{t.returnedAt ? formatDateTime(t.returnedAt) : '—'}</td>
                  <td>
                    <Badge
                      tone={
                        t.status === 'ATRASADO'
                          ? 'danger'
                          : t.status === 'RETORNOU'
                            ? 'success'
                            : 'info'
                      }
                    >
                      {tripStatusLabels[t.status]}
                    </Badge>
                  </td>
                  <td>{t.assignedBy.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
