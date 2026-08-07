import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardCheck } from 'lucide-react'
import { api } from '../lib/api'
import type { LogbookDetail, LogbookListItem } from '../types/logbook'
import { PageHeader, Spinner, Card, Button, Badge, EmptyState } from '../components/ui'
import { SignaturePad } from '../components/logbook/SignaturePad'
import { formatDateTime } from '../lib/format'
import { useAuthStore } from '../stores/auth'

function SignatureImg({ src, label }: { src: string | null; label: string }) {
  if (!src) return <p className="text-sm text-[var(--color-text-muted)]">{label}: —</p>
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-[var(--color-text-muted)]">{label}</p>
      <img src={src} alt={label} className="max-h-24 rounded border border-[var(--color-border)] bg-white" />
    </div>
  )
}

export function LogbookAdmin() {
  const qc = useQueryClient()
  const canSign = useAuthStore((s) => s.hasRole('ADMIN', 'OPERACAO'))
  const [pendingOnly, setPendingOnly] = useState(true)
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)
  const [coordSig, setCoordSig] = useState<string | null>(null)

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

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Diário de bordo"
        description="Checklists digitais LSL com assinaturas — validação do coordenador"
        actions={
          <Button
            size="sm"
            variant={pendingOnly ? 'primary' : 'secondary'}
            onClick={() => {
              setPendingOnly((v) => !v)
              setSelectedTripId(null)
            }}
          >
            {pendingOnly ? 'Só pendentes' : 'Todos recentes'}
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
            <div className="max-h-[32rem] space-y-1 overflow-y-auto">
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
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{row.plate}</span>
                    {!row.coordinatorComplete && row.returnComplete && (
                      <Badge tone="warning">Validar</Badge>
                    )}
                    {row.coordinatorComplete && <Badge tone="success">OK</Badge>}
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

        <Card className="lg:col-span-3" title="Detalhe">
          {!selectedTripId ? (
            <EmptyState
              icon={<ClipboardCheck className="h-8 w-8" />}
              description="Selecione uma viagem para revisar assinaturas e dados."
            />
          ) : detailLoading || !detail ? (
            <Spinner />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-[var(--color-text-muted)]">Placa:</span> {detail.plate}
                </p>
                <p>
                  <span className="text-[var(--color-text-muted)]">Motorista:</span>{' '}
                  {detail.trip.driverName ?? '—'}
                </p>
                <p>
                  <span className="text-[var(--color-text-muted)]">KM:</span>{' '}
                  {detail.kmInitial ?? '—'} → {detail.kmFinal ?? '—'}
                </p>
                <p>
                  <span className="text-[var(--color-text-muted)]">Formulário:</span> {detail.formCode}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <SignatureImg src={detail.departureSignaturePng} label="Motorista (saída)" />
                <SignatureImg src={detail.returnSignaturePng} label="Motorista (retorno)" />
                <SignatureImg src={detail.coordinatorSignaturePng} label="Coordenador" />
              </div>

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
                  {formatDateTime(detail.coordinatorSignedAt)}
                </p>
              )}

              <p className="text-xs text-[var(--color-text-muted)]">
                Retenção recomendada: 1 ano · Modelo {detail.formCode}
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
