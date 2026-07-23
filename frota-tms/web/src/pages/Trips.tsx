import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Trip } from '../types'
import {
  PageHeader,
  SearchInput,
  Select,
  PlateBadge,
  Spinner,
  EmptyState,
  Badge,
  Button,
  Modal,
  Textarea,
} from '../components/ui'
import { delayReasonPresets, tripStatusLabels } from '../lib/labels'
import { formatDate } from '../lib/format'
import { cn } from '../lib/cn'
import { useAuthStore } from '../stores/auth'

export function Trips() {
  const qc = useQueryClient()
  const canOperate = useAuthStore((s) => s.hasRole('ADMIN', 'OPERACAO'))
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [reportTrip, setReportTrip] = useState<Trip | null>(null)
  const [preset, setPreset] = useState('')
  const [reason, setReason] = useState('')
  const [markUnavailable, setMarkUnavailable] = useState(false)
  const [error, setError] = useState('')

  const { data = [], isLoading } = useQuery({
    queryKey: ['trips', status],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (status) params.status = status
      return (await api.get<Trip[]>('/trips', { params })).data
    },
  })

  const reportMutation = useMutation({
    mutationFn: async () => {
      if (!reportTrip) return
      const text = [preset && preset !== 'Outro (descrever abaixo)' ? preset : '', reason.trim()]
        .filter(Boolean)
        .join(' — ')
      return api.post(`/trips/${reportTrip.id}/delay-report`, {
        reason: text,
        markUnavailable,
        unavailableReason: markUnavailable ? text : undefined,
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['trips'] })
      void qc.invalidateQueries({ queryKey: ['returns'] })
      void qc.invalidateQueries({ queryKey: ['vehicles'] })
      setReportTrip(null)
      setPreset('')
      setReason('')
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

  const filtered = data.filter((t) => {
    if (!q) return true
    const s = q.toLowerCase()
    return (
      t.vehicle.plate.toLowerCase().includes(s) ||
      t.dealership.name.toLowerCase().includes(s) ||
      (t.driverName ?? '').toLowerCase().includes(s) ||
      (t.route?.name ?? '').toLowerCase().includes(s) ||
      (t.delayReason ?? '').toLowerCase().includes(s)
    )
  })

  return (
    <div>
      <PageHeader
        title="Viagens"
        description="Saída = data do roteiro · Previsão automática pela distância · Informe atraso/indisponibilidade"
      />

      {error && (
        <p className="mb-4 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <SearchInput value={q} onChange={setQ} placeholder="Filtrar por placa, destino, motorista…" />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={Object.entries(tripStatusLabels).map(([value, label]) => ({ value, label }))}
          placeholder="Todos os status"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="Nenhuma viagem encontrada" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Placa</th>
                <th>Destino</th>
                <th>Roteiro</th>
                <th>Saída</th>
                <th>Previsão</th>
                <th>Retorno</th>
                <th>Status</th>
                <th>Justificativa</th>
                <th>Responsável</th>
                {canOperate && <th />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const overdue = !!t.overdue
                const open = t.status === 'EM_ANDAMENTO' || t.status === 'ATRASADO'
                return (
                  <tr key={t.id} className={cn(overdue && 'bg-red-500/5')}>
                    <td>
                      <PlateBadge plate={t.vehicle.plate} color={t.color ?? 'red'} />
                    </td>
                    <td>{t.dealership.name}</td>
                    <td>{t.route?.name ?? '—'}</td>
                    <td>{formatDate(t.departureAt)}</td>
                    <td className={cn(overdue && 'font-semibold text-[var(--color-danger)]')}>
                      {formatDate(t.expectedReturn)}
                    </td>
                    <td>{t.returnedAt ? formatDate(t.returnedAt) : '—'}</td>
                    <td>
                      <div className="flex flex-col gap-1">
                        <Badge tone={overdue ? 'danger' : t.status === 'RETORNOU' ? 'success' : 'info'}>
                          {tripStatusLabels[t.status]}
                        </Badge>
                        {t.unavailableReason && (
                          <Badge tone="warning">Indisponível</Badge>
                        )}
                      </div>
                    </td>
                    <td className="max-w-[220px]">
                      {t.delayReason ? (
                        <span className="text-sm" title={t.delayReason}>
                          {t.delayReason}
                          {t.delayReportedBy && (
                            <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">
                              por {t.delayReportedBy.name}
                            </span>
                          )}
                        </span>
                      ) : overdue && open ? (
                        <span className="text-xs font-medium text-[var(--color-danger)]">
                          Pendente de justificativa
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{t.assignedBy.name}</td>
                    {canOperate && (
                      <td>
                        {open && (
                          <Button
                            size="sm"
                            variant={t.needsDelayReason ? 'primary' : 'secondary'}
                            onClick={() => {
                              setError('')
                              setReportTrip(t)
                              setPreset('')
                              setReason(t.delayReason ?? '')
                              setMarkUnavailable(!!t.unavailableReason)
                            }}
                          >
                            {t.delayReason ? 'Atualizar' : 'Informar'}
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!reportTrip}
        onClose={() => setReportTrip(null)}
        title={`Informe — ${reportTrip?.vehicle.plate ?? ''}`}
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            Use quando o veículo atrasar a previsão ou estiver indisponível para novo carregamento.
            A justificativa fica registrada no histórico.
          </p>
          <Select
            label="Motivo"
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            options={delayReasonPresets.map((label) => ({ value: label, label }))}
            placeholder="Selecione um motivo"
          />
          <Textarea
            label="Detalhe / justificativa"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Descreva o que aconteceu…"
            required
          />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={markUnavailable}
              onChange={(e) => setMarkUnavailable(e.target.checked)}
            />
            <span>
              Marcar veículo como <strong>indisponível</strong> (bloqueado) até o retorno — não
              entra em novo carregamento.
            </span>
          </label>
          {error && (
            <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReportTrip(null)}>
              Cancelar
            </Button>
            <Button
              loading={reportMutation.isPending}
              disabled={reason.trim().length < 5 && !preset}
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
