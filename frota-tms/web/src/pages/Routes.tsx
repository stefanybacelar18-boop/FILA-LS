import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Ban } from 'lucide-react'
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

export function Routes() {
  const qc = useQueryClient()
  const isAdmin = useAuthStore((s) => s.hasRole('ADMIN'))
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [cancelId, setCancelId] = useState<string | null>(null)

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
    },
  })

  return (
    <div>
      <PageHeader
        title="Roteiros"
        description="Planejamento de entregas por concessionária(s)"
        actions={
          isAdmin ? (
            <Link
              to="/roteiros/novo"
              className="inline-flex h-9 items-center gap-2 rounded-[var(--radius)] bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-fg)] hover:bg-[var(--color-primary-hover)]"
            >
              <Plus className="h-4 w-4" />
              Novo roteiro
            </Link>
          ) : undefined
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar roteiro ou concessionária…" />
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
        <EmptyState title="Nenhum roteiro encontrado" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Roteiro</th>
                <th>Data</th>
                <th>Concessionárias</th>
                <th>Status</th>
                <th>Placas</th>
                <th>Criado por</th>
                {isAdmin && <th />}
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/roteiros/${r.id}`}
                        className="font-medium text-[var(--color-primary)] hover:underline"
                      >
                        {r.name}
                      </Link>
                      {r.hasPriority && (
                        <Badge tone="warning">Carga Prioritária</Badge>
                      )}
                    </div>
                    {r.region && (
                      <p className="text-xs text-[var(--color-text-muted)]">{r.region}</p>
                    )}
                  </td>
                  <td>{formatDate(r.date)}</td>
                  <td>
                    {(() => {
                      const names =
                        r.dealerships && r.dealerships.length > 0
                          ? r.dealerships.map((rd) => rd.dealership.name)
                          : r.dealership
                            ? [r.dealership.name]
                            : []
                      if (names.length === 0) return '—'
                      if (names.length === 1) return names[0]
                      return (
                        <span title={names.join(', ')}>
                          {names.length} concessionárias
                        </span>
                      )
                    })()}
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
                              : 'default'
                      }
                    >
                      {routeStatusLabels[r.status]}
                    </Badge>
                  </td>
                  <td>{r.vehicles?.length ?? 0}</td>
                  <td>{r.createdBy.name}</td>
                  {isAdmin && (
                    <td>
                      <div className="flex justify-end gap-1">
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
              ))}
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
    </div>
  )
}
