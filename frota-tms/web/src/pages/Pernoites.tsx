import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, FileSpreadsheet, Moon } from 'lucide-react'
import { api, downloadReport } from '../lib/api'
import type { PernoitesData } from '../types'
import {
  PageHeader,
  Spinner,
  Card,
  Button,
  PlateBadge,
  Badge,
  EmptyState,
} from '../components/ui'
import { formatDate } from '../lib/format'
import { tripStatusLabels } from '../lib/labels'
import { cn } from '../lib/cn'

function RankingRow({
  rank,
  driverName,
  plates,
  pernoites,
  trips,
}: {
  rank: number
  driverName: string
  plates: string[]
  pernoites: number
  trips: number
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
        <p className="truncate text-sm font-medium text-[var(--color-text)]">{driverName}</p>
        {plates.length > 0 && (
          <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">
            {plates.length === 1 ? `Placa ${plates[0]}` : `Placas: ${plates.join(', ')}`}
          </p>
        )}
      </div>
      <div className="text-right">
        <p className="font-display text-lg font-semibold tabular-nums">{pernoites}</p>
        <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
          {trips === 1 ? '1 viagem' : `${trips} viagens`}
        </p>
      </div>
    </div>
  )
}

export function Pernoites() {
  const [offset, setOffset] = useState(0)
  const [exporting, setExporting] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['pernoites', offset],
    queryFn: async () => (await api.get<PernoitesData>('/pernoites', { params: { offset } })).data,
  })

  async function exportExcel() {
    setExporting(true)
    try {
      await downloadReport(
        `/reports/excel/pernoites-lsl?offset=${offset}`,
        `pernoites-lsl-${offset === 0 ? 'atual' : offset}.xlsx`,
      )
    } finally {
      setExporting(false)
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
    return <p className="text-[var(--color-danger)]">Falha ao carregar pernoites.</p>
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Pernoites LSL"
        description="Conferência de pernoites por motorista para pagamento ao RH"
        actions={
          <Button size="sm" variant="secondary" loading={exporting} onClick={() => void exportExcel()}>
            <FileSpreadsheet className="h-4 w-4" />
            Exportar Excel
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Moon className="h-5 w-5 text-[var(--color-primary)]" />
          <div>
            <p className="text-sm font-medium">Período de folha</p>
            <p className="text-xs text-[var(--color-text-muted)]">{data.period.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOffset((o) => o - 1)}>
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>
          {offset !== 0 && (
            <Button size="sm" variant="ghost" onClick={() => setOffset(0)}>
              Período atual
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setOffset((o) => o + 1)}>
            Próximo
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <p className="mb-5 text-sm leading-relaxed text-[var(--color-text-muted)]">
        <strong>Pernoite</strong> = viagem em que o retorno é em dia diferente da saída (não conta
        retorno no mesmo dia). O total é agrupado por <strong>motorista</strong>, somando todas as
        viagens no período — mesmo que tenha trocado de veículo.
      </p>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5">
          <p className="text-xs font-medium text-[var(--color-text-muted)]">Total de pernoites</p>
          <p className="font-display text-2xl font-bold tabular-nums">{data.summary.totalPernoites}</p>
        </div>
        <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5">
          <p className="text-xs font-medium text-[var(--color-text-muted)]">Viagens com pernoite</p>
          <p className="font-display text-2xl font-bold tabular-nums">{data.summary.totalTrips}</p>
        </div>
        <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5">
          <p className="text-xs font-medium text-[var(--color-text-muted)]">Motoristas no período</p>
          <p className="font-display text-2xl font-bold tabular-nums">
            {data.summary.driversWithPernoites}
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card title="Ranking por motorista">
          {data.ranking.length === 0 ? (
            <EmptyState title="Nenhuma pernoite" description="Não há viagens com pernoite neste período." />
          ) : (
            <div className="divide-y divide-[var(--color-border)]/80">
              {data.ranking.map((r, i) => (
                <RankingRow
                  key={r.driverKey}
                  rank={i + 1}
                  driverName={r.driverName}
                  plates={r.plates}
                  pernoites={r.pernoites}
                  trips={r.trips}
                />
              ))}
            </div>
          )}
        </Card>

        <Card title="Como conferir">
          <ol className="list-decimal space-y-2 pl-4 text-sm leading-relaxed text-[var(--color-text-muted)]">
            <li>Peça ao motorista a quantidade de pernoites do período (16 a 15).</li>
            <li>Localize o <strong>nome do motorista</strong> no ranking ao lado.</li>
            <li>Compare o total — a tabela abaixo lista cada viagem, com a placa usada.</li>
            <li>
              <strong>Confirmado</strong> = retorno já registrado; <strong>Previsto</strong> = ainda
              em viagem ou retorno pendente.
            </li>
          </ol>
          <p className="mt-4 text-xs text-[var(--color-text-muted)]">
            Período padrão: dia 16 do mês anterior até dia 15 do mês vigente. O mesmo critério aparece
            no{' '}
            <Link to="/dashboard" className="text-[var(--color-primary)] hover:underline">
              Dashboard
            </Link>
            .
          </p>
        </Card>
      </div>

      <Card title="Detalhamento por viagem">
        {data.trips.length === 0 ? (
          <EmptyState title="Sem registros" description="Nenhuma viagem com pernoite no período." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
                  <th className="pb-2 pr-3 font-medium">Motorista</th>
                  <th className="pb-2 pr-3 font-medium">Placa</th>
                  <th className="pb-2 pr-3 font-medium">Saída</th>
                  <th className="pb-2 pr-3 font-medium">Retorno</th>
                  <th className="pb-2 pr-3 font-medium">Destino</th>
                  <th className="pb-2 pr-3 font-medium text-center">Pernoites</th>
                  <th className="pb-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]/60">
                {data.trips.map((t) => (
                  <tr key={t.id} className="align-middle">
                    <td className="py-2.5 pr-3 font-medium">{t.driverName ?? '—'}</td>
                    <td className="py-2.5 pr-3">
                      <PlateBadge plate={t.plate} color="blue" />
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums">{formatDate(t.departureAt)}</td>
                    <td className="py-2.5 pr-3 tabular-nums">
                      {t.returnedAt ? formatDate(t.returnedAt) : formatDate(t.expectedReturn)}
                      {!t.confirmed && (
                        <span className="ml-1 text-[10px] text-amber-600">(prev.)</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="block max-w-[180px] truncate">{t.dealershipName}</span>
                      <span className="text-xs text-[var(--color-text-muted)]">{t.dealershipCity}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-center font-semibold tabular-nums">{t.nights}</td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge tone={t.confirmed ? 'success' : 'warning'}>
                          {t.confirmed ? 'Confirmado' : 'Previsto'}
                        </Badge>
                        <span className="text-xs text-[var(--color-text-muted)]">
                          {tripStatusLabels[t.status as keyof typeof tripStatusLabels] ?? t.status}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
