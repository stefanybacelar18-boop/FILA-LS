import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { GripVertical, Search } from 'lucide-react'
import { api } from '../lib/api'
import type { PlateColor, Route, Vehicle, VehicleStatus } from '../types'
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

interface PlatesBoardVehicle extends Vehicle {
  report?: {
    id: string
    reason: string
    availableAtForecast: string
    reportedAt: string
    reportedBy: { id: string; name: string }
  } | null
  unavailableReasonCode?: string
  loadDate?: string
  shouldBeAvailable?: boolean
  needsJustification?: boolean
}

interface PlatesBoard {
  routeId: string
  routeName: string
  loadAt: string
  plannedVehicleCount?: number | null
  assignedCount?: number
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

function allowedTypesForRoute(route: Route): Set<'TRUCK' | 'CARRETA'> | null {
  const dealers = dealersOf(route)
  if (dealers.length === 0) return null
  let allowed: Set<'TRUCK' | 'CARRETA'> = new Set(['TRUCK', 'CARRETA'])
  for (const d of dealers) {
    if (d.allowedVehicle === 'AMBOS') continue
    if (d.allowedVehicle === 'TRUCK' || d.allowedVehicle === 'CARRETA') {
      allowed = new Set([...allowed].filter((t) => t === d.allowedVehicle))
    }
  }
  return allowed
}

function PlateRow({
  vehicle,
  onAction,
  actionLabel,
  draggable,
  extra,
}: {
  vehicle: { id: string; plate: string; color: PlateColor; capacityMotos: number; defaultDriver: string | null }
  onAction: () => void
  actionLabel: string
  draggable?: boolean
  extra?: string
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: vehicle.id,
    data: { vehicle },
    disabled: !draggable,
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3',
        isDragging && 'opacity-40',
      )}
    >
      {draggable && (
        <button
          type="button"
          className="cursor-grab touch-none p-1 text-[var(--color-text-muted)]"
          {...listeners}
          {...attributes}
          aria-label="Arrastar"
        >
          <GripVertical className="h-5 w-5" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <PlateBadge plate={vehicle.plate} color={vehicle.color} />
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {vehicle.capacityMotos} motos
          {vehicle.defaultDriver ? ` · ${vehicle.defaultDriver}` : ''}
        </p>
        {extra && <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{extra}</p>}
      </div>
      <Button variant={draggable ? 'primary' : 'secondary'} size="sm" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  )
}

function DropArea({ empty, children }: { empty: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'route-drop' })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-h-[240px] space-y-2 rounded-xl border-2 border-dashed p-3 transition',
        isOver
          ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)]/50'
          : 'border-[var(--color-border)] bg-[var(--color-surface-2)]/40',
      )}
    >
      {empty ? (
        <p className="py-16 text-center text-base text-[var(--color-text-muted)]">
          Toque em <strong>Usar</strong> ou arraste a placa para cá
        </p>
      ) : (
        children
      )}
    </div>
  )
}

export function AssignPlates() {
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [routeId, setRouteId] = useState(searchParams.get('routeId') || '')
  const [selected, setSelected] = useState<string[]>([])
  const [driverName, setDriverName] = useState('')
  const [driverTouched, setDriverTouched] = useState(false)
  const [plateSearch, setPlateSearch] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  const [justifyVehicle, setJustifyVehicle] = useState<PlatesBoardVehicle | null>(null)
  const [preset, setPreset] = useState('')
  const [reason, setReason] = useState('')
  const [forecastDate, setForecastDate] = useState('')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const { data: routes = [], isLoading: loadingRoutes } = useQuery({
    queryKey: ['routes'],
    queryFn: async () => (await api.get<Route[]>('/routes')).data,
  })

  // Operação só vê o que o Admin já enviou (AGUARDANDO_PLACAS)
  const assignableRoutes = useMemo(
    () =>
      routes
        .filter((r) => r.status === 'AGUARDANDO_PLACAS')
        .sort((a, b) => Number(b.hasPriority) - Number(a.hasPriority)),
    [routes],
  )

  useEffect(() => {
    const fromUrl = searchParams.get('routeId')
    if (fromUrl && fromUrl !== routeId) setRouteId(fromUrl)
  }, [searchParams, routeId])

  const selectedRoute = routes.find((r) => r.id === routeId)
  const cities = selectedRoute ? citiesOf(selectedRoute) : []
  const allowedTypes = selectedRoute ? allowedTypesForRoute(selectedRoute) : null

  const { data: board, isLoading: loadingBoard } = useQuery({
    queryKey: ['plates-board', routeId],
    queryFn: async () => (await api.get<PlatesBoard>(`/routes/${routeId}/plates-board`)).data,
    enabled: !!routeId,
  })

  const available = board?.available ?? []
  const unavailable = board?.unavailable ?? []

  const pool = useMemo(() => {
    const q = plateSearch.trim().toLowerCase()
    return available.filter((v) => {
      if (selected.includes(v.id)) return false
      if (allowedTypes && !allowedTypes.has(v.type)) return false
      if (!q) return true
      return (
        v.plate.toLowerCase().includes(q) ||
        (v.defaultDriver?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [available, selected, plateSearch, allowedTypes])

  const selectedVehicles = available.filter((v) => selected.includes(v.id))

  useEffect(() => {
    if (driverTouched) return
    if (selectedVehicles.length === 1 && selectedVehicles[0].defaultDriver) {
      setDriverName(selectedVehicles[0].defaultDriver)
    } else if (selectedVehicles.length === 0) {
      setDriverName('')
    } else {
      const drivers = [...new Set(selectedVehicles.map((v) => v.defaultDriver).filter(Boolean))]
      setDriverName(drivers.length === 1 ? (drivers[0] as string) : '')
    }
  }, [selectedVehicles, driverTouched])

  const assignMutation = useMutation({
    mutationFn: async () => {
      const drivers: Record<string, string> = {}
      for (const v of selectedVehicles) {
        const name = driverName.trim() || v.defaultDriver
        if (name) drivers[v.id] = name
      }
      return api.post(`/routes/${routeId}/assign-plates`, {
        vehicleIds: selected,
        driverName: driverName.trim() || undefined,
        drivers,
      })
    },
    onSuccess: async () => {
      const n = selected.length
      const name = selectedRoute?.name ?? 'roteiro'
      setSelected([])
      setDriverName('')
      setDriverTouched(false)
      setConfirmOpen(false)
      setError('')
      setRouteId('')
      setPlateSearch('')
      setOkMsg(`${n} placa(s) definida(s) em "${name}". Roteiro saiu da pendência.`)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['routes'] }),
        qc.invalidateQueries({ queryKey: ['vehicles'] }),
        qc.invalidateQueries({ queryKey: ['trips'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
        qc.invalidateQueries({ queryKey: ['plates-board'] }),
      ])
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Não foi possível atribuir. Tente de novo.',
      )
      setConfirmOpen(false)
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
      setOkMsg('Indisponibilidade registrada com previsão de disponibilidade.')
      await qc.invalidateQueries({ queryKey: ['plates-board', routeId] })
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Não foi possível salvar a justificativa.',
      )
    },
  })

  function pickRoute(id: string) {
    setRouteId(id)
    setSearchParams(id ? { routeId: id } : {})
    setSelected([])
    setDriverName('')
    setDriverTouched(false)
    setError('')
    setOkMsg('')
    setPlateSearch('')
  }

  function addPlate(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev : [...prev, id]))
    setOkMsg('')
  }

  function removePlate(id: string) {
    setSelected((prev) => prev.filter((x) => x !== id))
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    if (e.over?.id === 'route-drop') addPlate(String(e.active.id))
  }

  const activeVehicle = available.find((v) => v.id === activeId)

  const pendingJustification = unavailable.filter((v) => !v.report)
  const criticalPending = unavailable.filter((v) => v.shouldBeAvailable && !v.report)
  const needed = board?.plannedVehicleCount ?? selectedRoute?.plannedVehicleCount ?? null
  const alreadyAssigned = board?.assignedCount ?? 0
  const selectedTotal = selected.length
  const effectiveAssigned = alreadyAssigned + selectedTotal
  const missing =
    needed != null && needed > 0 ? Math.max(0, needed - effectiveAssigned) : null
  const excess =
    needed != null && needed > 0 ? Math.max(0, effectiveAssigned - needed) : null
  const coverage =
    needed != null && needed > 0
      ? Math.min(100, Math.round((effectiveAssigned / needed) * 100))
      : null
  const canConfirm = selected.length > 0 && criticalPending.length === 0

  return (
    <div className="ops-readable mx-auto max-w-5xl">
      <PageHeader
        title="Operação — Definir Placas"
        description="Escolha a rota · selecione as placas · confirme. Só isso."
      />

      {okMsg && (
        <p className="mb-4 rounded-xl bg-teal-600/15 px-4 py-3 text-lg font-medium text-teal-900 dark:text-teal-100">
          {okMsg}
        </p>
      )}

      <p className="mb-3 text-2xl font-bold">1. Escolha a rota</p>

      {loadingRoutes ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : assignableRoutes.length === 0 ? (
        <EmptyState title="Nenhuma pendência" description="Todos os roteiros já têm placa definida." />
      ) : (
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {assignableRoutes.map((r) => {
            const c = citiesOf(r)
            const active = r.id === routeId
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => pickRoute(r.id)}
                className={cn(
                  'min-h-[88px] rounded-xl border-2 px-4 py-4 text-left transition',
                  active
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/40',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-lg font-semibold">{r.name}</span>
                  {r.hasPriority && (
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
                      Prioridade
                    </span>
                  )}
                </div>
                <p className="mt-1 text-base text-[var(--color-text-muted)]">
                  {formatDate(r.date)} · 06:00
                  {c.length > 0 ? ` · ${c.join(', ')}` : ''}
                </p>
              </button>
            )
          })}
        </div>
      )}

      {!routeId ? null : (
        <>
          <div className="mb-6 rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
            <p className="text-2xl font-bold">
              {selectedRoute?.name}
              {selectedRoute?.hasPriority && (
                <span className="ml-2 text-lg text-amber-700 dark:text-amber-300">★ Prioridade</span>
              )}
            </p>
            <p className="mt-1 text-lg text-[var(--color-text-muted)]">
              {cities.length > 0 ? cities.join(', ') : '—'} · {formatDate(selectedRoute?.date)} 06:00
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <CoverageStat label="Necessário" value={needed ?? '—'} />
              <CoverageStat label="Selecionados" value={selectedTotal} tone="text-[var(--color-primary)]" />
              <CoverageStat
                label={missing != null && missing > 0 ? 'Faltam' : excess && excess > 0 ? 'Excesso' : 'Faltam'}
                value={missing != null && missing > 0 ? missing : excess && excess > 0 ? excess : 0}
                tone={
                  missing != null && missing > 0
                    ? 'text-amber-700'
                    : excess && excess > 0
                      ? 'text-blue-700'
                      : 'text-green-700'
                }
              />
              <CoverageStat
                label="Cobertura"
                value={coverage != null ? `${coverage}%` : '—'}
                tone={coverage != null && coverage >= 100 ? 'text-green-700' : 'text-amber-700'}
              />
            </div>
            {coverage != null && (
              <div className="mt-3 h-4 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                <div
                  className={cn(
                    'h-full rounded-full',
                    coverage >= 100 ? 'bg-green-600' : 'bg-amber-500',
                  )}
                  style={{ width: `${coverage}%` }}
                />
              </div>
            )}
          </div>

          {criticalPending.length > 0 && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">
              <p className="font-semibold text-[var(--color-danger)]">
                {criticalPending.length} placa(s) já deveriam estar disponíveis e ainda sem
                justificativa.
              </p>
              <p className="mt-1 text-[var(--color-text-muted)]">
                Antes de confirmar o roteiro, justifique no passo 3 (motivo + previsão de
                disponibilidade). Isso evita carregar com buraco na frota sem registro.
              </p>
            </div>
          )}

          <p className="mb-3 text-2xl font-bold">2. Selecione as placas</p>

          {allowedTypes && allowedTypes.size < 2 && allowedTypes.size > 0 && (
            <p className="mb-3 rounded-xl bg-amber-500/15 px-4 py-2 text-sm text-amber-900 dark:text-amber-100">
              Este roteiro aceita apenas <strong>{[...allowedTypes].join(' / ')}</strong>
            </p>
          )}

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium">Motorista (opcional)</label>
            <input
              value={driverName}
              onChange={(e) => {
                setDriverTouched(true)
                setDriverName(e.target.value)
              }}
              placeholder="Se vazio, usa o motorista da placa"
              className="h-12 w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-base outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          {error && (
            <p className="mb-4 rounded-xl bg-red-500/10 px-4 py-3 text-base text-[var(--color-danger)]">
              {error}
            </p>
          )}

          <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            <div className="grid gap-4 lg:grid-cols-2">
              <section>
                <h3 className="mb-2 text-base font-semibold">Disponíveis ({pool.length})</h3>
                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
                  <input
                    type="search"
                    value={plateSearch}
                    onChange={(e) => setPlateSearch(e.target.value)}
                    placeholder="Buscar placa…"
                    className="h-12 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-2 pl-10 pr-3 text-base outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
                <div className="max-h-[400px] space-y-2 overflow-y-auto pr-1">
                  {loadingBoard ? (
                    <div className="flex justify-center py-12">
                      <Spinner size="lg" />
                    </div>
                  ) : pool.length === 0 ? (
                    <p className="py-8 text-center text-base text-[var(--color-text-muted)]">
                      {selected.length > 0 ? 'Todas já estão no roteiro →' : 'Nenhuma placa livre'}
                    </p>
                  ) : (
                    pool.map((v) => (
                      <PlateRow
                        key={v.id}
                        vehicle={v}
                        draggable
                        actionLabel="Usar"
                        onAction={() => addPlate(v.id)}
                      />
                    ))
                  )}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-base font-semibold">No roteiro ({selected.length})</h3>
                <DropArea empty={selected.length === 0}>
                  {selectedVehicles.map((v) => (
                    <PlateRow
                      key={v.id}
                      vehicle={v}
                      actionLabel="Tirar"
                      onAction={() => removePlate(v.id)}
                    />
                  ))}
                </DropArea>

                <Button
                  className="mt-4 h-16 w-full text-xl font-bold"
                  size="lg"
                  disabled={!canConfirm}
                  onClick={() => setConfirmOpen(true)}
                  loading={assignMutation.isPending}
                >
                  Confirmar {selected.length > 0 ? `(${selected.length} placas)` : ''}
                </Button>
                {criticalPending.length > 0 && (
                  <p className="mt-2 text-center text-base font-semibold text-[var(--color-danger)]">
                    Justifique as {criticalPending.length} placa(s) críticas para liberar
                  </p>
                )}
                {missing != null && missing > 0 && selected.length > 0 && (
                  <p className="mt-2 text-center text-base text-amber-700">
                    Ainda faltam {missing} veículo(s) para a meta — você pode confirmar parcial.
                  </p>
                )}
              </section>
            </div>

            <DragOverlay>
              {activeVehicle ? (
                <div className="rounded-xl border bg-[var(--color-surface)] px-4 py-3 shadow-lg">
                  <PlateBadge plate={activeVehicle.plate} color={activeVehicle.color} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          {/* Indisponíveis — operador justifica */}
          <div className="mt-8">
            <p className="mb-2 text-lg font-semibold">3. Placas indisponíveis para esta data</p>
            <p className="mb-3 text-sm text-[var(--color-text-muted)]">
              Se a placa não pode carregar em {selectedRoute ? formatDate(selectedRoute.date) : '—'}{' '}
              às 06:00, o operador deve justificar e informar a previsão de disponibilidade.
              {pendingJustification.length > 0 && (
                <span className="ml-1 font-medium text-[var(--color-danger)]">
                  ({pendingJustification.length} sem justificativa)
                </span>
              )}
            </p>

            {loadingBoard ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : unavailable.length === 0 ? (
              <EmptyState title="Nenhuma placa indisponível" description="Toda a frota elegível está livre." />
            ) : (
              <div className="max-h-[420px] space-y-2 overflow-y-auto">
                {unavailable.map((v) => (
                  <div
                    key={v.id}
                    className={cn(
                      'flex flex-wrap items-center gap-3 rounded-xl border px-3 py-3',
                      v.shouldBeAvailable && !v.report
                        ? 'border-red-500/40 bg-red-500/5'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)]',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <PlateBadge plate={v.plate} color={v.color} />
                        {v.shouldBeAvailable && (
                          <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-[var(--color-danger)]">
                            Já deveria ter retornado
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                        {vehicleStatusLabels[v.status as VehicleStatus] ?? v.status}
                        {v.expectedReturn ? ` · retorno prev. ${formatDate(v.expectedReturn)}` : ''}
                      </p>
                      {v.report ? (
                        <p className="mt-1 text-sm">
                          <span className="font-medium">Justificativa:</span> {v.report.reason}
                          <span className="block text-xs text-[var(--color-text-muted)]">
                            Disp. prevista: {formatDate(v.report.availableAtForecast)} · por{' '}
                            {v.report.reportedBy.name}
                          </span>
                        </p>
                      ) : (
                        <p className="mt-1 text-xs font-medium text-[var(--color-danger)]">
                          Pendente de justificativa
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={v.report ? 'secondary' : 'primary'}
                      onClick={() => {
                        setError('')
                        setJustifyVehicle(v)
                        setPreset('')
                        setReason(v.report?.reason ?? '')
                        setForecastDate(
                          v.report?.availableAtForecast
                            ? toInputDate(v.report.availableAtForecast)
                            : toInputDate(selectedRoute?.date ?? new Date()),
                        )
                      }}
                    >
                      {v.report ? 'Atualizar' : 'Justificar'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {!routeId && assignableRoutes.length > 0 && (
        <p className="mt-2 text-center text-base text-[var(--color-text-muted)]">
          Toque em um roteiro para continuar
        </p>
      )}

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => assignMutation.mutate()}
        title="Confirmar placas?"
        message={`Rota: ${selectedRoute?.name}
Necessário: ${needed ?? '—'} · Selecionados: ${selectedTotal} · Faltam: ${missing ?? '—'} · Cobertura: ${coverage != null ? `${coverage}%` : '—'}
Saída ${selectedRoute ? formatDate(selectedRoute.date) : ''} às 06:00.`}
        confirmLabel="Sim, confirmar"
        loading={assignMutation.isPending}
      />

      <Modal
        open={!!justifyVehicle}
        onClose={() => setJustifyVehicle(null)}
        title={`Indisponível — ${justifyVehicle?.plate ?? ''}`}
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            Informe por que esta placa não estará disponível para carregar em{' '}
            <strong>{selectedRoute ? formatDate(selectedRoute.date) : ''}</strong> às 06:00 e a
            previsão de quando volta a ficar disponível.
          </p>
          <Select
            label="Motivo"
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            options={delayReasonPresets.map((label) => ({ value: label, label }))}
            placeholder="Selecione"
          />
          <Textarea
            label="Justificativa"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Descreva o motivo…"
            required
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

function CoverageStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string | number
  tone?: string
}) {
  return (
    <div className="rounded-xl bg-[var(--color-surface-2)] px-3 py-3 text-center">
      <p className="text-sm font-medium text-[var(--color-text-muted)]">{label}</p>
      <p className={cn('text-3xl font-bold', tone)}>{value}</p>
    </div>
  )
}
