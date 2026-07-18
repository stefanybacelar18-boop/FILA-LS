import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { PageHeader, Spinner, Button, Badge } from '../components/ui'
import { formatDate, formatDateTime } from '../lib/format'
import { routeStatusLabels } from '../lib/labels'

interface DayRoute {
  id: string
  name: string
  date: string
  status: string
  hasPriority: boolean
  planned: number | null
  assigned: number
  coverage: number | null
  dealerships?: { dealership: { city: string } }[]
}

interface MyDayData {
  createdToday: DayRoute[]
  awaitingPlates: DayRoute[]
  completeToday: DayRoute[]
  draftingCount: number
  lastUpdate: string | null
  lastUpdateLabel: string | null
}

function RouteList({
  title,
  items,
  empty,
}: {
  title: string
  items: DayRoute[]
  empty: string
}) {
  return (
    <section className="rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h2 className="text-xl font-bold">
        {title}{' '}
        <span className="text-[var(--color-primary)]">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        <p className="mt-4 text-lg text-[var(--color-text-muted)]">{empty}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] px-4 py-3"
            >
              <div>
                <p className="text-lg font-bold">
                  {r.hasPriority && <span className="mr-2 text-amber-600">★</span>}
                  {r.name}
                </p>
                <p className="text-base text-[var(--color-text-muted)]">
                  {formatDate(r.date)} ·{' '}
                  {r.dealerships?.map((d) => d.dealership.city).join(', ')}
                </p>
              </div>
              <div className="text-right">
                <Badge>{routeStatusLabels[r.status as keyof typeof routeStatusLabels] ?? r.status}</Badge>
                <p className="mt-1 text-base font-semibold">
                  {r.assigned}/{r.planned ?? '—'} placas
                  {r.coverage != null ? ` · ${r.coverage}%` : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function MyDay() {
  const { data, isLoading } = useQuery({
    queryKey: ['planning-my-day'],
    queryFn: async () => (await api.get<MyDayData>('/planning/my-day')).data,
    refetchInterval: 30_000,
  })

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="ops-readable mx-auto max-w-5xl">
      <PageHeader
        title="Meu Dia"
        description="Visão rápida do planejador"
        actions={
          <Link to="/mesa">
            <Button size="lg">Ir para a Mesa</Button>
          </Link>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <p className="text-base text-[var(--color-text-muted)]">Criadas hoje</p>
          <p className="text-4xl font-bold">{data.createdToday.length}</p>
        </div>
        <div className="rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <p className="text-base text-[var(--color-text-muted)]">Aguardando placas</p>
          <p className="text-4xl font-bold text-amber-600">{data.awaitingPlates.length}</p>
        </div>
        <div className="rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <p className="text-base text-[var(--color-text-muted)]">Em montagem</p>
          <p className="text-4xl font-bold">{data.draftingCount}</p>
        </div>
      </div>

      <p className="mb-5 text-base text-[var(--color-text-muted)]">
        Última atualização:{' '}
        <strong>
          {data.lastUpdate ? formatDateTime(data.lastUpdate) : '—'}
          {data.lastUpdateLabel ? ` · ${data.lastUpdateLabel}` : ''}
        </strong>
      </p>

      <div className="space-y-4">
        <RouteList
          title="Rotas criadas hoje"
          items={data.createdToday}
          empty="Nenhuma rota criada hoje"
        />
        <RouteList
          title="Aguardando placas"
          items={data.awaitingPlates}
          empty="Nenhuma rota aguardando a operação"
        />
        <RouteList
          title="Completas / em andamento hoje"
          items={data.completeToday}
          empty="Nenhuma rota completa hoje"
        />
      </div>
    </div>
  )
}
