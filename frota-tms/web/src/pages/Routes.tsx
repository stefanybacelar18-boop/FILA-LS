import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Pencil, Ban, Send, MapPin, RefreshCw, ChevronRight, Upload } from 'lucide-react'
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
import { hasActivePriority } from '../lib/route-priority'

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

function sortRoutesByPriority(list: Route[]): Route[] {
  return [...list].sort((a, b) => {
    const p = Number(hasActivePriority(b)) - Number(hasActivePriority(a))
    if (p !== 0) return p
    if (hasActivePriority(a) && hasActivePriority(b)) {
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

/** Aba Todos: data do roteiro mais nova no topo; empate → criado mais recente. */
function sortRoutesByNewest(list: Route[]): Route[] {
  return [...list].sort((a, b) => {
    const da = new Date(a.date).getTime()
    const db = new Date(b.date).getTime()
    if (db !== da) return db - da
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

/** Prioridades abertas: vencimento mais próximo no topo. */
function sortOpenPriorities(list: Route[]): Route[] {
  return [...list].sort((a, b) => {
    const ae = a.priorityExpiryDate ? new Date(a.priorityExpiryDate).getTime() : Infinity
    const be = b.priorityExpiryDate ? new Date(b.priorityExpiryDate).getTime() : Infinity
    if (ae !== be) return ae - be
    const da = new Date(a.date).getTime()
    const db = new Date(b.date).getTime()
    if (da !== db) return da - db
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

function isOpenRoute(r: Route): boolean {
  return r.status !== 'CANCELADO' && r.status !== 'CONCLUIDO'
}

/** Viagem ativa (operação) ou última concluída para exibir motorista/placa. */
function routeDisplayTrip(r: Route) {
  return (
    r.trips?.find((t) => t.status === 'EM_ANDAMENTO' || t.status === 'ATRASADO') ?? r.trips?.[0]
  )
}

function statusTone(status: Route['status']) {
  if (status === 'CANCELADO') return 'danger' as const
  if (status === 'CONCLUIDO') return 'success' as const
  if (status === 'EM_ANDAMENTO') return 'info' as const
  if (status === 'AGUARDANDO_PLACAS') return 'primary' as const
  return 'default' as const
}

type Tab = 'pendentes' | 'prioridades' | 'todos'

export function Routes() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const isAdmin = useAuthStore((s) => s.hasRole('ADMIN'))
  const isOps = useAuthStore((s) => s.hasRole('OPERACAO'))
  const tabFromUrl = searchParams.get('tab')
  const initialTab: Tab =
    tabFromUrl === 'prioridades' || tabFromUrl === 'todos' || tabFromUrl === 'pendentes'
      ? tabFromUrl
      : isOps
        ? 'prioridades'
        : 'pendentes'
  const [tab, setTab] = useState<Tab>(initialTab)
  const [q, setQ] = useState('')
  const [detailRoute, setDetailRoute] = useState<Route | null>(null)
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [sendId, setSendId] = useState<string | null>(null)
  const [reassignRoute, setReassignRoute] = useState<Route | null>(null)
  const [reassignVehicleId, setReassignVehicleId] = useState('')
  const [reassignDriverId, setReassignDriverId] = useState('')
  const [error, setError] = useState('')
  const location = useLocation()
  const [okMsg, setOkMsg] = useState('')

  useEffect(() => {
    const t = searchParams.get('tab')
    if (t === 'prioridades' || t === 'todos' || t === 'pendentes') setTab(t)
  }, [searchParams])

  useEffect(() => {
    const msg = (location.state as { importOk?: string } | null)?.importOk
    if (msg) {
      setOkMsg(msg)
      navigate(location.pathname + location.search, { replace: true, state: {} })
    }
  }, [location, navigate])

  function selectTab(next: Tab) {
    setTab(next)
    if (next === 'pendentes') {
      setSearchParams({}, { replace: true })
    } else {
      setSearchParams({ tab: next }, { replace: true })
    }
  }

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

  const openTrip = reassignRoute ? routeDisplayTrip(reassignRoute) : undefined
  const currentVehicle =
    openTrip?.vehicle ??
    reassignRoute?.vehicles?.[0]?.vehicle ??
    null
  /** Preenche motorista só na abertura do modal (não reverte quando o Admin limpa o campo). */
  const reassignNeedsDriverInit = useRef(false)

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
        : v.defaultDriver
          ? `Motorista padrão: ${v.defaultDriver}`
          : 'Placa atual do roteiro',
    }))
  }, [availableVehicles, currentVehicle])

  const driverOptions = useMemo(() => {
    const selectedPlate =
      availableVehicles.find((v) => v.id === reassignVehicleId) ??
      (currentVehicle?.id === reassignVehicleId ? (currentVehicle as Vehicle) : null)
    const defaultName = selectedPlate?.defaultDriver?.trim().toLowerCase()
    return drivers
      .filter((d) => !d.blocked)
      .map((d) => ({
        value: d.id,
        label: d.name,
        description:
          defaultName && d.name.trim().toLowerCase() === defaultName
            ? 'Motorista padrão da placa'
            : undefined,
      }))
  }, [drivers, availableVehicles, currentVehicle, reassignVehicleId])

  function matchDriverIdForPlate(vehicle: Vehicle | null | undefined, fallbackName?: string | null) {
    const candidates = [vehicle?.defaultDriver, fallbackName]
      .map((n) => n?.trim().toLowerCase())
      .filter(Boolean) as string[]
    for (const name of candidates) {
      const match = drivers.find(
        (d) => !d.blocked && d.name.trim().toLowerCase() === name,
      )
      if (match) return match.id
    }
    return ''
  }

  function openReassign(r: Route) {
    const trip = routeDisplayTrip(r)
    const vehicle = (trip?.vehicle ?? r.vehicles?.[0]?.vehicle) as Vehicle | undefined
    setDetailRoute(null)
    setReassignRoute(r)
    setReassignVehicleId(vehicle?.id ?? trip?.vehicleId ?? '')
    setReassignDriverId('')
    reassignNeedsDriverInit.current = true
    setError('')
  }

  function onReassignPlateChange(vehicleId: string) {
    setReassignVehicleId(vehicleId)
    const vehicle =
      availableVehicles.find((v) => v.id === vehicleId) ??
      (currentVehicle?.id === vehicleId ? (currentVehicle as Vehicle) : null)
    // Nova placa → sugere motorista padrão; Admin pode trocar em seguida sem ser revertido
    const nextDriver = matchDriverIdForPlate(
      vehicle,
      vehicleId === currentVehicle?.id ? openTrip?.driverName : null,
    )
    setReassignDriverId(nextDriver)
    reassignNeedsDriverInit.current = false
  }

  useEffect(() => {
    if (!reassignRoute || drivers.length === 0 || !reassignNeedsDriverInit.current) return
    const vehicle =
      availableVehicles.find((v) => v.id === reassignVehicleId) ??
      (currentVehicle?.id === reassignVehicleId ? (currentVehicle as Vehicle) : null)
    const matched = matchDriverIdForPlate(vehicle, routeDisplayTrip(reassignRoute)?.driverName)
    setReassignDriverId(matched)
    reassignNeedsDriverInit.current = false
  }, [reassignRoute, drivers, reassignVehicleId, availableVehicles, currentVehicle])

  // Keep detail modal in sync when list refreshes
  useEffect(() => {
    if (!detailRoute) return
    const fresh = data.find((r) => r.id === detailRoute.id)
    if (fresh) setDetailRoute(fresh)
  }, [data, detailRoute?.id])

  const pending = useMemo(
    () =>
      sortRoutesByPriority(
        data.filter(
          (r) =>
            r.status === 'AGUARDANDO_PLACAS' && (!r.vehicles || r.vehicles.length === 0),
        ),
      ),
    [data],
  )

  const priorities = useMemo(
    () =>
      sortOpenPriorities(
        data.filter((r) => hasActivePriority(r) && isOpenRoute(r)),
      ),
    [data],
  )

  const allSorted = useMemo(() => sortRoutesByNewest(data), [data])
  const visible =
    tab === 'pendentes' ? pending : tab === 'prioridades' ? priorities : allSorted
  const showPriorityColumns = tab === 'prioridades'

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/routes/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['routes'] })
      void qc.invalidateQueries({ queryKey: ['vehicles'] })
      void qc.invalidateQueries({ queryKey: ['vehicles-available'] })
      void qc.invalidateQueries({ queryKey: ['trips'] })
      void qc.invalidateQueries({ queryKey: ['returns'] })
      void qc.invalidateQueries({ queryKey: ['vehicles-availability-summary'] })
      setCancelId(null)
      setDetailRoute(null)
      setError('')
      setOkMsg('Roteiro cancelado.')
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Não foi possível cancelar.',
      )
      setCancelId(null)
    },
  })

  const cancelTarget = cancelId ? data.find((r) => r.id === cancelId) : null
  const cancelHasOpenTrip =
    !!cancelTarget &&
    (cancelTarget.status === 'EM_ANDAMENTO' ||
      (cancelTarget.trips?.some((t) => t.status === 'EM_ANDAMENTO' || t.status === 'ATRASADO') ??
        false))

  const sendMutation = useMutation({
    mutationFn: async (id: string) =>
      (await api.post<{ firstRouteOfDay?: boolean }>(`/routes/${id}/send-to-operation`)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['routes'] })
      setSendId(null)
      setError('')
      setOkMsg('Roteiro disponibilizado para a Operação.')
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
    <div className="page-desktop max-w-[1100px]">
      <PageHeader
        title="Roteiros"
        description={
          tab === 'prioridades'
            ? 'Prioridades abertas, ordenadas pelo vencimento.'
            : tab === 'pendentes'
              ? 'Fila aguardando definição de placa.'
              : 'Clique no nome para ver detalhes.'
        }
        actions={
          isAdmin ? (
            <div className="flex flex-wrap gap-2">
              <Link to="/roteiros/importar-chronus">
                <Button variant="secondary">
                  <Upload className="h-4 w-4" />
                  Importar Chronus
                </Button>
              </Link>
              <Link to="/roteiros/novo">
                <Button>
                  <Plus className="h-4 w-4" />
                  Novo roteiro
                </Button>
              </Link>
            </div>
          ) : undefined
        }
      />

      {isAdmin && <AvailablePlatesBanner />}

      {okMsg && <p className="mb-3 text-sm text-[var(--color-success)]">{okMsg}</p>}
      {error && <p className="mb-3 text-sm text-[var(--color-danger)]">{error}</p>}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex flex-wrap rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
          {(
            [
              { id: 'pendentes' as const, label: 'Aguardando', count: pending.length },
              { id: 'prioridades' as const, label: 'Prioridades', count: priorities.length },
              { id: 'todos' as const, label: 'Todos', count: data.length },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTab(t.id)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition',
                tab === t.id
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
              )}
            >
              {t.label}
              <span
                className={cn(
                  'ml-1.5 inline-flex min-w-[1.1rem] justify-center text-xs tabular-nums',
                  tab === t.id ? 'text-white/80' : 'text-[var(--color-text-muted)]',
                )}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>
        <div className="w-full sm:max-w-xs">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar roteiro…" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          title={
            tab === 'pendentes'
              ? 'Nenhum roteiro aguardando placa'
              : tab === 'prioridades'
                ? 'Nenhuma prioridade aberta'
                : 'Nenhum roteiro'
          }
          description={
            tab === 'pendentes'
              ? isAdmin
                ? 'Crie um roteiro e disponibilize para a Operação.'
                : 'Quando o Admin disponibilizar, aparece aqui.'
              : tab === 'prioridades'
                ? 'Prioridades abertas (com ou sem placa) aparecem aqui.'
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
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-xs font-medium text-[var(--color-text-muted)]">
                  <th className="px-4 py-2.5 font-medium">Roteiro</th>
                  <th className="px-4 py-2.5 font-medium whitespace-nowrap">
                    {showPriorityColumns ? 'Vencimento' : 'Datas'}
                  </th>
                  <th className="px-4 py-2.5 font-medium">Destinos</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Placa</th>
                  <th className="px-4 py-2.5 text-right font-medium"> </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const plate = r.vehicles?.[0]?.vehicle?.plate
                  const driverName = routeDisplayTrip(r)?.driverName
                  const stops = dealershipStops(r)
                  const awaitingPlate =
                    r.status === 'AGUARDANDO_PLACAS' && (!r.vehicles || r.vehicles.length === 0)
                  const expiryPast =
                    !!r.priorityExpiryDate &&
                    new Date(r.priorityExpiryDate) < new Date(new Date().toDateString())
                  const returnDate = r.returnForecast?.expectedReturn
                    ? formatDate(r.returnForecast.expectedReturn)
                    : null
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-[var(--color-border)]/80 last:border-0 hover:bg-[var(--color-surface-2)]/50"
                    >
                      <td className="px-4 py-3 align-middle">
                        <button
                          type="button"
                          onClick={() => setDetailRoute(r)}
                          className="group max-w-[16rem] text-left"
                        >
                          <span className="block truncate font-medium text-[var(--color-text)] group-hover:text-[var(--color-primary)]">
                            {r.name}
                          </span>
                          {hasActivePriority(r) && (
                            <span className="mt-0.5 inline-block text-[11px] font-medium text-[var(--color-danger)]">
                              Prioridade
                            </span>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 align-middle whitespace-nowrap text-[var(--color-text)]">
                        {showPriorityColumns ? (
                          r.priorityExpiryDate ? (
                            <span className={cn(expiryPast && 'font-medium text-[var(--color-danger)]')}>
                              {formatDate(r.priorityExpiryDate)}
                              {expiryPast ? ' · vencido' : ''}
                            </span>
                          ) : (
                            <span className="text-[var(--color-text-muted)]">—</span>
                          )
                        ) : (
                          <div className="leading-snug">
                            <p>{formatDate(r.date)}</p>
                            {returnDate && (
                              <p className="text-xs text-[var(--color-text-muted)]">até {returnDate}</p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-middle text-[var(--color-text-muted)]">
                        {destinationsSummary(stops)}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <Badge tone={statusTone(r.status)}>{routeStatusLabels[r.status]}</Badge>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        {plate ? (
                          <div className="min-w-0">
                            <PlateBadge plate={plate} color="blue" />
                            {driverName && (
                              <p className="mt-1 max-w-[9rem] truncate text-xs text-[var(--color-text-muted)]">
                                {driverName}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-[var(--color-text-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-middle text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          {awaitingPlate && (isOps || isAdmin) && (
                            <Link to={`/definir-placas?routeId=${r.id}`}>
                              <Button size="sm" variant="outline">
                                Definir placa
                              </Button>
                            </Link>
                          )}
                          {isAdmin && r.status === 'RASCUNHO' && (
                            <Button size="sm" variant="outline" onClick={() => setSendId(r.id)}>
                              Disponibilizar
                            </Button>
                          )}
                          {isAdmin &&
                            r.status === 'EM_ANDAMENTO' &&
                            routeDisplayTrip(r)?.status !== 'RETORNOU' && (
                            <Button size="sm" variant="ghost" onClick={() => openReassign(r)}>
                              Trocar placa
                            </Button>
                          )}
                          <button
                            type="button"
                            title="Detalhes"
                            onClick={() => setDetailRoute(r)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
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
                routeDisplayTrip(detailRoute)?.status !== 'RETORNOU' && (
                  <Button variant="outline" onClick={() => openReassign(detailRoute)}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Trocar placa / motorista
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
              {hasActivePriority(detailRoute) && <Badge tone="danger">Prioridade</Badge>}
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
                  {routeDisplayTrip(detailRoute)?.driverName ?? '—'}
                </p>
              </div>
            </div>

            {hasActivePriority(detailRoute) && (
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
        message={
          cancelHasOpenTrip
            ? 'Este roteiro está em andamento. Ao cancelar, a viagem será encerrada e a placa voltará a ficar disponível. Confirma?'
            : 'Confirma o cancelamento deste roteiro?'
        }
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
        title={
          reassignRoute ? `Trocar placa / motorista — ${reassignRoute.name}` : 'Trocar placa / motorista'
        }
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
            Altere a placa e/ou o motorista do roteiro em andamento. Digite o nome e{' '}
            <strong>escolha na lista</strong> (não basta digitar). Ao mudar a placa, o motorista
            padrão é sugerido — você pode trocar. A placa anterior volta a ficar disponível.
          </p>
          {currentVehicle && (
            <p className="rounded-md bg-[var(--color-surface-2)] px-3 py-2 text-sm">
              Atual: <strong>{currentVehicle.plate}</strong>
              {openTrip?.driverName ? ` · ${openTrip.driverName}` : ''}
            </p>
          )}
          <Combobox
            label="Placa"
            value={reassignVehicleId}
            onChange={onReassignPlateChange}
            options={plateOptions}
            placeholder="Buscar placa…"
          />
          <Combobox
            label="Motorista"
            value={reassignDriverId}
            onChange={setReassignDriverId}
            options={driverOptions}
            placeholder="Buscar motorista…"
            emptyMessage={
              drivers.length === 0
                ? 'Nenhum motorista cadastrado — cadastre em Motoristas.'
                : 'Nenhum motorista encontrado'
            }
          />
          {reassignVehicleId && !reassignDriverId && (
            <p className="text-xs text-[var(--color-danger)]">
              Selecione o motorista desta viagem.
            </p>
          )}
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
