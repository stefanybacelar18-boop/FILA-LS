import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Ban, Send, MapPin, RefreshCw, ChevronRight } from 'lucide-react'
import { api } from '../lib/api'
import type { Driver, Route, Vehicle } from '../types'
import {
  PageHeader,
  SearchInput,
  Button,
  Badge,
  Spinner,
  EmptyState,
  ConfirmModal,
  Modal,
  Combobox,
  PlateBadge,
} from '../components/ui'
import { AvailablePlatesBanner } from '../components/AvailablePlatesBanner'
import { useAuthStore } from '../stores/auth'
import { routeStatusLabels } from '../lib/labels'
import { formatDate } from '../lib/format'
import { cn } from '../lib/cn'
import { plateOwner } from '../lib/plateOwner'

function dealershipStops(r: Route): { name: string; city: string }[] {
  if (r.dealerships && r.dealerships.length > 0) {
    return [...r.dealerships]
      .sort((a, b) => a.order - b.order)
      .map((rd) => ({ name: rd.dealership.name, city: rd.dealership.city }))
  }
  if (r.dealership) return [{ name: r.dealership.name, city: r.dealership.city }]
  return []
}

function destinationsSummary(stops: { name: string; city: string }[]): string {
  if (stops.length === 0) return '—'
  const cities = [...new Set(stops.map((s) => s.city))]
  if (cities.length === 1) {
    return stops.length === 1 ? cities[0] : `${stops.length} · ${cities[0]}`
  }
  return `${stops.length} destinos`
}

function sortRoutes(list: Route[]): Route[] {
  return [...list].sort((a, b) => {
    const p = Number(b.hasPriority) - Number(a.hasPriority)
    if (p !== 0) return p
    if (a.hasPriority && b.hasPriority) {
      const ae = a.priorityExpiryDate ? new Date(a.priorityExpiryDate).getTime() : Infinity
      const be = b.priorityExpiryDate ? new Date(b.priorityExpiryDate).getTime() : Infinity
      if (ae !== be) return ae - be
    }
    const da = new Date(a.date).getTime()
    const db = new Date(b.date).getTime()
    if (da !== db) return da - db
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

function statusTone(status: Route['status']) {
  if (status === 'CANCELADO') return 'danger' as const
  if (status === 'CONCLUIDO') return 'success' as const
  if (status === 'EM_ANDAMENTO') return 'info' as const
  if (status === 'AGUARDANDO_PLACAS') return 'primary' as const
  return 'default' as const
}

type Tab = 'pendentes' | 'todos'

export function Routes() {
  const qc = useQueryClient()
  const isAdmin = useAuthStore((s) => s.hasRole('ADMIN'))
  const isOps = useAuthStore((s) => s.hasRole('OPERACAO'))
  const [tab, setTab] = useState<Tab>('pendentes')
  const [q, setQ] = useState('')
  const [detailRoute, setDetailRoute] = useState<Route | null>(null)
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [sendId, setSendId] = useState<string | null>(null)
  const [reassignRoute, setReassignRoute] = useState<Route | null>(null)
  const [reassignVehicleId, setReassignVehicleId] = useState('')
  const [reassignDriverId, setReassignDriverId] = useState('')
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  const { data = [], isLoading } = useQuery({
    queryKey: ['routes', q],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (q) params.q = q
      return (await api.get<Route[]>('/routes', { params })).data
    },
  })

  const { data: availableVehicles = [] } = useQuery({
    queryKey: ['vehicles-available'],
    queryFn: async () => (await api.get<Vehicle[]>('/vehicles/available')).data,
    enabled: !!reassignRoute && isAdmin,
  })

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers', 'active'],
    queryFn: async () =>
      (await api.get<Driver[]>('/drivers', { params: { active: 'true' } })).data,
    enabled: !!reassignRoute && isAdmin,
  })

  const openTrip = reassignRoute?.trips?.[0]
  const currentVehicle =
    openTrip?.vehicle ??
    reassignRoute?.vehicles?.[0]?.vehicle ??
    null

  const plateOptions = useMemo(() => {
    const list = [...availableVehicles]
    if (currentVehicle && !list.some((v) => v.id === currentVehicle.id)) {
      list.unshift({
        id: currentVehicle.id,
        plate: currentVehicle.plate,
        capacityMotos: (currentVehicle as Vehicle).capacityMotos ?? 0,
        defaultDriver: (currentVehicle as Vehicle).defaultDriver ?? null,
      } as Vehicle)
    }
    return list.map((v) => ({
      value: v.id,
      label: `${v.plate} · ${plateOwner(v.plate)}${
        currentVehicle?.id === v.id ? ' (atual)' : ''
      }`,
      description: v.capacityMotos
        ? `${v.capacityMotos} motos${v.defaultDriver ? ` · ${v.defaultDriver}` : ''}`
        : 'Placa atual do roteiro',
    }))
  }, [availableVehicles, currentVehicle])

  const driverOptions = useMemo(
    () =>
      drivers
        .filter((d) => !d.blocked)
        .map((d) => ({
          value: d.id,
          label: d.name,
        })),
    [drivers],
  )

  function openReassign(r: Route) {
    const trip = r.trips?.[0]
    const vehicle = trip?.vehicle ?? r.vehicles?.[0]?.vehicle
    setDetailRoute(null)
    setReassignRoute(r)
    setReassignVehicleId(vehicle?.id ?? trip?.vehicleId ?? '')
    setReassignDriverId('')
    setError('')
  }

  useEffect(() => {
    if (!reassignRoute || drivers.length === 0 || reassignDriverId) return
    const name = reassignRoute.trips?.[0]?.driverName?.trim()
    if (!name) return
    const match = drivers.find((d) => d.name.trim().toLowerCase() === name.toLowerCase())
    if (match) setReassignDriverId(match.id)
  }, [reassignRoute, drivers, reassignDriverId])

  // Keep detail modal in sync when list refreshes
  useEffect(() => {
    if (!detailRoute) return
    const fresh = data.find((r) => r.id === detailRoute.id)
    if (fresh) setDetailRoute(fresh)
  }, [data, detailRoute?.id])

  const pending = useMemo(
    () =>
      sortRoutes(
        data.filter(
          (r) =>
            r.status === 'AGUARDANDO_PLACAS' && (!r.vehicles || r.vehicles.length === 0),
        ),
      ),
    [data],
  )

  const allSorted = useMemo(() => sortRoutes(data), [data])
  const visible = tab === 'pendentes' ? pending : allSorted

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/routes/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['routes'] })
      setCancelId(null)
      setDetailRoute(null)
      setError('')
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Não foi possível cancelar.',
      )
      setCancelId(null)
    },
  })

  const sendMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/routes/${id}/send-to-operation`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['routes'] })
      setSendId(null)
      setOkMsg('Roteiro disponibilizado para a Operação.')
      setError('')
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Não foi possível disponibilizar.',
      )
      setSendId(null)
    },
  })

  const reassignMutation = useMutation({
    mutationFn: async () => {
      if (!reassignRoute) throw new Error('Sem roteiro')
      if (!reassignVehicleId) throw new Error('Selecione a placa')
      if (!reassignDriverId) throw new Error('Selecione o motorista')
      return api.post(`/routes/${reassignRoute.id}/reassign-plate`, {
        vehicleId: reassignVehicleId,
        driverId: reassignDriverId,
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['routes'] })
      void qc.invalidateQueries({ queryKey: ['vehicles'] })
      void qc.invalidateQueries({ queryKey: ['vehicles-available'] })
      void qc.invalidateQueries({ queryKey: ['trips'] })
      void qc.invalidateQueries({ queryKey: ['returns'] })
      void qc.invalidateQueries({ queryKey: ['vehicles-availability-summary'] })
      setReassignRoute(null)
      setReassignVehicleId('')
      setReassignDriverId('')
      setOkMsg('Placa/motorista atualizados.')
      setError('')
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          (err as Error)?.message ??
          'Não foi possível trocar placa/motorista.',
      )
    },
  })

  const detailStops = detailRoute ? dealershipStops(detailRoute) : []
  const detailPlate = detailRoute?.vehicles?.[0]?.vehicle?.plate
  const detailAwaiting =
    detailRoute?.status === 'AGUARDANDO_PLACAS' &&
    (!detailRoute.vehicles || detailRoute.vehicles.length === 0)

  return (
    <div className="page-desktop max-w-[1200px]">
      <PageHeader
        title="Roteiros"
        description="Prioridade no topo. Clique no roteiro para ver detalhes."
        actions={
          isAdmin ? (
            <Link to="/roteiros/novo">
              <Button>
                <Plus className="h-4 w-4" />
                Novo roteiro
              </Button>
            </Link>
          ) : undefined
        }
      />

      {isAdmin && <AvailablePlatesBanner />}

      {okMsg && <p className="mb-3 text-sm text-[var(--color-success)]">{okMsg}</p>}
      {error && <p className="mb-3 text-sm text-[var(--color-danger)]">{error}</p>}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
          <button
            type="button"
            onClick={() => setTab('pendentes')}
            className={cn(
              'rounded-md px-3.5 py-1.5 text-sm font-medium transition',
              tab === 'pendentes'
                ? 'bg-[var(--color-primary)] text-white shadow-sm'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
            )}
          >
            Pendentes de placa
            <span
              className={cn(
                'ml-1.5 inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 text-xs',
                tab === 'pendentes' ? 'bg-white/20' : 'bg-[var(--color-surface-2)]',
              )}
            >
              {pending.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab('todos')}
            className={cn(
              'rounded-md px-3.5 py-1.5 text-sm font-medium transition',
              tab === 'todos'
                ? 'bg-[var(--color-primary)] text-white shadow-sm'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
            )}
          >
            Todos
            <span
              className={cn(
                'ml-1.5 inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 text-xs',
                tab === 'todos' ? 'bg-white/20' : 'bg-[var(--color-surface-2)]',
              )}
            >
              {data.length}
            </span>
          </button>
        </div>
        <div className="w-full sm:max-w-sm">
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Buscar descrição, cidade ou concessionária…"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          title={tab === 'pendentes' ? 'Nenhum roteiro aguardando placa' : 'Nenhum roteiro'}
          description={
            tab === 'pendentes'
              ? isAdmin
                ? 'Crie um roteiro e disponibilize para a Operação.'
                : 'Quando o Admin disponibilizar, aparece aqui.'
              : isAdmin
                ? 'Crie o primeiro roteiro.'
                : undefined
          }
          action={
            isAdmin && tab === 'todos' ? (
              <Link to="/roteiros/novo">
                <Button>Novo roteiro</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/60 text-xs font-semibold tracking-wide text-[var(--color-text-muted)] uppercase">
                  <th className="px-4 py-3 font-semibold">Roteiro</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Início</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Fim</th>
                  <th className="px-4 py-3 font-semibold">Destinos</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Placa</th>
                  <th className="px-4 py-3 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const plate = r.vehicles?.[0]?.vehicle?.plate
                  const stops = dealershipStops(r)
                  const awaitingPlate =
                    r.status === 'AGUARDANDO_PLACAS' && (!r.vehicles || r.vehicles.length === 0)
                  return (
                    <tr
                      key={r.id}
                      className={cn(
                        'border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]/40',
                        r.hasPriority && 'bg-[var(--color-danger)]/[0.03]',
                      )}
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setDetailRoute(r)}
                          className="group inline-flex max-w-full items-center gap-1.5 text-left"
                        >
                          <span className="truncate font-medium text-[var(--color-primary)] underline-offset-2 group-hover:underline">
                            {r.name}
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)] opacity-0 transition group-hover:opacity-100" />
                        </button>
                        {r.hasPriority && (
                          <p className="mt-0.5 text-xs text-[var(--color-danger)]">Prioridade</p>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-[var(--color-text)]">
                        {formatDate(r.date)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-[var(--color-text)]">
                        {r.returnForecast?.expectedReturn
                          ? formatDate(r.returnForecast.expectedReturn)
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)]">
                        {destinationsSummary(stops)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone(r.status)}>{routeStatusLabels[r.status]}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {plate ? (
                          <PlateBadge plate={plate} color="blue" />
                        ) : (
                          <span className="text-[var(--color-text-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          {awaitingPlate && (isOps || isAdmin) && (
                            <Link to={`/definir-placas?routeId=${r.id}`}>
                              <Button size="sm" variant="outline">
                                Placa
                              </Button>
                            </Link>
                          )}
                          {isAdmin && r.status === 'RASCUNHO' && (
                            <button
                              type="button"
                              title="Disponibilizar"
                              onClick={() => setSendId(r.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)]"
                            >
                              <Send className="h-4 w-4" />
                            </button>
                          )}
                          {isAdmin && r.status === 'EM_ANDAMENTO' && (r.trips?.length ?? 0) > 0 && (
                            <button
                              type="button"
                              title="Trocar placa/motorista"
                              onClick={() => openReassign(r)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)]"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </button>
                          )}
                          {isAdmin && (
                            <>
                              <Link
                                to={`/roteiros/${r.id}`}
                                title="Editar"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
                              >
                                <Pencil className="h-4 w-4" />
                              </Link>
                              {r.status !== 'CANCELADO' && r.status !== 'CONCLUIDO' && (
                                <button
                                  type="button"
                                  title="Cancelar"
                                  onClick={() => setCancelId(r.id)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-red-500/10 hover:text-[var(--color-danger)]"
                                >
                                  <Ban className="h-4 w-4" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={!!detailRoute}
        onClose={() => setDetailRoute(null)}
        title={detailRoute?.name ?? 'Roteiro'}
        size="lg"
        footer={
          detailRoute ? (
            <>
              <Button variant="secondary" onClick={() => setDetailRoute(null)}>
                Fechar
              </Button>
              {detailAwaiting && (isOps || isAdmin) && (
                <Link to={`/definir-placas?routeId=${detailRoute.id}`}>
                  <Button>Definir placa</Button>
                </Link>
              )}
              {isAdmin && detailRoute.status === 'RASCUNHO' && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSendId(detailRoute.id)
                  }}
                >
                  <Send className="h-3.5 w-3.5" />
                  Disponibilizar
                </Button>
              )}
              {isAdmin &&
                detailRoute.status === 'EM_ANDAMENTO' &&
                (detailRoute.trips?.length ?? 0) > 0 && (
                  <Button variant="outline" onClick={() => openReassign(detailRoute)}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Trocar placa
                  </Button>
                )}
              {isAdmin && (
                <Link to={`/roteiros/${detailRoute.id}`}>
                  <Button variant="outline">
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </Button>
                </Link>
              )}
            </>
          ) : undefined
        }
      >
        {detailRoute && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(detailRoute.status)}>
                {routeStatusLabels[detailRoute.status]}
              </Badge>
              {detailRoute.hasPriority && <Badge tone="danger">Prioridade</Badge>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                  Início
                </p>
                <p className="mt-1 font-medium">{formatDate(detailRoute.date)} · 06:00</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                  Previsão de retorno
                </p>
                <p className="mt-1 font-medium">
                  {detailRoute.returnForecast?.expectedReturn
                    ? formatDate(detailRoute.returnForecast.expectedReturn)
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                  Placa
                </p>
                <div className="mt-1">
                  {detailPlate ? (
                    <PlateBadge plate={detailPlate} color="blue" />
                  ) : (
                    <span className="text-[var(--color-text-muted)]">Sem placa</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                  Motorista
                </p>
                <p className="mt-1 font-medium">
                  {detailRoute.trips?.[0]?.driverName ?? '—'}
                </p>
              </div>
            </div>

            {detailRoute.hasPriority && (
              <div className="rounded-[var(--radius)] border border-[var(--color-danger)]/20 bg-[var(--color-danger)]/[0.04] px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-danger)]">
                  Prioridade · vencimento
                </p>
                <p
                  className={cn(
                    'mt-1 text-sm font-medium',
                    detailRoute.priorityExpiryDate &&
                      new Date(detailRoute.priorityExpiryDate) < new Date()
                      ? 'text-[var(--color-danger)]'
                      : 'text-[var(--color-text)]',
                  )}
                >
                  {detailRoute.priorityExpiryDate
                    ? formatDate(detailRoute.priorityExpiryDate)
                    : 'Falta informar o vencimento'}
                </p>
                {detailRoute.priorityNotes && (
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    {detailRoute.priorityNotes}
                  </p>
                )}
              </div>
            )}

            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                Concessionárias ({detailStops.length})
              </p>
              {detailStops.length === 0 ? (
                <p className="text-[var(--color-text-muted)]">Nenhuma concessionária</p>
              ) : (
                <ol className="space-y-2.5">
                  {detailStops.map((s, idx) => (
                    <li key={`${detailRoute.id}-d-${idx}`} className="flex gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-muted)] text-xs font-bold text-[var(--color-primary)]">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="font-medium text-[var(--color-text)]">{s.name}</p>
                        <p className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                          <MapPin className="h-3 w-3" />
                          {s.city}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {detailRoute.notes && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                  Observações
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[var(--color-text)]">
                  {detailRoute.notes}
                </p>
              </div>
            )}

            {isAdmin &&
              detailRoute.status !== 'CANCELADO' &&
              detailRoute.status !== 'CONCLUIDO' && (
                <div className="border-t border-[var(--color-border)] pt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[var(--color-danger)] hover:bg-red-500/10"
                    onClick={() => setCancelId(detailRoute.id)}
                  >
                    <Ban className="h-3.5 w-3.5" />
                    Cancelar roteiro
                  </Button>
                </div>
              )}
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={!!cancelId}
        onClose={() => setCancelId(null)}
        onConfirm={() => cancelId && cancelMutation.mutate(cancelId)}
        title="Cancelar roteiro"
        message="Confirma o cancelamento deste roteiro?"
        confirmLabel="Cancelar roteiro"
        danger
        loading={cancelMutation.isPending}
      />

      <ConfirmModal
        open={!!sendId}
        onClose={() => setSendId(null)}
        onConfirm={() => sendId && sendMutation.mutate(sendId)}
        title="Disponibilizar para Operação?"
        message="A Operação verá este roteiro e escolherá 1 placa."
        confirmLabel="Disponibilizar"
        loading={sendMutation.isPending}
      />

      <Modal
        open={!!reassignRoute}
        onClose={() => {
          setReassignRoute(null)
          setReassignVehicleId('')
          setReassignDriverId('')
        }}
        title={reassignRoute ? `Trocar placa — ${reassignRoute.name}` : 'Trocar placa'}
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setReassignRoute(null)
                setReassignVehicleId('')
                setReassignDriverId('')
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => reassignMutation.mutate()}
              loading={reassignMutation.isPending}
              disabled={!reassignVehicleId || !reassignDriverId}
            >
              Confirmar troca
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            Ajuste placa e motorista de roteiro em andamento. A placa anterior volta a ficar
            disponível.
          </p>
          {currentVehicle && (
            <p className="rounded-md bg-[var(--color-surface-2)] px-3 py-2 text-sm">
              Atual: <strong>{currentVehicle.plate}</strong>
              {openTrip?.driverName ? ` · ${openTrip.driverName}` : ''}
            </p>
          )}
          <Combobox
            label="Nova placa"
            value={reassignVehicleId}
            onChange={setReassignVehicleId}
            options={plateOptions}
            placeholder="Buscar placa…"
          />
          <Combobox
            label="Motorista"
            value={reassignDriverId}
            onChange={setReassignDriverId}
            options={driverOptions}
            placeholder="Buscar motorista…"
          />
          {reassignMutation.isError && (
            <p className="text-sm text-[var(--color-danger)]">
              {(reassignMutation.error as { response?: { data?: { error?: string } } })?.response
                ?.data?.error ??
                (reassignMutation.error as Error)?.message ??
                'Falha na troca'}
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}
