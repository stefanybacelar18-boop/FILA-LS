import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { ReturnsPanel, Trip } from '../types'
import {
  PageHeader,
  PlateBadge,
  Spinner,
  EmptyState,
  Button,
  Badge,
  Modal,
  Textarea,
  Select,
} from '../components/ui'
import { delayReasonPresets } from '../lib/labels'
import { formatDate } from '../lib/format'
import { cn } from '../lib/cn'

function TripSection({
  title,
  trips,
  tone,
  onReturn,
  onReport,
}: {
  title: string
  trips: Trip[]
  tone: string
  onReturn: (trip: Trip) => void
  onReport: (trip: Trip) => void
}) {
  return (
    <section className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <h2 className={cn('font-display text-sm font-semibold', tone)}>{title}</h2>
        <Badge>{trips.length}</Badge>
      </div>
      {trips.length === 0 ? (
        <EmptyState title="Nenhuma viagem" className="py-8" />
      ) : (
        <div className="table-wrap border-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>Placa</th>
                <th>Destino</th>
                <th>Saída</th>
                <th>Previsão</th>
                <th>Justificativa</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {trips.map((t) => (
                <tr key={t.id} className={cn(t.overdue && 'bg-red-500/5')}>
                  <td>
                    <PlateBadge plate={t.vehicle.plate} color={t.color ?? 'red'} />
                    {t.unavailableReason && (
                      <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">
                        Indisponível
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="font-medium">{t.dealership.name}</div>
                    <div className="text-xs text-[var(--color-text-muted)]">{t.route?.name}</div>
                  </td>
                  <td>{formatDate(t.departureAt)}</td>
                  <td className={cn(t.overdue && 'font-semibold text-[var(--color-danger)]')}>
                    {formatDate(t.expectedReturn)}
                  </td>
                  <td className="max-w-[200px] text-sm">
                    {t.delayReason ? (
                      t.delayReason
                    ) : t.overdue ? (
                      <span className="text-[var(--color-danger)]">Pendente</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap justify-end gap-1">
                      {(t.overdue || !t.delayReason) && (
                        <Button size="sm" variant="secondary" onClick={() => onReport(t)}>
                          Informar
                        </Button>
                      )}
                      <Button size="sm" onClick={() => onReturn(t)}>
                        Retornou
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function Returns() {
  const qc = useQueryClient()
  const [confirmTrip, setConfirmTrip] = useState<Trip | null>(null)
  const [reportTrip, setReportTrip] = useState<Trip | null>(null)
  const [delayReason, setDelayReason] = useState('')
  const [preset, setPreset] = useState('')
  const [markUnavailable, setMarkUnavailable] = useState(false)
  const [error, setError] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['returns'],
    queryFn: async () => (await api.get<ReturnsPanel>('/trips/returns')).data,
  })

  function composedReason() {
    return [preset && preset !== 'Outro (descrever abaixo)' ? preset : '', delayReason.trim()]
      .filter(Boolean)
      .join(' — ')
  }

  const returnMutation = useMutation({
    mutationFn: async () => {
      if (!confirmTrip) return
      const body: { delayReason?: string } = {}
      if (confirmTrip.overdue || confirmTrip.status === 'ATRASADO') {
        body.delayReason = composedReason() || confirmTrip.delayReason || undefined
      }
      return api.post(`/trips/${confirmTrip.id}/return`, body)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['returns'] })
      void qc.invalidateQueries({ queryKey: ['trips'] })
      void qc.invalidateQueries({ queryKey: ['vehicles'] })
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
      setConfirmTrip(null)
      setDelayReason('')
      setPreset('')
      setError('')
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Não foi possível registrar o retorno.',
      )
    },
  })

  const reportMutation = useMutation({
    mutationFn: async () => {
      if (!reportTrip) return
      const text = composedReason()
      return api.post(`/trips/${reportTrip.id}/delay-report`, {
        reason: text,
        markUnavailable,
        unavailableReason: markUnavailable ? text : undefined,
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['returns'] })
      void qc.invalidateQueries({ queryKey: ['trips'] })
      void qc.invalidateQueries({ queryKey: ['vehicles'] })
      setReportTrip(null)
      setDelayReason('')
      setPreset('')
      setMarkUnavailable(false)
      setError('')
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Não foi possível registrar o informe.',
      )
    },
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-[var(--color-danger)]">
        Não foi possível carregar os retornos. Tente novamente.
      </p>
    )
  }

  const needsJustification =
    !!confirmTrip &&
    (confirmTrip.overdue || confirmTrip.status === 'ATRASADO') &&
    !confirmTrip.delayReason

  return (
    <div>
      <PageHeader
        title="Retornos"
        description="Confirme retornos. Em atraso, a justificativa é obrigatória para liberar novo carregamento."
      />

      {error && (
        <p className="mb-4 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <div className="grid gap-4">
        <TripSection
          title="Atraso"
          trips={data.overdue}
          tone="text-[var(--color-danger)]"
          onReturn={(t) => {
            setError('')
            setConfirmTrip(t)
            setPreset('')
            setDelayReason(t.delayReason ?? '')
          }}
          onReport={(t) => {
            setError('')
            setReportTrip(t)
            setPreset('')
            setDelayReason(t.delayReason ?? '')
            setMarkUnavailable(!!t.unavailableReason)
          }}
        />
        <TripSection
          title="Hoje"
          trips={data.today}
          tone="text-blue-600"
          onReturn={(t) => {
            setError('')
            setConfirmTrip(t)
            setDelayReason('')
            setPreset('')
          }}
          onReport={(t) => {
            setError('')
            setReportTrip(t)
            setPreset('')
            setDelayReason('')
            setMarkUnavailable(false)
          }}
        />
        <TripSection
          title="Amanhã"
          trips={data.tomorrow}
          tone="text-orange-600"
          onReturn={(t) => {
            setError('')
            setConfirmTrip(t)
            setDelayReason('')
            setPreset('')
          }}
          onReport={(t) => {
            setError('')
            setReportTrip(t)
            setPreset('')
            setDelayReason('')
            setMarkUnavailable(false)
          }}
        />
        <TripSection
          title="Em 2 dias"
          trips={data.in2Days}
          tone="text-[var(--color-text-muted)]"
          onReturn={(t) => {
            setError('')
            setConfirmTrip(t)
            setDelayReason('')
            setPreset('')
          }}
          onReport={(t) => {
            setError('')
            setReportTrip(t)
            setPreset('')
            setDelayReason('')
            setMarkUnavailable(false)
          }}
        />
        <TripSection
          title="Depois (3+ dias)"
          trips={data.later ?? []}
          tone="text-[var(--color-text-muted)]"
          onReturn={(t) => {
            setError('')
            setConfirmTrip(t)
            setDelayReason('')
            setPreset('')
          }}
          onReport={(t) => {
            setError('')
            setReportTrip(t)
            setPreset('')
            setDelayReason('')
            setMarkUnavailable(false)
          }}
        />
      </div>

      <Modal
        open={!!confirmTrip}
        onClose={() => setConfirmTrip(null)}
        title="Confirmar retorno"
      >
        <div className="space-y-3">
          <p className="text-sm">
            Confirma o retorno da placa <strong>{confirmTrip?.vehicle.plate}</strong>? O veículo
            voltará para disponível e poderá carregar de novo.
          </p>
          {(needsJustification || confirmTrip?.overdue || confirmTrip?.status === 'ATRASADO') && (
            <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                Fora da previsão — justifique o atraso (obrigatório)
              </p>
              {confirmTrip?.delayReason && (
                <p className="text-xs text-[var(--color-text-muted)]">
                  Já informado: {confirmTrip.delayReason}
                </p>
              )}
              <Select
                label="Motivo"
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
                options={delayReasonPresets.map((label) => ({ value: label, label }))}
                placeholder="Selecione"
              />
              <Textarea
                label="Detalhe"
                value={delayReason}
                onChange={(e) => setDelayReason(e.target.value)}
                rows={3}
                placeholder="Por que não retornou na data prevista?"
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmTrip(null)}>
              Cancelar
            </Button>
            <Button
              loading={returnMutation.isPending}
              onClick={() => returnMutation.mutate()}
            >
              Confirmar retorno
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!reportTrip}
        onClose={() => setReportTrip(null)}
        title={`Informe — ${reportTrip?.vehicle.plate ?? ''}`}
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            Informe da empresa terceira: atraso na previsão ou veículo indisponível.
          </p>
          <Select
            label="Motivo"
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            options={delayReasonPresets.map((label) => ({ value: label, label }))}
            placeholder="Selecione um motivo"
          />
          <Textarea
            label="Justificativa"
            value={delayReason}
            onChange={(e) => setDelayReason(e.target.value)}
            rows={3}
            placeholder="Descreva o motivo…"
          />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={markUnavailable}
              onChange={(e) => setMarkUnavailable(e.target.checked)}
            />
            <span>
              Marcar como <strong>indisponível</strong> (bloqueado) até retornar
            </span>
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReportTrip(null)}>
              Cancelar
            </Button>
            <Button
              loading={reportMutation.isPending}
              disabled={composedReason().length < 5}
              onClick={() => reportMutation.mutate()}
            >
              Salvar informe
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
