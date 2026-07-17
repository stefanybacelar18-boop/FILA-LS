import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Truck,
  MapPinned,
  AlertTriangle,
  Wrench,
  Tags,
  RotateCcw,
  ClipboardList,
} from 'lucide-react'
import { api } from '../lib/api'
import type { DashboardData } from '../types'
import { PageHeader, Spinner, Card, Badge, Button } from '../components/ui'
import { formatDate } from '../lib/format'
import { cn } from '../lib/cn'
import { useAuthStore } from '../stores/auth'
import { routeStatusLabels } from '../lib/labels'

export function Dashboard() {
  const canOperate = useAuthStore((s) => s.hasRole('ADMIN', 'OPERACAO'))
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

  const ops = data.ops
  const alerts = [
    {
      show: (ops?.awaitingPlates ?? 0) > 0,
      tone: 'info' as const,
      title: `${ops?.awaitingPlates ?? 0} roteiro(s) aguardando placas`,
      href: '/definir-placas',
      cta: 'Definir placas',
      roles: true,
    },
    {
      show: (ops?.justificativasPendentes ?? 0) > 0,
      tone: 'danger' as const,
      title: `${ops?.justificativasPendentes ?? 0} placa(s) que já deveriam ter retornado sem justificativa`,
      href: '/definir-placas',
      cta: 'Justificar',
      roles: true,
    },
    {
      show: (data.fleet.atrasadas ?? 0) > 0,
      tone: 'danger' as const,
      title: `${data.fleet.atrasadas} viagem(ns) em atraso`,
      href: '/retornos',
      cta: 'Ver retornos',
      roles: canOperate,
    },
    {
      show: (ops?.priorityRoutes ?? 0) > 0,
      tone: 'warning' as const,
      title: `${ops?.priorityRoutes ?? 0} roteiro(s) com carga prioritária ativos`,
      href: '/roteiros',
      cta: 'Ver roteiros',
      roles: true,
    },
  ].filter((a) => a.show && a.roles)

  const kpis = [
    { label: 'Disponíveis (truck)', value: data.fleet.trucksAvailable, icon: Truck, tone: 'text-green-600' },
    { label: 'Disponíveis (carreta)', value: data.fleet.carretasAvailable, icon: Truck, tone: 'text-green-600' },
    { label: 'Em viagem', value: data.fleet.emViagem, icon: MapPinned, tone: 'text-blue-600' },
    { label: 'Retornam hoje', value: data.fleet.retornamHoje, icon: MapPinned, tone: 'text-blue-600' },
    { label: 'Atrasadas', value: data.fleet.atrasadas, icon: AlertTriangle, tone: 'text-red-600' },
    {
      label: 'Já deveriam ter voltado',
      value: data.fleet.deveriamEstarDisponiveis ?? 0,
      icon: AlertTriangle,
      tone: 'text-red-600',
    },
    { label: 'Bloqueados', value: data.fleet.bloqueados ?? 0, icon: Wrench, tone: 'text-slate-600' },
    { label: 'Tempo médio (dias)', value: data.avgTravelDays, icon: ClipboardList, tone: 'text-amber-600' },
  ]

  const chartData = data.tripsPerDay.map((d) => ({
    ...d,
    label: formatDate(d.date, 'dd/MM'),
  }))

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Central operacional: o que precisa de ação hoje"
      />

      {alerts.length > 0 && (
        <div className="mb-5 space-y-2">
          {alerts.map((a) => (
            <div
              key={a.title}
              className={cn(
                'flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border px-4 py-3',
                a.tone === 'danger' && 'border-red-500/30 bg-red-500/10',
                a.tone === 'warning' && 'border-amber-500/30 bg-amber-500/10',
                a.tone === 'info' && 'border-teal-500/30 bg-teal-500/10',
              )}
            >
              <p className="text-sm font-medium">{a.title}</p>
              <Link
                to={a.href}
                className="inline-flex h-8 items-center rounded-md bg-[var(--color-surface)] px-3 text-sm font-medium hover:bg-[var(--color-surface-2)]"
              >
                {a.cta}
              </Link>
            </div>
          ))}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
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

      {(data.hojeCarregamento?.length ?? 0) > 0 && (
        <Card
          title="Carregamento de hoje (saída 06:00)"
          action={
            canOperate ? (
              <Link to="/definir-placas" className="text-sm text-[var(--color-primary)] hover:underline">
                Definir placas
              </Link>
            ) : undefined
          }
          className="mb-4"
        >
          <div className="table-wrap border-0">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Roteiro</th>
                  <th>Destinos</th>
                  <th>Placas</th>
                  <th>Cobertura</th>
                  <th>Status</th>
                  {canOperate && <th />}
                </tr>
              </thead>
              <tbody>
                {data.hojeCarregamento!.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{r.name}</span>
                        {r.hasPriority && <Badge tone="warning">Prioridade</Badge>}
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {formatDate(r.date)} · 06:00
                      </p>
                    </td>
                    <td>{r.cities || '—'}</td>
                    <td>
                      {r.assignedPlates}
                      {r.plannedPlates != null ? ` / ${r.plannedPlates}` : ''}
                    </td>
                    <td>
                      {r.coverage != null ? (
                        <span
                          className={cn(
                            'font-semibold',
                            r.coverage >= 100
                              ? 'text-green-600'
                              : r.coverage >= 50
                                ? 'text-amber-600'
                                : 'text-[var(--color-danger)]',
                          )}
                        >
                          {r.coverage}%
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <Badge>{routeStatusLabels[r.status as keyof typeof routeStatusLabels] ?? r.status}</Badge>
                    </td>
                    {canOperate && (
                      <td>
                        {r.status === 'AGUARDANDO_PLACAS' || r.status === 'RASCUNHO' ? (
                          <Link to="/definir-placas">
                            <Button size="sm" variant="secondary">
                              <Tags className="h-3.5 w-3.5" />
                              Placas
                            </Button>
                          </Link>
                        ) : (
                          <Link to="/retornos">
                            <Button size="sm" variant="ghost">
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

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
