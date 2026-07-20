import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { AuditLog } from '../types'
import { PageHeader, Spinner, EmptyState, Badge } from '../components/ui'
import { formatDateTime } from '../lib/format'

export function Audit() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['history', 'audit'],
    queryFn: async () => (await api.get<AuditLog[]>('/history/audit')).data,
  })

  return (
    <div>
      <PageHeader
        title="Auditoria"
        description="Registro de ações realizadas no sistema"
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : data.length === 0 ? (
        <EmptyState title="Nenhum evento de auditoria" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Ação</th>
                <th>Entidade</th>
                <th>Detalhes</th>
                <th>Usuário</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {data.map((log) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                  <td>
                    <Badge tone="primary">{log.action}</Badge>
                  </td>
                  <td>
                    {log.entity}
                    {log.entityId && (
                      <span className="ml-1 text-xs text-[var(--color-text-muted)]">
                        #{log.entityId.slice(0, 8)}
                      </span>
                    )}
                  </td>
                  <td className="max-w-xs truncate">{log.details ?? '—'}</td>
                  <td>
                    {log.user ? (
                      <span>
                        {log.user.name}
                        <span className="block text-xs text-[var(--color-text-muted)]">
                          {log.user.email}
                        </span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="text-xs text-[var(--color-text-muted)]">{log.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
