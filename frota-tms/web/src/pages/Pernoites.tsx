import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, FileSpreadsheet, MapPinned, Moon, Pencil } from 'lucide-react'
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
  Input,
} from '../components/ui'
import { combineDateAndTime, formatDate, toInputDate } from '../lib/format'
import { addCalendarDaysYmd, calendarNightsBetween, chargedPernoiteNights } from '../lib/pernoite'
import { hasActivePriority } from '../lib/route-priority'
import { RouteLoadTable } from '../components/RouteLoadCard'
import { tripStatusLabels } from '../lib/labels'
import { cn } from '../lib/cn'
import { useAuthStore } from '../stores/auth'

type PernoiteTrip = PernoitesData['trips'][number]

const MANUAL_NIGHT_OPTIONS = [
  { nights: 0, label: 'Não foi' },
  { nights: 1, label: 'Padrão' },
  { nights: 2, label: 'Duas noites' },
  { nights: 3, label: 'Três noites' },
] as const

function PernoiteOverrideBadge({ nights, overridden }: { nights: number; overridden: boolean }) {
  if (!overridden) return null
  return (
    <Badge tone={nights === 0 ? 'warning' : 'info'} className="font-medium">
      {nights === 0 ? 'não foi' : 'manual'}
    </Badge>
  )
}

function RouteStopsModal({
  trip,
  onClose,
}: {
  trip: PernoiteTrip | null
  onClose: () => void
}) {
  if (!trip) return null
  const dests = trip.destinations ?? []
  const motoTotal =
    trip.totalMotoCount != null
      ? trip.totalMotoCount
      : dests.reduce((sum, d) => sum + (d.motoCount ?? 0), 0) || null

  return (
    <Modal
      open
      onClose={onClose}
      title={trip.routeName ? `Roteiro · ${trip.routeName}` : 'Roteiro de entrega'}
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs">
          <p>
            <span className="text-[var(--color-text-muted)]">Motorista:</span> {trip.driverName ?? '—'}
          </p>
          <p>
            <span className="text-[var(--color-text-muted)]">Placa:</span> {trip.plate}
          </p>
          <p>
            <span className="text-[var(--color-text-muted)]">Saída:</span> {formatDate(trip.departureAt)}
            {' · '}
            <span className="text-[var(--color-text-muted)]">Retorno:</span>{' '}
            {formatDate(trip.returnedAt ?? trip.expectedReturn)}
          </p>
          <p>
            {dests.length} parada{dests.length !== 1 ? 's' : ''}
            {motoTotal ? ` · ${motoTotal} motos` : ''}
          </p>
        </div>
        {hasActivePriority(trip) && trip.priorityExpiryDate ? (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Prioridade · vencimento {formatDate(trip.priorityExpiryDate)}
            {trip.priorityNotes ? ` — ${trip.priorityNotes}` : ''}
          </p>
        ) : null}
        {trip.routeNotes ? (
          <p className="text-xs text-[var(--color-text-muted)]">
            <span className="font-medium text-[var(--color-text)]">Obs. roteiro:</span> {trip.routeNotes}
          </p>
        ) : null}
        {dests.length === 0 ? (
          <EmptyState title="Sem paradas" description="Não há destinos cadastrados neste roteiro." />
        ) : (
          <RouteLoadTable destinations={dests} className="mt-0 border-t-0 pt-0" />
        )}
      </div>
    </Modal>
  )
}

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
  const [arrivalDate, setArrivalDate] = useState('')
  const [nights, setNights] = useState(1)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!trip) return
    setArrivalDate(toInputDate(trip.returnedAt ?? trip.expectedReturn))
    setNights(trip.nights)
    setError('')
  }, [trip])

  const departureYmd = trip ? toInputDate(trip.departureAt) : ''
  const calendarNights = trip ? calendarNightsBetween(departureYmd, arrivalDate) : 0
  const charged = chargedPernoiteNights(calendarNights)

  function applyShortcut(n: 0 | 1) {
    if (!departureYmd) return
    setArrivalDate(addCalendarDaysYmd(departureYmd, n))
    setNights(n)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!trip || !arrivalDate) return
      const returnedAt = combineDateAndTime(arrivalDate, '18:00').toISOString()
      await api.patch(`/trips/${trip.id}/arrival`, {
        returnedAt,
        nights,
      })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['pernoites'] })
      await qc.invalidateQueries({ queryKey: ['dashboard'] })
      await qc.invalidateQueries({ queryKey: ['returns'] })
      await qc.invalidateQueries({ queryKey: ['trips'] })
      await qc.invalidateQueries({ queryKey: ['vehicles'] })
      onClose()
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Não foi possível salvar a chegada real.',
      )
    },
  })

  if (!trip) return null

  return (
    <Modal
      open
      onClose={onClose}
      title="Ajustar chegada real"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saveMutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            loading={saveMutation.isPending}
            disabled={!arrivalDate}
          >
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-text-muted)]">
          Se esqueceram de retornar a placa, o sistema usa o dia do clique e pode cobrar pernoite a
          mais. Informe o dia em que o veículo <strong>realmente chegou</strong>. O RH usa essa data
          — sem cobrança extra.
        </p>
        {!trip.confirmed ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            A placa ainda está em viagem. Salvar também registra o retorno nesta data e libera o
            veículo.
          </p>
        ) : null}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs">
          <p>
            <span className="text-[var(--color-text-muted)]">Motorista:</span>{' '}
            {trip.driverName ?? '—'}
          </p>
          <p>
            <span className="text-[var(--color-text-muted)]">Placa:</span> {trip.plate}
          </p>
          <p>
            <span className="text-[var(--color-text-muted)]">Saída:</span> {formatDate(trip.departureAt)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => applyShortcut(0)}
            className={cn(
              'rounded-[var(--radius)] border px-3 py-3 text-center transition-colors',
              calendarNights === 0
                ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)] text-[var(--color-primary)]'
                : 'border-[var(--color-border)] hover:bg-[var(--color-surface-2)]',
            )}
          >
            <span className="block text-sm font-semibold">Mesmo dia</span>
            <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
              0 pernoites
            </span>
          </button>
          <button
            type="button"
            onClick={() => applyShortcut(1)}
            className={cn(
              'rounded-[var(--radius)] border px-3 py-3 text-center transition-colors',
              calendarNights === 1
                ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)] text-[var(--color-primary)]'
                : 'border-[var(--color-border)] hover:bg-[var(--color-surface-2)]',
            )}
          >
            <span className="block text-sm font-semibold">Dia seguinte</span>
            <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
              1 pernoite
            </span>
          </button>
        </div>
        <Input
          label="Chegada real"
          type="date"
          value={arrivalDate}
          min={departureYmd}
          onChange={(e) => {
            setArrivalDate(e.target.value)
            setNights(chargedPernoiteNights(calendarNightsBetween(departureYmd, e.target.value)))
          }}
        />
        <p className="text-sm">
          Para o RH isso conta <strong>{nights} pernoite{nights === 1 ? '' : 's'}</strong>
          {nights !== charged ? (
            <span className="text-[var(--color-text-muted)]">
              {' '}
              (calendário: {charged})
            </span>
          ) : null}
          .
        </p>
        <div>
          <p className="mb-2 text-xs font-medium text-[var(--color-text-muted)]">
            Cobrar quantidade diferente (raro)
          </p>
          <div className="grid grid-cols-4 gap-2">
            {MANUAL_NIGHT_OPTIONS.map((opt) => (
              <button
                key={opt.nights}
                type="button"
                onClick={() => setNights(opt.nights)}
                className={cn(
                  'rounded-[var(--radius)] border px-2 py-2 text-center transition-colors',
                  nights === opt.nights
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)] text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] hover:bg-[var(--color-surface-2)]',
                )}
              >
                <span className="block font-display text-lg font-semibold tabular-nums">
                  {opt.nights}
                </span>
                <span className="text-[9px] uppercase tracking-wide text-[var(--color-text-muted)]">
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
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
  const [viewingRoute, setViewingRoute] = useState<PernoiteTrip | null>(null)
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
            O administrador pode clicar no número da coluna Pernoites para informar a{' '}
            <strong>chegada real</strong> (mesmo dia = 0, dia seguinte = 1). Use isso quando
            esqueceram de retornar a placa e o sistema cobraria noite a mais.
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
              Clique no <strong>destino</strong> para ver o roteiro de entrega (paradas, motos e
              vencimento).
            </li>
            <li>
              <strong>Confirmado</strong> = retorno já registrado; <strong>Previsto</strong> = ainda
              em viagem ou retorno pendente.
            </li>
            {isAdmin ? (
              <li>
                Se esqueceram de retornar a placa, clique no número em <strong>Pernoites</strong> e
                informe a chegada real. <strong>Mesmo dia</strong> = 0 (sem cobrança extra);{' '}
                <strong>dia seguinte</strong> = 1. O selo <strong>manual</strong> /{' '}
                <strong>não foi</strong> aparece se a quantidade cobrada for diferente do calendário.
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
                  <tr
                    key={t.id}
                    className={cn('align-middle', t.nights === 0 && 'opacity-70')}
                  >
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
                      <button
                        type="button"
                        onClick={() => setViewingRoute(t)}
                        title="Ver roteiro de entrega"
                        className="max-w-[220px] rounded-md px-1 py-0.5 text-left hover:bg-[var(--color-surface-2)]"
                      >
                        <span className="flex items-center gap-1 font-medium text-[var(--color-primary)]">
                          <MapPinned className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{t.dealershipName}</span>
                        </span>
                        <span className="block truncate text-xs text-[var(--color-text-muted)]">
                          {t.dealershipCity}
                          {(t.destinations?.length ?? 0) > 1
                            ? ` · ${t.destinations.length} paradas`
                            : ''}
                        </span>
                      </button>
                    </td>
                    <td className="py-2.5 pr-3 text-center">
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => setEditing(t)}
                          title="Ajustar chegada real"
                          className="inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 font-semibold tabular-nums hover:bg-[var(--color-surface-2)]"
                        >
                          {t.nights}
                          <Pencil className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
                          <PernoiteOverrideBadge nights={t.nights} overridden={t.nightsOverridden} />
                        </button>
                      ) : (
                        <span className="inline-flex items-center justify-center gap-1 font-semibold tabular-nums">
                          {t.nights}
                          <PernoiteOverrideBadge nights={t.nights} overridden={t.nightsOverridden} />
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
      <RouteStopsModal trip={viewingRoute} onClose={() => setViewingRoute(null)} />
    </div>
  )
}
