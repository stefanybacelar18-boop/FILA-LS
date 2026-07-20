import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Ban, Send } from 'lucide-react'
import { api } from '../lib/api'
import type { Route } from '../types'
import {
  PageHeader,
  SearchInput,
  Button,
  Badge,
  Spinner,
  EmptyState,
  ConfirmModal,
} from '../components/ui'
import { useAuthStore } from '../stores/auth'
import { routeStatusLabels } from '../lib/labels'
import { formatDate } from '../lib/format'
import { cn } from '../lib/cn'

function citiesOf(r: Route): string {
  if (r.dealerships && r.dealerships.length > 0) {
    return [...new Set(r.dealerships.map((rd) => rd.dealership.city))].join(', ')
  }
  return r.dealership?.city ?? '—'
}

type Tab = 'pendentes' | 'todos'

export function Routes() {
  const qc = useQueryClient()
  const isAdmin = useAuthStore((s) => s.hasRole('ADMIN'))
  const isOps = useAuthStore((s) => s.hasRole('OPERACAO'))
  const [tab, setTab] = useState<Tab>('pendentes')
  const [q, setQ] = useState('')
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [sendId, setSendId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  const { data = [], isLoading } = useQuery({
    queryKey: ['routes', q],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (q) params.q = q
      return (await api.get<Route[]>('/routes', { params })).data
    },
  })

  const pending = useMemo(
    () =>
      data.filter(
        (r) =>
          r.status === 'AGUARDANDO_PLACAS' && (!r.vehicles || r.vehicles.length === 0),
      ),
    [data],
  )

  const visible = tab === 'pendentes' ? pending : data

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
        description="Data de início + concessionárias. Previsão de retorno automática pelo PAD."
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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setTab('pendentes')}
          className={cn(
            'rounded-full px-4 py-1.5 text-sm font-medium transition',
            tab === 'pendentes'
              ? 'bg-[var(--color-primary)] text-white'
              : 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
          )}
        >
          Pendentes de placa ({pending.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('todos')}
          className={cn(
            'rounded-full px-4 py-1.5 text-sm font-medium transition',
            tab === 'todos'
              ? 'bg-[var(--color-primary)] text-white'
              : 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
          )}
        >
          Todos ({data.length})
        </button>
        <div className="min-w-[12rem] flex-1">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar roteiro ou cidade…" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          title={tab === 'pendentes' ? 'Nenhum roteiro aguardando placa' : 'Nenhum roteiro'}
          description={
            tab === 'pendentes'
              ? isAdmin
                ? 'Crie um roteiro e disponibilize para a Operação.'
                : 'Quando o Admin disponibilizar, aparece aqui.'
              : isAdmin
                ? 'Crie o primeiro roteiro.'
                : undefined
          }
          action={
            isAdmin && tab === 'todos' ? (
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
                <th>Início</th>
                <th>Destinos</th>
                <th>Status</th>
                <th>Placa</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const plate = r.vehicles?.[0]?.vehicle?.plate
                const awaitingPlate =
                  r.status === 'AGUARDANDO_PLACAS' && (!r.vehicles || r.vehicles.length === 0)
                return (
                  <tr key={r.id}>
                    <td>
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
                      ) : (
                        <span className="text-[var(--color-text-muted)]">—</span>
                      )}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        {awaitingPlate && isOps && (
                          <Link to={`/definir-placas?routeId=${r.id}`}>
                            <Button size="sm">Definir placa</Button>
                          </Link>
                        )}
                        {isAdmin && r.status === 'RASCUNHO' && (
                          <Button size="sm" variant="outline" onClick={() => setSendId(r.id)}>
                            <Send className="h-3.5 w-3.5" />
                            Disponibilizar
                          </Button>
                        )}
                        {isAdmin && (
                          <>
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
                          </>
                        )}
                      </div>
                    </td>
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
