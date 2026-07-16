import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { api } from '../lib/api'
import type { Dealership, PriorityProduct, Route } from '../types'
import { PageHeader, Button, Input, Select, Textarea, Spinner, Badge } from '../components/ui'
import { toInputDate } from '../lib/format'
import { cn } from '../lib/cn'

export function RouteForm() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [name, setName] = useState('')
  const [date, setDate] = useState(toInputDate(new Date()))
  const [dealershipId, setDealershipId] = useState('')
  const [region, setRegion] = useState('')
  const [notes, setNotes] = useState('')
  const [productIds, setProductIds] = useState<string[]>([])

  const { data: dealerships = [] } = useQuery({
    queryKey: ['dealerships'],
    queryFn: async () => (await api.get<Dealership[]>('/dealerships')).data,
  })

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.get<PriorityProduct[]>('/products')).data,
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
    setDealershipId(existing.dealershipId)
    setRegion(existing.region ?? '')
    setNotes(existing.notes ?? '')
    setProductIds(existing.products?.map((p) => p.productId) ?? [])
  }, [existing])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        date,
        dealershipId,
        region: region || null,
        notes: notes || null,
        productIds,
      }
      if (isNew) return (await api.post<Route>('/routes', payload)).data
      return (await api.put<Route>(`/routes/${id}`, payload)).data
    },
    onSuccess: (route) => {
      void qc.invalidateQueries({ queryKey: ['routes'] })
      navigate('/roteiros')
      return route
    },
  })

  function toggleProduct(pid: string) {
    setProductIds((prev) => (prev.includes(pid) ? prev.filter((x) => x !== pid) : [...prev, pid]))
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
        description="Defina destino, data e produtos prioritários vinculados"
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
          <Select
            label="Concessionária"
            value={dealershipId}
            onChange={(e) => {
              setDealershipId(e.target.value)
              const d = dealerships.find((x) => x.id === e.target.value)
              if (d) setRegion(d.region)
            }}
            options={dealerships.filter((d) => d.active).map((d) => ({
              value: d.id,
              label: `${d.name} (${d.city}/${d.state})`,
            }))}
            placeholder="Selecione…"
            required
          />
          <Input label="Região" value={region} onChange={(e) => setRegion(e.target.value)} />
          <div className="sm:col-span-2">
            <Textarea label="Observações" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Produtos prioritários</p>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded border border-[var(--color-border)] p-2">
            {products.length === 0 && (
              <p className="p-2 text-sm text-[var(--color-text-muted)]">Nenhum produto ativo.</p>
            )}
            {products.map((p) => {
              const checked = productIds.includes(p.id)
              return (
                <label
                  key={p.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded px-2 py-2 text-sm hover:bg-[var(--color-surface-2)]',
                    checked && 'bg-[var(--color-primary-muted)]',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleProduct(p.id)}
                    className="accent-[var(--color-primary)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{p.product}</span>
                    <span className="ml-2 text-xs text-[var(--color-text-muted)]">
                      Lote {p.lot} · {p.daysRemaining}d
                    </span>
                  </span>
                  {p.daysRemaining <= 30 && (
                    <Badge tone={p.daysRemaining < 7 ? 'danger' : 'warning'}>Prioritário</Badge>
                  )}
                </label>
              )
            })}
          </div>
        </div>

        {saveMutation.isError && (
          <p className="text-sm text-[var(--color-danger)]">
            {(saveMutation.error as { response?: { data?: { error?: string } } })?.response?.data
              ?.error ?? 'Erro ao salvar roteiro'}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => navigate('/roteiros')}>
            Cancelar
          </Button>
          <Button type="submit" loading={saveMutation.isPending}>
            Salvar
          </Button>
        </div>
      </form>
    </div>
  )
}
