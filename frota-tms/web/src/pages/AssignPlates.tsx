import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
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
  Combobox,
} from '../components/ui'
import { delayReasonPresets, vehicleStatusLabels } from '../lib/labels'
import { formatDate, toInputDate } from '../lib/format'
import { cn } from '../lib/cn'
import { compareRoutesByLoadPriority } from '../lib/route-priority'
import { isRouteForLslFleet } from '../lib/chronus-plate-hint'
import { RouteLoadCard } from '../components/RouteLoadCard'
import type { RouteLoadDestination } from '../lib/route-priority'
import { useAuthStore } from '../stores/auth'
import { plateOwner } from '../lib/plateOwner'

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
  requiredFleetOwner?: 'LSL' | 'AG' | null
  requiredCapacityMotos?: number | null
  loadRequirement?: {
    fleetOwner: 'LSL' | 'AG' | null
    capacityMotos: number | null
    label: string | null
  }
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
  destinations?: {
    id: string
    name: string
    city: string
    order: number
    minExpiryDate?: string | null
    motoCount?: number | null
  }[]
  available: PlatesBoardVehicle[]
  unavailable: PlatesBoardVehicle[]
  summary?: {
    available: number
    unavailable: number
    criticalPendingJustifications: number
    justified: number
  }
}

function dealersOf(route: Route) {
  if (route.dealerships && route.dealerships.length > 0) {
    return [...route.dealerships].sort((a, b) => a.order - b.order).map((rd) => rd.dealership)
  }
  return route.dealership ? [route.dealership] : []
}

function routeDestinations(route: Route) {
  if (route.dealerships && route.dealerships.length > 0) {
    return [...route.dealerships].sort((a, b) => a.order - b.order)
  }
  return []
}

function routeDestinationItems(route: Route): RouteLoadDestination[] {
  return routeDestinations(route).map((rd) => ({
    city: rd.dealership.city,
    dealershipName: rd.dealership.name,
    minExpiryDate: rd.minExpiryDate,
    motoCount: rd.motoCount,
    order: rd.order,
  }))
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
  const isOps = useAuthStore((s) => s.hasRole('OPERACAO'))
  const isAdmin = useAuthStore((s) => s.hasRole('ADMIN'))
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
        .filter((r) => {
          if (r.status !== 'AGUARDANDO_PLACAS' || (r.vehicles && r.vehicles.length > 0)) {
            return false
          }
          if (isOps && !isAdmin && isRouteForLslFleet(r)) return false
          return true
        })
        .sort(compareRoutesByLoadPriority),
    [routes, isOps, isAdmin],
  )

  useEffect(() => {
    const fromUrl = searchParams.get('routeId')
    if (fromUrl && fromUrl !== routeId) setRouteId(fromUrl)
  }, [searchParams, routeId])

  const selectedRoute = routes.find((r) => r.id === routeId)
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
      return
    }
    if (isOps && !isAdmin && isRouteForLslFleet(selectedRoute)) {
      setError('Roteiro LSL — apenas Admin define placa.')
      setRouteId('')
      setSearchParams({})
    }
  }, [routeId, loadingRoutes, routesError, selectedRoute, setSearchParams, isOps, isAdmin])

  // Só placas que JÁ DEVERIAM ter voltado (previsão ≤ 06:00) ou bloqueadas —
  // não listar toda a frota em viagem (isso polui e confunde)
  const overdueOrBlocked = useMemo(
    () => (board?.unavailable ?? []).filter((v) => v.shouldBeAvailable),
    [board?.unavailable],
  )
  const pendingReport = overdueOrBlocked.filter((v) => !v.report)
  const justifiedReports = overdueOrBlocked.filter((v) => !!v.report)
  const returningLaterCount = useMemo(
    () => (board?.unavailable ?? []).filter((v) => !v.shouldBeAvailable).length,
    [board?.unavailable],
  )

  const selectedVehicle = available.find((v) => v.id === selectedId) ?? null
  const selectedDriver = drivers.find((d) => d.id === selectedDriverId) ?? null
  const driverBlockedWarning =
    selectedDriver?.blocked
      ? `Não é possível usar este motorista: ${selectedDriver.blockReason || 'bloqueado pelo administrador'}`
      : ''

  function pickPlate(v: PlatesBoardVehicle) {
    setSelectedId(v.id)
    setError('')
    const match = drivers.find(
      (d) =>
        !d.blocked &&
        v.defaultDriver &&
        d.name.trim().toLowerCase() === v.defaultDriver.trim().toLowerCase(),
    )
    setSelectedDriverId(match?.id ?? '')
  }

  function onPlateComboboxChange(id: string) {
    const v = available.find((x) => x.id === id)
    if (v) pickPlate(v)
    else {
      setSelectedId(null)
      setSelectedDriverId('')
    }
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
        qc.invalidateQueries({ queryKey: ['returns'] }),
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
      await qc.invalidateQueries({ queryKey: ['justifications'] })
      await qc.invalidateQueries({ queryKey: ['dashboard'] })
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
      <div className="page-desktop max-w-5xl">
        <PageHeader
          title="Definir placa"
          description="Menor vencimento primeiro."
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
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-danger)]" />
                Vencido
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                Vence em 1 dia
              </span>
            </div>
            <div className="space-y-5">
            {pendingRoutes.map((r) => (
              <RouteLoadCard
                key={r.id}
                name={r.name}
                loadDate={r.date}
                destinations={routeDestinationItems(r)}
                priorityExpiryDate={r.priorityExpiryDate}
                notes={r.notes}
                totalMotoCount={r.totalMotoCount}
                requiredFleetOwner={r.requiredFleetOwner}
                requiredCapacityMotos={r.requiredCapacityMotos}
                onClick={() => pickRoute(r.id)}
              />
            ))}
            </div>
          </>
        )}
      </div>
    )
  }

  // ——— Detalhe da rota (tela focada) ———
  const expiry =
    board?.route?.priorityExpiryDate ??
    board?.priorityExpiryDate ??
    selectedRoute?.priorityExpiryDate ??
    null

  const destinationRows: RouteLoadDestination[] =
    board?.destinations?.map((d) => ({
      city: d.city,
      dealershipName: d.name,
      minExpiryDate: d.minExpiryDate,
      motoCount: d.motoCount,
      order: d.order,
    })) ??
    (selectedRoute ? routeDestinationItems(selectedRoute) : [])

  return (
    <div className="page-desktop flex max-w-5xl flex-col pb-28">
      <button
        type="button"
        onClick={backToList}
        className="mb-2 inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar às rotas
      </button>

      <div className="mb-4">
        <RouteLoadCard
          name={selectedRoute?.name ?? 'Rota'}
          loadDate={selectedRoute?.date ?? new Date().toISOString()}
          destinations={destinationRows}
          priorityExpiryDate={expiry}
          notes={selectedRoute?.notes}
          totalMotoCount={selectedRoute?.totalMotoCount}
          requiredFleetOwner={selectedRoute?.requiredFleetOwner}
          requiredCapacityMotos={selectedRoute?.requiredCapacityMotos}
        />
        {board?.returnForecast && (
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Retorno previsto: {formatDate(board.returnForecast.expectedReturn)}
          </p>
        )}
      </div>

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

      <section className="space-y-3 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Definir placa</h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            {available.length} disponível{available.length === 1 ? '' : 'eis'}
            {returningLaterCount > 0 ? ` · ${returningLaterCount} em viagem` : ''}
          </p>
        </div>
        {board?.loadRequirement?.label && (
          <p className="mb-3 text-sm text-[var(--color-text-muted)]">
            Veículo:{' '}
            <span className="font-medium text-[var(--color-text)]">
              {board.loadRequirement.label}
            </span>
          </p>
        )}

        {loadingBoard ? (
          <div className="flex justify-center py-8">
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
          <div className="space-y-3">
            <Combobox
              label="Placa *"
              value={selectedId ?? ''}
              onChange={onPlateComboboxChange}
              placeholder="Digite a placa…"
              emptyMessage="Nenhuma placa encontrada"
              options={available.map((v) => ({
                value: v.id,
                label: v.plate,
                description: [
                  `${plateOwner(v.plate)} · ${v.capacityMotos} motos`,
                  v.defaultDriver ? `padrão ${v.defaultDriver}` : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
              }))}
            />

            <Combobox
              label="Motorista *"
              value={selectedDriverId}
              onChange={(id) => {
                setSelectedDriverId(id)
                setError('')
              }}
              placeholder="Digite o nome do motorista…"
              emptyMessage="Nenhum motorista encontrado"
              disabled={!selectedId}
              options={drivers.map((d) => {
                const isDefault =
                  !!selectedVehicle?.defaultDriver &&
                  d.name.trim().toLowerCase() ===
                    selectedVehicle.defaultDriver.trim().toLowerCase()
                return {
                  value: d.id,
                  label: d.blocked ? `${d.name} — BLOQUEADO` : d.name,
                  description: d.blocked
                    ? d.blockReason || 'Bloqueado pelo admin'
                    : isDefault
                      ? 'Motorista padrão da placa'
                      : undefined,
                  disabled: !!d.blocked,
                }
              })}
            />

            {selectedVehicle && (
              <p className="text-xs text-[var(--color-text-muted)]">
                Selecionada:{' '}
                <PlateBadge plate={selectedVehicle.plate} color={selectedVehicle.color as PlateColor} />
                {selectedDriver ? ` · ${selectedDriver.name}` : ''}
              </p>
            )}

            {driverBlockedWarning && (
              <p className="text-xs font-medium text-[var(--color-danger)]">{driverBlockedWarning}</p>
            )}
            {drivers.length === 0 && (
              <p className="text-xs text-[var(--color-danger)]">
                Nenhum motorista cadastrado — cadastre em Motoristas.
              </p>
            )}
          </div>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--color-border)] bg-[var(--color-bg)]/95 px-4 py-3 backdrop-blur-sm md:static md:mt-4 md:border-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
        <div className="mx-auto max-w-5xl">
          <Button
            className="w-full"
            size="lg"
            disabled={!selectedId || !selectedDriverId || !!driverBlockedWarning}
            onClick={() => setConfirmOpen(true)}
            loading={assignMutation.isPending}
          >
            {driverBlockedWarning
              ? 'Motorista bloqueado — escolha outro'
              : selectedVehicle
                ? `Confirmar ${selectedVehicle.plate}${selectedDriver ? ` · ${selectedDriver.name}` : ''}`
                : 'Selecione placa e motorista'}
          </Button>
        </div>
      </div>

      {justifiedReports.length > 0 && (
        <section className="mt-4 mb-4 rounded-[var(--radius)] border border-amber-500/25 bg-amber-500/5 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">
              Justificativas deste roteiro ({justifiedReports.length})
            </h2>
            <Link
              to="/justificativas"
              className="text-xs font-medium text-[var(--color-primary)] hover:underline"
            >
              Ver todas
            </Link>
          </div>
          <div className="space-y-2">
            {justifiedReports.map((v) => (
              <div
                key={v.id}
                className="flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <PlateBadge plate={v.plate} color={v.color as PlateColor} />
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                      Registrada
                    </span>
                  </div>
                  <p className="mt-1 text-sm">{v.report?.reason}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Disp. prevista:{' '}
                    {v.report?.availableAtForecast
                      ? formatDate(v.report.availableAtForecast)
                      : '—'}
                    {v.report?.reportedBy?.name ? ` · por ${v.report.reportedBy.name}` : ''}
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => openJustify(v)}>
                  Atualizar
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {overdueOrBlocked.length > 0 && !showProblems && pendingReport.length === 0 && justifiedReports.length === 0 && (
        <button
          type="button"
          className="mt-2 w-full text-center text-xs text-[var(--color-text-muted)] underline-offset-2 hover:underline"
          onClick={() => setShowProblems(true)}
        >
          Ver placas com atraso/quebra já registrados
        </button>
      )}

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
