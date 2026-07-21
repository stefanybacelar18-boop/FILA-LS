import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Ban, Unlock } from 'lucide-react'
import { api } from '../lib/api'
import type { Driver } from '../types'
import {
  PageHeader,
  SearchInput,
  Button,
  Modal,
  Input,
  Textarea,
  Spinner,
  EmptyState,
  ConfirmModal,
  Badge,
} from '../components/ui'
import { useAuthStore } from '../stores/auth'

const emptyForm = { name: '', phone: '', notes: '', active: true }

export function Drivers() {
  const qc = useQueryClient()
  const isAdmin = useAuthStore((s) => s.hasRole('ADMIN'))
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Driver | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [deactivateId, setDeactivateId] = useState<string | null>(null)
  const [blockTarget, setBlockTarget] = useState<Driver | null>(null)
  const [blockReason, setBlockReason] = useState('')

  const { data = [], isLoading } = useQuery({
    queryKey: ['drivers', q],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (q) params.q = q
      return (await api.get<Driver[]>('/drivers', { params })).data
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        notes: form.notes.trim() || null,
        active: form.active,
      }
      if (editing) return api.put(`/drivers/${editing.id}`, payload)
      return api.post('/drivers', payload)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['drivers'] })
      setOpen(false)
      setEditing(null)
      setForm(emptyForm)
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/drivers/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['drivers'] })
      setDeactivateId(null)
    },
  })

  const blockMutation = useMutation({
    mutationFn: async () => {
      if (!blockTarget) throw new Error('Sem motorista')
      return api.post(`/drivers/${blockTarget.id}/block`, { reason: blockReason.trim() })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['drivers'] })
      setBlockTarget(null)
      setBlockReason('')
    },
  })

  const unblockMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/drivers/${id}/unblock`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['drivers'] })
    },
  })

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setOpen(true)
  }

  function openEdit(d: Driver) {
    setEditing(d)
    setForm({
      name: d.name,
      phone: d.phone ?? '',
      notes: d.notes ?? '',
      active: d.active,
    })
    setOpen(true)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    saveMutation.mutate()
  }

  return (
    <div className="page-desktop max-w-3xl">
      <PageHeader
        title="Motoristas"
        description="Cadastro usado na definição de placa. Motorista bloqueado não pode ser selecionado."
        actions={
          isAdmin ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Novo motorista
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 max-w-sm">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar motorista…" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          title="Nenhum motorista"
          description={isAdmin ? 'Cadastre o primeiro motorista.' : undefined}
          action={
            isAdmin ? <Button onClick={openCreate}>Novo motorista</Button> : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/60 text-xs font-semibold tracking-wide text-[var(--color-text-muted)] uppercase">
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Telefone</th>
                <th className="px-4 py-3">Status</th>
                {isAdmin && <th className="px-4 py-3 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr
                  key={d.id}
                  className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]/40"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium">{d.name}</p>
                    {d.blocked && d.blockReason && (
                      <p className="mt-0.5 text-xs text-[var(--color-danger)]">
                        Motivo: {d.blockReason}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">{d.phone || '—'}</td>
                  <td className="px-4 py-3">
                    {!d.active ? (
                      <Badge tone="default">Inativo</Badge>
                    ) : d.blocked ? (
                      <Badge tone="danger">Bloqueado</Badge>
                    ) : (
                      <Badge tone="success">Ativo</Badge>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1">
                        <button
                          type="button"
                          title="Editar"
                          onClick={() => openEdit(d)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {d.active && !d.blocked && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setBlockTarget(d)
                              setBlockReason('')
                            }}
                          >
                            <Ban className="h-3.5 w-3.5" />
                            Bloquear
                          </Button>
                        )}
                        {d.active && d.blocked && (
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={unblockMutation.isPending}
                            onClick={() => unblockMutation.mutate(d.id)}
                          >
                            <Unlock className="h-3.5 w-3.5" />
                            Desbloquear
                          </Button>
                        )}
                        {d.active && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeactivateId(d.id)}
                          >
                            Desativar
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

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Editar motorista' : 'Novo motorista'}
      >
        <form onSubmit={onSubmit} className="space-y-3">
          <Input
            label="Nome *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            minLength={2}
          />
          <Input
            label="Telefone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Input
            label="Observação"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          {editing && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="accent-[var(--color-primary)]"
              />
              Ativo
            </label>
          )}
          {saveMutation.isError && (
            <p className="text-sm text-[var(--color-danger)]">
              {(saveMutation.error as { response?: { data?: { error?: string } } })?.response
                ?.data?.error ?? 'Erro ao salvar'}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={saveMutation.isPending}>
              Salvar
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!blockTarget}
        onClose={() => {
          setBlockTarget(null)
          setBlockReason('')
        }}
        title={`Bloquear ${blockTarget?.name ?? 'motorista'}`}
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            blockMutation.mutate()
          }}
        >
          <p className="text-sm text-[var(--color-text-muted)]">
            O operador verá este motivo ao tentar usar o motorista na definição de placa.
          </p>
          <Textarea
            label="Motivo do bloqueio *"
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
            required
            minLength={3}
            rows={3}
            placeholder="Ex.: CNH vencida, afastamento médico, férias…"
          />
          {blockMutation.isError && (
            <p className="text-sm text-[var(--color-danger)]">
              {(blockMutation.error as { response?: { data?: { error?: string } } })?.response
                ?.data?.error ?? 'Erro ao bloquear'}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setBlockTarget(null)
                setBlockReason('')
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={blockMutation.isPending} disabled={blockReason.trim().length < 3}>
              Confirmar bloqueio
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deactivateId}
        onClose={() => setDeactivateId(null)}
        onConfirm={() => deactivateId && deactivateMutation.mutate(deactivateId)}
        title="Desativar motorista?"
        message="Ele deixa de aparecer na seleção de placa. Histórico de viagens permanece."
        confirmLabel="Desativar"
        danger
        loading={deactivateMutation.isPending}
      />
    </div>
  )
}
