import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileText, UserCheck } from 'lucide-react'
import { api, downloadReport } from '../lib/api'
import type { LogbookDetail, LogbookListItem, LogbookListResponse } from '../types/logbook'
import { PageHeader, Spinner, Card, Button, Badge, EmptyState } from '../components/ui'
import { SignaturePad } from '../components/logbook/SignaturePad'
import { ChecklistReviewTable } from '../components/logbook/ChecklistReviewTable'
import { formatDate, formatDateTime } from '../lib/format'
import { useAuthStore } from '../stores/auth'
import { cn } from '../lib/cn'

const WORKFLOW_STEPS = [
  { key: 'motorista', label: 'Motorista preenche' },
  { key: 'entrega', label: 'Entrega ao coordenador' },
  { key: 'conferencia', label: 'Conferência e assinatura' },
  { key: 'arquivo', label: 'Arquivar PDF' },
] as const

function SignatureImg({ src, label }: { src: string | null; label: string }) {
  if (!src) return <p className="text-sm text-[var(--color-text-muted)]">{label}: —</p>
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-[var(--color-text-muted)]">{label}</p>
      <img src={src} alt={label} className="max-h-28 rounded border border-[var(--color-border)] bg-white" />
    </div>
  )
}

function statusBadge(status: LogbookListItem['status']) {
  switch (status) {
    case 'AGUARDANDO_COORDENADOR':
      return <Badge tone="warning">Para conferir</Badge>
    case 'ARQUIVADO':
      return <Badge tone="success">Arquivado</Badge>
    case 'PENDENTE_RETORNO':
      return <Badge tone="info">Em viagem</Badge>
    default:
      return <Badge tone="default">Em preenchimento</Badge>
  }
}

export function LogbookAdmin() {
  const qc = useQueryClient()
  const canSign = useAuthStore((s) => s.hasRole('ADMIN', 'OPERACAO'))
  const [queueOnly, setQueueOnly] = useState(true)
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)
  const [coordSig, setCoordSig] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['logbook', queueOnly],
    queryFn: async () =>
      (await api.get<LogbookListResponse>('/logbook', { params: { pending: queueOnly ? 'true' : 'false' } }))
        .data,
  })

  const list = data?.items ?? []
  const pendingCount = data?.pendingCoordinator ?? 0

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['logbook', selectedTripId],
    enabled: !!selectedTripId,
    queryFn: async () => (await api.get<LogbookDetail>(`/logbook/${selectedTripId}`)).data,
  })

  const signMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTripId || !coordSig) return
      return api.post(`/logbook/${selectedTripId}/coordinator-sign`, { signaturePng: coordSig })
    },
    onSuccess: async () => {
      setCoordSig(null)
      await qc.invalidateQueries({ queryKey: ['logbook'] })
      if (selectedTripId && detail) {
        const plate = detail.plate.replace(/[^A-Z0-9]/gi, '')
        const date = formatDate(detail.trip.departureAt, 'yyyy-MM-dd')
        await downloadReport(`/logbook/${selectedTripId}/pdf`, `diario-bordo-${plate}-${date}.pdf`)
      }
    },
  })

  async function downloadPdf() {
    if (!detail || !selectedTripId) return
    setDownloading(true)
    try {
      const plate = detail.plate.replace(/[^A-Z0-9]/gi, '')
      const date = formatDate(detail.trip.departureAt, 'yyyy-MM-dd')
      await downloadReport(`/logbook/${selectedTripId}/pdf`, `diario-bordo-${plate}-${date}.pdf`)
    } finally {
      setDownloading(false)
    }
  }

  const activeStep =
    detail?.status === 'ARQUIVADO'
      ? 3
      : detail?.status === 'AGUARDANDO_COORDENADOR'
        ? 2
        : detail?.returnComplete
          ? 1
          : 0

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Diário de bordo"
        description="Mesmo fluxo do papel: motorista preenche → coordenador confere, assina e arquiva o PDF"
        actions={
          <Button
            size="sm"
            variant={queueOnly ? 'primary' : 'secondary'}
            onClick={() => {
              setQueueOnly((v) => !v)
              setSelectedTripId(null)
            }}
          >
            {queueOnly ? `Fila do coordenador (${pendingCount})` : 'Todos os diários'}
          </Button>
        }
      />

      <div className="mb-5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <p className="mb-3 text-sm text-[var(--color-text-muted)]">
          Substitui a entrega física do checklist. Quando o motorista conclui saída e retorno no celular, o
          diário entra na <strong>fila do coordenador</strong> (ex.: Rodrigo) para conferência, assinatura e
          arquivo.
        </p>
        <div className="flex flex-wrap gap-2">
          {WORKFLOW_STEPS.map((step, i) => (
            <div
              key={step.key}
              className={cn(
                'flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium',
                i <= activeStep && selectedTripId
                  ? 'bg-[var(--color-primary-muted)] text-[var(--color-primary)]'
                  : 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]',
              )}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/80 text-[10px] font-bold">
                {i + 1}
              </span>
              {step.label}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card
          className="lg:col-span-2"
          title={queueOnly ? `Fila do coordenador (${pendingCount})` : 'Diários recentes'}
        >
          {isLoading ? (
            <Spinner />
          ) : list.length === 0 ? (
            <EmptyState
              description={
                queueOnly
                  ? 'Nenhum diário aguardando conferência. Quando o motorista concluir retorno, aparece aqui.'
                  : 'Nenhum diário encontrado.'
              }
            />
          ) : (
            <div className="max-h-[36rem] space-y-1 overflow-y-auto">
              {list.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedTripId(row.tripId)}
                  className={cn(
                    'w-full rounded-lg border px-3 py-2.5 text-left text-sm transition',
                    selectedTripId === row.tripId
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)]'
                      : 'border-[var(--color-border)] hover:bg-[var(--color-surface-2)]',
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{row.plate}</span>
                    {statusBadge(row.status)}
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {row.driverName ?? '—'} · {row.routeName ?? 'Sem roteiro'}
                  </p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">{row.statusLabel}</p>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card
          className="lg:col-span-3"
          title="Conferência do coordenador"
          action={
            detail?.returnComplete ? (
              <Button size="sm" variant="secondary" loading={downloading} onClick={() => void downloadPdf()}>
                <Download className="h-4 w-4" />
                Baixar PDF
              </Button>
            ) : undefined
          }
        >
          {!selectedTripId ? (
            <EmptyState
              icon={<UserCheck className="h-8 w-8" />}
              description="Selecione um diário da fila para conferir como no papel entregue pelo motorista."
            />
          ) : detailLoading || !detail ? (
            <Spinner />
          ) : (
            <div className="space-y-4">
              {detail.status === 'AGUARDANDO_COORDENADOR' && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
                  Diário <strong>entregue pelo motorista</strong> — confira checklist e assinaturas, depois
                  assine como coordenador e arquive o PDF.
                </div>
              )}

              <div className="grid gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-[var(--color-text-muted)]">Placa:</span> {detail.plate}
                </p>
                <p>
                  <span className="text-[var(--color-text-muted)]">Motorista:</span>{' '}
                  {detail.trip.driverName ?? '—'}
                  {detail.driverMatricula ? ` · mat. ${detail.driverMatricula}` : ''}
                </p>
                <p>
                  <span className="text-[var(--color-text-muted)]">KM:</span> {detail.kmInitial ?? '—'} →{' '}
                  {detail.kmFinal ?? '—'}
                </p>
                <p>
                  <span className="text-[var(--color-text-muted)]">Status:</span> {detail.statusLabel}
                </p>
              </div>

              {detail.returnComplete && (
                <>
                  <div>
                    <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                      <FileText className="h-4 w-4" />
                      Checklist preenchido (saída × retorno)
                    </p>
                    <ChecklistReviewTable
                      items={detail.checklistItems}
                      departure={detail.checklistDeparture}
                      returnState={detail.checklistReturn}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <SignatureImg src={detail.departureSignaturePng} label="Motorista (saída)" />
                    <SignatureImg src={detail.returnSignaturePng} label="Motorista (retorno)" />
                    <SignatureImg src={detail.coordinatorSignaturePng} label="Líder ou coordenador" />
                  </div>
                </>
              )}

              {canSign && detail.status === 'AGUARDANDO_COORDENADOR' && (
                <div className="rounded-lg border-2 border-[var(--color-primary)]/40 bg-[var(--color-surface)] p-4">
                  <p className="mb-1 text-sm font-semibold">Assinatura do coordenador</p>
                  <p className="mb-3 text-xs text-[var(--color-text-muted)]">
                    Após conferir, assine abaixo. O PDF oficial será baixado automaticamente para arquivo.
                  </p>
                  <SignaturePad label="Líder ou coordenador" onChange={setCoordSig} />
                  <Button
                    className="mt-3"
                    loading={signMutation.isPending}
                    disabled={!coordSig}
                    onClick={() => signMutation.mutate()}
                  >
                    Conferir, assinar e arquivar
                  </Button>
                </div>
              )}

              {detail.status === 'ARQUIVADO' && (
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-3 text-sm">
                  <p className="font-medium text-green-800 dark:text-green-200">
                    Conferido por {detail.coordinatorName ?? 'coordenador'} em{' '}
                    {formatDateTime(detail.coordinatorSignedAt)}
                  </p>
                  <p className="mt-1 text-[var(--color-text-muted)]">
                    Documento arquivado. Baixe o PDF para guardar como cópia oficial (retenção 1 ano).
                  </p>
                  <Button className="mt-3" variant="outline" loading={downloading} onClick={() => void downloadPdf()}>
                    <Download className="h-4 w-4" />
                    Baixar cópia para arquivo
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
