import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Pencil, Ban, Send, MapPin, RefreshCw, ChevronRight, Upload, Undo2, Calendar } from 'lucide-react'
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
  Input,
} from '../components/ui'
import { AvailablePlatesBanner } from '../components/AvailablePlatesBanner'
import { useAuthStore } from '../stores/auth'
import { routeStatusLabels } from '../lib/labels'
import { formatDate, toInputDate } from '../lib/format'
import { cn } from '../lib/cn'
import { plateOwner } from '../lib/plateOwner'
import { hasActivePriority } from '../lib/route-priority'
import { resetBodyScroll } from '../lib/scroll-lock'

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

function canReleaseToPlates(r: Route): boolean {
  if (r.status !== 'EM_ANDAMENTO') return false
  const openTrip = r.trips?.some((t) => t.status === 'EM_ANDAMENTO' || t.status === 'ATRASADO')
  const hasPlate = (r.vehicles?.length ?? 0) > 0
  return openTrip || hasPlate
}

function matchesRouteDate(route: Route, filterDate: string): boolean {
  if (!filterDate) return true
  return toInputDate(route.date) === filterDate
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
  const [filterDate, setFilterDate] = useState(() => {
    const d = searchParams.get('date')
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d
    if (initialTab === 'todos') return toInputDate(new Date())
    return ''
  })
  const [detailRoute, setDetailRoute] = useState<Route | null>(null)
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [sendId, setSendId] = useState<string | null>(null)
  const [reassignRoute, setReassignRoute] = useState<Route | null>(null)
  const [reassignVehicleId, setReassignVehicleId] = useState('')
  const [reassignDriverId, setReassignDriverId] = useState('')
  const [releaseId, setReleaseId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const location = useLocation()
  const [okMsg, setOkMsg] = useState('')

  useEffect(() => {
    return () => resetBodyScroll()
  }, [])

  useEffect(() => {
    const t = searchParams.get('tab')
    if (t === 'prioridades' || t === 'todos' || t === 'pendentes') setTab(t)
    const d = searchParams.get('date')
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setFilterDate(d)
    else if (t === 'todos') setFilterDate(toInputDate(new Date()))
  }, [searchParams])

  useEffect(() => {
    const msg = (location.state as { importOk?: string } | null)?.importOk
    if (msg) {
      setOkMsg(msg)
      navigate(location.pathname + location.search, { replace: true, state: {} })
    }
  }, [location, navigate])

  function selectTab(next: Tab) {
    setDetailRoute(null)
    setCancelId(null)
    setSendId(null)
    setTab(next)
    if (next === 'todos' && !filterDate) {
      setFilterDate(toInputDate(new Date()))
    }
    const params: Record<string, string> = {}
    if (next !== 'pendentes') params.tab = next
    if (filterDate) params.date = filterDate
    setSearchParams(params, { replace: true })
  }

  function setRouteDateFilter(next: string) {
    setFilterDate(next)
    const params: Record<string, string> = {}
    if (tab !== 'pendentes') params.tab = tab
    if (next) params.date = next
    setSearchParams(params, { replace: true })
  }

  const { data = [], isLoading } = useQuery({
    queryKey: ['routes', tab, q, filterDate],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (q) params.q = q
      if (filterDate) params.date = filterDate
      if (!filterDate && !q) {
        if (tab === 'pendentes') {
          params.status = 'AGUARDANDO_PLACAS'
          params.unassigned = 'true'
        } else if (tab === 'prioridades') {
          params.priority = 'true'
        }
      }
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

  const allSorted = useMemo(
    () => sortRoutesByNewest(data.filter((r) => r.status !== 'CANCELADO')),
    [data],
  )
  const visible = useMemo(() => {
    const base = tab === 'pendentes' ? pending : tab === 'prioridades' ? priorities : allSorted
    return base.filter((r) => matchesRouteDate(r, filterDate))
  }, [tab, pending, priorities, allSorted, filterDate])
  const showPriorityColumns = tab === 'prioridades'
  const hideDateColumn = !!filterDate && !showPriorityColumns

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

  const releaseMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/routes/${id}/release-to-plates`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['routes'] })
      void qc.invalidateQueries({ queryKey: ['vehicles'] })
      void qc.invalidateQueries({ queryKey: ['vehicles-available'] })
      void qc.invalidateQueries({ queryKey: ['trips'] })
      void qc.invalidateQueries({ queryKey: ['returns'] })
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
      void qc.invalidateQueries({ queryKey: ['plates-board'] })
      void qc.invalidateQueries({ queryKey: ['planning-alerts'] })
      setReleaseId(null)
      setDetailRoute(null)
      setError('')
      setOkMsg('Roteiro liberado — disponível em Definir placa.')
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Não foi possível liberar o roteiro.',
      )
      setReleaseId(null)
    },
  })

  const detailStops = detailRoute ? dealershipStops(detailRoute) : []
  const detailPlate = detailRoute?.vehicles?.[0]?.vehicle?.plate
  const detailAwaiting =
    detailRoute?.status === 'AGUARDANDO_PLACAS' &&
    (!detailRoute.vehicles || detailRoute.vehicles.length === 0)

  return (
    <div className="page-desktop">
      <PageHeader
        title="Roteiros"
        description={
          tab === 'prioridades'
            ? 'Prioridades abertas, ordenadas pelo vencimento.'
            : tab === 'pendentes'
              ? 'Fila aguardando definição de placa.'
              : filterDate
                ? `Roteiros do dia ${formatDate(filterDate)}.`
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

      {okMsg && (
        <p className="mb-4 rounded border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-[var(--color-success)]">
          {okMsg}
        </p>
      )}
      {error && (
        <p className="mb-4 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <div className="panel mb-4 divide-y divide-[var(--color-border)]">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="inline-flex flex-wrap rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-0.5"
            role="tablist"
            aria-label="Filtrar roteiros"
          >
            {(
              [
                { id: 'pendentes' as const, label: 'Aguardando', count: pending.length },
                { id: 'prioridades' as const, label: 'Prioridades', count: priorities.length },
                { id: 'todos' as const, label: 'Todos', count: allSorted.length },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => selectTab(t.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition',
                  tab === t.id
                    ? 'bg-[var(--color-primary)] text-white shadow-sm'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
                )}
              >
                {t.label}
                <span
                  className={cn(
                    'inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums',
                    tab === t.id
                      ? 'bg-white/20 text-white'
                      : 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]',
                  )}
                >
                  {t.count}
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--color-text-muted)] sm:text-right">
            {filterDate ? (
              <>
                <span className="font-semibold text-[var(--color-text)]">{visible.length}</span> roteiro(s) em{' '}
                {formatDate(filterDate)}
              </>
            ) : (
              <>
                <span className="font-semibold text-[var(--color-text)]">{visible.length}</span> roteiro(s) exibidos
              </>
            )}
          </p>
        </div>

        <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_10.5rem_auto]">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar roteiro…" />
          <Input
            type="date"
            label="Data"
            value={filterDate}
            onChange={(e) => setRouteDateFilter(e.target.value)}
            aria-label="Filtrar por data"
          />
          <div className="flex items-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="flex-1 sm:flex-none"
              onClick={() => setRouteDateFilter(toInputDate(new Date()))}
            >
              <Calendar className="h-3.5 w-3.5" />
              Hoje
            </Button>
            {filterDate && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="flex-1 sm:flex-none"
                onClick={() => setRouteDateFilter('')}
              >
                Limpar
              </Button>
            )}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          title={
            filterDate
              ? `Nenhum roteiro em ${formatDate(filterDate)}`
              : tab === 'pendentes'
                ? 'Nenhum roteiro aguardando placa'
                : tab === 'prioridades'
                  ? 'Nenhuma prioridade aberta'
                  : 'Nenhum roteiro'
          }
          description={
            filterDate
              ? 'Tente outra data ou limpe o filtro para ver todos.'
              : tab === 'pendentes'
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
            filterDate ? (
              <Button variant="secondary" onClick={() => setRouteDateFilter('')}>
                Limpar filtro de data
              </Button>
            ) : isAdmin && tab === 'todos' ? (
              <Link to="/roteiros/novo">
                <Button>Novo roteiro</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Roteiro</th>
                {showPriorityColumns ? (
                  <th>Vencimento</th>
                ) : hideDateColumn ? null : (
                  <th>Datas</th>
                )}
                <th>Destinos</th>
                <th>Status</th>
                <th>Placa / motorista</th>
                <th className="w-0" />
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
                  toInputDate(r.priorityExpiryDate) < toInputDate(new Date())
                const returnDate = r.returnForecast?.expectedReturn
                  ? formatDate(r.returnForecast.expectedReturn)
                  : null
                return (
                  <tr key={r.id}>
                    <td className="max-w-[12rem]">
                      <button
                        type="button"
                        onClick={() => setDetailRoute(r)}
                        className="group w-full text-left"
                      >
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate font-medium text-[var(--color-text)] group-hover:text-[var(--color-primary)]">
                            {r.name}
                          </span>
                          {hasActivePriority(r) && tab !== 'prioridades' && (
                            <Badge tone="danger" className="shrink-0">
                              Prioridade
                            </Badge>
                          )}
                        </span>
                        {hideDateColumn && (
                          <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">
                            {formatDate(r.date)}
                          </span>
                        )}
                      </button>
                    </td>
                    {showPriorityColumns ? (
                      <td className="whitespace-nowrap">
                        {r.priorityExpiryDate ? (
                          <span className={cn(expiryPast && 'font-medium text-[var(--color-danger)]')}>
                            {formatDate(r.priorityExpiryDate)}
                            {expiryPast ? ' · vencido' : ''}
                          </span>
                        ) : (
                          <span className="text-[var(--color-text-muted)]">—</span>
                        )}
                      </td>
                    ) : hideDateColumn ? null : (
                      <td className="whitespace-nowrap">
                        <p>{formatDate(r.date)}</p>
                        {returnDate && (
                          <p className="text-xs text-[var(--color-text-muted)]">até {returnDate}</p>
                        )}
                      </td>
                    )}
                    <td className="max-w-[10rem] truncate text-[var(--color-text-muted)]">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0 opacity-60" />
                        {destinationsSummary(stops)}
                      </span>
                    </td>
                    <td>
                      <Badge tone={statusTone(r.status)}>{routeStatusLabels[r.status]}</Badge>
                    </td>
                    <td>
                      {plate ? (
                        <div className="min-w-0 space-y-1">
                          <PlateBadge plate={plate} color="blue" />
                          {driverName && (
                            <p className="max-w-[9rem] truncate text-xs text-[var(--color-text-muted)]">
                              {driverName}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-[var(--color-text-muted)]">—</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        {awaitingPlate && (isOps || isAdmin) && (
                          <Link to={`/definir-placas?routeId=${r.id}`}>
                            <Button size="sm" variant="outline">
                              Definir placa
                            </Button>
                          </Link>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          title="Ver detalhes e ações"
                          onClick={() => setDetailRoute(r)}
                          aria-label={`Ver detalhes de ${r.name}`}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
                    setDetailRoute(null)
                  }}
                >
                  <Send className="h-3.5 w-3.5" />
                  Disponibilizar
                </Button>
              )}
              {isAdmin && detailRoute && canReleaseToPlates(detailRoute) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setReleaseId(detailRoute.id)
                    setDetailRoute(null)
                  }}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Voltar p/ definir placa
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
                      toInputDate(detailRoute.priorityExpiryDate) < toInputDate(new Date())
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
                    onClick={() => {
                      setCancelId(detailRoute.id)
                      setDetailRoute(null)
                    }}
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
        open={!!releaseId}
        onClose={() => setReleaseId(null)}
        onConfirm={() => releaseId && releaseMutation.mutate(releaseId)}
        title="Voltar para definir placa?"
        message="A viagem aberta será cancelada, a placa liberada e o roteiro volta para a fila em Definir placa — para atribuir um novo veículo quando o carregamento não ocorrer."
        confirmLabel="Liberar roteiro"
        danger
        loading={releaseMutation.isPending}
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
