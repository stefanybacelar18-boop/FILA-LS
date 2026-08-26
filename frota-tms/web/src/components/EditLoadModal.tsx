import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import type { Dealership, Route } from '../types'
import { Button, Combobox, Input, Modal, Select, Spinner, Textarea } from './ui'
import { toInputDate } from '../lib/format'
import { routeFleetRequirement, stripChronusPlateNotes } from '../lib/chronus-plate-hint'
import { cn } from '../lib/cn'

type FleetChoice = '' | 'LSL' | 'AG'

type DestDraft = {
  key: string
  dealershipId: string
  motoCount: string
  minExpiryDate: string
}

function newKey() {
  return `d-${Math.random().toString(36).slice(2, 9)}`
}

function destsFromRoute(route: Route): DestDraft[] {
  const rows =
    route.dealerships && route.dealerships.length > 0
      ? [...route.dealerships].sort((a, b) => a.order - b.order)
      : route.dealershipId
        ? [
            {
              dealershipId: route.dealershipId,
              motoCount: null,
              minExpiryDate: null,
            },
          ]
        : []
  return rows.map((rd) => ({
    key: newKey(),
    dealershipId:
      rd.dealershipId ||
      ('dealership' in rd ? rd.dealership?.id : undefined) ||
      route.dealershipId ||
      '',
    motoCount: rd.motoCount != null ? String(rd.motoCount) : '',
    minExpiryDate: toInputDate(rd.minExpiryDate),
  }))
}

export function EditLoadModal({
  routeId,
  open,
  onClose,
  onSaved,
}: {
  routeId: string | null
  open: boolean
  onClose: () => void
  onSaved?: (route: Route) => void
}) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [fleet, setFleet] = useState<FleetChoice>('')
  const [capacity, setCapacity] = useState('')
  const [notes, setNotes] = useState('')
  const [dests, setDests] = useState<DestDraft[]>([])
  const [addDealerId, setAddDealerId] = useState('')
  const [formError, setFormError] = useState('')

  const { data: route, isLoading } = useQuery({
    queryKey: ['routes', routeId, 'edit-load'],
    queryFn: async () => (await api.get<Route>(`/routes/${routeId}`)).data,
    enabled: open && !!routeId,
  })

  const { data: dealerships = [] } = useQuery({
    queryKey: ['dealerships'],
    queryFn: async () => (await api.get<Dealership[]>('/dealerships')).data,
    enabled: open,
  })

  useEffect(() => {
    if (!open || !route) return
    const req = routeFleetRequirement(route)
    setName(route.name ?? '')
    setDate(toInputDate(route.date))
    setFleet((req.fleetOwner ?? '') as FleetChoice)
    setCapacity(req.capacityMotos != null ? String(req.capacityMotos) : '')
    setNotes(stripChronusPlateNotes(route.notes) ?? '')
    setDests(destsFromRoute(route))
    setAddDealerId('')
    setFormError('')
  }, [open, route])

  const selectedIds = useMemo(() => new Set(dests.map((d) => d.dealershipId).filter(Boolean)), [dests])
  const addOptions = useMemo(
    () =>
      dealerships
        .filter((d) => d.active && !selectedIds.has(d.id))
        .map((d) => ({
          value: d.id,
          label: `${d.city} · ${d.name}`,
          description: d.code ? `cód. ${d.code}` : undefined,
        })),
    [dealerships, selectedIds],
  )
  const dealerById = useMemo(() => new Map(dealerships.map((d) => [d.id, d])), [dealerships])
  const motoTotal = dests.reduce((sum, d) => sum + (Number(d.motoCount) || 0), 0)
  const originalFleet = route ? routeFleetRequirement(route).fleetOwner : null

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!routeId) throw new Error('Roteiro inválido')
      const description = name.trim()
      if (description.length < 2) throw new Error('Informe a descrição do roteiro')
      if (!date) throw new Error('Informe a data de saída')
      const destinations = dests.filter((d) => d.dealershipId)
      if (destinations.length < 1) throw new Error('Inclua ao menos um destino')
      const capacityMotos = capacity.trim() ? Number(capacity) : null
      if (capacity.trim() && (!Number.isFinite(capacityMotos) || (capacityMotos ?? 0) <= 0)) {
        throw new Error('Capacidade inválida')
      }
      for (const d of destinations) {
        if (d.motoCount.trim()) {
          const n = Number(d.motoCount)
          if (!Number.isInteger(n) || n < 0) throw new Error('Quantidade de motos inválida')
        }
      }
      return (
        await api.put<Route>(`/routes/${routeId}`, {
          name: description,
          date,
          requiredFleetOwner: fleet || null,
          requiredCapacityMotos: capacityMotos,
          notes: notes.trim() || null,
          destinations: destinations.map((d, order) => ({
            dealershipId: d.dealershipId,
            motoCount: d.motoCount.trim() ? Number(d.motoCount) : null,
            minExpiryDate: d.minExpiryDate || null,
            order,
          })),
        })
      ).data
    },
    onSuccess: async (saved) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['routes'] }),
        qc.invalidateQueries({ queryKey: ['plates-board'] }),
        qc.invalidateQueries({ queryKey: ['planning-alerts'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      onSaved?.(saved)
      onClose()
    },
    onError: (err: unknown) => {
      setFormError(
        (err as { response?: { data?: { error?: string } }; message?: string })?.response?.data
          ?.error ??
          (err as { message?: string })?.message ??
          'Não foi possível salvar a carga.',
      )
    },
  })

  function updateDest(key: string, patch: Partial<DestDraft>) {
    setDests((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  }

  function removeDest(key: string) {
    setDests((prev) => (prev.length <= 1 ? prev : prev.filter((d) => d.key !== key)))
  }

  function addDest(dealershipId: string) {
    if (!dealershipId || selectedIds.has(dealershipId)) return
    setDests((prev) => [
      ...prev,
      { key: newKey(), dealershipId, motoCount: '', minExpiryDate: '' },
    ])
    setAddDealerId('')
  }

  const fleetChangedToLsl = originalFleet === 'AG' && fleet === 'LSL'
  const fleetChangedToAg = originalFleet === 'LSL' && fleet === 'AG'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Editar carga"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saveMutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              setFormError('')
              saveMutation.mutate()
            }}
            loading={saveMutation.isPending}
            disabled={isLoading || !route}
          >
            Salvar carga
          </Button>
        </>
      }
    >
      {isLoading || !route ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-[var(--color-text-muted)]">
            Altere frota, capacidade, destinos, motos e vencimentos. Exemplo: carga Chronus em{' '}
            <strong>AG</strong> pode ir para <strong>LSL</strong> para usar veículo próprio.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Descrição *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="sm:col-span-2"
            />
            <Input
              label="Data de saída"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <Select
              label="Frota"
              value={fleet}
              onChange={(e) => setFleet(e.target.value as FleetChoice)}
              options={[
                { value: '', label: 'Qualquer (AG ou LSL)' },
                { value: 'AG', label: 'AG' },
                { value: 'LSL', label: 'LSL (veículo próprio)' },
              ]}
            />
            <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
              <span className="font-medium text-[var(--color-text)]">Capacidade mínima (motos)</span>
              <div className="flex flex-wrap items-center gap-2">
                {['40', '50', '70'].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCapacity(n)}
                    className={cn(
                      'h-9 rounded-[var(--radius)] border px-3 text-sm',
                      capacity === n
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)] text-[var(--color-primary)]'
                        : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]',
                    )}
                  >
                    {n}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="Outro"
                  className="h-9 w-28 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-[var(--color-primary)]"
                />
                {capacity && (
                  <button
                    type="button"
                    className="text-xs text-[var(--color-text-muted)] hover:underline"
                    onClick={() => setCapacity('')}
                  >
                    sem mínimo
                  </button>
                )}
              </div>
            </label>
          </div>

          {fleetChangedToLsl && (
            <p className="rounded-[var(--radius)] border border-[var(--color-primary)]/30 bg-[var(--color-primary-muted)] px-3 py-2 text-sm">
              A Operação AG deixa de ver este roteiro. Só o Admin define placa da frota LSL.
            </p>
          )}
          {fleetChangedToAg && (
            <p className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm">
              A Operação AG passa a ver este roteiro e poderá definir a placa.
            </p>
          )}

          <div>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium">Destinos</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {motoTotal} moto{motoTotal === 1 ? '' : 's'} no total
              </p>
            </div>
            <ul className="space-y-3">
              {dests.map((d) => {
                const dealer = dealerById.get(d.dealershipId)
                return (
                  <li
                    key={d.key}
                    className="rounded-[var(--radius)] border border-[var(--color-border)] p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--color-text)]">
                          {dealer?.city ?? 'Concessionária'}
                        </p>
                        <p className="truncate text-xs text-[var(--color-text-muted)]">
                          {dealer?.name ?? d.dealershipId}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={dests.length <= 1}
                        onClick={() => removeDest(d.key)}
                        aria-label="Remover destino"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Input
                        label="Motos"
                        type="number"
                        min={0}
                        value={d.motoCount}
                        onChange={(e) => updateDest(d.key, { motoCount: e.target.value })}
                      />
                      <Input
                        label="Vencimento N.F."
                        type="date"
                        value={d.minExpiryDate}
                        onChange={(e) => updateDest(d.key, { minExpiryDate: e.target.value })}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="mt-3 flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Combobox
                  label="Incluir destino"
                  value={addDealerId}
                  onChange={(id) => {
                    setAddDealerId(id)
                    if (id) addDest(id)
                  }}
                  placeholder="Buscar cidade ou concessionária…"
                  emptyMessage="Nenhuma concessionária restante"
                  options={addOptions}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!addDealerId}
                onClick={() => addDest(addDealerId)}
              >
                <Plus className="h-4 w-4" />
                Incluir
              </Button>
            </div>
          </div>

          <Textarea
            label="Observações (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Notas internas da carga"
          />

          {(formError || saveMutation.isError) && (
            <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-[var(--color-danger)]">
              {formError}
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
