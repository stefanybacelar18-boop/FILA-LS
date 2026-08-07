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
import { Truck, MapPinned, Tags, AlertTriangle, Upload, Trash2, Moon } from 'lucide-react'
import { api } from '../lib/api'
import type { DashboardData } from '../types'
import { PageHeader, Spinner, Card, Button, ConfirmModal, PlateBadge } from '../components/ui'
import { formatDate } from '../lib/format'
import { cn } from '../lib/cn'
import { useAuthStore } from '../stores/auth'

function RankingRow({
  rank,
  title,
  subtitle,
  value,
  valueLabel,
}: {
  rank: number
  title: string
  subtitle?: string
  value: number
  valueLabel: string
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
          rank === 1
            ? 'bg-[var(--color-primary)] text-white'
            : 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]',
        )}
      >
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--color-text)]">{title}</p>
        {subtitle && (
          <p className="truncate text-xs text-[var(--color-text-muted)]">{subtitle}</p>
        )}
      </div>
      <div className="text-right">
        <p className="font-display text-lg font-semibold tabular-nums">{value}</p>
        <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
          {valueLabel}
        </p>
      </div>
    </div>
  )
}

function SummaryKpi({
  label,
  value,
  icon: Icon,
  tone,
  href,
}: {
  label: string
  value: number
  icon: typeof Truck
  tone: string
  href?: string
}) {
  const inner = (
    <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 transition hover:border-[var(--color-border-strong)]">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
        <Icon className={cn('h-4 w-4', tone)} />
      </div>
      <p className="font-display text-2xl font-bold tabular-nums">{value}</p>
    </div>
  )
  if (href) {
    return (
      <Link to={href} className="block">
        {inner}
      </Link>
    )
  }
  return inner
}

export function Dashboard() {
  const qc = useQueryClient()
  const isAdmin = useAuthStore((s) => s.hasRole('ADMIN'))
  const [purgeOpen, setPurgeOpen] = useState(false)
  const [purgeMsg, setPurgeMsg] = useState('')

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
          ? `${result.deleted} roteiro(s) cancelado(s) removido(s).`
          : 'Nenhum roteiro cancelado encontrado.',
      )
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
      void qc.invalidateQueries({ queryKey: ['routes'] })
    },
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

  const { summary, period } = data
  const chartData = data.tripsPerDay.map((d) => ({
    ...d,
    label: formatDate(d.date, 'dd/MM'),
  }))

  const alerts = [
    summary.vencimentoUrgente > 0 && {
      text: `${summary.vencimentoUrgente} roteiro(s) com vencimento urgente`,
      href: '/roteiros?tab=prioridades',
      tone: 'danger' as const,
    },
    summary.aguardandoPlaca > 0 && {
      text: `${summary.aguardandoPlaca} aguardando placa`,
      href: '/definir-placas',
      tone: 'info' as const,
    },
    summary.viagensAtrasadas > 0 && {
      text: `${summary.viagensAtrasadas} viagem(ns) em atraso`,
      href: '/retornos',
      tone: 'warning' as const,
    },
  ].filter(Boolean) as { text: string; href: string; tone: 'danger' | 'info' | 'warning' }[]

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Dashboard"
        description="Visão da operação e desempenho recente"
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
        <div className="mb-5 flex flex-wrap gap-2">
          {alerts.map((a) => (
            <Link
              key={a.text}
              to={a.href}
              className={cn(
                'inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition hover:opacity-90',
                a.tone === 'danger' && 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
                a.tone === 'warning' &&
                  'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200',
                a.tone === 'info' &&
                  'border-teal-500/30 bg-teal-500/10 text-teal-800 dark:text-teal-200',
              )}
            >
              {a.text}
            </Link>
          ))}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryKpi
          label="Placas disponíveis"
          value={summary.placasDisponiveis}
          icon={Truck}
          tone="text-green-600"
          href="/frota"
        />
        <SummaryKpi
          label="Em viagem"
          value={summary.emViagem}
          icon={MapPinned}
          tone="text-blue-600"
          href="/retornos"
        />
        <SummaryKpi
          label="Aguardando placa"
          value={summary.aguardandoPlaca}
          icon={Tags}
          tone="text-[var(--color-primary)]"
          href="/definir-placas"
        />
        <SummaryKpi
          label="Viagens atrasadas"
          value={summary.viagensAtrasadas}
          icon={AlertTriangle}
          tone="text-red-600"
          href="/retornos"
        />
      </div>

      <Card className="mb-6" title="Viagens por dia">
        <p className="-mt-2 mb-4 text-xs text-[var(--color-text-muted)]">
          Quantidade de viagens com saída em cada dia — últimos {period.tripsChartDays} dias.
        </p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'var(--color-surface-2)' }}
                contentStyle={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  fontSize: 13,
                }}
                formatter={(value) => [`${Number(value ?? 0)} viagem(ns)`, 'Saídas']}
                labelFormatter={(label) => `Dia ${label}`}
              />
              <Bar
                dataKey="count"
                name="Viagens"
                fill="var(--color-primary)"
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Ranking de concessionárias">
          <p className="-mt-2 mb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
            Concessionárias com mais <strong>destinos atendidos</strong> no período — cada viagem
            registrada para a loja conta 1 ponto (últimos {period.rankingDays} dias).
          </p>
          {data.dealershipRanking.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-text-muted)]">
              Nenhuma viagem no período.
            </p>
          ) : (
            <div className="divide-y divide-[var(--color-border)]/80">
              {data.dealershipRanking.map((r, i) => (
                <RankingRow
                  key={r.dealershipId}
                  rank={i + 1}
                  title={r.name}
                  subtitle={r.city}
                  value={r.trips}
                  valueLabel="viagens"
                />
              ))}
            </div>
          )}
        </Card>

        <Card title="Ranking de placas">
          <p className="-mt-2 mb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
            Veículos com mais <strong>saídas em viagem</strong> no período — cada registro de
            viagem conta 1 ponto (últimos {period.rankingDays} dias).
          </p>
          {data.plateRanking.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-text-muted)]">
              Nenhuma viagem no período.
            </p>
          ) : (
            <div className="divide-y divide-[var(--color-border)]/80">
              {data.plateRanking.map((r, i) => (
                <div key={r.vehicleId} className="flex items-center gap-3 py-2.5">
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                      i === 0
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]',
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <PlateBadge plate={r.plate} color="blue" />
                    {r.type && (
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">{r.type}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-display text-lg font-semibold tabular-nums">{r.trips}</p>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
                      viagens
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="mb-6" title="Pernoites LSL — período de folha">
        <div className="-mt-2 mb-3 flex flex-wrap items-start justify-between gap-2">
          <p className="max-w-2xl text-xs leading-relaxed text-[var(--color-text-muted)]">
            Viagens da frota LSL em que o retorno é em <strong>dia diferente da saída</strong> — período
            de {period.pernoites.label}. Total:{' '}
            <strong>{data.pernoiteSummary.totalPernoites} pernoite(s)</strong> em{' '}
            {data.pernoiteSummary.totalTrips} viagem(ns).
          </p>
          <Link
            to="/pernoites"
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-primary)] hover:underline"
          >
            <Moon className="h-3.5 w-3.5" />
            Conferir e exportar
          </Link>
        </div>
        {data.pernoiteRanking.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--color-text-muted)]">
            Nenhuma pernoite no período de folha.
          </p>
        ) : (
          <div className="divide-y divide-[var(--color-border)]/80">
            {data.pernoiteRanking.map((r, i) => (
              <RankingRow
                key={r.vehicleId}
                rank={i + 1}
                title={r.plate}
                subtitle={r.driverName ?? undefined}
                value={r.pernoites}
                valueLabel={r.trips === 1 ? '1 viagem' : `${r.trips} viagens`}
              />
            ))}
          </div>
        )}
      </Card>

      <p className="mt-6 text-center text-xs text-[var(--color-text-muted)]">
        Exportações detalhadas em{' '}
        <Link to="/relatorios" className="text-[var(--color-primary)] hover:underline">
          Relatórios
        </Link>
      </p>

      <ConfirmModal
        open={purgeOpen}
        onClose={() => setPurgeOpen(false)}
        title="Remover roteiros cancelados"
        message="Isso apaga permanentemente todos os roteiros com status Cancelado. Esta ação não pode ser desfeita."
        confirmLabel="Remover permanentemente"
        danger
        loading={purgeMutation.isPending}
        onConfirm={() => purgeMutation.mutate()}
      />
    </div>
  )
}
