import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { GripVertical, Plus, Send, Star, Download } from 'lucide-react'
import { api } from '../lib/api'
import { PageHeader, Button, Spinner, EmptyState, Input, Modal } from '../components/ui'
import { formatDate, toInputDate } from '../lib/format'
import { cn } from '../lib/cn'

interface PlanningCityRow {
  id: string
  ids?: string[]
  city: string
  state: string | null
  noteCount: number
  dealership?: { id: string; name: string } | null
}

interface BoardRoute {
  id: string
  name: string
  date: string
  status: string
  hasPriority: boolean
  priorityNotes?: string | null
  notes?: string | null
  plannedVehicleCount?: number | null
  readyForOperation?: boolean
  sentToOperationAt?: string | null
  cityCount: number
  noteCount: number
  planned: number | null
  assigned: number
  missing: number | null
  coverage: number | null
  dealerships: { dealership: { city: string; name: string } }[]
  planningCities: PlanningCityRow[]
}

interface BoardData {
  pending: PlanningCityRow[]
  drafting: BoardRoute[]
  ready: BoardRoute[]
  summary: {
    pendingCities: number
    pendingNotes: number
    draftingRoutes: number
    readyRoutes: number
  }
}

function CityChip({
  city,
  noteCount,
  draggable,
}: {
  city: PlanningCityRow
  noteCount: number
  draggable?: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: city.id,
    data: { city },
    disabled: !draggable,
  })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-sm font-medium',
        isDragging && 'opacity-40',
        draggable && 'cursor-grab',
      )}
      {...(draggable ? { ...listeners, ...attributes } : {})}
    >
      {draggable && <GripVertical className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />}
      <span className="min-w-0 flex-1 truncate text-sm sm:text-base">{city.city}</span>
      <span className="rounded-md bg-[var(--color-primary-muted)] px-2 py-0.5 text-xs font-semibold text-[var(--color-primary)]">
        {noteCount}
      </span>
    </div>
  )
}

function DropColumn({
  id,
  title,
  subtitle,
  children,
}: {
  id: string
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <section
      ref={setNodeRef}
      className={cn(
        'panel flex min-h-[52vh] flex-col p-4 transition-colors',
        isOver ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)]/40' : 'border-[var(--color-border)]',
      )}
    >
      <header className="mb-4 border-b border-[var(--color-border)] pb-3">
        <h2 className="text-lg font-semibold tracking-tight text-[var(--color-text)]">{title}</h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{subtitle}</p>
      </header>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto">{children}</div>
    </section>
  )
}

export function PlanningBoard() {
  const qc = useQueryClient()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [newCity, setNewCity] = useState('')
  const [newCount, setNewCount] = useState('1')
  const [editRoute, setEditRoute] = useState<BoardRoute | null>(null)
  const [routeNotes, setRouteNotes] = useState('')
  const [priority, setPriority] = useState(false)
  const [priorityNotes, setPriorityNotes] = useState('')
  const [loadDate, setLoadDate] = useState(toInputDate(new Date()))

  const { data, isLoading } = useQuery({
    queryKey: ['planning-board'],
    queryFn: async () => (await api.get<BoardData>('/planning/board')).data,
  })

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['planning-board'] }),
      qc.invalidateQueries({ queryKey: ['routes'] }),
      qc.invalidateQueries({ queryKey: ['planning-my-day'] }),
      qc.invalidateQueries({ queryKey: ['planning-alerts'] }),
      qc.invalidateQueries({ queryKey: ['planning-overview'] }),
      qc.invalidateQueries({ queryKey: ['dashboard'] }),
    ])
  }

  const demoMutation = useMutation({
    mutationFn: () => api.post('/planning/cities/demo'),
    onSuccess: async () => {
      setOkMsg('Cidades de exemplo carregadas na mesa.')
      await invalidate()
    },
  })

  const addCityMutation = useMutation({
    mutationFn: () =>
      api.post('/planning/cities', {
        city: newCity.trim(),
        noteCount: Math.max(1, Number(newCount) || 1),
      }),
    onSuccess: async () => {
      setAddOpen(false)
      setNewCity('')
      setNewCount('1')
      setOkMsg('Cidade adicionada / agrupada.')
      await invalidate()
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Falha ao adicionar cidade',
      )
    },
  })

  const createRouteMutation = useMutation({
    mutationFn: (planningCityIds: string[]) =>
      api.post('/planning/routes', {
        planningCityIds,
        date: new Date(`${loadDate}T12:00:00`).toISOString(),
        plannedVehicleCount: 1,
      }),
    onSuccess: async () => {
      setOkMsg('Rota criada na coluna de montagem.')
      await invalidate()
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Não foi possível montar a rota',
      )
    },
  })

  const addToRouteMutation = useMutation({
    mutationFn: ({ routeId, planningCityId }: { routeId: string; planningCityId: string }) =>
      api.post(`/planning/routes/${routeId}/add-city`, { planningCityId }),
    onSuccess: async () => {
      await invalidate()
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Não foi possível adicionar a cidade',
      )
    },
  })

  const patchRouteMutation = useMutation({
    mutationFn: () => {
      if (!editRoute) return Promise.reject()
      return api.patch(`/planning/routes/${editRoute.id}`, {
        plannedVehicleCount: 1,
        notes: routeNotes.trim() || null,
        hasPriority: priority,
        priorityNotes: priority ? priorityNotes.trim() || null : null,
        readyForOperation: true,
      })
    },
    onSuccess: async () => {
      setEditRoute(null)
      setOkMsg('Rota atualizada e marcada como pronta (1 placa).')
      await invalidate()
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Falha ao salvar rota',
      )
    },
  })

  const sendMutation = useMutation({
    mutationFn: (routeId: string) => api.post(`/planning/routes/${routeId}/send`),
    onSuccess: async () => {
      setOkMsg('Rota enviada para a Operação.')
      await invalidate()
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Defina a quantidade de veículos antes de enviar',
      )
    },
  })

  const pending = data?.pending ?? []
  const drafting = data?.drafting ?? []
  const ready = data?.ready ?? []

  const dropTargets = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of drafting) map.set(`route:${r.id}`, r.id)
    return map
  }, [drafting])

  function onDragEnd(e: DragEndEvent) {
    setError('')
    const cityId = String(e.active.id)
    const over = e.over?.id ? String(e.over.id) : ''
    if (!over) return

    if (over === 'new-route') {
      createRouteMutation.mutate([cityId])
      return
    }
    const routeId = dropTargets.get(over)
    if (routeId) {
      addToRouteMutation.mutate({ routeId, planningCityId: cityId })
    }
  }

  function openEdit(route: BoardRoute) {
    setEditRoute(route)
    setRouteNotes(route.notes || '')
    setPriority(!!route.hasPriority)
    setPriorityNotes(route.priorityNotes || '')
  }

  async function downloadExport() {
    const res = await api.get('/planning/export', { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `frotatms-planejamento.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="ops-readable mx-auto max-w-[1600px]">
      <PageHeader
        title="Mesa de Roteirização"
        description="Como no papel: agrupe cidades → monte rotas (1 placa cada) → envie para a Operação"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="lg" variant="secondary" onClick={() => setAddOpen(true)}>
              <Plus className="h-5 w-5" /> Cidade / notas
            </Button>
            <Button size="lg" variant="outline" onClick={() => demoMutation.mutate()} loading={demoMutation.isPending}>
              Carregar exemplo
            </Button>
            <Button size="lg" variant="secondary" onClick={() => void downloadExport()}>
              <Download className="h-5 w-5" /> Exportar
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <label className="text-base font-semibold">
          Data do carregamento (saída 06:00)
          <Input
            type="date"
            className="mt-1 text-lg"
            value={loadDate}
            onChange={(e) => setLoadDate(e.target.value)}
          />
        </label>
        <p className="pb-2 text-base text-[var(--color-text-muted)]">
          Pendentes: <strong>{data?.summary.pendingCities ?? 0}</strong> cidades ·{' '}
          <strong>{data?.summary.pendingNotes ?? 0}</strong> notas
        </p>
      </div>

      {okMsg && (
        <p className="mb-3 rounded-lg border border-teal-600/20 bg-teal-600/10 px-3 py-2 text-sm font-medium text-[var(--color-success)]">{okMsg}</p>
      )}
      {error && (
        <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid gap-4 xl:grid-cols-3">
          <DropColumn
            id="pending"
            title="1. Notas pendentes"
            subtitle="Cidades agrupadas automaticamente"
          >
            {pending.length === 0 ? (
              <EmptyState
                title="Nenhuma nota na mesa"
                description="Adicione cidades ou carregue o exemplo"
              />
            ) : (
              pending.map((c) => <CityChip key={c.id} city={c} noteCount={c.noteCount} draggable />)
            )}
            <p className="mt-2 text-center text-sm text-[var(--color-text-muted)]">
              Arraste uma cidade para “Nova rota” ou para uma rota em montagem
            </p>
          </DropColumn>

          <DropColumn
            id="new-route"
            title="2. Rotas em montagem"
            subtitle="Solte aqui para criar / completar"
          >
            <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-primary-muted)]/20 px-3 py-5 text-center text-base font-medium text-[var(--color-primary)]">
              + Nova rota (solte a cidade)
            </div>

            {drafting.length === 0 && (
              <p className="text-center text-base text-[var(--color-text-muted)]">
                Nenhuma rota em montagem
              </p>
            )}

            {drafting.map((r) => (
              <RouteCard
                key={r.id}
                route={r}
                droppable
                onEdit={() => openEdit(r)}
                onSend={() => sendMutation.mutate(r.id)}
                sending={sendMutation.isPending}
              />
            ))}
          </DropColumn>

          <DropColumn
            id="ready"
            title="3. Rotas prontas"
            subtitle="Enviadas ou marcadas para operação"
          >
            {ready.length === 0 ? (
              <EmptyState title="Nenhuma rota pronta" description="Finalize a montagem e envie" />
            ) : (
              ready.map((r) => (
                <RouteCard
                  key={r.id}
                  route={r}
                  onEdit={r.status === 'RASCUNHO' ? () => openEdit(r) : undefined}
                  onSend={
                    r.status === 'RASCUNHO' ? () => sendMutation.mutate(r.id) : undefined
                  }
                  sending={sendMutation.isPending}
                />
              ))
            )}
          </DropColumn>
        </div>
      </DndContext>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Adicionar cidade / notas">
        <div className="space-y-3">
          <Input
            label="Cidade"
            value={newCity}
            onChange={(e) => setNewCity(e.target.value)}
            placeholder="Ex: Salvador"
            className="text-lg"
          />
          <Input
            label="Qtd. de notas"
            type="number"
            min={1}
            value={newCount}
            onChange={(e) => setNewCount(e.target.value)}
            className="text-lg"
          />
          <p className="text-sm text-[var(--color-text-muted)]">
            Cidades repetidas são somadas automaticamente (ex.: Salvador 18).
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="lg" onClick={() => setAddOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="lg"
              loading={addCityMutation.isPending}
              disabled={newCity.trim().length < 2}
              onClick={() => addCityMutation.mutate()}
            >
              Salvar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!editRoute}
        onClose={() => setEditRoute(null)}
        title={editRoute ? `Finalizar: ${editRoute.name}` : 'Rota'}
      >
        {editRoute && (
          <div className="space-y-3">
            <p className="text-base text-[var(--color-text-muted)]">
              {formatDate(editRoute.date)} ·{' '}
              {editRoute.dealerships.map((d) => d.dealership.city).join(', ')}
            </p>
            <p className="rounded-xl bg-[var(--color-surface-2)] px-4 py-3 text-lg font-semibold">
              Esta rota usa <strong>1 placa</strong> (regra operacional).
            </p>
            <label className="flex items-center gap-3 text-lg font-semibold">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={priority}
                onChange={(e) => setPriority(e.target.checked)}
              />
              <Star className="h-5 w-5 text-amber-500" /> Prioridade
            </label>
            {priority && (
              <Input
                label="Motivo da prioridade"
                value={priorityNotes}
                onChange={(e) => setPriorityNotes(e.target.value)}
              />
            )}
            <Input
              label="Observações"
              value={routeNotes}
              onChange={(e) => setRouteNotes(e.target.value)}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" size="lg" onClick={() => setEditRoute(null)}>
                Fechar
              </Button>
              <Button size="lg" loading={patchRouteMutation.isPending} onClick={() => patchRouteMutation.mutate()}>
                Marcar pronta
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function RouteCard({
  route,
  droppable,
  onEdit,
  onSend,
  sending,
}: {
  route: BoardRoute
  droppable?: boolean
  onEdit?: () => void
  onSend?: () => void
  sending?: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `route:${route.id}`,
    disabled: !droppable,
  })
  const cities =
    route.dealerships?.map((d) => d.dealership.city).join(', ') ||
    route.planningCities?.map((c) => c.city).join(', ')

  return (
    <article
      ref={setNodeRef}
      className={cn(
        'rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3',
        isOver && 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/30',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold leading-tight">{route.name}</h3>
        {route.hasPriority && (
          <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-200">
            <Star className="h-3.5 w-3.5" /> Prioridade
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">{cities || 'Sem cidades'}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-[var(--color-text-muted)]">Cidades</dt>
          <dd className="text-lg font-semibold">{route.cityCount}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-text-muted)]">Notas</dt>
          <dd className="text-lg font-semibold">{route.noteCount}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-text-muted)]">Veículos</dt>
          <dd className="text-lg font-semibold">1 placa</dd>
        </div>
        <div>
          <dt className="text-[var(--color-text-muted)]">Status</dt>
          <dd className="font-semibold">
            {route.status === 'AGUARDANDO_PLACAS' ? 'Com Operação' : route.readyForOperation ? 'Pronta' : 'Montando'}
          </dd>
        </div>
      </dl>
      {route.notes && <p className="mt-2 text-sm text-[var(--color-text-muted)]">{route.notes}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {onEdit && (
          <Button size="lg" variant="secondary" onClick={onEdit}>
            Definir meta / prioridade
          </Button>
        )}
        {onSend && (
          <Button size="lg" onClick={onSend} loading={sending}>
            <Send className="h-5 w-5" /> Enviar para Operação
          </Button>
        )}
      </div>
    </article>
  )
}
