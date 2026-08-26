import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Search } from 'lucide-react'
import { api } from '../lib/api'
import type { Dealership, Route } from '../types'
import { PageHeader, Button, Input, Select, Spinner, Textarea } from '../components/ui'
import { AvailablePlatesBanner } from '../components/AvailablePlatesBanner'
import { formatDate, toInputDate } from '../lib/format'
import { cn } from '../lib/cn'
import { routeFleetRequirement, stripChronusPlateNotes } from '../lib/chronus-plate-hint'

function isPastOrToday(isoDay: string): boolean {
  if (!isoDay) return false
  const today = toInputDate(new Date())
  return isoDay <= today
}

/** Novos roteiros: padrão = próximo dia útil (pula sáb/dom). */
function defaultNewRouteDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1)
  }
  return toInputDate(d)
}

export function RouteForm() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const createdIdRef = useRef<string | null>(null)

  const [name, setName] = useState('')
  const [date, setDate] = useState(defaultNewRouteDate)
  const [dealershipIds, setDealershipIds] = useState<string[]>([])
  const [dealerSearch, setDealerSearch] = useState('')
  const [hasPriority, setHasPriority] = useState(false)
  const [priorityExpiryDate, setPriorityExpiryDate] = useState('')
  const [priorityNotes, setPriorityNotes] = useState('')
  const [fleetOwner, setFleetOwner] = useState<'' | 'LSL' | 'AG'>('')
  const [capacityMotos, setCapacityMotos] = useState('')
  const [notes, setNotes] = useState('')
  const [destMotoCount, setDestMotoCount] = useState<Record<string, string>>({})
  const [destExpiry, setDestExpiry] = useState<Record<string, string>>({})

  const { data: dealerships = [] } = useQuery({
    queryKey: ['dealerships'],
    queryFn: async () => (await api.get<Dealership[]>('/dealerships')).data,
  })

  const { data: existing, isLoading } = useQuery({
    queryKey: ['routes', id],
    queryFn: async () => (await api.get<Route>(`/routes/${id}`)).data,
    enabled: !isNew && !!id,
  })

  useEffect(() => {
    if (!existing) return
    setName(existing.name ?? '')
    setDate(toInputDate(existing.date))
    const ids =
      existing.dealerships?.map((rd) => rd.dealershipId) ??
      (existing.dealershipId ? [existing.dealershipId] : [])
    setDealershipIds(ids)
    setHasPriority(!!existing.hasPriority)
    setPriorityExpiryDate(toInputDate(existing.priorityExpiryDate))
    setPriorityNotes(existing.priorityNotes ?? '')
    const req = routeFleetRequirement(existing)
    setFleetOwner((req.fleetOwner ?? '') as '' | 'LSL' | 'AG')
    setCapacityMotos(req.capacityMotos != null ? String(req.capacityMotos) : '')
    setNotes(stripChronusPlateNotes(existing.notes) ?? '')
    const motos: Record<string, string> = {}
    const expiries: Record<string, string> = {}
    for (const rd of existing.dealerships ?? []) {
      const did = rd.dealershipId || rd.dealership?.id
      if (!did) continue
      if (rd.motoCount != null) motos[did] = String(rd.motoCount)
      if (rd.minExpiryDate) expiries[did] = toInputDate(rd.minExpiryDate)
    }
    setDestMotoCount(motos)
    setDestExpiry(expiries)
  }, [existing])

  const selectedDealers = useMemo(
    () => dealerships.filter((d) => dealershipIds.includes(d.id)),
    [dealerships, dealershipIds],
  )

  const citiesHint = useMemo(() => {
    const cities = [...new Set(selectedDealers.map((d) => d.city))]
    if (cities.length === 0) return ''
    return cities.join(' · ')
  }, [selectedDealers])

  const filteredDealerships = useMemo(() => {
    const q = dealerSearch.trim().toLowerCase()
    const active = dealerships.filter((d) => d.active)
    if (!q) return active
    return active.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.city.toLowerCase().includes(q) ||
        d.state.toLowerCase().includes(q) ||
        (d.code?.toLowerCase().includes(q) ?? false),
    )
  }, [dealerships, dealerSearch])

  function saveErrorMessage(err: unknown): string {
    const ax = err as {
      response?: { status?: number; data?: { error?: string } }
      message?: string
      code?: string
    }
    const status = ax.response?.status
    if (status === 530 || status === 502 || status === 503 || status === 504) {
      return 'Conexão com o servidor caiu (túnel). Atualize a página e tente salvar de novo.'
    }
    if (!ax.response && (ax.code === 'ERR_NETWORK' || ax.message?.includes('Network'))) {
      return 'Sem conexão com o servidor. Verifique o link/túnel e tente novamente.'
    }
    return ax.response?.data?.error ?? ax.message ?? 'Erro ao salvar'
  }

  const saveMutation = useMutation({
    mutationFn: async (disponibilizar: boolean) => {
      const description = name.trim()
      if (description.length < 2) throw new Error('Informe a descrição do roteiro')
      if (dealershipIds.length < 1) throw new Error('Selecione ao menos uma concessionária')
      if (hasPriority && !priorityExpiryDate) {
        throw new Error('Informe a menor data de vencimento da prioridade')
      }
      const region =
        [...new Set(selectedDealers.map((d) => d.region))].join(' / ') || null
      const capacity = capacityMotos.trim() ? Number(capacityMotos) : null
      if (capacityMotos.trim() && (!Number.isFinite(capacity) || (capacity ?? 0) <= 0)) {
        throw new Error('Capacidade inválida')
      }
      const payload = {
        name: description,
        date,
        destinations: dealershipIds.map((id, order) => ({
          dealershipId: id,
          motoCount: destMotoCount[id]?.trim() ? Number(destMotoCount[id]) : null,
          minExpiryDate: destExpiry[id] || null,
          order,
        })),
        region,
        notes: notes.trim() || null,
        hasPriority,
        priorityNotes: hasPriority ? priorityNotes.trim() || null : null,
        priorityExpiryDate: hasPriority ? priorityExpiryDate : null,
        plannedVehicleCount: 1,
        requiredFleetOwner: fleetOwner || null,
        requiredCapacityMotos: capacity,
      }
      let route: Route
      const editingId = (!isNew && id) || createdIdRef.current
      if (!editingId) {
        route = (await api.post<Route>('/routes', payload)).data
        createdIdRef.current = route.id
      } else {
        route = (await api.put<Route>(`/routes/${editingId}`, payload)).data
      }
      if (disponibilizar && route.status === 'RASCUNHO') {
        route = (await api.post<Route>(`/routes/${route.id}/send-to-operation`)).data
      }
      return route
    },
    onSuccess: async () => {
      createdIdRef.current = null
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['routes'] }),
        qc.invalidateQueries({ queryKey: ['planning-alerts'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      navigate('/roteiros')
    },
    onError: () => {
      if (isNew && createdIdRef.current) {
        navigate(`/roteiros/${createdIdRef.current}`, { replace: true })
      }
    },
  })

  function toggleDealership(did: string) {
    setDealershipIds((prev) =>
      prev.includes(did) ? prev.filter((x) => x !== did) : [...prev, did],
    )
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    saveMutation.mutate(false)
  }

  const alreadySent =
    existing?.status === 'EM_ANDAMENTO' ||
    existing?.status === 'CONCLUIDO' ||
    existing?.status === 'CANCELADO'
  const canEdit = !alreadySent
  const canSend =
    !alreadySent &&
    existing?.status !== 'AGUARDANDO_PLACAS' &&
    (isNew || existing?.status === 'RASCUNHO')

  const expiryPast = hasPriority && isPastOrToday(priorityExpiryDate)

  if (!isNew && isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="page-desktop max-w-3xl">
      <Link
        to="/roteiros"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>

      <PageHeader
        title={isNew ? 'Novo roteiro' : 'Editar roteiro'}
        description="Defina a descrição, a data e as concessionárias. Prioridade por vencimento, se houver."
      />

      <AvailablePlatesBanner defaultOpen />

      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-3 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div>
            <Input
              label="Descrição *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Lote Sul · vencimento curto"
              required
              minLength={2}
              disabled={!canEdit}
            />
            {citiesHint && (
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Cidades selecionadas: {citiesHint}
                {!name.trim() && (
                  <>
                    {' · '}
                    <button
                      type="button"
                      className="text-[var(--color-primary)] hover:underline"
                      onClick={() => setName(citiesHint)}
                    >
                      usar como descrição
                    </button>
                  </>
                )}
              </p>
            )}
          </div>
          <div>
            <Input
              label="Data de início da viagem"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              disabled={!canEdit}
            />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Padrão: amanhã · saída às 06:00 · retorno pelo destino mais longe do PAD
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Frota da carga"
              value={fleetOwner}
              onChange={(e) => setFleetOwner(e.target.value as '' | 'LSL' | 'AG')}
              disabled={!canEdit}
              options={[
                { value: '', label: 'Qualquer (AG ou LSL)' },
                { value: 'AG', label: 'AG' },
                { value: 'LSL', label: 'LSL (veículo próprio)' },
              ]}
            />
            <Input
              label="Capacidade mínima (motos)"
              type="number"
              min={1}
              value={capacityMotos}
              onChange={(e) => setCapacityMotos(e.target.value)}
              placeholder="Ex.: 50"
              disabled={!canEdit}
            />
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            Use LSL quando a carga Chronus veio como AG e você vai colocar placa própria.
          </p>
        </div>

        <div
          className={cn(
            'space-y-4 rounded-[var(--radius)] border p-5',
            hasPriority
              ? 'border-amber-500/40 bg-amber-500/5'
              : 'border-[var(--color-border)] bg-[var(--color-surface)]',
          )}
        >
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 accent-[var(--color-primary)]"
              checked={hasPriority}
              onChange={(e) => {
                setHasPriority(e.target.checked)
                if (!e.target.checked) {
                  setPriorityExpiryDate('')
                  setPriorityNotes('')
                }
              }}
            />
            <span>
              <span className="text-sm font-semibold">Prioridade por vencimento</span>
              <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">
                Marque quando houver carga com validade crítica. A Operação verá o alerta com a
                menor data de vencimento.
              </span>
            </span>
          </label>

          {hasPriority && (
            <div className="space-y-3 border-t border-amber-500/20 pt-4">
              <div>
                <Input
                  label="Menor data de vencimento *"
                  type="date"
                  value={priorityExpiryDate}
                  onChange={(e) => setPriorityExpiryDate(e.target.value)}
                  required={hasPriority}
                />
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  Obrigatória. Pode ser retroativa. A Operação verá esta data em destaque ao definir
                  a placa.
                </p>
              </div>

              {hasPriority && !priorityExpiryDate && (
                <div className="flex items-start gap-2 rounded-[var(--radius)] border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-800 dark:text-red-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Informe a menor data de vencimento. Sem ela, o operador não sabe qual data
                    retroativa coletar.
                  </span>
                </div>
              )}

              {expiryPast && priorityExpiryDate && (
                <div className="flex items-start gap-2 rounded-[var(--radius)] border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-800 dark:text-red-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Vencimento em <strong>{formatDate(priorityExpiryDate)}</strong>
                    {priorityExpiryDate < toInputDate(new Date())
                      ? ' — já vencido (retroativo).'
                      : ' — vence hoje.'}{' '}
                    A Operação verá este alerta em destaque.
                  </span>
                </div>
              )}

              <Textarea
                label="Observação da prioridade (opcional)"
                value={priorityNotes}
                onChange={(e) => setPriorityNotes(e.target.value)}
                rows={2}
                placeholder="Ex.: lote com validade curta, cliente X…"
              />
            </div>
          )}
        </div>

        <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <p className="mb-2 text-sm font-medium">
            Concessionárias <span className="text-[var(--color-danger)]">*</span>
            <span className="ml-2 font-normal text-[var(--color-text-muted)]">
              {dealershipIds.length} selecionada{dealershipIds.length === 1 ? '' : 's'}
            </span>
          </p>

          <div className="relative mb-2">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input
              type="search"
              value={dealerSearch}
              onChange={(e) => setDealerSearch(e.target.value)}
              placeholder="Buscar cidade ou concessionária…"
              className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] py-2 pr-3 pl-9 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          <div className="max-h-72 space-y-0.5 overflow-y-auto">
            {filteredDealerships.length === 0 && (
              <p className="p-2 text-sm text-[var(--color-text-muted)]">Nenhuma encontrada.</p>
            )}
            {filteredDealerships.map((d) => {
              const checked = dealershipIds.includes(d.id)
              return (
                <label
                  key={d.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-[var(--color-surface-2)]',
                    checked && 'bg-[var(--color-primary-muted)]',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleDealership(d.id)}
                    className="accent-[var(--color-primary)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{d.city}</span>
                    <span className="text-[var(--color-text-muted)]"> · {d.name}</span>
                    <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">
                      {d.distanceKm.toFixed(0)} km do PAD ·{' '}
                      {d.avgTravelDays === 0 ? 'mesmo dia' : `${d.avgTravelDays} dias`}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>

          {selectedDealers.length > 0 && (
            <div className="mt-4 space-y-3 border-t border-[var(--color-border)] pt-4">
              <p className="text-sm font-medium">Motos e vencimento por destino</p>
              {selectedDealers.map((d) => (
                <div key={d.id} className="grid gap-2 sm:grid-cols-[1fr_6rem_9rem] sm:items-end">
                  <p className="text-sm">
                    <span className="font-medium">{d.city}</span>
                    <span className="text-[var(--color-text-muted)]"> · {d.name}</span>
                  </p>
                  <Input
                    label="Motos"
                    type="number"
                    min={0}
                    value={destMotoCount[d.id] ?? ''}
                    onChange={(e) =>
                      setDestMotoCount((prev) => ({ ...prev, [d.id]: e.target.value }))
                    }
                    disabled={!canEdit}
                  />
                  <Input
                    label="Venc. N.F."
                    type="date"
                    value={destExpiry[d.id] ?? ''}
                    onChange={(e) =>
                      setDestExpiry((prev) => ({ ...prev, [d.id]: e.target.value }))
                    }
                    disabled={!canEdit}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <Textarea
          label="Observações (opcional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Notas internas da carga"
          disabled={!canEdit}
        />

        {saveMutation.isError && (
          <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-[var(--color-danger)]">
            {saveErrorMessage(saveMutation.error)}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate('/roteiros')}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="secondary"
            loading={saveMutation.isPending}
            disabled={
              name.trim().length < 2 ||
              dealershipIds.length < 1 ||
              !canEdit ||
              saveMutation.isPending ||
              (hasPriority && !priorityExpiryDate)
            }
          >
            Salvar
          </Button>
          {canSend && (
            <Button
              type="button"
              loading={saveMutation.isPending}
              disabled={
                name.trim().length < 2 ||
                dealershipIds.length < 1 ||
                saveMutation.isPending ||
                (hasPriority && !priorityExpiryDate)
              }
              onClick={() => saveMutation.mutate(true)}
            >
              Disponibilizar para Operação
            </Button>
          )}
          {existing?.status === 'AGUARDANDO_PLACAS' && (
            <p className="w-full text-right text-xs text-[var(--color-text-muted)]">
              Já disponível para Operação — você ainda pode salvar ajustes.
            </p>
          )}
        </div>
      </form>
    </div>
  )
}
