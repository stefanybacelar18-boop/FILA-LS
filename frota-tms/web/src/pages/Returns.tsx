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
          'flex w-full flex-col items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-dashed px-4 py-8 text-center transition',
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
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-xs font-medium hover:border-[var(--color-primary)]/40"
            >
              <Paperclip className="h-3.5 w-3.5 text-[var(--color-primary)]" />
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
    <div className="ops-readable mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Retornos"
        description="Confirme quem voltou. Se não retornou, registre o problema com justificativa, nova previsão e evidências."
      />

      {error && !reportTrip && (
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
        onClose={() => {
          setReportTrip(null)
          setFiles([])
          setError('')
        }}
        title={`Problemas — ${reportTrip?.vehicle.plate ?? ''}`}
        size="lg"
      >
        <div className="space-y-5">
          <div className="rounded-[var(--radius)] border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-950 dark:text-amber-100">
            Informe o motivo, a nova previsão e anexe evidências. Sem evidência o registro não é
            salvo.
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
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
            rows={3}
            placeholder="Por que não retornou? Descreva o problema…"
            required
          />

          <EvidenceUploader files={files} onChange={setFiles} />

          <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 py-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 accent-[var(--color-primary)]"
              checked={markUnavailable}
              onChange={(e) => setMarkUnavailable(e.target.checked)}
            />
            <span>
              <span className="font-medium">Marcar como indisponível</span>
              <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">
                Bloqueia a placa para novo carregamento até o retorno
              </span>
            </span>
          </label>

          {error && reportTrip && (
            <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-[var(--color-border)] pt-4">
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
          </div>
        </div>
      </Modal>
    </div>
  )
}
