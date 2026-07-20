import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, Check } from 'lucide-react'
import { api } from '../lib/api'
import type { Driver, PlateColor, Route, Vehicle, VehicleStatus } from '../types'
import {
  PageHeader,
  Button,
  PlateBadge,
  Spinner,
  EmptyState,
  ConfirmModal,
  Modal,
  Textarea,
  Input,
  Select,
} from '../components/ui'
import { delayReasonPresets, vehicleStatusLabels } from '../lib/labels'
import { formatDate, toInputDate } from '../lib/format'
import { cn } from '../lib/cn'

interface PlatesBoardVehicle extends Omit<Vehicle, 'expectedReturn'> {
  expectedReturn?: string | null
  report?: {
    id: string
    reason: string
    availableAtForecast: string
    reportedAt: string
    reportedBy: { id: string; name: string }
  } | null
  shouldBeAvailable?: boolean
  needsJustification?: boolean
}

interface PlatesBoard {
  routeId: string
  routeName: string
  loadAt: string
  plannedVehicleCount?: number | null
  assignedCount?: number
  hasPriority?: boolean
  priorityExpiryDate?: string | null
  priorityNotes?: string | null
  route?: {
    id: string
    name: string
    date: string
    hasPriority: boolean
    priorityExpiryDate?: string | null
    priorityNotes?: string | null
  }
  returnForecast?: {
    basis: 'PAD_DISTANCE'
    pad: { lat: number; lng: number }
    formula?: string
    farthestDealership: {
      id: string
      name: string
      city: string
      distanceKm: number
      avgTravelDays: number
      source: string
    }
    departureAt: string
    expectedReturn: string
  } | null
  available: PlatesBoardVehicle[]
  unavailable: PlatesBoardVehicle[]
  summary?: {
    available: number
    unavailable: number
    criticalPendingJustifications: number
    justified: number
  }
}

function citiesOf(route: Route): string[] {
  const dealers =
    route.dealerships && route.dealerships.length > 0
      ? route.dealerships.map((rd) => rd.dealership)
      : route.dealership
        ? [route.dealership]
        : []
  return [...new Set(dealers.map((d) => d.city))]
}

function dealersOf(route: Route) {
  if (route.dealerships && route.dealerships.length > 0) {
    return route.dealerships.map((rd) => rd.dealership)
  }
  return route.dealership ? [route.dealership] : []
}

function allowedTypesForRoute(route: Route): {
  types: Set<'TRUCK' | 'CARRETA'> | null
  incompatible: boolean
} {
  const dealers = dealersOf(route)
  if (dealers.length === 0) return { types: null, incompatible: false }
  let allowed: Set<'TRUCK' | 'CARRETA'> = new Set(['TRUCK', 'CARRETA'])
  for (const d of dealers) {
    if (d.allowedVehicle === 'AMBOS') continue
    if (d.allowedVehicle === 'TRUCK' || d.allowedVehicle === 'CARRETA') {
      allowed = new Set([...allowed].filter((t) => t === d.allowedVehicle))
    }
  }
  if (allowed.size === 0) return { types: allowed, incompatible: true }
  return { types: allowed, incompatible: false }
}

const cannotLoadPresets = [
  'Quebra mecânica',
  'Atraso no retorno da viagem anterior',
  'Veículo em manutenção',
  'Acidente ou pane',
  'Motorista indisponível',
  'Outro (descrever abaixo)',
] as const

export function AssignPlates() {
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [routeId, setRouteId] = useState(searchParams.get('routeId') || '')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedDriverId, setSelectedDriverId] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [showProblems, setShowProblems] = useState(false)

  const [justifyVehicle, setJustifyVehicle] = useState<PlatesBoardVehicle | null>(null)
  const [preset, setPreset] = useState('')
  const [reason, setReason] = useState('')
  const [forecastDate, setForecastDate] = useState('')

  const { data: routes = [], isLoading: loadingRoutes, isError: routesError, error: routesErr } =
    useQuery({
      queryKey: ['routes'],
      queryFn: async () => (await api.get<Route[]>('/routes')).data,
    })

  const pendingRoutes = useMemo(
    () =>
      routes
        .filter(
          (r) =>
            r.status === 'AGUARDANDO_PLACAS' && (!r.vehicles || r.vehicles.length === 0),
        )
        .sort((a, b) => {
          const p = Number(b.hasPriority) - Number(a.hasPriority)
          if (p !== 0) return p
          if (a.hasPriority && b.hasPriority) {
            const ae = a.priorityExpiryDate ? new Date(a.priorityExpiryDate).getTime() : Infinity
            const be = b.priorityExpiryDate ? new Date(b.priorityExpiryDate).getTime() : Infinity
            return ae - be
          }
          return new Date(a.date).getTime() - new Date(b.date).getTime()
        }),
    [routes],
  )

  useEffect(() => {
    const fromUrl = searchParams.get('routeId')
    if (fromUrl && fromUrl !== routeId) setRouteId(fromUrl)
  }, [searchParams, routeId])

  const selectedRoute = routes.find((r) => r.id === routeId)
  const cities = selectedRoute ? citiesOf(selectedRoute) : []
  const typeRule = selectedRoute ? allowedTypesForRoute(selectedRoute) : null
  const allowedTypes = typeRule?.types ?? null
  const incompatibleTypes = !!typeRule?.incompatible

  const {
    data: board,
    isLoading: loadingBoard,
    isError: boardError,
    error: boardErr,
  } = useQuery({
    queryKey: ['plates-board', routeId],
    queryFn: async () => (await api.get<PlatesBoard>(`/routes/${routeId}/plates-board`)).data,
    enabled: !!routeId,
  })

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers', 'active'],
    queryFn: async () =>
      (await api.get<Driver[]>('/drivers', { params: { active: 'true' } })).data,
    enabled: !!routeId,
  })

  const available = useMemo(() => {
    const list = board?.available ?? []
    if (!allowedTypes || incompatibleTypes) return list
    return list.filter((v) => allowedTypes.has(v.type))
  }, [board?.available, allowedTypes, incompatibleTypes])

  // Rota inválida na URL → volta à lista
  useEffect(() => {
    if (!routeId || loadingRoutes || routesError) return
    if (!selectedRoute) {
      setError('Roteiro não encontrado.')
      setRouteId('')
      setSearchParams({})
      return
    }
    if (
      selectedRoute.status !== 'AGUARDANDO_PLACAS' ||
      (selectedRoute.vehicles && selectedRoute.vehicles.length > 0)
    ) {
      setError('Este roteiro já não está aguardando placa.')
      setRouteId('')
      setSearchParams({})
    }
  }, [routeId, loadingRoutes, routesError, selectedRoute, setSearchParams])

  // Só placas que JÁ DEVERIAM ter voltado (previsão ≤ 06:00) ou bloqueadas —
  // não listar toda a frota em viagem (isso polui e confunde)
  const overdueOrBlocked = useMemo(
    () => (board?.unavailable ?? []).filter((v) => v.shouldBeAvailable),
    [board?.unavailable],
  )
  const pendingReport = overdueOrBlocked.filter((v) => !v.report)
  const returningLaterCount = useMemo(
    () => (board?.unavailable ?? []).filter((v) => !v.shouldBeAvailable).length,
    [board?.unavailable],
  )

  const selectedVehicle = available.find((v) => v.id === selectedId) ?? null
  const selectedDriver = drivers.find((d) => d.id === selectedDriverId) ?? null

  function pickPlate(v: PlatesBoardVehicle) {
    setSelectedId(v.id)
    setError('')
    const match = drivers.find(
      (d) =>
        v.defaultDriver &&
        d.name.trim().toLowerCase() === v.defaultDriver.trim().toLowerCase(),
    )
    setSelectedDriverId(match?.id ?? '')
  }

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error('Sem placa')
      if (!selectedDriverId) throw new Error('Selecione o motorista')
      return api.post(`/routes/${routeId}/assign-plates`, {
        vehicleId: selectedId,
        vehicleIds: [selectedId],
        driverId: selectedDriverId,
      })
    },
    onSuccess: async () => {
      const plate = selectedVehicle?.plate ?? ''
      const name = selectedRoute?.name ?? 'rota'
      setSelectedId(null)
      setSelectedDriverId('')
      setConfirmOpen(false)
      setError('')
      setRouteId('')
      setSearchParams({})
      setShowProblems(false)
      setOkMsg(`Placa ${plate} confirmada na rota "${name}".`)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['routes'] }),
        qc.invalidateQueries({ queryKey: ['vehicles'] }),
        qc.invalidateQueries({ queryKey: ['trips'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
        qc.invalidateQueries({ queryKey: ['plates-board'] }),
        qc.invalidateQueries({ queryKey: ['planning-alerts'] }),
      ])
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Não foi possível confirmar a placa.',
      )
    },
  })

  function composedReason() {
    return [preset && preset !== 'Outro (descrever abaixo)' ? preset : '', reason.trim()]
      .filter(Boolean)
      .join(' — ')
  }

  const justifyMutation = useMutation({
    mutationFn: async () => {
      if (!justifyVehicle || !routeId) return
      return api.post(`/routes/${routeId}/unavailable`, {
        vehicleId: justifyVehicle.id,
        reason: composedReason(),
        availableAtForecast: forecastDate,
      })
    },
    onSuccess: async () => {
      setJustifyVehicle(null)
      setPreset('')
      setReason('')
      setForecastDate('')
      setError('')
      setOkMsg('Indisponibilidade registrada (atraso/quebra).')
      await qc.invalidateQueries({ queryKey: ['plates-board', routeId] })
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Não foi possível salvar o registro.',
      )
    },
  })

  function pickRoute(id: string) {
    setRouteId(id)
    setSearchParams({ routeId: id })
    setSelectedId(null)
    setSelectedDriverId('')
    setError('')
    setOkMsg('')
    setShowProblems(false)
  }

  function backToList() {
    setRouteId('')
    setSearchParams({})
    setSelectedId(null)
    setSelectedDriverId('')
    setShowProblems(false)
  }

  function openJustify(v: PlatesBoardVehicle) {
    setError('')
    setJustifyVehicle(v)
    setPreset('')
    setReason(v.report?.reason ?? '')
    setForecastDate(
      v.report?.availableAtForecast
        ? toInputDate(v.report.availableAtForecast)
        : toInputDate(selectedRoute?.date ?? new Date()),
    )
  }

  // ——— Lista de rotas (sem detalhe) ———
  if (!routeId) {
    return (
      <div className="page-desktop max-w-3xl">
        <PageHeader
          title="Pendentes de placa"
          description="Prioridade no topo — Admin e Operação podem definir placa."
        />
        {okMsg && <p className="mb-4 text-sm text-[var(--color-success)]">{okMsg}</p>}
        {error && <p className="mb-4 text-sm text-[var(--color-danger)]">{error}</p>}

        {loadingRoutes ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : routesError ? (
          <EmptyState
            title="Não foi possível carregar as rotas"
            description={
              (routesErr as { response?: { data?: { error?: string } } })?.response?.data?.error ??
              'Verifique a conexão e tente novamente.'
            }
          />
        ) : pendingRoutes.length === 0 ? (
          <EmptyState
            title="Nenhuma rota aguardando placa"
            description="Quando o Admin disponibilizar um roteiro, ele aparece aqui."
          />
        ) : (
          <div className="space-y-2">
            {pendingRoutes.map((r) => {
              const c = citiesOf(r)
              const expiryPast =
                r.priorityExpiryDate &&
                toInputDate(r.priorityExpiryDate) <= toInputDate(new Date())
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => pickRoute(r.id)}
                  className={
                    r.hasPriority
                      ? 'flex w-full flex-col items-start rounded-[var(--radius)] border border-[var(--color-danger)]/35 bg-[var(--color-danger)]/5 px-3.5 py-3 text-left transition hover:border-[var(--color-danger)]/60'
                      : 'flex w-full flex-col items-start rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3 text-left transition hover:border-[var(--color-primary)]/40'
                  }
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-base font-semibold">{r.name}</span>
                    {r.hasPriority && (
                      <span
                        className={
                          expiryPast
                            ? 'text-xs font-semibold text-[var(--color-danger)]'
                            : 'text-xs font-medium text-amber-700 dark:text-amber-300'
                        }
                      >
                        Prioridade · vencimento
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    {formatDate(r.date)} · 06:00
                    {c.length > 0 ? ` · ${c.join(', ')}` : ''}
                  </p>
                  {r.hasPriority && r.priorityExpiryDate && (
                    <p
                      className={
                        expiryPast
                          ? 'mt-2 text-sm font-semibold text-[var(--color-danger)]'
                          : 'mt-2 text-sm font-medium text-[var(--color-text)]'
                      }
                    >
                      Menor vencimento: {formatDate(r.priorityExpiryDate)}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ——— Detalhe da rota (tela focada) ———
  const priority =
    board?.route?.hasPriority ?? board?.hasPriority ?? selectedRoute?.hasPriority ?? false
  const expiry =
    board?.route?.priorityExpiryDate ??
    board?.priorityExpiryDate ??
    selectedRoute?.priorityExpiryDate ??
    null
  const expiryPast = !!expiry && toInputDate(expiry) <= toInputDate(new Date())

  return (
    <div className="page-desktop max-w-3xl">
      <button
        type="button"
        onClick={backToList}
        className="mb-2 inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar às rotas
      </button>

      <div className="mb-3">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--color-text)]">
          {selectedRoute?.name ?? 'Rota'}
        </h1>
        <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">
          {formatDate(selectedRoute?.date)} · 06:00
          {cities.length ? ` · ${cities.join(', ')}` : ''} · 1 placa
        </p>
      </div>

      {(priority || board?.returnForecast) && (
        <div className="mb-3 flex flex-wrap items-stretch gap-2">
          {priority && (
            <div className="min-w-[11rem] flex-1 rounded-[var(--radius)] border border-[var(--color-danger)]/35 bg-[var(--color-danger)]/5 px-3 py-2">
              <p className="text-[0.65rem] font-semibold tracking-wide text-[var(--color-danger)] uppercase">
                Prioridade · vencimento
              </p>
              {expiry ? (
                <p
                  className={cn(
                    'text-lg font-bold leading-tight',
                    expiryPast ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]',
                  )}
                >
                  {formatDate(expiry)}
                </p>
              ) : (
                <p className="text-xs font-semibold text-[var(--color-danger)]">
                  Sem data — Admin deve informar
                </p>
              )}
            </div>
          )}
          {board?.returnForecast && (
            <div className="min-w-[14rem] flex-[1.4] rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
              <p className="text-[0.65rem] font-semibold tracking-wide text-[var(--color-text-muted)] uppercase">
                Fim previsto (PAD)
              </p>
              <p className="text-lg font-bold leading-tight text-[var(--color-text)]">
                {formatDate(board.returnForecast.expectedReturn)}
              </p>
              <p className="truncate text-xs text-[var(--color-text-muted)]">
                {board.returnForecast.farthestDealership.city} ·{' '}
                {board.returnForecast.farthestDealership.distanceKm.toFixed(0)} km ·{' '}
                {board.returnForecast.farthestDealership.avgTravelDays === 0
                  ? 'mesmo dia'
                  : `${board.returnForecast.farthestDealership.avgTravelDays} dias`}
              </p>
            </div>
          )}
        </div>
      )}

      {error && <p className="mb-2 text-sm text-[var(--color-danger)]">{error}</p>}
      {okMsg && <p className="mb-2 text-sm text-[var(--color-success)]">{okMsg}</p>}

      {pendingReport.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-red-500/25 bg-red-500/5 px-3 py-2">
          <p className="text-sm">
            <AlertTriangle className="mr-1.5 inline h-4 w-4 text-[var(--color-danger)]" />
            <strong>{pendingReport.length}</strong> placa(s) já deveriam ter retornado.
          </p>
          <Button size="sm" variant="outline" onClick={() => setShowProblems(true)}>
            Informar
          </Button>
        </div>
      )}

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Placa e motorista</h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            {available.length} disponível{available.length === 1 ? '' : 'eis'}
            {returningLaterCount > 0 ? ` · ${returningLaterCount} ainda em viagem` : ''}
          </p>
        </div>

        {loadingBoard ? (
          <div className="flex justify-center py-10">
            <Spinner size="lg" />
          </div>
        ) : boardError ? (
          <EmptyState
            title="Erro ao carregar placas"
            description={
              (boardErr as { response?: { data?: { error?: string } } })?.response?.data?.error ??
              'Tente voltar e abrir a rota de novo.'
            }
          />
        ) : incompatibleTypes ? (
          <EmptyState
            title="Roteiro com tipos de veículo incompatíveis"
            description="Há destinos que aceitam só Truck e outros só Carreta. Peça ao Admin ajustar as concessionárias."
          />
        ) : available.length === 0 ? (
          <EmptyState
            title="Nenhuma placa disponível agora"
            description={
              pendingReport.length > 0
                ? 'Há placas que já deveriam ter voltado. Informe atraso/quebra.'
                : 'Aguarde o retorno das viagens ou verifique a frota.'
            }
            action={
              pendingReport.length > 0 ? (
                <Button variant="secondary" onClick={() => setShowProblems(true)}>
                  Informar atraso/quebra
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="max-h-[min(52vh,28rem)] space-y-1.5 overflow-y-auto rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5">
            {available.map((v) => {
              const active = selectedId === v.id
              return (
                <div
                  key={v.id}
                  className={cn(
                    'rounded-md border transition',
                    active
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)]'
                      : 'border-transparent hover:bg-[var(--color-surface-2)]/70',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => pickPlate(v)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left"
                  >
                    <div
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                        active
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                          : 'border-[var(--color-border-strong)]',
                      )}
                    >
                      {active && <Check className="h-3 w-3" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <PlateBadge plate={v.plate} color={v.color as PlateColor} />
                        <span className="text-xs text-[var(--color-text-muted)]">
                          {v.capacityMotos ? `${v.capacityMotos} motos` : 'Disponível'}
                          {v.defaultDriver ? ` · padrão ${v.defaultDriver}` : ''}
                        </span>
                      </div>
                    </div>
                  </button>

                  {active && (
                    <div className="border-t border-[var(--color-primary)]/20 px-3 py-2.5">
                      <Select
                        label="Motorista *"
                        value={selectedDriverId}
                        onChange={(e) => setSelectedDriverId(e.target.value)}
                        required
                        placeholder="Selecione o motorista"
                        options={drivers.map((d) => ({
                          value: d.id,
                          label:
                            v.defaultDriver &&
                            d.name.trim().toLowerCase() === v.defaultDriver.trim().toLowerCase()
                              ? `${d.name} (padrão)`
                              : d.name,
                        }))}
                      />
                      {drivers.length === 0 && (
                        <p className="mt-1.5 text-xs text-[var(--color-danger)]">
                          Nenhum motorista cadastrado — cadastre em Motoristas.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="sticky bottom-0 z-10 mt-3 border-t border-[var(--color-border)] bg-[var(--color-bg)]/95 pt-3 pb-1 backdrop-blur-sm">
          <Button
            className="w-full"
            size="lg"
            disabled={!selectedId || !selectedDriverId}
            onClick={() => setConfirmOpen(true)}
            loading={assignMutation.isPending}
          >
            {selectedVehicle
              ? `Confirmar ${selectedVehicle.plate}${selectedDriver ? ` · ${selectedDriver.name}` : ''}`
              : 'Selecione placa e motorista'}
          </Button>
          {overdueOrBlocked.length > 0 && !showProblems && pendingReport.length === 0 && (
            <button
              type="button"
              className="mt-2 w-full text-center text-xs text-[var(--color-text-muted)] underline-offset-2 hover:underline"
              onClick={() => setShowProblems(true)}
            >
              Ver placas com atraso/quebra já registrados
            </button>
          )}
        </div>
      </section>

      {showProblems && (
        <section className="mt-4 mb-6 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Indisponibilidade (atraso / quebra)</h2>
            <Button size="sm" variant="ghost" onClick={() => setShowProblems(false)}>
              Fechar
            </Button>
          </div>
          <p className="mb-3 text-sm text-[var(--color-text-muted)]">
            Apenas placas que <strong>já deveriam ter retornado</strong> até{' '}
            {selectedRoute ? formatDate(selectedRoute.date) : '—'} 06:00 (pela previsão da viagem)
            ou estão bloqueadas/manutenção.
          </p>

          {overdueOrBlocked.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">Nenhuma pendência.</p>
          ) : (
            <div className="space-y-2">
              {overdueOrBlocked.map((v) => (
                <div
                  key={v.id}
                  className={cn(
                    'flex flex-wrap items-center gap-3 rounded-[var(--radius)] border px-3 py-3',
                    !v.report
                      ? 'border-red-500/30 bg-red-500/5'
                      : 'border-[var(--color-border)]',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <PlateBadge plate={v.plate} color={v.color as PlateColor} />
                      {!v.report && (
                        <span className="text-xs font-medium text-[var(--color-danger)]">
                          Já deveria ter retornado
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                      {vehicleStatusLabels[v.status as VehicleStatus] ?? v.status}
                      {v.expectedReturn
                        ? ` · previsão era ${formatDate(v.expectedReturn)}`
                        : ''}
                    </p>
                    {v.report && (
                      <p className="mt-1 text-sm">
                        {v.report.reason}
                        <span className="block text-xs text-[var(--color-text-muted)]">
                          Disp. prevista: {formatDate(v.report.availableAtForecast)}
                        </span>
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={v.report ? 'secondary' : 'primary'}
                    onClick={() => openJustify(v)}
                  >
                    {v.report ? 'Atualizar' : 'Informar'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => assignMutation.mutate()}
        title="Confirmar placa?"
        message={`Rota: ${selectedRoute?.name}
Placa: ${selectedVehicle?.plate ?? '—'}
Motorista: ${selectedDriver?.name ?? '—'}
Saída: ${selectedRoute ? formatDate(selectedRoute.date) : ''} às 06:00${
          error && confirmOpen ? `\n\nErro: ${error}` : ''
        }`}
        confirmLabel="Confirmar"
        loading={assignMutation.isPending}
      />

      <Modal
        open={!!justifyVehicle}
        onClose={() => setJustifyVehicle(null)}
        title={`Indisponível — ${justifyVehicle?.plate ?? ''}`}
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            Esta placa deveria estar disponível para{' '}
            <strong>{selectedRoute ? formatDate(selectedRoute.date) : ''}</strong> às 06:00. Informe
            o motivo (atraso ou quebra) e a nova previsão.
          </p>
          <Select
            label="Motivo"
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            options={[
              ...cannotLoadPresets,
              ...delayReasonPresets.filter(
                (p) => !(cannotLoadPresets as readonly string[]).includes(p),
              ),
            ].map((label) => ({ value: label, label }))}
            placeholder="Selecione"
          />
          <Textarea
            label="Detalhes"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Descreva…"
          />
          <Input
            label="Previsão de disponibilidade"
            type="date"
            value={forecastDate}
            onChange={(e) => setForecastDate(e.target.value)}
            required
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setJustifyVehicle(null)}>
              Cancelar
            </Button>
            <Button
              loading={justifyMutation.isPending}
              disabled={composedReason().length < 5 || !forecastDate}
              onClick={() => justifyMutation.mutate()}
            >
              Salvar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
