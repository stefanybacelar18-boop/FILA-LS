import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { formatDate } from '../lib/format'
import { PageHeader, Button, Input, Spinner, EmptyState } from '../components/ui'

type CargoMatch = {
  id: string
  chassis: string
  invoiceNumber: string | null
  model: string | null
  dealershipName: string | null
  city: string | null
  routeName: string
  routeDate: string
  plate: string | null
  situation: 'ENTREGUE' | 'EM_VIAGEM' | 'SEM_VIAGEM'
  situationLabel: string
  deliveredAt: string | null
}

export function CargoLookup() {
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')

  const query = useQuery({
    queryKey: ['cargo-lookup', q],
    enabled: q.length > 0,
    queryFn: async () =>
      (await api.get<{ q: string; matches: CargoMatch[] }>('/cargo/lookup', { params: { q } })).data,
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setQ(draft.trim())
  }

  const errorMessage =
    query.error &&
    ((query.error as { response?: { data?: { error?: string } } }).response?.data?.error ??
      'Não foi possível consultar.')

  return (
    <div className="page-desktop max-w-3xl">
      <PageHeader title="Chassi / NF" />

      <form onSubmit={onSubmit} className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Input
            label="Chassi ou nota fiscal"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <Button type="submit" disabled={draft.trim().length < 3}>
          Consultar
        </Button>
      </form>

      {!q ? null : query.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : errorMessage ? (
        <p className="text-sm text-[var(--color-danger)]">{errorMessage}</p>
      ) : !query.data?.matches.length ? (
        <EmptyState title="Nenhum registro" />
      ) : (
        <ul className="space-y-3">
          {query.data.matches.map((item) => (
            <li
              key={item.id}
              className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
            >
              <p
                className={
                  item.situation === 'ENTREGUE'
                    ? 'text-base font-semibold text-[var(--color-success)]'
                    : 'text-base font-semibold'
                }
              >
                {item.situationLabel}
                {item.situation === 'ENTREGUE' && item.deliveredAt
                  ? ` em ${formatDate(item.deliveredAt)}`
                  : ''}
              </p>
              <p className="mt-1 font-medium">
                {item.chassis}
                {item.invoiceNumber ? ` · NF ${item.invoiceNumber}` : ''}
                {item.model ? ` · ${item.model}` : ''}
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                {[item.city, item.dealershipName, item.routeName, item.plate].filter(Boolean).join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
