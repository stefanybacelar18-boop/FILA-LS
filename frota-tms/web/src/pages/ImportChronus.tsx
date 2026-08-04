import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileSpreadsheet, Upload } from 'lucide-react'
import { api } from '../lib/api'
import { PageHeader, Button, Spinner, Badge } from '../components/ui'
import { formatDate } from '../lib/format'
import { cn } from '../lib/cn'

interface ChronusDestination {
  dealerCode: string
  dealerName: string
  city: string
  dealershipId: string | null
  matched: boolean
  motoCount: number
}

interface ChronusRoutePreview {
  manifesto: string
  name: string
  date: string
  motoCount: number
  plateHint: string | null
  hasPriority: boolean
  priorityExpiryDate: string | null
  destinations: ChronusDestination[]
  unmatchedDealerCodes: string[]
  duplicateRouteId: string | null
  duplicateRouteName: string | null
}

interface ChronusPreviewResponse {
  batchId: string
  routeDate: string
  routeDateLabel: string
  totalRows: number
  rowsWithoutManifesto: number
  manifestCount: number
  routes: ChronusRoutePreview[]
  message?: string
}

export function ImportChronus() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ChronusPreviewResponse | null>(null)
  const [error, setError] = useState('')

  const previewMutation = useMutation({
    mutationFn: async (selected: File) => {
      const form = new FormData()
      form.append('file', selected)
      const res = await api.post<ChronusPreviewResponse>('/planning/import/chronus/preview', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data
    },
    onSuccess: (data) => {
      setPreview(data)
      setError('')
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Falha ao ler o arquivo'
      setError(msg)
      setPreview(null)
    },
  })

  const commitMutation = useMutation({
    mutationFn: async (batchId: string) =>
      (
        await api.post<{
          created: number
          skippedDuplicates: { manifesto: string; name: string }[]
        }>('/planning/import/chronus/commit', { batchId })
      ).data,
    onSuccess: async (data) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['routes'] }),
        qc.invalidateQueries({ queryKey: ['planning-board'] }),
        qc.invalidateQueries({ queryKey: ['planning-alerts'] }),
      ])
      navigate('/roteiros', {
        state: {
          importOk: `${data.created} roteiro(s) criado(s) a partir do Chronus.`,
        },
      })
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Falha ao criar roteiros'
      setError(msg)
    },
  })

  const creatable = preview?.routes.filter(
    (r) => !r.duplicateRouteId && r.unmatchedDealerCodes.length === 0,
  )
  const duplicates = preview?.routes.filter((r) => r.duplicateRouteId) ?? []
  const invalid = preview?.routes.filter(
    (r) => !r.duplicateRouteId && r.unmatchedDealerCodes.length > 0,
  ) ?? []

  function onPick(next: File | null) {
    setFile(next)
    setPreview(null)
    setError('')
    if (next) previewMutation.mutate(next)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <PageHeader
        title="Importar Chronus"
        description="Exporte Entregas do Chronus (CSV ou XLSX), envie aqui e crie os roteiros por manifesto."
        actions={
          <Link to="/roteiros">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </Link>
        }
      />

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Arquivo do Chronus</p>
            <p className="text-sm text-[var(--color-text-muted)]">
              Linhas sem manifesto são ignoradas. Cada manifesto vira um roteiro com operação.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={previewMutation.isPending}
            >
              {previewMutation.isPending ? (
                <Spinner size="sm" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {file ? 'Trocar arquivo' : 'Selecionar arquivo'}
            </Button>
          </div>
        </div>

        {file && (
          <p className="mt-3 flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <FileSpreadsheet className="h-4 w-4" />
            {file.name}
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </p>
        )}
      </div>

      {preview && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Data dos roteiros" value={preview.routeDateLabel} />
            <Stat label="Manifestos" value={String(preview.manifestCount)} />
            <Stat label="Sem manifesto (ignoradas)" value={String(preview.rowsWithoutManifesto)} />
            <Stat label="Novos roteiros" value={String(creatable?.length ?? 0)} />
          </div>

          {duplicates.length > 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
              {duplicates.length} manifesto(s) já existem como roteiro e serão ignorados.
            </p>
          )}

          {invalid.length > 0 && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {invalid.length} manifesto(s) com concessionária não cadastrada — não serão criados.
            </p>
          )}

          <div className="space-y-3">
            {preview.routes.map((route) => {
              const blocked = !!route.duplicateRouteId || route.unmatchedDealerCodes.length > 0
              return (
                <div
                  key={route.manifesto}
                  className={cn(
                    'rounded-xl border p-4',
                    blocked
                      ? 'border-[var(--color-border)] opacity-70'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)]',
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{route.name}</p>
                      <p className="text-sm text-[var(--color-text-muted)]">
                        Manifesto {route.manifesto} · {route.motoCount} motos ·{' '}
                        {route.destinations.length} destinos
                        {route.plateHint ? ` · placa Chronus: ${route.plateHint}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {route.duplicateRouteId && <Badge tone="warning">Já existe</Badge>}
                      {route.hasPriority && route.priorityExpiryDate && (
                        <Badge tone="danger">Venc. {formatDate(route.priorityExpiryDate)}</Badge>
                      )}
                      {!route.duplicateRouteId && route.unmatchedDealerCodes.length > 0 && (
                        <Badge tone="danger">Sem cadastro</Badge>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                    {route.destinations.map((d) => d.city).join(' · ')}
                  </p>
                </div>
              )
            })}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPreview(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => preview && commitMutation.mutate(preview.batchId)}
              disabled={
                !creatable?.length || commitMutation.isPending || previewMutation.isPending
              }
            >
              {commitMutation.isPending ? <Spinner size="sm" /> : null}
              Criar {creatable?.length ?? 0} roteiro(s)
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  )
}
