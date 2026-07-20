import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Paperclip } from 'lucide-react'
import { api, getToken } from '../lib/api'
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
  Input,
} from '../components/ui'
import { delayReasonPresets } from '../lib/labels'
import { formatDate, toInputDate } from '../lib/format'
import { cn } from '../lib/cn'

function TripCard({
  trip,
  onReturn,
  onProblem,
}: {
  trip: Trip
  onReturn: () => void
  onProblem: () => void
}) {
  const evidences = trip.evidences ?? []
  return (
    <div
      className={cn(
        'rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4',
        trip.overdue && 'border-red-500/30 bg-red-500/5',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <PlateBadge plate={trip.vehicle.plate} color={trip.color ?? 'red'} />
          <p className="mt-2 text-sm font-medium">{trip.dealership.name}</p>
          <p className="text-xs text-[var(--color-text-muted)]">{trip.route?.name}</p>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Saída {formatDate(trip.departureAt)} · Previsão{' '}
            <span className={cn(trip.overdue && 'font-semibold text-[var(--color-danger)]')}>
              {formatDate(trip.expectedReturn)}
            </span>
          </p>
          {trip.delayReason && (
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
              Justificativa: {trip.delayReason}
              {evidences.length > 0 ? ` · ${evidences.length} evidência(s)` : ''}
            </p>
          )}
          {trip.unavailableReason && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Marcado indisponível</p>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:min-w-[11rem]">
          <Button onClick={onReturn} className="w-full justify-center">
            <Check className="h-4 w-4" />
            Retornou
          </Button>
          <Button variant="secondary" onClick={onProblem} className="w-full justify-center">
            <AlertTriangle className="h-4 w-4" />
            Problemas na viagem
          </Button>
        </div>
      </div>
      {evidences.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {evidences.map((e) => (
            <a
              key={e.id}
              href={`/uploads/trip-evidence/${e.filename}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-surface-2)]"
            >
              <Paperclip className="h-3 w-3" />
              {e.originalName}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  trips,
  tone,
  onReturn,
  onProblem,
}: {
  title: string
  trips: Trip[]
  tone: string
  onReturn: (t: Trip) => void
  onProblem: (t: Trip) => void
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className={cn('text-base font-semibold', tone)}>{title}</h2>
        <Badge>{trips.length}</Badge>
      </div>
      {trips.length === 0 ? (
        <EmptyState title="Nenhuma viagem" className="py-8" />
      ) : (
        <div className="space-y-3">
          {trips.map((t) => (
            <TripCard
              key={t.id}
              trip={t}
              onReturn={() => onReturn(t)}
              onProblem={() => onProblem(t)}
            />
          ))}
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
  const [newExpectedReturn, setNewExpectedReturn] = useState('')
  const [markUnavailable, setMarkUnavailable] = useState(false)
  const [files, setFiles] = useState<FileList | null>(null)
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
      // Em atraso sem justificativa registrada: bloqueia — deve usar "Problemas"
      if (
        (confirmTrip.overdue || confirmTrip.status === 'ATRASADO') &&
        !confirmTrip.delayReason
      ) {
        throw Object.assign(new Error('DELAY_REQUIRED'), {
          response: {
            data: {
              error:
                'Esta viagem está em atraso. Use “Problemas na viagem” (justificativa + evidências) antes de confirmar o retorno.',
            },
          },
        })
      }
      return api.post(`/trips/${confirmTrip.id}/return`, {
        delayReason: confirmTrip.delayReason || undefined,
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['returns'] })
      void qc.invalidateQueries({ queryKey: ['trips'] })
      void qc.invalidateQueries({ queryKey: ['vehicles'] })
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
      setConfirmTrip(null)
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
      if (text.length < 5) throw new Error('Informe a justificativa')
      if (!newExpectedReturn) throw new Error('Informe a nova previsão de retorno')
      if (!files || files.length < 1) throw new Error('Anexe ao menos uma evidência')

      const form = new FormData()
      form.append('reason', text)
      form.append('newExpectedReturn', newExpectedReturn)
      form.append('markUnavailable', markUnavailable ? 'true' : 'false')
      if (markUnavailable) form.append('unavailableReason', text)
      Array.from(files).forEach((f) => form.append('evidence', f))

      const token = getToken()
      const res = await fetch(`/api/trips/${reportTrip.id}/delay-report`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw Object.assign(new Error('fail'), { response: { data: body } })
      }
      return body
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['returns'] })
      void qc.invalidateQueries({ queryKey: ['trips'] })
      void qc.invalidateQueries({ queryKey: ['vehicles'] })
      setReportTrip(null)
      setDelayReason('')
      setPreset('')
      setNewExpectedReturn('')
      setMarkUnavailable(false)
      setFiles(null)
      setError('')
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } }; message?: string })?.response?.data
          ?.error ??
          (err as Error)?.message ??
          'Não foi possível registrar o problema.',
      )
    },
  })

  function openProblem(t: Trip) {
    setError('')
    setReportTrip(t)
    setPreset('')
    setDelayReason(t.delayReason ?? '')
    setMarkUnavailable(!!t.unavailableReason)
    setFiles(null)
    // default: +2 days from today
    const d = new Date()
    d.setDate(d.getDate() + 2)
    setNewExpectedReturn(toInputDate(d))
  }

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

  const openProblemHandler = (t: Trip) => openProblem(t)
  const openReturn = (t: Trip) => {
    setError('')
    setConfirmTrip(t)
  }

  return (
    <div className="ops-readable mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Retornos"
        description="Confirme quem voltou. Se não retornou, registre o problema com justificativa, nova previsão e evidências."
      />

      {error && (
        <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <Section
        title="Em atraso"
        trips={data.overdue}
        tone="text-[var(--color-danger)]"
        onReturn={openReturn}
        onProblem={openProblemHandler}
      />
      <Section
        title="Previsão hoje"
        trips={data.today}
        tone="text-blue-600"
        onReturn={openReturn}
        onProblem={openProblemHandler}
      />
      <Section
        title="Amanhã"
        trips={data.tomorrow}
        tone="text-orange-600"
        onReturn={openReturn}
        onProblem={openProblemHandler}
      />
      <Section
        title="Em 2 dias"
        trips={data.in2Days}
        tone="text-[var(--color-text-muted)]"
        onReturn={openReturn}
        onProblem={openProblemHandler}
      />
      <Section
        title="Depois"
        trips={data.later ?? []}
        tone="text-[var(--color-text-muted)]"
        onReturn={openReturn}
        onProblem={openProblemHandler}
      />

      <Modal open={!!confirmTrip} onClose={() => setConfirmTrip(null)} title="Confirmar retorno">
        <div className="space-y-3">
          <p className="text-sm">
            Confirma o retorno da placa <strong>{confirmTrip?.vehicle.plate}</strong>? O veículo
            volta a ficar disponível.
          </p>
          {(confirmTrip?.overdue || confirmTrip?.status === 'ATRASADO') &&
            !confirmTrip?.delayReason && (
              <p className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                Esta viagem está em atraso. Feche e use <strong>Problemas na viagem</strong> para
                registrar justificativa + evidências antes de confirmar.
              </p>
            )}
          {confirmTrip?.delayReason && (
            <p className="text-xs text-[var(--color-text-muted)]">
              Justificativa já registrada: {confirmTrip.delayReason}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmTrip(null)}>
              Cancelar
            </Button>
            <Button
              loading={returnMutation.isPending}
              disabled={
                !!(confirmTrip?.overdue || confirmTrip?.status === 'ATRASADO') &&
                !confirmTrip?.delayReason
              }
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
        title={`Problemas — ${reportTrip?.vehicle.plate ?? ''}`}
        size="lg"
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            Justificativa e evidências são obrigatórias. A nova previsão atualiza o retorno esperado.
          </p>
          <Select
            label="Motivo"
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            options={delayReasonPresets.map((label) => ({ value: label, label }))}
            placeholder="Selecione um motivo"
          />
          <Textarea
            label="Justificativa *"
            value={delayReason}
            onChange={(e) => setDelayReason(e.target.value)}
            rows={3}
            placeholder="Por que não retornou? Descreva o problema…"
            required
          />
          <Input
            label="Nova previsão de retorno *"
            type="date"
            value={newExpectedReturn}
            onChange={(e) => setNewExpectedReturn(e.target.value)}
            required
          />
          <div>
            <label className="mb-1 block text-sm font-medium">
              Evidências (fotos ou PDF) *
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
              multiple
              onChange={(e) => setFiles(e.target.files)}
              className="block w-full text-sm"
            />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Até 6 arquivos · máx. 8 MB cada
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={markUnavailable}
              onChange={(e) => setMarkUnavailable(e.target.checked)}
            />
            <span>
              Marcar veículo como <strong>indisponível</strong> até o retorno
            </span>
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReportTrip(null)}>
              Cancelar
            </Button>
            <Button
              loading={reportMutation.isPending}
              disabled={
                composedReason().length < 5 || !newExpectedReturn || !files || files.length < 1
              }
              onClick={() => reportMutation.mutate()}
            >
              Salvar problema
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

