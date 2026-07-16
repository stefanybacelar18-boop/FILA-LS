import { useQuery } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Truck, MapPinned, AlertTriangle, Wrench } from 'lucide-react'
import { api } from '../lib/api'
import type { DashboardData } from '../types'
import { PageHeader, Spinner, Card } from '../components/ui'
import { formatDate } from '../lib/format'
import { cn } from '../lib/cn'

export function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardData>('/dashboard')).data,
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error || !data) {
    return <p className="text-[var(--color-danger)]">Falha ao carregar o dashboard.</p>
  }

  const kpis = [
    { label: 'Frota total', value: data.fleet.total, icon: Truck, tone: 'text-teal-600' },
    { label: 'Trucks disponíveis', value: data.fleet.trucksAvailable, icon: Truck, tone: 'text-green-600' },
    { label: 'Carretas disponíveis', value: data.fleet.carretasAvailable, icon: Truck, tone: 'text-green-600' },
    { label: 'Em viagem', value: data.fleet.emViagem, icon: MapPinned, tone: 'text-blue-600' },
    { label: 'Retornam hoje', value: data.fleet.retornamHoje, icon: MapPinned, tone: 'text-blue-600' },
    { label: 'Atrasadas', value: data.fleet.atrasadas, icon: AlertTriangle, tone: 'text-red-600' },
    { label: 'Manutenção', value: data.fleet.emManutencao, icon: Wrench, tone: 'text-slate-600' },
    { label: 'Tempo médio (dias)', value: data.avgTravelDays, icon: MapPinned, tone: 'text-amber-600' },
  ]

  const chartData = data.tripsPerDay.map((d) => ({
    ...d,
    label: formatDate(d.date, 'dd/MM'),
  }))

  return (
    <div>
      <PageHeader title="Dashboard" description="Visão operacional da frota, roteiros e viagens" />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)]"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--color-text-muted)]">{k.label}</span>
              <k.icon className={cn('h-4 w-4', k.tone)} />
            </div>
            <p className="font-display text-2xl font-bold">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Viagens por dia (14 dias)">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="count" name="Viagens" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Ranking de concessionárias">
          <div className="space-y-2">
            {data.ranking.length === 0 && (
              <p className="text-sm text-[var(--color-text-muted)]">Sem dados de viagens.</p>
            )}
            {data.ranking.map((r, i) => (
              <div key={r.dealershipId} className="flex items-center gap-3 text-sm">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-[var(--color-primary-muted)] text-xs font-bold text-[var(--color-primary)]">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{r.city}</p>
                </div>
                <span className="font-display font-semibold">{r.trips}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
