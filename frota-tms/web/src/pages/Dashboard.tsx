import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  FileSpreadsheet,
  Trash2,
  Upload,
} from 'lucide-react'
import { api, downloadReport } from '../lib/api'
import type { DashboardData } from '../types'
import { PageHeader, Spinner, Card, Badge, Button, ConfirmModal } from '../components/ui'
import { formatDate } from '../lib/format'
import { cn } from '../lib/cn'
import { useAuthStore } from '../stores/auth'
import { routeStatusLabels } from '../lib/labels'

export function Dashboard() {
  const qc = useQueryClient()
  const isAdmin = useAuthStore((s) => s.hasRole('ADMIN'))
  const canOperate = useAuthStore((s) => s.hasRole('ADMIN', 'OPERACAO'))
  const [purgeOpen, setPurgeOpen] = useState(false)
  const [purgeMsg, setPurgeMsg] = useState('')
  const [reportLoading, setReportLoading] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardData>('/dashboard')).data,
  })

  const purgeMutation = useMutation({
    mutationFn: async () =>
      (await api.post<{ deleted: number; names: string[] }>('/routes/purge-cancelled')).data,
    onSuccess: (result) => {
      setPurgeOpen(false)
      setPurgeMsg(
        result.deleted > 0
          ? `${result.deleted} roteiro(s) cancelado(s) removido(s) permanentemente.`
          : 'Nenhum roteiro cancelado encontrado.',
      )
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
      void qc.invalidateQueries({ queryKey: ['routes'] })
    },
    onError: () => {
      setPurgeMsg('Falha ao remover roteiros cancelados.')
    },
  })

  async function quickReport(type: string) {
    setReportLoading(type)
    try {
      await downloadReport(`/reports/excel/${type}`, `relatorio-${type}.xlsx`)
    } finally {
      setReportLoading(null)
    }
  }

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
      show: (ops?.urgentRoutes ?? 0) > 0,
      tone: 'danger' as const,
      title: `${ops?.urgentRoutes ?? 0} roteiro(s) com vencimento urgente`,
      href: '/roteiros',
      cta: 'Ver prioridades',
      roles: true,
    },
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
      show: (data.fleet.atrasadasSemJustificativa ?? 0) === 0 && (data.fleet.atrasadas ?? 0) > 0,
      tone: 'warning' as const,
      title: `${data.fleet.atrasadas} viagem(ns) em atraso já com justificativa`,
      href: '/justificativas',
      cta: 'Ver justificativas',
      roles: canOperate,
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
    {
      label: 'Placas p/ roteiros',
      value: data.fleet.availableForRoutes ?? data.fleet.trucksAvailable + data.fleet.carretasAvailable,
      icon: Truck,
      tone: 'text-green-600',
      highlight: true,
    },
    { label: 'Capacidade (motos)', value: data.fleet.availableCapacityMotos ?? '—', icon: Truck, tone: 'text-green-600' },
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

  const chronusKpis = [
    {
      label: 'Motos em roteiros abertos',
      value: data.chronus?.motosInOpenRoutes ?? 0,
      icon: Upload,
      tone: 'text-teal-600',
    },
    {
      label: 'Roteiros com carga Chronus',
      value: data.chronus?.activeRoutes ?? 0,
      icon: ClipboardList,
      tone: 'text-teal-600',
    },
    {
      label: 'Imports Chronus hoje',
      value: data.chronus?.importsToday ?? 0,
      icon: FileSpreadsheet,
      tone: 'text-slate-600',
    },
    {
      label: 'Vencimento urgente',
      value: data.ops?.urgentRoutes ?? 0,
      icon: AlertTriangle,
      tone: 'text-red-600',
    },
  ]

  const statusLabels: Record<string, string> = {
    AGUARDANDO_PLACAS: 'Aguardando placa',
    EM_ANDAMENTO: 'Em andamento',
    RASCUNHO: 'Rascunho',
    CONCLUIDO: 'Concluído',
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Central operacional: o que precisa de ação hoje"
        actions={
          isAdmin ? (
            <div className="flex flex-wrap gap-2">
              <Link to="/roteiros/importar-chronus">
                <Button size="sm" variant="secondary">
                  <Upload className="h-4 w-4" />
                  Importar Chronus
                </Button>
              </Link>
              <Button size="sm" variant="ghost" onClick={() => setPurgeOpen(true)}>
                <Trash2 className="h-4 w-4" />
                Limpar cancelados
              </Button>
            </div>
          ) : undefined
        }
      />

      {purgeMsg && (
        <p className="mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm">
          {purgeMsg}
        </p>
      )}

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
            className={cn(
              'rounded-[var(--radius)] border bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)]',
              'highlight' in k && k.highlight
                ? 'border-[var(--color-primary)]/40 ring-1 ring-[var(--color-primary)]/20'
                : 'border-[var(--color-border)]',
            )}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--color-text-muted)]">{k.label}</span>
              <k.icon className={cn('h-4 w-4', k.tone)} />
            </div>
            <p className="font-display text-2xl font-bold">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {chronusKpis.map((k) => (
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
                  <th>Motos</th>
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
                    <td>{r.motoCount ?? '—'}</td>
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
                          <Link to={`/definir-placas?routeId=${r.id}`}>
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
        <Card title="Roteiros por status">
          <div className="space-y-2">
            {(data.routesByStatus ?? []).length === 0 && (
              <p className="text-sm text-[var(--color-text-muted)]">Sem roteiros ativos.</p>
            )}
            {(data.routesByStatus ?? []).map((r) => (
              <div key={r.status} className="flex items-center justify-between text-sm">
                <span>{statusLabels[r.status] ?? r.status}</span>
                <span className="font-display font-semibold">{r.count}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Relatórios rápidos">
          <div className="flex flex-wrap gap-2">
            {[
              { type: 'disponiveis', label: 'Placas disponíveis' },
              { type: 'diario', label: 'Viagens do dia' },
              { type: 'frota', label: 'Frota completa' },
              { type: 'concessionarias', label: 'Concessionárias' },
            ].map((r) => (
              <Button
                key={r.type}
                size="sm"
                variant="secondary"
                disabled={reportLoading === r.type}
                onClick={() => void quickReport(r.type)}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                {reportLoading === r.type ? 'Baixando…' : r.label}
              </Button>
            ))}
          </div>
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">
            Exportações em Excel. Relatórios completos em{' '}
            <Link to="/relatorios" className="text-[var(--color-primary)] hover:underline">
              Relatórios
            </Link>
            .
          </p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
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

      <ConfirmModal
        open={purgeOpen}
        onClose={() => setPurgeOpen(false)}
        title="Remover roteiros cancelados"
        message="Isso apaga permanentemente todos os roteiros com status Cancelado (incluindo testes). Esta ação não pode ser desfeita."
        confirmLabel="Remover permanentemente"
        danger
        loading={purgeMutation.isPending}
        onConfirm={() => purgeMutation.mutate()}
      />
    </div>
  )
}
