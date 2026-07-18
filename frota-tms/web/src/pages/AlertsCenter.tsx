import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Ban, Clock, Star, Tags } from 'lucide-react'
import { api } from '../lib/api'
import { PageHeader, Spinner, Button } from '../components/ui'
import { formatDateTime } from '../lib/format'
import { useAuthStore } from '../stores/auth'

interface AlertsData {
  semPlacas: { id: string; name: string; hasPriority: boolean; planned: number | null; assigned: number }[]
  criticas: { id: string; name: string; hasPriority: boolean }[]
  atrasados: {
    id: string
    expectedReturn: string
    vehicle: { plate: string }
    route?: { name: string } | null
  }[]
  bloqueados: { id: string; plate: string; status: string }[]
  retornosHoje: { id: string; expectedReturn: string; vehicle: { plate: string } }[]
  retornosAmanha: { id: string; expectedReturn: string; vehicle: { plate: string } }[]
  counts: {
    semPlacas: number
    criticas: number
    atrasados: number
    bloqueados: number
    retornosHoje: number
    retornosAmanha: number
  }
}

function AlertBlock({
  title,
  count,
  icon: Icon,
  tone,
  children,
}: {
  title: string
  count: number
  icon: typeof AlertTriangle
  tone: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <header className="mb-3 flex items-center gap-3">
        <Icon className={`h-7 w-7 ${tone}`} />
        <h2 className="text-xl font-bold">
          {title} <span className={tone}>({count})</span>
        </h2>
      </header>
      {children}
    </section>
  )
}

export function AlertsCenter() {
  const canOps = useAuthStore((s) => s.hasRole('OPERACAO', 'ADMIN'))
  const { data, isLoading } = useQuery({
    queryKey: ['planning-alerts'],
    queryFn: async () => (await api.get<AlertsData>('/planning/alerts')).data,
    refetchInterval: 20_000,
  })

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  const c = data.counts

  return (
    <div className="ops-readable mx-auto max-w-5xl space-y-4">
      <PageHeader
        title="Central de Alertas"
        description="O que precisa de atenção agora"
        actions={
          canOps ? (
            <Link to="/definir-placas">
              <Button size="lg">
                <Tags className="h-5 w-5" /> Definir placas
              </Button>
            </Link>
          ) : (
            <Link to="/mesa">
              <Button size="lg">Abrir Mesa</Button>
            </Link>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Sem placas', value: c.semPlacas, tone: 'text-amber-600' },
          { label: 'Críticas', value: c.criticas, tone: 'text-red-600' },
          { label: 'Atrasados', value: c.atrasados, tone: 'text-red-600' },
          { label: 'Bloqueados', value: c.bloqueados, tone: 'text-slate-700' },
          { label: 'Retorno hoje', value: c.retornosHoje, tone: 'text-blue-600' },
          { label: 'Retorno amanhã', value: c.retornosAmanha, tone: 'text-orange-600' },
        ].map((k) => (
          <div
            key={k.label}
            className="rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          >
            <p className="text-base text-[var(--color-text-muted)]">{k.label}</p>
            <p className={`text-4xl font-bold ${k.tone}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <AlertBlock title="Rotas sem placas" count={c.semPlacas} icon={Tags} tone="text-amber-600">
        {data.semPlacas.length === 0 ? (
          <p className="text-lg text-[var(--color-text-muted)]">Nenhuma</p>
        ) : (
          <ul className="space-y-2">
            {data.semPlacas.map((r) => (
              <li key={r.id} className="flex justify-between gap-2 text-lg">
                <span>
                  {r.hasPriority && <Star className="mr-1 inline h-4 w-4 text-amber-500" />}
                  {r.name}
                </span>
                <span className="font-semibold">
                  {r.assigned}/{r.planned ?? '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AlertBlock>

      <AlertBlock title="Rotas críticas" count={c.criticas} icon={AlertTriangle} tone="text-red-600">
        {data.criticas.length === 0 ? (
          <p className="text-lg text-[var(--color-text-muted)]">Nenhuma</p>
        ) : (
          <ul className="space-y-2 text-lg">
            {data.criticas.map((r) => (
              <li key={r.id}>{r.name}</li>
            ))}
          </ul>
        )}
      </AlertBlock>

      <AlertBlock title="Veículos atrasados" count={c.atrasados} icon={Clock} tone="text-red-600">
        {data.atrasados.length === 0 ? (
          <p className="text-lg text-[var(--color-text-muted)]">Nenhum</p>
        ) : (
          <ul className="space-y-2 text-lg">
            {data.atrasados.map((t) => (
              <li key={t.id}>
                <strong>{t.vehicle.plate}</strong> · prev. {formatDateTime(t.expectedReturn)}
                {t.route ? ` · ${t.route.name}` : ''}
              </li>
            ))}
          </ul>
        )}
      </AlertBlock>

      <AlertBlock title="Veículos bloqueados / manutenção" count={c.bloqueados} icon={Ban} tone="text-slate-700">
        {data.bloqueados.length === 0 ? (
          <p className="text-lg text-[var(--color-text-muted)]">Nenhum</p>
        ) : (
          <ul className="space-y-2 text-lg">
            {data.bloqueados.map((v) => (
              <li key={v.id}>
                <strong>{v.plate}</strong> · {v.status}
              </li>
            ))}
          </ul>
        )}
      </AlertBlock>

      <AlertBlock title="Retornos previstos hoje" count={c.retornosHoje} icon={Clock} tone="text-blue-600">
        {data.retornosHoje.length === 0 ? (
          <p className="text-lg text-[var(--color-text-muted)]">Nenhum</p>
        ) : (
          <ul className="space-y-2 text-lg">
            {data.retornosHoje.map((t) => (
              <li key={t.id}>
                <strong>{t.vehicle.plate}</strong> · {formatDateTime(t.expectedReturn)}
              </li>
            ))}
          </ul>
        )}
      </AlertBlock>

      <AlertBlock title="Retornos previstos amanhã" count={c.retornosAmanha} icon={Clock} tone="text-orange-600">
        {data.retornosAmanha.length === 0 ? (
          <p className="text-lg text-[var(--color-text-muted)]">Nenhum</p>
        ) : (
          <ul className="space-y-2 text-lg">
            {data.retornosAmanha.map((t) => (
              <li key={t.id}>
                <strong>{t.vehicle.plate}</strong> · {formatDateTime(t.expectedReturn)}
              </li>
            ))}
          </ul>
        )}
      </AlertBlock>
    </div>
  )
}
