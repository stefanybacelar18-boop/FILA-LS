import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardCheck, Download, FileText } from 'lucide-react'
import { api, downloadReport } from '../lib/api'
import type { LogbookDetail, LogbookListItem } from '../types/logbook'
import { PageHeader, Spinner, Card, Button, Badge, EmptyState } from '../components/ui'
import { SignaturePad } from '../components/logbook/SignaturePad'
import { ChecklistReviewTable } from '../components/logbook/ChecklistReviewTable'
import { formatDate, formatDateTime } from '../lib/format'
import { useAuthStore } from '../stores/auth'

function SignatureImg({ src, label }: { src: string | null; label: string }) {
  if (!src) return <p className="text-sm text-[var(--color-text-muted)]">{label}: —</p>
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-[var(--color-text-muted)]">{label}</p>
      <img src={src} alt={label} className="max-h-28 rounded border border-[var(--color-border)] bg-white" />
    </div>
  )
}

export function LogbookAdmin() {
  const qc = useQueryClient()
  const canSign = useAuthStore((s) => s.hasRole('ADMIN', 'OPERACAO'))
  const [pendingOnly, setPendingOnly] = useState(false)
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)
  const [coordSig, setCoordSig] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const { data: list = [], isLoading } = useQuery({
    queryKey: ['logbook', pendingOnly],
    queryFn: async () =>
      (await api.get<LogbookListItem[]>('/logbook', { params: { pending: pendingOnly ? 'true' : 'false' } }))
        .data,
  })

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
    onSuccess: () => {
      setCoordSig(null)
      void qc.invalidateQueries({ queryKey: ['logbook'] })
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

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Diário de bordo"
        description="Visualize o checklist preenchido, assinaturas e baixe o PDF para arquivo"
        actions={
          <Button
            size="sm"
            variant={pendingOnly ? 'primary' : 'secondary'}
            onClick={() => {
              setPendingOnly((v) => !v)
              setSelectedTripId(null)
            }}
          >
            {pendingOnly ? 'Só pendentes de validação' : 'Todos recentes'}
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2" title="Viagens">
          {isLoading ? (
            <Spinner />
          ) : list.length === 0 ? (
            <EmptyState description="Nenhum diário neste filtro." />
          ) : (
            <div className="max-h-[36rem] space-y-1 overflow-y-auto">
              {list.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedTripId(row.tripId)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                    selectedTripId === row.tripId
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)]'
                      : 'border-[var(--color-border)] hover:bg-[var(--color-surface-2)]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{row.plate}</span>
                    <div className="flex gap-1">
                      {row.departureComplete && !row.returnComplete && (
                        <Badge tone="info">Só saída</Badge>
                      )}
                      {!row.coordinatorComplete && row.returnComplete && (
                        <Badge tone="warning">Validar</Badge>
                      )}
                      {row.coordinatorComplete && <Badge tone="success">Arquivado</Badge>}
                    </div>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {row.driverName ?? '—'} · {row.routeName ?? 'Sem roteiro'}
                  </p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">
                    Saída {formatDateTime(row.departureAt)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card
          className="lg:col-span-3"
          title="Diário preenchido"
          action={
            detail?.departureComplete ? (
              <Button size="sm" variant="secondary" loading={downloading} onClick={() => void downloadPdf()}>
                <Download className="h-4 w-4" />
                Baixar PDF
              </Button>
            ) : undefined
          }
        >
          {!selectedTripId ? (
            <EmptyState
              icon={<ClipboardCheck className="h-8 w-8" />}
              description="Selecione uma viagem para ver o checklist completo e as assinaturas."
            />
          ) : detailLoading || !detail ? (
            <Spinner />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-[var(--color-text-muted)]">Placa:</span> {detail.plate} ·{' '}
                  {detail.vehicleLabel}
                </p>
                <p>
                  <span className="text-[var(--color-text-muted)]">Motorista:</span>{' '}
                  {detail.trip.driverName ?? '—'}
                  {detail.driverMatricula ? ` (${detail.driverMatricula})` : ''}
                </p>
                {detail.helperName && (
                  <p>
                    <span className="text-[var(--color-text-muted)]">Ajudante:</span> {detail.helperName}
                    {detail.helperMatricula ? ` (${detail.helperMatricula})` : ''}
                  </p>
                )}
                <p>
                  <span className="text-[var(--color-text-muted)]">Roteiro:</span>{' '}
                  {detail.trip.route?.name ?? '—'}
                </p>
                <p>
                  <span className="text-[var(--color-text-muted)]">KM:</span> {detail.kmInitial ?? '—'} →{' '}
                  {detail.kmFinal ?? '—'}
                </p>
                <p>
                  <span className="text-[var(--color-text-muted)]">Combustível:</span> Diesel{' '}
                  {detail.fuelDieselDeparture ?? '—'}/{detail.fuelDieselReturn ?? '—'} · Óleo{' '}
                  {detail.fuelOilDeparture ?? '—'}/{detail.fuelOilReturn ?? '—'}
                </p>
                <p className="sm:col-span-2">
                  <span className="text-[var(--color-text-muted)]">Formulário:</span> {detail.formCode}
                </p>
              </div>

              {!detail.departureComplete ? (
                <p className="text-sm text-[var(--color-text-muted)]">
                  Motorista ainda não concluiu o checklist de saída.
                </p>
              ) : (
                <>
                  <div>
                    <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                      <FileText className="h-4 w-4" />
                      Checklist de verificação
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
                    <SignatureImg src={detail.coordinatorSignaturePng} label="Coordenador" />
                  </div>
                </>
              )}

              {detail.maintenanceDescription && (
                <p className="text-sm">
                  <span className="font-medium">Manutenção:</span> {detail.maintenanceDescription}
                </p>
              )}
              {detail.damageDescription && (
                <p className="text-sm">
                  <span className="font-medium">Avaria:</span> {detail.damageDescription}
                </p>
              )}

              {canSign && detail.returnComplete && !detail.coordinatorComplete && (
                <div className="rounded-lg border border-[var(--color-border)] p-4">
                  <p className="mb-3 text-sm font-medium">Assinatura do coordenador</p>
                  <SignaturePad label="Assinar como líder/coordenador" onChange={setCoordSig} />
                  <Button
                    className="mt-3"
                    loading={signMutation.isPending}
                    disabled={!coordSig}
                    onClick={() => signMutation.mutate()}
                  >
                    Validar diário
                  </Button>
                </div>
              )}

              {detail.coordinatorComplete && (
                <p className="text-sm text-[var(--color-success)]">
                  Validado por {detail.coordinatorName ?? 'coordenador'} em{' '}
                  {formatDateTime(detail.coordinatorSignedAt)} — use <strong>Baixar PDF</strong> para
                  arquivar.
                </p>
              )}

              {detail.departureComplete && (
                <Button variant="outline" loading={downloading} onClick={() => void downloadPdf()}>
                  <Download className="h-4 w-4" />
                  Baixar diário em PDF
                </Button>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
