import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { api } from '../lib/api'
import { PageHeader, Spinner, Button } from '../components/ui'
import { formatDate } from '../lib/format'
import { routeStatusLabels } from '../lib/labels'
import { cn } from '../lib/cn'

interface OverviewRoute {
  id: string
  name: string
  date: string
  status: string
  hasPriority: boolean
  planned: number | null
  assigned: number
  missing: number | null
  coverage: number | null
  dealerships?: { dealership: { city: string } }[]
}

interface OverviewData {
  date: string
  routesToday: OverviewRoute[]
  prioritarias: OverviewRoute[]
  aguardandoPlacas: OverviewRoute[]
  completas: OverviewRoute[]
  totais: {
    rotas: number
    plannedVehicles: number
    assignedVehicles: number
    missing: number
    coverage: number | null
  }
}

export function PlanningOverview() {
  const { data, isLoading } = useQuery({
    queryKey: ['planning-overview'],
    queryFn: async () => (await api.get<OverviewData>('/planning/overview')).data,
    refetchInterval: 20_000,
  })

  async function downloadExport() {
    const res = await api.get('/planning/export', { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'frotatms-planejamento.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  const t = data.totais

  return (
    <div className="ops-readable mx-auto max-w-6xl">
      <PageHeader
        title="Central de Planejamento"
        description={`Rotas do dia · ${formatDate(data.date)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/mesa">
              <Button size="lg">Mesa de Roteirização</Button>
            </Link>
            <Button size="lg" variant="secondary" onClick={() => void downloadExport()}>
              <Download className="h-5 w-5" /> Exportar
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Rotas do dia" value={t.rotas} />
        <Stat label="Prioritárias" value={data.prioritarias.length} tone="text-amber-600" />
        <Stat label="Aguardando placas" value={data.aguardandoPlacas.length} tone="text-amber-700" />
        <Stat label="Completas / ok" value={data.completas.length} tone="text-green-600" />
      </div>

      <div className="mb-6 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-base text-[var(--color-text-muted)]">Cobertura do dia</p>
            <p className="text-3xl font-semibold">
              {t.assignedVehicles} / {t.plannedVehicles || '—'} veículos
            </p>
            <p className="mt-1 text-lg">
              Faltam <strong>{t.missing}</strong>
              {t.coverage != null ? ` · Cobertura ${t.coverage}%` : ''}
            </p>
          </div>
          <p className="text-3xl font-semibold text-[var(--color-primary)]">
            {t.coverage != null ? `${t.coverage}%` : '—'}
          </p>
        </div>
        <div className="mt-4 h-5 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              (t.coverage ?? 0) >= 100
                ? 'bg-green-600'
                : (t.coverage ?? 0) >= 70
                  ? 'bg-[var(--color-primary)]'
                  : 'bg-amber-500',
            )}
            style={{ width: `${Math.min(100, t.coverage ?? 0)}%` }}
          />
        </div>
      </div>

      <section className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="mb-4 text-lg font-semibold">Rotas do dia</h2>
        {data.routesToday.length === 0 ? (
          <p className="text-lg text-[var(--color-text-muted)]">
            Nenhuma rota para hoje. Monte na Mesa.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.routesToday.map((r) => (
              <li
                key={r.id}
                className="grid gap-2 rounded-[var(--radius)] border border-[var(--color-border)] px-4 py-3 md:grid-cols-[1fr_auto_auto] md:items-center"
              >
                <div>
                  <p className="text-lg font-bold">
                    {r.hasPriority && <span className="mr-1 text-[var(--color-text-muted)]">★</span>}
                    {r.name}
                  </p>
                  <p className="text-base text-[var(--color-text-muted)]">
                    {r.dealerships?.map((d) => d.dealership.city).join(', ')}
                  </p>
                </div>
                <div className="text-base font-semibold">
                  {routeStatusLabels[r.status as keyof typeof routeStatusLabels] ?? r.status}
                </div>
                <div className="text-right text-lg font-bold">
                  {r.assigned}/{r.planned ?? '—'}
                  {r.coverage != null && (
                    <span className="ml-2 text-[var(--color-primary)]">{r.coverage}%</span>
                  )}
                  {r.missing != null && r.missing > 0 && (
                    <span className="ml-2 text-amber-700">faltam {r.missing}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <p className="text-base text-[var(--color-text-muted)]">{label}</p>
      <p className={cn('text-3xl font-semibold', tone)}>{value}</p>
    </div>
  )
}
