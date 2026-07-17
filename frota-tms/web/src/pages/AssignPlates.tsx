import { useEffect, useMemo, useState } from 'react'
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
import type { Route, Vehicle } from '../types'
import {
  PageHeader,
  Button,
  PlateBadge,
  Spinner,
  EmptyState,
  ConfirmModal,
} from '../components/ui'
import { formatDate } from '../lib/format'
import { cn } from '../lib/cn'

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

/** Interseção das regras allowedVehicle de todos os destinos. null = qualquer tipo. */
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
}: {
  vehicle: Vehicle
  onAction: () => void
  actionLabel: string
  draggable?: boolean
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
      </div>
      <Button variant={draggable ? 'primary' : 'secondary'} size="sm" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  )
}

function DropArea({
  empty,
  children,
}: {
  empty: boolean
  children: React.ReactNode
}) {
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
  const [routeId, setRouteId] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [driverName, setDriverName] = useState('')
  const [driverTouched, setDriverTouched] = useState(false)
  const [plateSearch, setPlateSearch] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const { data: routes = [], isLoading: loadingRoutes } = useQuery({
    queryKey: ['routes'],
    queryFn: async () => (await api.get<Route[]>('/routes')).data,
  })

  const assignableRoutes = useMemo(
    () =>
      routes.filter(
        (r) => r.status === 'AGUARDANDO_PLACAS' || r.status === 'RASCUNHO',
      ),
    [routes],
  )

  const selectedRoute = routes.find((r) => r.id === routeId)
  const cities = selectedRoute ? citiesOf(selectedRoute) : []
  const dealers = selectedRoute ? dealersOf(selectedRoute) : []
  const allowedTypes = selectedRoute ? allowedTypesForRoute(selectedRoute) : null

  const { data: available = [], isLoading: loadingAvailable } = useQuery({
    queryKey: ['vehicles', 'available'],
    queryFn: async () => (await api.get<Vehicle[]>('/vehicles/available')).data,
  })

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
      setRouteId('') // volta à lista — este roteiro some (já não é pendência)
      setPlateSearch('')
      setOkMsg(`${n} placa(s) definida(s) em "${name}". Roteiro saiu da pendência.`)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['routes'] }),
        qc.invalidateQueries({ queryKey: ['vehicles'] }),
        qc.invalidateQueries({ queryKey: ['trips'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
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

  function pickRoute(id: string) {
    setRouteId(id)
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

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Definir Placas" description="Escolha o roteiro e as placas" />

      {/* Mensagem de sucesso fica no topo mesmo após limpar o roteiro */}
      {okMsg && (
        <p className="mb-4 rounded-xl bg-teal-600/15 px-4 py-3 text-base font-medium text-teal-900 dark:text-teal-100">
          {okMsg}
        </p>
      )}

      {/* PASSO 1 */}
      <p className="mb-3 text-lg font-semibold">1. Roteiro pendente</p>

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
                  {formatDate(r.date)}
                  {c.length > 0 ? ` · ${c.join(', ')}` : ''}
                </p>
              </button>
            )
          })}
        </div>
      )}

      {!routeId ? null : (
        <>
          {/* Resumo curto do roteiro escolhido */}
          <div className="mb-6 rounded-xl bg-[var(--color-surface-2)] px-4 py-3 text-base">
            <p>
              <span className="font-semibold">{selectedRoute?.name}</span>
              {cities.length > 0 && <> → {cities.join(', ')}</>}
            </p>
            {dealers.length > 0 && (
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                {dealers.length} destino{dealers.length > 1 ? 's' : ''}:{' '}
                {dealers.map((d) => d.name).join(' · ')}
              </p>
            )}
          </div>

          {/* PASSO 2 */}
          <p className="mb-3 text-lg font-semibold">2. Placas</p>

          {allowedTypes && allowedTypes.size < 2 && (
            <p className="mb-3 rounded-xl bg-amber-500/15 px-4 py-2 text-sm text-amber-900 dark:text-amber-100">
              Este roteiro aceita apenas{' '}
              <strong>{[...allowedTypes].join(' / ')}</strong> (regra das concessionárias).
            </p>
          )}
          {allowedTypes && allowedTypes.size === 0 && (
            <p className="mb-3 rounded-xl bg-red-500/10 px-4 py-3 text-base text-[var(--color-danger)]">
              Destinos incompatíveis (tipos de veículo conflitantes). Revise as concessionárias do
              roteiro.
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
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold">Disponíveis ({pool.length})</h3>
                </div>
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
                <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
                  {loadingAvailable ? (
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
                  className="mt-4 h-12 w-full text-base"
                  disabled={selected.length === 0}
                  onClick={() => setConfirmOpen(true)}
                  loading={assignMutation.isPending}
                >
                  Confirmar {selected.length > 0 ? `(${selected.length})` : ''}
                </Button>
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
        message={`Enviar ${selected.length} placa(s) para ${selectedRoute?.name}${cities.length ? ` (${cities.join(', ')})` : ''}?`}
        confirmLabel="Sim, confirmar"
        loading={assignMutation.isPending}
      />
    </div>
  )
}
