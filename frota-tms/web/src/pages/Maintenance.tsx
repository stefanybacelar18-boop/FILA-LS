import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Ban, CheckCircle2, Wrench } from 'lucide-react'
import { api } from '../lib/api'
import type { Vehicle } from '../types'
import {
  PageHeader,
  SearchInput,
  Button,
  Modal,
  Textarea,
  Select,
  PlateBadge,
  Spinner,
  EmptyState,
  Badge,
} from '../components/ui'
import { useAuthStore } from '../stores/auth'
import { vehicleBlockCategoryLabels, vehicleTypeLabels } from '../lib/labels'
import { formatDateTime } from '../lib/format'

export function Maintenance() {
  const qc = useQueryClient()
  const canOperate = useAuthStore((s) => s.hasRole('ADMIN', 'OPERACAO'))
  const [q, setQ] = useState('')
  const [blockOpen, setBlockOpen] = useState(false)
  const [blockVehicleId, setBlockVehicleId] = useState('')
  const [blockCategory, setBlockCategory] = useState<'MANUTENCAO' | 'OUTRO'>('MANUTENCAO')
  const [blockReason, setBlockReason] = useState('')
  const [releaseTarget, setReleaseTarget] = useState<Vehicle | null>(null)
  const [releaseNotes, setReleaseNotes] = useState('')

  const { data: held = [], isLoading } = useQuery({
    queryKey: ['vehicles-maintenance'],
    queryFn: async () => (await api.get<Vehicle[]>('/vehicles/maintenance')).data,
  })

  const { data: available = [] } = useQuery({
    queryKey: ['vehicles-available-for-block'],
    queryFn: async () => (await api.get<Vehicle[]>('/vehicles/available')).data,
    enabled: blockOpen && canOperate,
  })

  const filtered = useMemo(() => {
    const term = q.trim().toUpperCase()
    if (!term) return held
    return held.filter(
      (v) =>
        v.plate.includes(term) ||
        (v.defaultDriver ?? '').toUpperCase().includes(term) ||
        (v.blockReason ?? '').toUpperCase().includes(term),
    )
  }, [held, q])

  const blockMutation = useMutation({
    mutationFn: async () => {
      if (!blockVehicleId) throw new Error('Selecione a placa')
      return api.post(`/vehicles/${blockVehicleId}/block`, {
        category: blockCategory,
        reason: blockReason.trim(),
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vehicles'] })
      void qc.invalidateQueries({ queryKey: ['vehicles-maintenance'] })
      void qc.invalidateQueries({ queryKey: ['vehicles-available-for-block'] })
      void qc.invalidateQueries({ queryKey: ['vehicles-availability-summary'] })
      void qc.invalidateQueries({ queryKey: ['plates-board'] })
      setBlockOpen(false)
      setBlockVehicleId('')
      setBlockCategory('MANUTENCAO')
      setBlockReason('')
    },
  })

  const releaseMutation = useMutation({
    mutationFn: async () => {
      if (!releaseTarget) throw new Error('Sem veículo')
      return api.post(`/vehicles/${releaseTarget.id}/release`, {
        notes: releaseNotes.trim() || null,
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vehicles'] })
      void qc.invalidateQueries({ queryKey: ['vehicles-maintenance'] })
      void qc.invalidateQueries({ queryKey: ['vehicles-available-for-block'] })
      void qc.invalidateQueries({ queryKey: ['vehicles-availability-summary'] })
      void qc.invalidateQueries({ queryKey: ['plates-board'] })
      setReleaseTarget(null)
      setReleaseNotes('')
    },
  })

  function onBlockSubmit(e: FormEvent) {
    e.preventDefault()
    blockMutation.mutate()
  }

  return (
    <div>
      <PageHeader
        title="Manutenção / bloqueio"
        description="Placas fora de operação até alguém liberar como OK para carregar de novo"
        actions={
          canOperate ? (
            <Button onClick={() => setBlockOpen(true)}>
              <Ban className="h-4 w-4" />
              Bloquear placa
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar placa, motorista ou motivo…" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nenhuma placa em manutenção"
          description="Quando Admin ou Operação bloquear uma placa, ela aparece aqui até a liberação."
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Placa</th>
                <th>Tipo</th>
                <th>Motivo</th>
                <th>Desde</th>
                <th>Registrado por</th>
                {canOperate && <th />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.id}>
                  <td>
                    <Link to={`/frota/${v.id}`} className="inline-flex">
                      <PlateBadge plate={v.plate} color={v.color} />
                    </Link>
                  </td>
                  <td>{vehicleTypeLabels[v.type]}</td>
                  <td>
                    <div className="mb-1">
                      <Badge tone="warning">
                        {vehicleBlockCategoryLabels[v.blockCategory ?? 'MANUTENCAO'] ??
                          v.blockCategory ??
                          'Manutenção'}
                      </Badge>
                    </div>
                    <div className="text-sm">{v.blockReason || '—'}</div>
                  </td>
                  <td>{formatDateTime(v.blockedAt)}</td>
                  <td>{v.blockedBy?.name ?? '—'}</td>
                  {canOperate && (
                    <td>
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          onClick={() => {
                            setReleaseTarget(v)
                            setReleaseNotes('')
                          }}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Liberar (OK)
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        title="Bloquear placa"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBlockOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={onBlockSubmit}
              loading={blockMutation.isPending}
              disabled={!blockVehicleId || blockReason.trim().length < 3}
            >
              <Wrench className="h-4 w-4" />
              Confirmar bloqueio
            </Button>
          </>
        }
      >
        <form onSubmit={onBlockSubmit} className="space-y-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            A placa fica indisponível para novo carregamento até alguém informar que já está OK.
          </p>
          <Select
            label="Placa disponível"
            value={blockVehicleId}
            onChange={(e) => setBlockVehicleId(e.target.value)}
            options={available.map((v) => ({
              value: v.id,
              label: `${v.plate} · ${v.capacityMotos} motos${v.defaultDriver ? ` · ${v.defaultDriver}` : ''}`,
            }))}
            placeholder={available.length ? 'Selecione a placa' : 'Nenhuma placa disponível'}
            required
          />
          <Select
            label="Tipo"
            value={blockCategory}
            onChange={(e) => setBlockCategory(e.target.value as 'MANUTENCAO' | 'OUTRO')}
            options={[
              { value: 'MANUTENCAO', label: 'Manutenção' },
              { value: 'OUTRO', label: 'Outro motivo' },
            ]}
          />
          <Textarea
            label="Motivo"
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
            placeholder="Ex.: troca de embreagem, aguardando peça…"
            required
          />
          {blockMutation.isError && (
            <p className="text-sm text-[var(--color-danger)]">
              {(blockMutation.error as { response?: { data?: { error?: string } } })?.response?.data
                ?.error ?? 'Não foi possível bloquear'}
            </p>
          )}
        </form>
      </Modal>

      <Modal
        open={!!releaseTarget}
        onClose={() => setReleaseTarget(null)}
        title={releaseTarget ? `Liberar ${releaseTarget.plate}` : 'Liberar'}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReleaseTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={() => releaseMutation.mutate()} loading={releaseMutation.isPending}>
              <CheckCircle2 className="h-4 w-4" />
              Confirmar: veículo OK
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            Confirma que a placa pode voltar a carregar? Ela entra novamente como disponível.
          </p>
          {releaseTarget?.blockReason && (
            <p className="rounded-lg bg-[var(--color-surface-muted)] px-3 py-2 text-sm">
              Motivo atual: <strong>{releaseTarget.blockReason}</strong>
            </p>
          )}
          <Textarea
            label="Observação (opcional)"
            value={releaseNotes}
            onChange={(e) => setReleaseNotes(e.target.value)}
            placeholder="Ex.: serviço concluído, liberado pela oficina"
          />
          {releaseMutation.isError && (
            <p className="text-sm text-[var(--color-danger)]">
              {(releaseMutation.error as { response?: { data?: { error?: string } } })?.response
                ?.data?.error ?? 'Não foi possível liberar'}
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}
