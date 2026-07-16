import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import type { SearchResult } from '../types'
import { PageHeader, SearchInput, Spinner, EmptyState, Badge } from '../components/ui'
import { searchTypeLabels } from '../lib/labels'
import { useState, useEffect } from 'react'

export function Search() {
  const [params, setParams] = useSearchParams()
  const initial = params.get('q') ?? ''
  const [q, setQ] = useState(initial)

  useEffect(() => {
    setQ(initial)
  }, [initial])

  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim().length >= 2) setParams({ q: q.trim() })
      else if (!q.trim()) setParams({})
    }, 250)
    return () => clearTimeout(t)
  }, [q, setParams])

  const query = params.get('q') ?? ''

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['search', query],
    queryFn: async () =>
      (await api.get<{ results: SearchResult[]; q: string }>('/search', { params: { q: query } }))
        .data,
    enabled: query.length >= 2,
  })

  return (
    <div>
      <PageHeader title="Busca" description="Pesquisa global em placas, roteiros, produtos e mais" />

      <div className="mb-5 max-w-xl">
        <SearchInput value={q} onChange={setQ} placeholder="Digite ao menos 2 caracteres…" />
      </div>

      {query.length < 2 ? (
        <EmptyState
          title="Digite para buscar"
          description="Informe placa, concessionária, produto, motorista ou roteiro."
        />
      ) : isLoading || isFetching ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : !data?.results.length ? (
        <EmptyState title="Nenhum resultado" description={`Nada encontrado para “${query}”.`} />
      ) : (
        <div className="space-y-2">
          {data.results.map((r) => (
            <Link
              key={`${r.type}-${r.id}`}
              to={r.href}
              className="flex items-start gap-3 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 transition hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary-muted)]/30"
            >
              <Badge tone="primary">{searchTypeLabels[r.type] ?? r.type}</Badge>
              <div className="min-w-0">
                <p className="font-medium">{r.title}</p>
                <p className="text-sm text-[var(--color-text-muted)]">{r.subtitle}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
