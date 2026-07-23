import { useEffect, useRef, useState, type DragEvent, type ChangeEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Check,
  FileText,
  ImageIcon,
  Paperclip,
  Upload,
  X,
} from 'lucide-react'
import { api, getToken, evidenceUrl } from '../lib/api'
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

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,application/pdf'
const MAX_FILES = 6
const MAX_BYTES = 8 * 1024 * 1024

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function EvidenceUploader({
  files,
  onChange,
  error,
}: {
  files: File[]
  onChange: (files: File[]) => void
  error?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [localError, setLocalError] = useState('')
  const [previews, setPreviews] = useState<Record<string, string>>({})

  useEffect(() => {
    const next: Record<string, string> = {}
    const urls: string[] = []
    for (const f of files) {
      if (f.type.startsWith('image/')) {
        const url = URL.createObjectURL(f)
        next[`${f.name}-${f.size}-${f.lastModified}`] = url
        urls.push(url)
      }
    }
    setPreviews(next)
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [files])

  function mergeFiles(incoming: FileList | File[]) {
    setLocalError('')
    const list = Array.from(incoming)
    const accepted: File[] = []
    for (const f of list) {
      const okType =
        /^image\/(jpeg|png|webp|gif)$/i.test(f.type) || f.type === 'application/pdf'
      if (!okType) {
        setLocalError('Use apenas fotos (JPG, PNG, WEBP) ou PDF.')
        continue
      }
      if (f.size > MAX_BYTES) {
        setLocalError(`"${f.name}" passa de 8 MB.`)
        continue
      }
      accepted.push(f)
    }
    const merged = [...files]
    for (const f of accepted) {
      const dup = merged.some(
        (x) => x.name === f.name && x.size === f.size && x.lastModified === f.lastModified,
      )
      if (!dup) merged.push(f)
    }
    if (merged.length > MAX_FILES) {
      setLocalError(`Máximo de ${MAX_FILES} arquivos.`)
      onChange(merged.slice(0, MAX_FILES))
      return
    }
    onChange(merged)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files?.length) mergeFiles(e.dataTransfer.files)
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) mergeFiles(e.target.files)
    e.target.value = ''
  }

  function removeAt(index: number) {
    onChange(files.filter((_, i) => i !== index))
  }

  const showError = error || localError

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">
            Evidências <span className="text-[var(--color-danger)]">*</span>
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            Fotos do problema ou PDF · obrigatório para registrar
          </p>
        </div>
        {files.length > 0 && (
          <span className="rounded-full bg-[var(--color-primary-muted)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-primary)]">
            {files.length}/{MAX_FILES}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          setDragging(false)
        }}
        onDrop={onDrop}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-dashed px-4 py-6 text-center transition',
          dragging
            ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)]'
            : files.length === 0
              ? 'border-[var(--color-primary)]/40 bg-[var(--color-primary-muted)]/40 hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-muted)]'
              : 'border-[var(--color-border)] bg-[var(--color-surface-2)]/50 hover:border-[var(--color-primary)]/50',
        )}
      >
        <span
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-full',
            dragging || files.length === 0
              ? 'bg-[var(--color-primary)] text-white'
              : 'bg-[var(--color-surface)] text-[var(--color-primary)]',
          )}
        >
          <Upload className="h-5 w-5" />
        </span>
        <span className="text-sm font-medium text-[var(--color-text)]">
          {dragging ? 'Solte os arquivos aqui' : 'Arraste fotos aqui ou clique para anexar'}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">
          JPG, PNG, WEBP ou PDF · até {MAX_FILES} arquivos · máx. 8 MB cada
        </span>
        <span className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-primary)] shadow-sm ring-1 ring-[var(--color-border)]">
          <Paperclip className="h-3.5 w-3.5" />
          Escolher arquivos
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        onChange={onInputChange}
      />

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f, i) => {
            const key = `${f.name}-${f.size}-${f.lastModified}`
            const preview = previews[key]
            const isPdf = f.type === 'application/pdf'
            return (
              <li
                key={key}
                className="flex items-center gap-3 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5"
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--color-surface-2)]">
                  {preview ? (
                    <img src={preview} alt="" className="h-full w-full object-cover" />
                  ) : isPdf ? (
                    <FileText className="h-6 w-6 text-[var(--color-danger)]" />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-[var(--color-text-muted)]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{f.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {isPdf ? 'PDF' : 'Imagem'} · {formatBytes(f.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="rounded-md p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)]"
                  aria-label={`Remover ${f.name}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {showError && <p className="text-sm text-[var(--color-danger)]">{showError}</p>}
      {files.length === 0 && !showError && (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
          Anexe ao menos uma evidência para salvar o problema.
        </p>
      )}
    </div>
  )
}

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
  const hasProblem = !!trip.delayReason || evidences.length > 0

  return (
    <div
      className={cn(
        'rounded-[var(--radius)] border bg-[var(--color-surface)] px-3.5 py-3',
        trip.overdue
          ? 'border-red-500/35 bg-red-500/5'
          : hasProblem
            ? 'border-amber-500/30 bg-amber-500/5'
            : 'border-[var(--color-border)]',
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <PlateBadge plate={trip.vehicle.plate} color={trip.color ?? 'red'} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-[var(--color-text)]">
              {trip.dealership.city}
              <span className="font-normal text-[var(--color-text-muted)]">
                {' '}
                · {trip.dealership.name}
              </span>
            </p>
            {trip.overdue && <Badge tone="danger">Em atraso</Badge>}
            {hasProblem && !trip.overdue && <Badge tone="warning">Problema registrado</Badge>}
          </div>

          <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">
            {trip.route?.name ?? 'Roteiro'}
            {trip.driverName ? ` · Motorista: ${trip.driverName}` : ''}
          </p>

          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
            <span>
              <span className="text-[var(--color-text-muted)]">Saída </span>
              <span className="font-medium">{formatDate(trip.departureAt)}</span>
            </span>
            <span>
              <span className="text-[var(--color-text-muted)]">Previsão retorno </span>
              <span
                className={cn(
                  'font-semibold',
                  trip.overdue ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]',
                )}
              >
                {formatDate(trip.expectedReturn)}
              </span>
            </span>
          </div>

          {trip.delayReason && (
            <p className="mt-1.5 text-xs text-[var(--color-text)]">
              <span className="text-[var(--color-text-muted)]">Justificativa: </span>
              {trip.delayReason}
              {trip.delayReportedBy?.name ? ` · por ${trip.delayReportedBy.name}` : ''}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-1.5 sm:flex-col sm:items-stretch">
          <Button size="sm" onClick={onReturn}>
            <Check className="h-3.5 w-3.5" />
            Retornou
          </Button>
          <Button size="sm" variant="secondary" onClick={onProblem}>
            <AlertTriangle className="h-3.5 w-3.5" />
            Problema
          </Button>
        </div>
      </div>

      {evidences.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-[var(--color-border)]/70 pt-2">
          <span className="text-xs font-medium text-[var(--color-text-muted)]">
            Evidências ({evidences.length}):
          </span>
          {evidences.map((e) => (
            <a
              key={e.id}
              href={evidenceUrl(e.id)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs font-medium hover:border-[var(--color-primary)]/40"
            >
              <Paperclip className="h-3 w-3 text-[var(--color-primary)]" />
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
  hideIfEmpty,
  onReturn,
  onProblem,
}: {
  title: string
  trips: Trip[]
  tone: string
  hideIfEmpty?: boolean
  onReturn: (t: Trip) => void
  onProblem: (t: Trip) => void
}) {
  if (hideIfEmpty && trips.length === 0) return null

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className={cn('text-sm font-semibold', tone)}>{title}</h2>
        <span
          className={cn(
            'inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 text-xs font-semibold',
            trips.length > 0
              ? 'bg-[var(--color-surface-2)] text-[var(--color-text)]'
              : 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]',
          )}
        >
          {trips.length}
        </span>
      </div>
      {trips.length === 0 ? (
        <p className="px-1 text-xs text-[var(--color-text-muted)]">Nenhuma viagem neste grupo.</p>
      ) : (
        <div className="space-y-1.5">
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
  const [files, setFiles] = useState<File[]>([])
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
      if (
        confirmTrip.overdue && !confirmTrip.delayReason
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
      if (files.length < 1) throw new Error('Anexe ao menos uma evidência')

      const form = new FormData()
      form.append('reason', text)
      form.append('newExpectedReturn', newExpectedReturn)
      form.append('markUnavailable', markUnavailable ? 'true' : 'false')
      if (markUnavailable) form.append('unavailableReason', text)
      files.forEach((f) => form.append('evidence', f))

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
      void qc.invalidateQueries({ queryKey: ['justifications'] })
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
      setReportTrip(null)
      setDelayReason('')
      setPreset('')
      setNewExpectedReturn('')
      setMarkUnavailable(false)
      setFiles([])
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
    setFiles([])
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
    <div className="page-desktop max-w-4xl space-y-4">
      <PageHeader
        title="Retornos"
        description="Confirme o retorno ou registre problema (justificativa + evidências). Admin e Operação veem os anexos neste card."
      />

      {error && !reportTrip && (
        <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        {[
          { label: 'Em atraso', count: data.overdue.length, tone: 'text-[var(--color-danger)]' },
          { label: 'Hoje', count: data.today.length, tone: 'text-blue-600' },
          { label: 'Amanhã', count: data.tomorrow.length, tone: 'text-orange-600' },
          {
            label: 'Em 2 dias',
            count: data.in2Days.length,
            tone: 'text-[var(--color-text-muted)]',
          },
          {
            label: 'Depois',
            count: (data.later ?? []).length,
            tone: 'text-[var(--color-text-muted)]',
          },
        ].map((s) => (
          <span
            key={s.label}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1"
          >
            <span className={cn('font-semibold', s.tone)}>{s.count}</span>
            <span className="text-[var(--color-text-muted)]">{s.label}</span>
          </span>
        ))}
      </div>

      {data.overdue.length +
        data.today.length +
        data.tomorrow.length +
        data.in2Days.length +
        (data.later?.length ?? 0) ===
      0 ? (
        <EmptyState
          title="Nenhuma viagem em aberto"
          description="Quando houver placas em viagem, elas aparecem aqui por data de previsão."
        />
      ) : (
        <div className="space-y-4">
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
            hideIfEmpty
            onReturn={openReturn}
            onProblem={openProblemHandler}
          />
          <Section
            title="Amanhã"
            trips={data.tomorrow}
            tone="text-orange-600"
            hideIfEmpty
            onReturn={openReturn}
            onProblem={openProblemHandler}
          />
          <Section
            title="Em 2 dias"
            trips={data.in2Days}
            tone="text-[var(--color-text-muted)]"
            hideIfEmpty
            onReturn={openReturn}
            onProblem={openProblemHandler}
          />
          <Section
            title="Depois"
            trips={data.later ?? []}
            tone="text-[var(--color-text-muted)]"
            hideIfEmpty
            onReturn={openReturn}
            onProblem={openProblemHandler}
          />
        </div>
      )}

      <Modal
        open={!!confirmTrip}
        onClose={() => setConfirmTrip(null)}
        title="Confirmar retorno"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmTrip(null)}>
              Cancelar
            </Button>
            <Button
              loading={returnMutation.isPending}
              disabled={!!confirmTrip?.overdue && !confirmTrip?.delayReason}
              onClick={() => returnMutation.mutate()}
            >
              Confirmar retorno
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm">
            Confirma o retorno da placa <strong>{confirmTrip?.vehicle.plate}</strong>? O veículo
            volta a ficar disponível.
          </p>
          {confirmTrip?.overdue && !confirmTrip?.delayReason && (
              <p className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                Esta viagem está em atraso. Use <strong>Problema</strong> para registrar
                justificativa + evidências antes de confirmar.
              </p>
            )}
          {confirmTrip?.delayReason && (
            <p className="text-xs text-[var(--color-text-muted)]">
              Justificativa já registrada: {confirmTrip.delayReason}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={!!reportTrip}
        onClose={() => {
          setReportTrip(null)
          setFiles([])
          setError('')
        }}
        title={`Problema — ${reportTrip?.vehicle.plate ?? ''}`}
        size="lg"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setReportTrip(null)
                setFiles([])
                setError('')
              }}
            >
              Cancelar
            </Button>
            <Button
              loading={reportMutation.isPending}
              disabled={
                composedReason().length < 5 || !newExpectedReturn || files.length < 1
              }
              onClick={() => reportMutation.mutate()}
            >
              Salvar problema
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-text-muted)]">
            Motivo, nova previsão e evidência (foto/PDF). Admin e Operação veem os anexos em
            Retornos.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Motivo"
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              options={delayReasonPresets.map((label) => ({ value: label, label }))}
              placeholder="Selecione um motivo"
            />
            <Input
              label="Nova previsão de retorno *"
              type="date"
              value={newExpectedReturn}
              onChange={(e) => setNewExpectedReturn(e.target.value)}
              required
            />
          </div>

          <Textarea
            label="Justificativa *"
            value={delayReason}
            onChange={(e) => setDelayReason(e.target.value)}
            rows={2}
            placeholder="Descreva o problema…"
            required
          />

          <EvidenceUploader files={files} onChange={setFiles} />

          <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 accent-[var(--color-primary)]"
              checked={markUnavailable}
              onChange={(e) => setMarkUnavailable(e.target.checked)}
            />
            <span>
              <span className="font-medium">Marcar placa indisponível</span>
              <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">
                Bloqueia novo carregamento até o retorno
              </span>
            </span>
          </label>

          {error && reportTrip && (
            <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}
