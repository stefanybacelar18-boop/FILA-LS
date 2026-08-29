import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, FileSpreadsheet, Moon, Pencil } from 'lucide-react'
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
  Modal,
} from '../components/ui'
import { formatDate } from '../lib/format'
import { tripStatusLabels } from '../lib/labels'
import { cn } from '../lib/cn'
import { useAuthStore } from '../stores/auth'

type PernoiteTrip = PernoitesData['trips'][number]

const MANUAL_NIGHT_OPTIONS = [1, 2, 3] as const

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

function AdjustPernoiteModal({
  trip,
  onClose,
}: {
  trip: PernoiteTrip | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [nights, setNights] = useState(1)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!trip) return
    setNights(trip.nights)
    setError('')
  }, [trip])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!trip) return
      return api.patch(`/trips/${trip.id}/pernoite`, { nights })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['pernoites'] })
      await qc.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Não foi possível salvar o ajuste.',
      )
    },
  })

  if (!trip) return null

  return (
    <Modal
      open
      onClose={onClose}
      title="Ajustar pernoites"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saveMutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-text-muted)]">
          Quase sempre o motorista volta no dia seguinte — <strong>1 pernoite</strong> por roteiro.
          Marque 2 ou 3 só se ele realmente ficou mais noites. As datas da viagem não mudam.
        </p>
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs">
          <p>
            <span className="text-[var(--color-text-muted)]">Motorista:</span>{' '}
            {trip.driverName ?? '—'}
          </p>
          <p>
            <span className="text-[var(--color-text-muted)]">Placa:</span> {trip.plate}
          </p>
          <p>
            <span className="text-[var(--color-text-muted)]">Datas:</span> {formatDate(trip.departureAt)}{' '}
            → {formatDate(trip.returnedAt ?? trip.expectedReturn)}
            {trip.calendarNights !== trip.nights && (
              <span className="ml-1 text-[var(--color-text-muted)]">
                (calendário sugeriria {trip.calendarNights})
              </span>
            )}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {MANUAL_NIGHT_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setNights(n)}
              className={cn(
                'rounded-[var(--radius)] border px-3 py-3 text-center transition-colors',
                nights === n
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] hover:bg-[var(--color-surface-2)]',
              )}
            >
              <span className="block font-display text-xl font-semibold tabular-nums">{n}</span>
              <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
                {n === 1 ? 'Padrão' : n === 2 ? 'Duas noites' : 'Três noites'}
              </span>
            </button>
          ))}
        </div>
        {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
      </div>
    </Modal>
  )
}

export function Pernoites() {
  const [offset, setOffset] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [editing, setEditing] = useState<PernoiteTrip | null>(null)
  const isAdmin = useAuthStore((s) => s.hasRole('ADMIN'))

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
        retorno no mesmo dia). Cada roteiro conta no máximo <strong>1 pernoite</strong> (volta no
        dia seguinte), mesmo se as datas no sistema abrangem mais dias.
        {isAdmin ? (
          <>
            {' '}
            O administrador pode clicar no número da coluna Pernoites para marcar 2 ou 3 quando isso
            realmente acontecer.
          </>
        ) : null}{' '}
        O total é agrupado por <strong>motorista</strong>, somando todas as viagens no período — mesmo
        que tenha trocado de veículo.
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
            {isAdmin ? (
              <li>
                Se um roteiro teve 2 pernoites de verdade, clique no número em{' '}
                <strong>Pernoites</strong> e ajuste. O selo <strong>manual</strong> aparece nesses
                casos.
              </li>
            ) : null}
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
                    <td className="py-2.5 pr-3 text-center">
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => setEditing(t)}
                          title="Ajustar pernoites"
                          className="inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 font-semibold tabular-nums hover:bg-[var(--color-surface-2)]"
                        >
                          {t.nights}
                          <Pencil className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
                          {t.nightsOverridden ? (
                            <Badge tone="info" className="font-medium">
                              manual
                            </Badge>
                          ) : null}
                        </button>
                      ) : (
                        <span className="inline-flex items-center justify-center gap-1 font-semibold tabular-nums">
                          {t.nights}
                          {t.nightsOverridden ? (
                            <Badge tone="info" className="font-medium">
                              manual
                            </Badge>
                          ) : null}
                        </span>
                      )}
                    </td>
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

      <AdjustPernoiteModal trip={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
