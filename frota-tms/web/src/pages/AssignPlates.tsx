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
import { GripVertical, Tags } from 'lucide-react'
import { api } from '../lib/api'
import type { Route, Vehicle } from '../types'
import {
  PageHeader,
  Select,
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

function routeDealershipNames(route: Route): string[] {
  if (route.dealerships && route.dealerships.length > 0) {
    return route.dealerships.map((rd) => rd.dealership.name)
  }
  if (route.dealership) return [route.dealership.name]
  return []
}

function DraggablePlate({ vehicle, selected, onToggle }: {
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
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="accent-[var(--color-primary)]"
        />
        <PlateBadge plate={vehicle.plate} color={vehicle.color} />
        <span className="truncate text-xs text-[var(--color-text-muted)]">
          {vehicleTypeLabels[vehicle.type]} · {vehicle.capacityMotos} motos
          {vehicle.defaultDriver ? ` · ${vehicle.defaultDriver}` : ''}
        </span>
      </label>
    </div>
  )
}

function DropZone({ children, ids }: { children: ReactNode; ids: string[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'route-drop' })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-h-[200px] rounded-[var(--radius)] border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-3 transition',
        isOver && 'border-[var(--color-primary)] bg-[var(--color-primary-muted)]/40',
      )}
    >
      {ids.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--color-text-muted)]">
          Arraste placas aqui ou selecione na lista
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
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState('')

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
  const dealershipNames = selectedRoute ? routeDealershipNames(selectedRoute) : []

  const { data: available = [], isLoading: loadingAvailable } = useQuery({
    queryKey: ['vehicles', 'available'],
    queryFn: async () => (await api.get<Vehicle[]>('/vehicles/available')).data,
  })

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
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['routes'] })
      void qc.invalidateQueries({ queryKey: ['vehicles'] })
      void qc.invalidateQueries({ queryKey: ['trips'] })
      setSelected([])
      setDriverName('')
      setDriverTouched(false)
      setConfirmOpen(false)
      setError('')
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Erro ao atribuir placas'
      setError(msg)
      setConfirmOpen(false)
    },
  })

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    if (e.over?.id === 'route-drop') {
      const id = String(e.active.id)
      setSelected((prev) => (prev.includes(id) ? prev : [...prev, id]))
    }
  }

  const activeVehicle = available.find((v) => v.id === activeId)

  return (
    <div>
      <PageHeader
        title="Definir Placas"
        description="Selecione o roteiro e atribua placas disponíveis (seleção ou arrastar e soltar)"
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Select
          label="Roteiro"
          value={routeId}
          onChange={(e) => {
            setRouteId(e.target.value)
            setSelected([])
            setDriverName('')
            setDriverTouched(false)
            setError('')
          }}
          options={assignableRoutes.map((r) => {
            const names = routeDealershipNames(r)
            const dest =
              names.length === 0
                ? '—'
                : names.length <= 2
                  ? names.join(', ')
                  : `${names.length} concessionárias`
            return {
              value: r.id,
              label: `${r.name} — ${dest} (${formatDate(r.date)})`,
            }
          })}
          placeholder={loadingRoutes ? 'Carregando…' : 'Selecione um roteiro…'}
        />
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

      {selectedRoute && (
        <div className="mb-4 space-y-2 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Tags className="h-4 w-4 text-[var(--color-primary)]" />
            <span className="font-medium">{selectedRoute.name}</span>
            <Badge>{routeStatusLabels[selectedRoute.status]}</Badge>
            {selectedRoute.hasPriority && <Badge tone="warning">Carga Prioritária</Badge>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {dealershipNames.length === 0 ? (
              <span className="text-[var(--color-text-muted)]">Sem concessionárias</span>
            ) : (
              dealershipNames.map((name) => (
                <Badge key={name} tone="info">
                  {name}
                </Badge>
              ))
            )}
          </div>
        </div>
      )}

      {!routeId ? (
        <EmptyState
          title="Selecione um roteiro"
          description="Escolha um roteiro acima para listar as placas disponíveis."
        />
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)]">
              <h2 className="border-b border-[var(--color-border)] px-4 py-3 font-display text-sm font-semibold">
                Placas disponíveis ({available.length})
              </h2>
              <div className="max-h-[420px] space-y-2 overflow-y-auto p-3">
                {loadingAvailable ? (
                  <div className="flex justify-center py-10">
                    <Spinner />
                  </div>
                ) : available.length === 0 ? (
                  <EmptyState title="Nenhuma placa disponível" />
                ) : (
                  available.map((v) => (
                    <DraggablePlate
                      key={v.id}
                      vehicle={v}
                      selected={selected.includes(v.id)}
                      onToggle={() => toggle(v.id)}
                    />
                  ))
                )}
              </div>
            </section>

            <section className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)]">
              <h2 className="border-b border-[var(--color-border)] px-4 py-3 font-display text-sm font-semibold">
                Placas selecionadas ({selected.length})
              </h2>
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
                          Remover
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
      )}

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => assignMutation.mutate()}
        title="Confirmar atribuição de placas"
        message={`Atribuir ${selected.length} placa(s) ao roteiro "${selectedRoute?.name}"? As placas serão marcadas como em viagem.`}
        confirmLabel="Atribuir placas"
        loading={assignMutation.isPending}
      />
    </div>
  )
}
