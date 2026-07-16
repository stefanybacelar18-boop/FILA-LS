import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Search } from 'lucide-react'
import { api } from '../lib/api'
import type { Dealership, Route } from '../types'
import { PageHeader, Button, Input, Textarea, Spinner } from '../components/ui'
import { toInputDate } from '../lib/format'
import { cn } from '../lib/cn'

export function RouteForm() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [name, setName] = useState('')
  const [date, setDate] = useState(toInputDate(new Date()))
  const [dealershipIds, setDealershipIds] = useState<string[]>([])
  const [dealerSearch, setDealerSearch] = useState('')
  const [region, setRegion] = useState('')
  const [notes, setNotes] = useState('')
  const [hasPriority, setHasPriority] = useState(false)
  const [priorityNotes, setPriorityNotes] = useState('')

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
    setName(existing.name)
    setDate(toInputDate(existing.date))
    const ids =
      existing.dealerships?.map((rd) => rd.dealershipId) ??
      (existing.dealershipId ? [existing.dealershipId] : [])
    setDealershipIds(ids)
    setRegion(existing.region ?? '')
    setNotes(existing.notes ?? '')
    setHasPriority(!!existing.hasPriority)
    setPriorityNotes(existing.priorityNotes ?? '')
  }, [existing])

  const filteredDealerships = useMemo(() => {
    const q = dealerSearch.trim().toLowerCase()
    const active = dealerships.filter((d) => d.active)
    if (!q) return active
    return active.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.city.toLowerCase().includes(q) ||
        d.state.toLowerCase().includes(q) ||
        d.region.toLowerCase().includes(q) ||
        (d.code?.toLowerCase().includes(q) ?? false) ||
        (d.phone?.toLowerCase().includes(q) ?? false),
    )
  }, [dealerships, dealerSearch])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (dealershipIds.length < 1) throw new Error('Selecione ao menos uma concessionária')
      const payload = {
        name,
        date,
        dealershipIds,
        region: region || null,
        notes: notes || null,
        hasPriority,
        priorityNotes: hasPriority ? priorityNotes || null : null,
      }
      if (isNew) return (await api.post<Route>('/routes', payload)).data
      return (await api.put<Route>(`/routes/${id}`, payload)).data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['routes'] })
      navigate('/roteiros')
    },
  })

  function toggleDealership(did: string) {
    setDealershipIds((prev) => {
      const next = prev.includes(did) ? prev.filter((x) => x !== did) : [...prev, did]
      const selected = dealerships.filter((d) => next.includes(d.id))
      if (selected.length) {
        setRegion([...new Set(selected.map((d) => d.region))].join(' / '))
      }
      return next
    })
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    saveMutation.mutate()
  }

  if (!isNew && isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div>
      <Link
        to="/roteiros"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>

      <PageHeader
        title={isNew ? 'Novo roteiro' : 'Editar roteiro'}
        description="Selecione as concessionárias do roteiro e informe manualmente se há carga prioritária"
      />

      <form
        onSubmit={onSubmit}
        className="max-w-3xl space-y-4 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Input label="Nome do roteiro" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <Input label="Data" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <Input label="Região" value={region} onChange={(e) => setRegion(e.target.value)} />
          <div className="sm:col-span-2">
            <Textarea label="Observações" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={hasPriority}
              onChange={(e) => setHasPriority(e.target.checked)}
              className="mt-1 accent-[var(--color-primary)]"
            />
            <span>
              <span className="font-medium">Carga prioritária</span>
              <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">
                Marque manualmente quando este roteiro tiver prioridade de carregamento
              </span>
            </span>
          </label>
          {hasPriority && (
            <div className="mt-3">
              <Textarea
                label="Detalhe da prioridade (opcional)"
                value={priorityNotes}
                onChange={(e) => setPriorityNotes(e.target.value)}
                placeholder="Ex.: vencimento próximo, pedido urgente, cliente X…"
              />
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              Concessionárias <span className="text-[var(--color-danger)]">*</span>
              <span className="ml-2 font-normal text-[var(--color-text-muted)]">
                ({dealershipIds.length} selecionada{dealershipIds.length === 1 ? '' : 's'} ·{' '}
                {dealerships.filter((d) => d.active).length} na lista)
              </span>
            </p>
          </div>

          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input
              type="search"
              value={dealerSearch}
              onChange={(e) => setDealerSearch(e.target.value)}
              placeholder="Buscar por nome, código, cidade, UF ou região…"
              className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          <div className="max-h-72 space-y-1 overflow-y-auto rounded border border-[var(--color-border)] p-2">
            {filteredDealerships.length === 0 && (
              <p className="p-2 text-sm text-[var(--color-text-muted)]">
                Nenhuma concessionária encontrada com esse filtro.
              </p>
            )}
            {filteredDealerships.map((d) => {
              const checked = dealershipIds.includes(d.id)
              return (
                <label
                  key={d.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded px-2 py-2 text-sm hover:bg-[var(--color-surface-2)]',
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
                      <span className="font-medium">{d.name}</span>
                      <span className="ml-2 text-xs text-[var(--color-text-muted)]">
                        {d.code ? `${d.code} · ` : ''}
                        {d.city}/{d.state} · {d.region} · {d.distanceKm} km · {d.avgTravelDays}d
                      </span>
                    </span>
                </label>
              )
            })}
          </div>
          {dealershipIds.length < 1 && (
            <p className="mt-1 text-xs text-[var(--color-danger)]">Selecione ao menos uma concessionária</p>
          )}
        </div>

        {saveMutation.isError && (
          <p className="text-sm text-[var(--color-danger)]">
            {(saveMutation.error as { response?: { data?: { error?: string } }; message?: string })?.response
              ?.data?.error ??
              (saveMutation.error as Error)?.message ??
              'Erro ao salvar roteiro'}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => navigate('/roteiros')}>
            Cancelar
          </Button>
          <Button type="submit" loading={saveMutation.isPending} disabled={dealershipIds.length < 1}>
            Salvar
          </Button>
        </div>
      </form>
    </div>
  )
}
