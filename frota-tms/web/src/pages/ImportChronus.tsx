import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileSpreadsheet, Upload } from 'lucide-react'
import { api } from '../lib/api'
import { PageHeader, Button, Spinner, Badge, Input } from '../components/ui'
import { cn } from '../lib/cn'
import { RouteLoadCard } from '../components/RouteLoadCard'

interface ChronusDestination {
  dealerCode: string
  dealerName: string
  city: string
  dealershipId: string | null
  matched: boolean
  motoCount: number
  minExpiryDate: string | null
  expiryExcluded?: boolean
}

interface ChronusRoutePreview {
  manifesto: string
  name: string
  date: string
  motoCount: number
  plateHint: string | null
  requiredFleetOwner?: 'LSL' | 'AG' | null
  requiredCapacityMotos?: number | null
  plateHintIsFictional?: boolean
  hasPriority: boolean
  priorityExpiryDate: string | null
  destinations: ChronusDestination[]
  unmatchedDealerCodes: string[]
  duplicateRouteId: string | null
  duplicateRouteName: string | null
  duplicateRouteDate?: string | null
  canRefreshLoad?: boolean
  inTransitEligible?: boolean
  assignedPlate?: string | null
  assignedDriverName?: string | null
  sentAt?: string | null
  chronusStatus?: string | null
  skipReason?: string | null
  skipLabel?: string | null
  calendar?: {
    status: 'APTO' | 'ATENCAO' | 'RISCO' | 'PENDENTE'
    blocked: boolean
    summary: string
  }
}

interface ChronusPreviewResponse {
  batchId: string
  routeDate: string
  routeDateLabel: string
  isFridayImport: boolean
  saturdayLoadDate: string
  mondayLoadDate: string
  totalRows: number
  rowsWithoutManifesto: number
  manifestCount: number
  routes: ChronusRoutePreview[]
  inTransit?: boolean
  message?: string
}

export function ImportChronus() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [inTransit, setInTransit] = useState(false)
  const [preview, setPreview] = useState<ChronusPreviewResponse | null>(null)
  const [error, setError] = useState('')

  const previewMutation = useMutation({
    mutationFn: async ({
      selected,
      date,
      saturday,
      transit,
    }: {
      selected: File
      date?: string
      saturday?: boolean
      transit?: boolean
    }) => {
      const form = new FormData()
      form.append('file', selected)
      if (date) form.append('routeDate', date)
      if (saturday) form.append('saturdayWork', 'true')
      if (transit) form.append('inTransit', 'true')
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
          refreshed: number
          started?: number
          attached?: number
          inTransit?: boolean
          plates?: string[]
          skipped?: { manifesto: string; reason: string }[]
          skippedDuplicates: { manifesto: string; name: string }[]
          skippedInvalid?: string[]
        }>('/planning/import/chronus/commit', { batchId }, { timeout: 120_000 })
      ).data,
    onSuccess: async (data) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['routes'] }),
        qc.invalidateQueries({ queryKey: ['trips'] }),
        qc.invalidateQueries({ queryKey: ['returns'] }),
        qc.invalidateQueries({ queryKey: ['vehicles'] }),
        qc.invalidateQueries({ queryKey: ['planning-board'] }),
        qc.invalidateQueries({ queryKey: ['planning-alerts'] }),
      ])
      if (data.inTransit) {
        navigate('/viagens', {
          state: {
            importOk: `${data.started ?? 0} viagem(ns) em trânsito recuperada(s)${
              data.plates?.length ? ` · ${data.plates.join(', ')}` : ''
            }.`,
          },
        })
        return
      }
      navigate('/roteiros', {
        state: {
          importOk: [
            data.refreshed > 0
              ? `${data.created} roteiro(s) criado(s) · ${data.refreshed} carga(s) atualizada(s).`
              : `${data.created} roteiro(s) criado(s) a partir do Chronus.`,
            data.skippedInvalid?.length
              ? `${data.skippedInvalid.length} manifesto(s) sem cadastro ignorado(s).`
              : '',
          ]
            .filter(Boolean)
            .join(' '),
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

  const startable =
    preview?.routes.filter(
      (r) =>
        r.inTransitEligible &&
        !r.skipReason &&
        r.unmatchedDealerCodes.length === 0,
    ) ?? []
  const creatable = preview?.inTransit
    ? startable
    : preview?.routes.filter(
        (r) => !r.duplicateRouteId && r.unmatchedDealerCodes.length === 0,
      )
  const refreshable =
    preview?.routes.filter(
      (r) => r.canRefreshLoad && r.duplicateRouteId && r.unmatchedDealerCodes.length === 0,
    ) ?? []
  const duplicates =
    preview?.routes.filter((r) => r.duplicateRouteId && !r.canRefreshLoad) ?? []
  const invalid = preview?.routes.filter(
    (r) => !r.duplicateRouteId && r.unmatchedDealerCodes.length > 0,
  ) ?? []

  function onPick(next: File | null) {
    setFile(next)
    setPreview(null)
    setError('')
    if (next) previewMutation.mutate({ selected: next, transit: inTransit })
  }

  function reloadPreview(nextDate: string, nextSaturday: boolean, transit = inTransit) {
    if (!file) return
    setError('')
    previewMutation.mutate({
      selected: file,
      date: nextDate,
      saturday: nextSaturday,
      transit,
    })
  }

  function selectMode(nextTransit: boolean) {
    setInTransit(nextTransit)
    setPreview(null)
    setError('')
    if (file) previewMutation.mutate({ selected: file, transit: nextTransit })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <PageHeader
        title="Importar Chronus"
        description={
          inTransit
            ? 'Relatório das cargas que já saíram: abre a viagem em trânsito com a placa e o motorista, como na definição de placas.'
            : 'O mesmo número de manifesto (ex.: 384094) atualiza a viagem já importada, mesmo em outro dia. Não cria duplicata.'
        }
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
        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={!inTransit ? 'primary' : 'secondary'}
            onClick={() => selectMode(false)}
            disabled={previewMutation.isPending}
          >
            Carga (aguardando placas)
          </Button>
          <Button
            type="button"
            size="sm"
            variant={inTransit ? 'primary' : 'secondary'}
            onClick={() => selectMode(true)}
            disabled={previewMutation.isPending}
          >
            Saídas (em trânsito)
          </Button>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Arquivo do Chronus</p>
            <p className="text-sm text-[var(--color-text-muted)]">
              {inTransit
                ? 'Use o relatório das que já saíram para entrega (não o de carga). Placa real e motorista cadastrado viram viagem em andamento hoje.'
                : 'Linhas sem manifesto são ignoradas. Manifesto novo vira um roteiro. Se o número já existe, motos, paradas e vencimento entram na viagem importada. Na sexta o carregamento vai para segunda, a menos que haja expediente no sábado.'}
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat
              label={preview.inTransit ? 'Data da saída' : 'Data dos roteiros'}
              value={preview.routeDateLabel}
            />
            <Stat label="Manifestos" value={String(preview.manifestCount)} />
            <Stat label="Sem manifesto (ignoradas)" value={String(preview.rowsWithoutManifesto)} />
            <Stat
              label={preview.inTransit ? 'Em trânsito' : 'Novos roteiros'}
              value={String(creatable?.length ?? 0)}
            />
            <Stat
              label={preview.inTransit ? 'Ignorados' : 'Atualizar carga'}
              value={
                preview.inTransit
                  ? String(preview.routes.length - startable.length)
                  : String(refreshable.length)
              }
            />
          </div>

          {preview.isFridayImport && !preview.inTransit && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <p className="text-sm font-medium">Sexta-feira: quando carregar?</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Sem expediente no sábado, os roteiros ficam na segunda. Se o sábado tiver carga, escolha
                sábado.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={preview.routeDate === preview.mondayLoadDate ? 'primary' : 'secondary'}
                  size="sm"
                  disabled={previewMutation.isPending}
                  onClick={() => reloadPreview(preview.mondayLoadDate, false)}
                >
                  Segunda {preview.mondayLoadDate.slice(8, 10)}/{preview.mondayLoadDate.slice(5, 7)}
                </Button>
                <Button
                  type="button"
                  variant={preview.routeDate === preview.saturdayLoadDate ? 'primary' : 'secondary'}
                  size="sm"
                  disabled={previewMutation.isPending}
                  onClick={() => reloadPreview(preview.saturdayLoadDate, true)}
                >
                  Sábado (tem expediente) {preview.saturdayLoadDate.slice(8, 10)}/
                  {preview.saturdayLoadDate.slice(5, 7)}
                </Button>
              </div>
            </div>
          )}

          <div className="max-w-xs">
            <Input
              label={
                preview.inTransit
                  ? 'Data de saída (se o Chronus não tiver Data Envio)'
                  : preview.isFridayImport
                    ? 'Outra data'
                    : 'Data do carregamento'
              }
              type="date"
              value={preview.routeDate}
              disabled={previewMutation.isPending}
              onChange={(e) => reloadPreview(e.target.value, false)}
            />
          </div>

          {preview.inTransit && startable.length > 0 && (
            <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-200">
              {startable.length} manifesto(s) vão abrir como <strong>viagem em andamento</strong>{' '}
              (placa + motorista), igual à definição de placas.
            </p>
          )}

          {refreshable.length > 0 && !preview.inTransit && (
            <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-200">
              {refreshable.length} roteiro(s) repetido(s) terão <strong>carga atualizada</strong>{' '}
              (motos, vencimento e paradas) sem criar duplicata.
            </p>
          )}

          {duplicates.length > 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
              {duplicates.length} manifesto(s) já estão <strong>concluídos</strong> — não serão
              duplicados nem alterados.
            </p>
          )}

          {invalid.length > 0 && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {invalid.length} manifesto(s) com concessionária não cadastrada — esses não serão
              criados. Os demais podem ser confirmados. Cadastre o código Chronus em Concessionárias:{' '}
              <strong>
                {[
                  ...new Set(
                    invalid.flatMap((r) =>
                      r.destinations
                        .filter((d) => !d.matched)
                        .map((d) =>
                          d.dealerCode
                            ? `${d.dealerName} (${d.dealerCode})`
                            : d.dealerName,
                        ),
                    ),
                  ),
                ].join(' · ')}
              </strong>
              .
            </p>
          )}

          <div className="space-y-4">
            {preview.routes.map((route) => {
              const blocked = preview.inTransit
                ? !startable.some((r) => r.manifesto === route.manifesto)
                : (!!route.duplicateRouteId && !route.canRefreshLoad) ||
                  route.unmatchedDealerCodes.length > 0
              return (
                <div key={route.manifesto} className={cn(blocked && 'opacity-70')}>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {preview.inTransit && route.inTransitEligible && (
                      <Badge tone="info">
                        Em trânsito
                        {route.assignedPlate ? ` · ${route.assignedPlate}` : ''}
                        {route.assignedDriverName ? ` · ${route.assignedDriverName}` : ''}
                      </Badge>
                    )}
                    {preview.inTransit && route.skipLabel && (
                      <Badge tone="warning">{route.skipLabel}</Badge>
                    )}
                    {route.calendar?.status === 'RISCO' && (
                      <Badge tone="danger">Loja fechada na chegada</Badge>
                    )}
                    {route.calendar?.status === 'ATENCAO' && (
                      <Badge tone="warning">Conferir se a loja abre</Badge>
                    )}
                    {route.canRefreshLoad && route.duplicateRouteId && !preview.inTransit && (
                      <Badge tone="info">Atualizar carga</Badge>
                    )}
                    {route.duplicateRouteId && !route.canRefreshLoad && !preview.inTransit && (
                      <Badge tone="warning">Já concluído</Badge>
                    )}
                    {route.unmatchedDealerCodes.length > 0 && (
                      <Badge tone="danger">
                        Sem cadastro
                        {route.unmatchedDealerCodes.filter(Boolean).length
                          ? ` · cód. ${route.unmatchedDealerCodes.filter(Boolean).join(', ')}`
                          : ''}
                      </Badge>
                    )}
                  </div>
                  {route.calendar && route.calendar.status !== 'APTO' && route.calendar.summary && (
                    <p className="mb-2 text-xs text-[var(--color-text-muted)]">{route.calendar.summary}</p>
                  )}
                  <RouteLoadCard
                    name={route.duplicateRouteName || route.name}
                    loadDate={route.duplicateRouteDate || route.date}
                    priorityExpiryDate={route.priorityExpiryDate}
                    notes={
                      preview.inTransit
                        ? [
                            route.assignedPlate ? `Placa: ${route.assignedPlate}` : null,
                            route.assignedDriverName
                              ? `Motorista: ${route.assignedDriverName}`
                              : null,
                            route.chronusStatus ? `Status Chronus: ${route.chronusStatus}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || null
                        : route.plateHint
                          ? `Placa Chronus: ${route.plateHint}`
                          : null
                    }
                    requiredFleetOwner={route.requiredFleetOwner}
                    requiredCapacityMotos={route.requiredCapacityMotos}
                    destinations={route.destinations.map((d) => ({
                      city: d.city,
                      dealershipName: d.dealerName,
                      minExpiryDate: d.minExpiryDate,
                      motoCount: d.motoCount,
                    }))}
                  />
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
                (!creatable?.length && !refreshable.length) ||
                commitMutation.isPending ||
                previewMutation.isPending
              }
            >
              {commitMutation.isPending ? <Spinner size="sm" /> : null}
              {preview.inTransit ? 'Recuperar viagens em andamento' : 'Confirmar'}
              {preview.inTransit
                ? startable.length > 0
                  ? ` (${startable.length})`
                  : ''
                : (creatable?.length ?? 0) + refreshable.length > 0
                  ? ` (${[
                      creatable?.length
                        ? `${creatable.length} novo${creatable.length === 1 ? '' : 's'}`
                        : '',
                      refreshable.length
                        ? `${refreshable.length} atualização${refreshable.length === 1 ? '' : 'ões'}`
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')})`
                  : ''}
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
