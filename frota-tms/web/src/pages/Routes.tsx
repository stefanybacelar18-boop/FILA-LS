import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Ban, Send } from 'lucide-react'
import { api } from '../lib/api'
import type { Route } from '../types'
import {
  PageHeader,
  SearchInput,
  Select,
  Button,
  Badge,
  Spinner,
  EmptyState,
  ConfirmModal,
} from '../components/ui'
import { useAuthStore } from '../stores/auth'
import { routeStatusLabels } from '../lib/labels'
import { formatDate } from '../lib/format'

function citiesOf(r: Route): string {
  if (r.dealerships && r.dealerships.length > 0) {
    return [...new Set(r.dealerships.map((rd) => rd.dealership.city))].join(', ')
  }
  return r.dealership?.city ?? '—'
}

export function Routes() {
  const qc = useQueryClient()
  const isAdmin = useAuthStore((s) => s.hasRole('ADMIN'))
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [sendId, setSendId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  const { data = [], isLoading } = useQuery({
    queryKey: ['routes', q, status],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (q) params.q = q
      if (status) params.status = status
      return (await api.get<Route[]>('/routes', { params })).data
    },
  })

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/routes/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['routes'] })
      setCancelId(null)
      setError('')
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Não foi possível cancelar.',
      )
      setCancelId(null)
    },
  })

  const sendMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/routes/${id}/send-to-operation`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['routes'] })
      void qc.invalidateQueries({ queryKey: ['planning-alerts'] })
      setSendId(null)
      setOkMsg('Roteiro disponibilizado para a Operação.')
      setError('')
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Não foi possível disponibilizar.',
      )
      setSendId(null)
    },
  })

  return (
    <div>
      <PageHeader
        title="Roteiros"
        description="Monte o roteiro e disponibilize. A Operação escolhe 1 placa."
        actions={
          isAdmin ? (
            <Link to="/roteiros/novo">
              <Button>
                <Plus className="h-4 w-4" />
                Novo roteiro
              </Button>
            </Link>
          ) : undefined
        }
      />

      {okMsg && <p className="mb-3 text-sm text-[var(--color-success)]">{okMsg}</p>}
      {error && <p className="mb-3 text-sm text-[var(--color-danger)]">{error}</p>}

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar roteiro ou cidade…" />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={Object.entries(routeStatusLabels).map(([value, label]) => ({ value, label }))}
          placeholder="Todos os status"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          title="Nenhum roteiro"
          description={isAdmin ? 'Crie o primeiro roteiro para a Operação.' : undefined}
          action={
            isAdmin ? (
              <Link to="/roteiros/novo">
                <Button>Novo roteiro</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Roteiro</th>
                <th>Data</th>
                <th>Destinos</th>
                <th>Status</th>
                <th>Placa</th>
                {isAdmin && <th />}
              </tr>
            </thead>
            <tbody>
              {data.map((r) => {
                const assigned = r.vehicles?.length ?? 0
                const plate = r.vehicles?.[0]?.vehicle?.plate
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        {isAdmin ? (
                          <Link
                            to={`/roteiros/${r.id}`}
                            className="font-medium text-[var(--color-primary)] hover:underline"
                          >
                            {r.name}
                          </Link>
                        ) : (
                          <span className="font-medium">{r.name}</span>
                        )}
                        {r.hasPriority && <Badge tone="warning">Prioridade</Badge>}
                      </div>
                      {r.priorityNotes && (
                        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                          {r.priorityNotes}
                        </p>
                      )}
                    </td>
                    <td>
                      {formatDate(r.date)}
                      <span className="block text-xs text-[var(--color-text-muted)]">06:00</span>
                    </td>
                    <td className="max-w-[14rem] truncate" title={citiesOf(r)}>
                      {citiesOf(r)}
                    </td>
                    <td>
                      <Badge
                        tone={
                          r.status === 'CANCELADO'
                            ? 'danger'
                            : r.status === 'CONCLUIDO'
                              ? 'success'
                              : r.status === 'EM_ANDAMENTO'
                                ? 'info'
                                : r.status === 'AGUARDANDO_PLACAS'
                                  ? 'primary'
                                  : 'default'
                        }
                      >
                        {routeStatusLabels[r.status]}
                      </Badge>
                    </td>
                    <td>
                      {plate ? (
                        <span className="font-medium tracking-wide">{plate}</span>
                      ) : assigned > 0 ? (
                        `${assigned}`
                      ) : (
                        <span className="text-[var(--color-text-muted)]">—</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td>
                        <div className="flex justify-end gap-1">
                          {r.status === 'RASCUNHO' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSendId(r.id)}
                              title="Disponibilizar"
                            >
                              <Send className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Disponibilizar</span>
                            </Button>
                          )}
                          <Link
                            to={`/roteiros/${r.id}`}
                            className="inline-flex h-8 items-center rounded px-2 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
                          >
                            <Pencil className="h-4 w-4" />
                          </Link>
                          {r.status !== 'CANCELADO' && r.status !== 'CONCLUIDO' && (
                            <Button variant="ghost" size="sm" onClick={() => setCancelId(r.id)}>
                              <Ban className="h-4 w-4 text-[var(--color-danger)]" />
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        open={!!cancelId}
        onClose={() => setCancelId(null)}
        onConfirm={() => cancelId && cancelMutation.mutate(cancelId)}
        title="Cancelar roteiro"
        message="Confirma o cancelamento deste roteiro?"
        confirmLabel="Cancelar roteiro"
        danger
        loading={cancelMutation.isPending}
      />

      <ConfirmModal
        open={!!sendId}
        onClose={() => setSendId(null)}
        onConfirm={() => sendId && sendMutation.mutate(sendId)}
        title="Disponibilizar para Operação?"
        message="A Operação verá este roteiro e escolherá 1 placa."
        confirmLabel="Disponibilizar"
        loading={sendMutation.isPending}
      />
    </div>
  )
}
