import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
import { Building2, Calendar, Check, GripVertical, MapPin, Search, Tags } from 'lucide-react'
import { api } from '../lib/api'
import type { Route, Vehicle } from '../types'
import {
  PageHeader,
  Button,
  PlateBadge,
  Spinner,
  EmptyState,
  ConfirmModal,
  Input,
  Badge,
} from '../components/ui'
import { routeStatusLabels, vehicleTypeLabels } from '../lib/labels'
import { formatDate } from '../lib/format'
import { cn } from '../lib/cn'

function routeDealerships(route: Route) {
  if (route.dealerships && route.dealerships.length > 0) {
    return route.dealerships.map((rd) => rd.dealership)
  }
  if (route.dealership) return [route.dealership]
  return []
}

function routeCities(route: Route): string[] {
  return [...new Set(routeDealerships(route).map((d) => d.city))]
}

function DraggablePlate({
  vehicle,
  selected,
  onToggle,
}: {
  vehicle: Vehicle
  selected: boolean
  onToggle: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: vehicle.id,
    data: { vehicle },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex items-center gap-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2',
        selected && 'border-[var(--color-primary)] bg-[var(--color-primary-muted)]',
        isDragging && 'opacity-40',
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-[var(--color-text-muted)]"
        {...listeners}
        {...attributes}
        aria-label="Arrastar"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <PlateBadge plate={vehicle.plate} color={vehicle.color} />
        <span className="truncate text-xs text-[var(--color-text-muted)]">
          {vehicleTypeLabels[vehicle.type]} · {vehicle.capacityMotos} motos
          {vehicle.defaultDriver ? ` · ${vehicle.defaultDriver}` : ''}
        </span>
      </button>
    </div>
  )
}

function DropZone({ children, ids }: { children: ReactNode; ids: string[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'route-drop' })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-h-[220px] rounded-[var(--radius)] border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-3 transition',
        isOver && 'border-[var(--color-primary)] bg-[var(--color-primary-muted)]/40',
      )}
    >
      {ids.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--color-text-muted)]">
          Clique ou arraste placas da lista à esquerda
        </p>
      ) : (
        children
      )}
    </div>
  )
}

export function AssignPlates() {
  const qc = useQueryClient()
  const [routeId, setRouteId] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [driverName, setDriverName] = useState('')
  const [driverTouched, setDriverTouched] = useState(false)
  const [plateSearch, setPlateSearch] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const { data: routes = [], isLoading: loadingRoutes } = useQuery({
    queryKey: ['routes'],
    queryFn: async () => (await api.get<Route[]>('/routes')).data,
  })

  const assignableRoutes = useMemo(
    () =>
      routes.filter(
        (r) => r.status === 'AGUARDANDO_PLACAS' || r.status === 'EM_ANDAMENTO' || r.status === 'RASCUNHO',
      ),
    [routes],
  )

  const selectedRoute = routes.find((r) => r.id === routeId)
  const dealers = selectedRoute ? routeDealerships(selectedRoute) : []
  const cities = selectedRoute ? routeCities(selectedRoute) : []

  const { data: available = [], isLoading: loadingAvailable } = useQuery({
    queryKey: ['vehicles', 'available'],
    queryFn: async () => (await api.get<Vehicle[]>('/vehicles/available')).data,
  })

  /** Placas já escolhidas somem da lista da esquerda */
  const poolVehicles = useMemo(() => {
    const q = plateSearch.trim().toLowerCase()
    return available.filter((v) => {
      if (selected.includes(v.id)) return false
      if (!q) return true
      return (
        v.plate.toLowerCase().includes(q) ||
        (v.defaultDriver?.toLowerCase().includes(q) ?? false) ||
        vehicleTypeLabels[v.type].toLowerCase().includes(q)
      )
    })
  }, [available, selected, plateSearch])

  const selectedVehicles = available.filter((v) => selected.includes(v.id))

  useEffect(() => {
    if (driverTouched) return
    const vehicles = available.filter((v) => selected.includes(v.id))
    if (vehicles.length === 1 && vehicles[0].defaultDriver) {
      setDriverName(vehicles[0].defaultDriver)
    } else if (vehicles.length === 0) {
      setDriverName('')
    } else {
      const drivers = [...new Set(vehicles.map((v) => v.defaultDriver).filter(Boolean))]
      if (drivers.length === 1) setDriverName(drivers[0] as string)
      else if (drivers.length === 0) setDriverName('')
    }
  }, [selected, available, driverTouched])

  const assignMutation = useMutation({
    mutationFn: async () => {
      const drivers: Record<string, string> = {}
      for (const v of selectedVehicles) {
        const override = driverName.trim()
        if (override) drivers[v.id] = override
        else if (v.defaultDriver) drivers[v.id] = v.defaultDriver
      }
      return api.post(`/routes/${routeId}/assign-plates`, {
        vehicleIds: selected,
        driverName: driverName.trim() || undefined,
        drivers,
      })
    },
    onSuccess: async (_data, _vars, _ctx) => {
      const count = selected.length
      const plates = selectedVehicles.map((v) => v.plate).join(', ')
      setSelected([])
      setDriverName('')
      setDriverTouched(false)
      setConfirmOpen(false)
      setError('')
      setSuccessMsg(`${count} placa(s) atribuída(s): ${plates}. Removidas da lista de disponíveis.`)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['routes'] }),
        qc.invalidateQueries({ queryKey: ['vehicles'] }),
        qc.invalidateQueries({ queryKey: ['trips'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Erro ao atribuir placas'
      setError(msg)
      setConfirmOpen(false)
    },
  })

  function selectRoute(id: string) {
    setRouteId(id)
    setSelected([])
    setDriverName('')
    setDriverTouched(false)
    setError('')
    setSuccessMsg('')
    setPlateSearch('')
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    setSuccessMsg('')
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    if (e.over?.id === 'route-drop') {
      const id = String(e.active.id)
      setSelected((prev) => (prev.includes(id) ? prev : [...prev, id]))
      setSuccessMsg('')
    }
  }

  const activeVehicle = available.find((v) => v.id === activeId)

  return (
    <div>
      <PageHeader
        title="Definir Placas"
        description="Escolha o roteiro, veja as cidades/concessionárias e atribua as placas"
      />

      {/* Seletor visual de roteiros */}
      <section className="mb-5">
        <h2 className="mb-2 font-display text-sm font-semibold">1. Selecione o roteiro</h2>
        {loadingRoutes ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : assignableRoutes.length === 0 ? (
          <EmptyState
            title="Nenhum roteiro aguardando placas"
            description="Crie um roteiro em Roteiros → Novo primeiro."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {assignableRoutes.map((r) => {
              const rDealers = routeDealerships(r)
              const rCities = routeCities(r)
              const active = r.id === routeId
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => selectRoute(r.id)}
                  className={cn(
                    'rounded-[var(--radius)] border p-4 text-left transition',
                    active
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)] shadow-[var(--shadow-sm)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/50',
                  )}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-display text-sm font-semibold">{r.name}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                        <Calendar className="h-3 w-3" />
                        {formatDate(r.date)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {active && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-[10px] font-semibold text-white">
                          <Check className="h-3 w-3" /> Ativo
                        </span>
                      )}
                      {r.hasPriority && <Badge tone="warning">Prioritário</Badge>}
                    </div>
                  </div>

                  <div className="mb-2 flex items-start gap-1.5 text-xs">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />
                    <span className="font-medium">
                      {rCities.length === 0 ? 'Sem cidades' : rCities.join(' · ')}
                    </span>
                  </div>

                  <div className="flex items-start gap-1.5 text-xs text-[var(--color-text-muted)]">
                    <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      {rDealers.length === 0
                        ? 'Sem concessionárias'
                        : `${rDealers.length} concessionária${rDealers.length > 1 ? 's' : ''}: ${rDealers
                            .map((d) => d.name)
                            .join(', ')}`}
                    </span>
                  </div>

                  <div className="mt-2">
                    <Badge>{routeStatusLabels[r.status]}</Badge>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {selectedRoute && (
        <div className="mb-4 space-y-3 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Tags className="h-4 w-4 text-[var(--color-primary)]" />
            <span className="font-medium">{selectedRoute.name}</span>
            <Badge>{routeStatusLabels[selectedRoute.status]}</Badge>
            {selectedRoute.hasPriority && <Badge tone="warning">Carga Prioritária</Badge>}
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Cidades ({cities.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {cities.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1 rounded-full bg-teal-600/15 px-2.5 py-1 text-xs font-medium text-teal-800 dark:text-teal-200"
                >
                  <MapPin className="h-3 w-3" />
                  {c}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Concessionárias ({dealers.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {dealers.map((d) => (
                <Badge key={d.id} tone="info">
                  {d.name}
                  <span className="opacity-70"> · {d.city}</span>
                </Badge>
              ))}
            </div>
          </div>

          {selectedRoute.hasPriority && selectedRoute.priorityNotes && (
            <p className="text-xs text-amber-700 dark:text-amber-300">{selectedRoute.priorityNotes}</p>
          )}
        </div>
      )}

      {!routeId ? (
        <EmptyState
          title="Selecione um roteiro acima"
          description="Clique em um card de roteiro para ver as cidades e atribuir placas."
        />
      ) : (
        <>
          <h2 className="mb-2 font-display text-sm font-semibold">2. Atribua as placas</h2>
          <div className="mb-3 max-w-md">
            <Input
              label="Motorista (opcional — sobrescreve o padrão da placa)"
              value={driverName}
              onChange={(e) => {
                setDriverTouched(true)
                setDriverName(e.target.value)
              }}
              placeholder="Nome do motorista"
            />
          </div>

          {successMsg && (
            <p className="mb-3 rounded border border-teal-600/30 bg-teal-600/10 px-3 py-2 text-sm text-teal-800 dark:text-teal-200">
              {successMsg}
            </p>
          )}

          <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)]">
                <div className="border-b border-[var(--color-border)] px-4 py-3">
                  <h3 className="font-display text-sm font-semibold">
                    Disponíveis ({poolVehicles.length})
                  </h3>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Ao selecionar, a placa sai desta lista e vai para o roteiro
                  </p>
                  <div className="relative mt-2">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]" />
                    <input
                      type="search"
                      value={plateSearch}
                      onChange={(e) => setPlateSearch(e.target.value)}
                      placeholder="Buscar placa ou motorista…"
                      className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] py-1.5 pl-8 pr-2 text-sm outline-none focus:border-[var(--color-primary)]"
                    />
                  </div>
                </div>
                <div className="max-h-[420px] space-y-2 overflow-y-auto p-3">
                  {loadingAvailable ? (
                    <div className="flex justify-center py-10">
                      <Spinner />
                    </div>
                  ) : poolVehicles.length === 0 ? (
                    <EmptyState
                      title={selected.length > 0 ? 'Todas as placas escolhidas estão à direita' : 'Nenhuma placa disponível'}
                    />
                  ) : (
                    poolVehicles.map((v) => (
                      <DraggablePlate
                        key={v.id}
                        vehicle={v}
                        selected={false}
                        onToggle={() => toggle(v.id)}
                      />
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)]">
                <h3 className="border-b border-[var(--color-border)] px-4 py-3 font-display text-sm font-semibold">
                  No roteiro ({selected.length})
                </h3>
                <div className="p-3">
                  <DropZone ids={selected}>
                    <div className="space-y-2">
                      {selectedVehicles.map((v) => (
                        <div
                          key={v.id}
                          className="flex items-center justify-between gap-2 rounded border border-[var(--color-primary)]/40 bg-[var(--color-primary-muted)] px-3 py-2"
                        >
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <PlateBadge plate={v.plate} color={v.color} />
                              <span className="text-xs text-[var(--color-text-muted)]">
                                {vehicleTypeLabels[v.type]} · {v.capacityMotos} motos
                              </span>
                            </div>
                            {(driverName.trim() || v.defaultDriver) && (
                              <span className="text-xs text-[var(--color-text-muted)]">
                                Motorista: {driverName.trim() || v.defaultDriver}
                              </span>
                            )}
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => toggle(v.id)}>
                            Devolver
                          </Button>
                        </div>
                      ))}
                    </div>
                  </DropZone>

                  {error && (
                    <p className="mt-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-[var(--color-danger)]">
                      {error}
                    </p>
                  )}

                  <div className="mt-4 flex justify-end">
                    <Button
                      disabled={selected.length === 0}
                      onClick={() => setConfirmOpen(true)}
                      loading={assignMutation.isPending}
                    >
                      Confirmar atribuição
                    </Button>
                  </div>
                </div>
              </section>
            </div>

            <DragOverlay>
              {activeVehicle ? (
                <div className="rounded border border-[var(--color-primary)] bg-[var(--color-surface)] px-3 py-2 shadow-[var(--shadow-md)]">
                  <PlateBadge plate={activeVehicle.plate} color={activeVehicle.color} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </>
      )}

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => assignMutation.mutate()}
        title="Confirmar atribuição de placas"
        message={`Atribuir ${selected.length} placa(s) ao roteiro "${selectedRoute?.name}" (${cities.join(', ')})? As placas sairão da lista de disponíveis e ficarão Em Viagem.`}
        confirmLabel="Atribuir placas"
        loading={assignMutation.isPending}
      />
    </div>
  )
}
