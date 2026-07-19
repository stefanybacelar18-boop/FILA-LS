import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Wrench } from 'lucide-react'
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

/** Motivos focados em atraso / quebra (operação) */
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
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  const [justifyVehicle, setJustifyVehicle] = useState<PlatesBoardVehicle | null>(null)
  const [preset, setPreset] = useState('')
  const [reason, setReason] = useState('')
  const [forecastDate, setForecastDate] = useState('')

  const { data: routes = [], isLoading: loadingRoutes } = useQuery({
    queryKey: ['routes'],
    queryFn: async () => (await api.get<Route[]>('/routes')).data,
  })

  // Só o que o Admin já enviou — e ainda sem placa
  const pendingRoutes = useMemo(
    () =>
      routes
        .filter(
          (r) =>
            r.status === 'AGUARDANDO_PLACAS' &&
            (!r.vehicles || r.vehicles.length === 0),
        )
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

  const available = useMemo(() => {
    const list = board?.available ?? []
    if (!allowedTypes) return list
    return list.filter((v) => allowedTypes.has(v.type))
  }, [board?.available, allowedTypes])

  const unavailable = board?.unavailable ?? []
  const selectedVehicle = available.find((v) => v.id === selectedId) ?? null

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error('Sem placa')
      return api.post(`/routes/${routeId}/assign-plates`, {
        vehicleId: selectedId,
        vehicleIds: [selectedId],
        driverName: selectedVehicle?.defaultDriver || undefined,
      })
    },
    onSuccess: async () => {
      const plate = selectedVehicle?.plate ?? ''
      const name = selectedRoute?.name ?? 'rota'
      setSelectedId(null)
      setConfirmOpen(false)
      setError('')
      setRouteId('')
      setSearchParams({})
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
      setOkMsg('Atraso/quebra registrado com previsão de disponibilidade.')
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
    setSearchParams(id ? { routeId: id } : {})
    setSelectedId(null)
    setError('')
    setOkMsg('')
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

  return (
    <div className="ops-readable mx-auto max-w-3xl">
      <PageHeader
        title="Definir Placa"
        description="Escolha a rota do Admin · selecione 1 veículo · confirme. Se não puder carregar, informe atraso ou quebra."
      />

      {okMsg && (
        <p className="mb-4 rounded-xl bg-teal-600/15 px-4 py-3 text-lg font-medium">{okMsg}</p>
      )}
      {error && (
        <p className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-lg text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {/* PASSO 1 — Rotas do Admin */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">1. Rotas do Admin</h2>
        {loadingRoutes ? (
          <div className="flex justify-center py-10">
            <Spinner size="lg" />
          </div>
        ) : pendingRoutes.length === 0 ? (
          <EmptyState
            title="Nenhuma rota aguardando"
            description="Quando o Admin enviar uma rota, ela aparece aqui."
          />
        ) : (
          <div className="space-y-3">
            {pendingRoutes.map((r) => {
              const c = citiesOf(r)
              const active = r.id === routeId
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => pickRoute(r.id)}
                  className={cn(
                    'flex w-full min-h-[88px] flex-col items-start rounded-xl border px-4 py-3 text-left transition',
                    active
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/40',
                  )}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-lg font-semibold">{r.name}</span>
                    {r.hasPriority && (
                      <span className="rounded-lg bg-amber-500/10 px-3 py-1 text-sm font-semibold text-amber-800 dark:text-amber-100">
                        ★ Prioridade
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-base text-[var(--color-text-muted)]">
                    {formatDate(r.date)} · 06:00
                    {c.length > 0 ? ` · ${c.join(', ')}` : ''}
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--color-primary)]">
                    Precisa de 1 placa
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {!routeId ? null : (
        <>
          {/* PASSO 2 — Escolher 1 placa */}
          <section className="mb-8">
            <h2 className="mb-1 text-lg font-semibold">2. Escolha 1 placa</h2>
            <p className="mb-4 text-base text-[var(--color-text-muted)]">
              Rota <strong>{selectedRoute?.name}</strong>
              {cities.length > 0 ? ` → ${cities.join(', ')}` : ''}
            </p>

            {loadingBoard ? (
              <div className="flex justify-center py-12">
                <Spinner size="lg" />
              </div>
            ) : available.length === 0 ? (
              <EmptyState
                title="Nenhuma placa disponível"
                description="Use a seção abaixo para informar atraso ou quebra das placas que deveriam carregar."
              />
            ) : (
              <div className="space-y-2">
                {available.map((v) => {
                  const active = selectedId === v.id
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedId(v.id)}
                      className={cn(
                        'flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition',
                        active
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)]'
                          : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/30',
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
                          active
                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                            : 'border-[var(--color-border-strong)]',
                        )}
                      >
                        {active && <Check className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <PlateBadge plate={v.plate} color={v.color as PlateColor} />
                        <p className="mt-1 text-base text-[var(--color-text-muted)]">
                          {v.capacityMotos} motos
                          {v.defaultDriver ? ` · ${v.defaultDriver}` : ''}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            <Button
              className="mt-5 w-full font-semibold"
              size="xl"
              disabled={!selectedId}
              onClick={() => setConfirmOpen(true)}
              loading={assignMutation.isPending}
            >
              Confirmar placa {selectedVehicle ? selectedVehicle.plate : ''}
            </Button>
          </section>

          {/* PASSO 3 — Informar atraso / quebra */}
          <section className="mb-8 rounded-2xl border bg-[var(--color-surface)] p-5">
            <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
              <Wrench className="h-5 w-5 text-[var(--color-text-muted)]" />
              3. Informar atraso ou quebra
            </h2>
            <p className="mb-4 text-base text-[var(--color-text-muted)]">
              Se um veículo <strong>não vai carregar</strong> nesta rota (atraso, quebra, manutenção),
              registre aqui o motivo e a previsão de quando volta a ficar disponível.
            </p>

            {unavailable.length === 0 ? (
              <p className="text-base text-[var(--color-text-muted)]">
                Nenhuma placa indisponível no momento.
              </p>
            ) : (
              <div className="space-y-3">
                {unavailable.map((v) => (
                  <div
                    key={v.id}
                    className={cn(
                      'flex flex-wrap items-center gap-3 rounded-xl border bg-[var(--color-surface)] px-4 py-3',
                      v.shouldBeAvailable && !v.report
                        ? 'border-red-500/50'
                        : 'border-[var(--color-border)]',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <PlateBadge plate={v.plate} color={v.color as PlateColor} />
                        {v.shouldBeAvailable && (
                          <span className="inline-flex items-center gap-1 rounded bg-red-500/15 px-2 py-1 text-sm font-bold text-[var(--color-danger)]">
                            <AlertTriangle className="h-4 w-4" /> Já deveria ter retornado
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-base text-[var(--color-text-muted)]">
                        {vehicleStatusLabels[v.status as VehicleStatus] ?? v.status}
                        {v.expectedReturn ? ` · retorno prev. ${formatDate(v.expectedReturn)}` : ''}
                      </p>
                      {v.report ? (
                        <p className="mt-2 text-base">
                          <strong>Registrado:</strong> {v.report.reason}
                          <span className="block text-sm text-[var(--color-text-muted)]">
                            Disp. prevista: {formatDate(v.report.availableAtForecast)}
                          </span>
                        </p>
                      ) : (
                        <p className="mt-1 text-sm font-medium text-[var(--color-text-muted)]">
                          Sem registro de atraso/quebra
                        </p>
                      )}
                    </div>
                    <Button
                      size="lg"
                      variant={v.report ? 'secondary' : 'primary'}
                      onClick={() => openJustify(v)}
                    >
                      {v.report ? 'Atualizar' : 'Informar atraso/quebra'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => assignMutation.mutate()}
        title="Confirmar 1 placa nesta rota?"
        message={`Rota: ${selectedRoute?.name}
Placa: ${selectedVehicle?.plate ?? '—'}
Saída: ${selectedRoute ? formatDate(selectedRoute.date) : ''} às 06:00
(Esta rota aceita somente 1 veículo.)`}
        confirmLabel="Sim, confirmar"
        loading={assignMutation.isPending}
      />

      <Modal
        open={!!justifyVehicle}
        onClose={() => setJustifyVehicle(null)}
        title={`Atraso / quebra — ${justifyVehicle?.plate ?? ''}`}
      >
        <div className="space-y-4">
          <p className="text-base text-[var(--color-text-muted)]">
            Informe por que a placa <strong>{justifyVehicle?.plate}</strong> não carrega em{' '}
            <strong>{selectedRoute ? formatDate(selectedRoute.date) : ''}</strong> às 06:00.
          </p>
          <Select
            label="Motivo"
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            options={[...cannotLoadPresets, ...delayReasonPresets.filter((p) => !(cannotLoadPresets as readonly string[]).includes(p))].map(
              (label) => ({ value: label, label }),
            )}
            placeholder="Selecione"
          />
          <Textarea
            label="Detalhes"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Descreva o atraso ou a quebra…"
          />
          <Input
            label="Previsão de disponibilidade"
            type="date"
            value={forecastDate}
            onChange={(e) => setForecastDate(e.target.value)}
            required
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="lg" onClick={() => setJustifyVehicle(null)}>
              Cancelar
            </Button>
            <Button
              size="lg"
              loading={justifyMutation.isPending}
              disabled={composedReason().length < 5 || !forecastDate}
              onClick={() => justifyMutation.mutate()}
            >
              Salvar registro
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
