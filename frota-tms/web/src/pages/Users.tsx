import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil } from 'lucide-react'
import { api } from '../lib/api'
import type { Role, User } from '../types'
import {
  PageHeader,
  Button,
  Modal,
  Input,
  Select,
  Spinner,
  EmptyState,
  Badge,
} from '../components/ui'
import { roleLabels } from '../lib/labels'
import { formatDate } from '../lib/format'

const emptyForm = {
  name: '',
  email: '',
  password: '',
  role: 'CONSULTA' as Role,
}

export function Users() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [form, setForm] = useState(emptyForm)

  const { data = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<User[]>('/auth/users')).data,
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        const payload: Record<string, unknown> = {
          name: form.name,
          role: form.role,
        }
        if (form.password) payload.password = form.password
        return api.patch(`/auth/users/${editing.id}`, payload)
      }
      return api.post('/auth/users', form)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] })
      setOpen(false)
      setEditing(null)
      setForm(emptyForm)
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async (user: User) =>
      api.patch(`/auth/users/${user.id}`, { active: !user.active }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['users'] }),
  })

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setOpen(true)
  }

  function openEdit(u: User) {
    setEditing(u)
    setForm({
      name: u.name,
      email: u.email,
      password: '',
      role: u.role,
    })
    setOpen(true)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    saveMutation.mutate()
  }

  return (
    <div>
      <PageHeader
        title="Usuários"
        description="Gestão de acesso e perfis do sistema"
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Novo usuário
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : data.length === 0 ? (
        <EmptyState title="Nenhum usuário" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Status</th>
                <th>Criado em</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <Badge tone="primary">{roleLabels[u.role]}</Badge>
                  </td>
                  <td>
                    <Badge tone={u.active ? 'success' : 'default'}>
                      {u.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                  <td>{formatDate(u.createdAt)}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleMutation.mutate(u)}
                      >
                        {u.active ? 'Desativar' : 'Ativar'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Editar usuário' : 'Novo usuário'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={onSubmit} loading={saveMutation.isPending}>
              Salvar
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-3">
          <Input
            label="Nome"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          {!editing && (
            <Input
              label="E-mail"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          )}
          <Input
            label={editing ? 'Nova senha (opcional)' : 'Senha'}
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required={!editing}
            minLength={6}
          />
          <Select
            label="Perfil"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            options={Object.entries(roleLabels).map(([value, label]) => ({ value, label }))}
          />
        </form>
        {saveMutation.isError && (
          <p className="mt-3 text-sm text-[var(--color-danger)]">
            {(saveMutation.error as { response?: { data?: { error?: string } } })?.response?.data
              ?.error ?? 'Erro ao salvar'}
          </p>
        )}
      </Modal>
    </div>
  )
}
