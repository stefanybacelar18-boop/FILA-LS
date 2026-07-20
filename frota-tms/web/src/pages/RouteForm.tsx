import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Search } from 'lucide-react'
import { api } from '../lib/api'
import type { Dealership, Route } from '../types'
import { PageHeader, Button, Input, Spinner } from '../components/ui'
import { toInputDate } from '../lib/format'
import { cn } from '../lib/cn'

export function RouteForm() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const createdIdRef = useRef<string | null>(null)

  const [date, setDate] = useState(toInputDate(new Date()))
  const [dealershipIds, setDealershipIds] = useState<string[]>([])
  const [dealerSearch, setDealerSearch] = useState('')

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
    setDate(toInputDate(existing.date))
    const ids =
      existing.dealerships?.map((rd) => rd.dealershipId) ??
      (existing.dealershipId ? [existing.dealershipId] : [])
    setDealershipIds(ids)
  }, [existing])

  const selectedDealers = useMemo(
    () => dealerships.filter((d) => dealershipIds.includes(d.id)),
    [dealerships, dealershipIds],
  )

  const autoName = useMemo(() => {
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

  const saveMutation = useMutation({
    mutationFn: async (disponibilizar: boolean) => {
      if (dealershipIds.length < 1) throw new Error('Selecione ao menos uma concessionária')
      const name = autoName || existing?.name || `Roteiro ${date}`
      const region =
        [...new Set(selectedDealers.map((d) => d.region))].join(' / ') || null
      const payload = {
        name,
        date,
        dealershipIds,
        region,
        notes: null,
        hasPriority: false,
        priorityNotes: null,
        plannedVehicleCount: 1,
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
        description="Informe a data de início e as concessionárias. A previsão de retorno é calculada automaticamente pelo PAD."
      />

      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-3 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div>
            <Input
              label="Data de início da viagem"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Saída às 06:00 · retorno previsto pelo destino mais longe do PAD
            </p>
          </div>
          {autoName && (
            <p className="text-sm text-[var(--color-text-muted)]">
              Nome automático: <strong className="text-[var(--color-text)]">{autoName}</strong>
            </p>
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
                      {d.distanceKm.toFixed(0)} km do PAD · {d.avgTravelDays} dias
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        {saveMutation.isError && (
          <p className="text-sm text-[var(--color-danger)]">
            {(saveMutation.error as { response?: { data?: { error?: string } }; message?: string })
              ?.response?.data?.error ??
              (saveMutation.error as Error)?.message ??
              'Erro ao salvar'}
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
            disabled={dealershipIds.length < 1 || !canEdit || saveMutation.isPending}
          >
            Salvar
          </Button>
          {canSend && (
            <Button
              type="button"
              loading={saveMutation.isPending}
              disabled={dealershipIds.length < 1 || saveMutation.isPending}
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
