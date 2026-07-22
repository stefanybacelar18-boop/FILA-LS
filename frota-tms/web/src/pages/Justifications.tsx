import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ClipboardList, Paperclip, Route, MapPinned } from 'lucide-react'
import { api, evidenceUrl } from '../lib/api'
import {
  PageHeader,
  SearchInput,
  Spinner,
  EmptyState,
  Badge,
  PlateBadge,
} from '../components/ui'
import { formatDate, formatDateTime } from '../lib/format'
import { tripStatusLabels } from '../lib/labels'

interface RouteUnavailability {
  id: string
  reason: string
  availableAtForecast: string
  createdAt: string
  vehicle: { id: string; plate: string; status: string }
  route: { id: string; name: string; date: string; status: string }
  reportedBy: { id: string; name: string }
}

interface TripDelay {
  id: string
  status: string
  delayReason: string | null
  delayReportedAt: string | null
  expectedReturn: string
  departureAt: string
  returnedAt: string | null
  driverName: string | null
  vehicle: { id: string; plate: string; status: string }
  dealership: { id: string; name: string; city: string }
  route: { id: string; name: string; date: string } | null
  delayReportedBy: { id: string; name: string } | null
  evidences: {
    id: string
    filename: string
    originalName: string
    mimeType: string
    sizeBytes: number
    createdAt: string
  }[]
}

interface JustificationsData {
  routeUnavailabilities: RouteUnavailability[]
  tripDelays: TripDelay[]
  summary: {
    routeUnavailabilities: number
    tripDelays: number
    total: number
  }
}

type Tab = 'todas' | 'roteiros' | 'viagens'

export function Justifications() {
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<Tab>('todas')

  const { data, isLoading, error } = useQuery({
    queryKey: ['justifications'],
    queryFn: async () => (await api.get<JustificationsData>('/justifications')).data,
  })

  const term = q.trim().toUpperCase()

  const routeItems = useMemo(() => {
    const list = data?.routeUnavailabilities ?? []
    if (!term) return list
    return list.filter(
      (r) =>
        r.vehicle.plate.includes(term) ||
        r.route.name.toUpperCase().includes(term) ||
        r.reason.toUpperCase().includes(term) ||
        r.reportedBy.name.toUpperCase().includes(term),
    )
  }, [data?.routeUnavailabilities, term])

  const tripItems = useMemo(() => {
    const list = data?.tripDelays ?? []
    if (!term) return list
    return list.filter(
      (t) =>
        t.vehicle.plate.includes(term) ||
        (t.route?.name ?? '').toUpperCase().includes(term) ||
        (t.delayReason ?? '').toUpperCase().includes(term) ||
        t.dealership.city.toUpperCase().includes(term) ||
        (t.delayReportedBy?.name ?? '').toUpperCase().includes(term),
    )
  }, [data?.tripDelays, term])

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error || !data) {
    return <p className="text-[var(--color-danger)]">Falha ao carregar justificativas.</p>
  }

  const showRoutes = tab === 'todas' || tab === 'roteiros'
  const showTrips = tab === 'todas' || tab === 'viagens'
  const empty =
    (showRoutes ? routeItems.length === 0 : true) && (showTrips ? tripItems.length === 0 : true)

  return (
    <div>
      <PageHeader
        title="Justificativas"
        description="Atrasos e indisponibilidades registrados pela Operação — Admin acompanha tudo aqui"
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-[220px] flex-1">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar placa, roteiro, motivo…" />
        </div>
        <div className="flex gap-1 rounded-[var(--radius)] border border-[var(--color-border)] p-1">
          {(
            [
              { id: 'todas', label: `Todas (${data.summary.total})` },
              { id: 'roteiros', label: `Roteiros (${data.summary.routeUnavailabilities})` },
              { id: 'viagens', label: `Viagens (${data.summary.tripDelays})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={
                tab === t.id
                  ? 'rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white'
                  : 'rounded-md px-3 py-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {empty ? (
        <EmptyState
          title="Nenhuma justificativa encontrada"
          description="Quando a Operação registrar atraso em Retornos ou indisponibilidade em Definir placas, aparece aqui."
        />
      ) : (
        <div className="space-y-6">
          {showRoutes && routeItems.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold">
                <Route className="h-4 w-4 text-[var(--color-text-muted)]" />
                Indisponibilidade por roteiro
              </h2>
              <div className="space-y-2">
                {routeItems.map((r) => (
                  <article
                    key={r.id}
                    className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <PlateBadge plate={r.vehicle.plate} color="black" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{r.route.name}</p>
                          <Badge tone="warning">Roteiro</Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                          Carga {formatDate(r.route.date)} · registrado em{' '}
                          {formatDateTime(r.createdAt)} · por {r.reportedBy.name}
                        </p>
                        <p className="mt-2 text-sm">{r.reason}</p>
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                          Disponibilidade prevista: {formatDate(r.availableAtForecast)}
                        </p>
                      </div>
                      <Link
                        to="/definir-placas"
                        className="text-xs font-medium text-[var(--color-primary)] hover:underline"
                      >
                        Ver definir placas
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {showTrips && tripItems.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold">
                <MapPinned className="h-4 w-4 text-[var(--color-text-muted)]" />
                Atraso / problema na viagem
              </h2>
              <div className="space-y-2">
                {tripItems.map((t) => (
                  <article
                    key={t.id}
                    className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <PlateBadge plate={t.vehicle.plate} color="red" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">
                            {t.dealership.city}
                            <span className="font-normal text-[var(--color-text-muted)]">
                              {' '}
                              · {t.dealership.name}
                            </span>
                          </p>
                          <Badge tone="danger">Viagem</Badge>
                          <Badge tone="default">
                            {tripStatusLabels[t.status as keyof typeof tripStatusLabels] ?? t.status}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                          {t.route?.name ?? 'Sem roteiro'}
                          {t.driverName ? ` · ${t.driverName}` : ''}
                          {' · '}
                          registrado em {formatDateTime(t.delayReportedAt ?? t.departureAt)}
                          {t.delayReportedBy?.name ? ` · por ${t.delayReportedBy.name}` : ''}
                        </p>
                        <p className="mt-2 text-sm">{t.delayReason}</p>
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                          Previsão retorno: {formatDate(t.expectedReturn)}
                          {t.returnedAt ? ` · retornou ${formatDate(t.returnedAt)}` : ''}
                        </p>
                        {t.evidences.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {t.evidences.map((e) => (
                              <a
                                key={e.id}
                                href={evidenceUrl(e.id)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium hover:border-[var(--color-primary)]/40"
                              >
                                <Paperclip className="h-3 w-3" />
                                {e.originalName}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                      <Link
                        to="/retornos"
                        className="text-xs font-medium text-[var(--color-primary)] hover:underline"
                      >
                        Ver retornos
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <p className="mt-6 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        <ClipboardList className="h-3.5 w-3.5" />
        Inclui justificativas de roteiros (Definir placas) e de viagens (Retornos), mesmo após o retorno.
      </p>
    </div>
  )
}
