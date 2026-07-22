import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import type { Vehicle, VehicleStatus, VehicleType } from '../types'
import {
  PageHeader,
  SearchInput,
  Select,
  Button,
  Modal,
  Input,
  Textarea,
  PlateBadge,
  Spinner,
  EmptyState,
  ConfirmModal,
} from '../components/ui'
import { useAuthStore } from '../stores/auth'
import { vehicleStatusLabels, vehicleTypeLabels } from '../lib/labels'
import { formatDate } from '../lib/format'

const emptyForm = {
  plate: '',
  type: 'TRUCK' as VehicleType,
  model: '—',
  brand: '—',
  year: 2020,
  capacityMotos: 50,
  defaultDriver: '',
  status: 'DISPONIVEL' as VehicleStatus,
  notes: '',
}

export function Fleet() {
  const qc = useQueryClient()
  const isAdmin = useAuthStore((s) => s.hasRole('ADMIN'))
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [owner, setOwner] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Vehicle | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data = [], isLoading } = useQuery({
    queryKey: ['vehicles', q, status, type],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (q) params.q = q
      if (status) params.status = status
      if (type) params.type = type
      return (await api.get<Vehicle[]>('/vehicles', { params })).data
    },
  })

  const filtered = useMemo(() => {
    if (!owner) return data
    return data.filter((v) => (v.owner ?? 'AG') === owner)
  }, [data, owner])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        plate: form.plate,
        year: Number(form.year),
        capacityMotos: Number(form.capacityMotos),
        defaultDriver: form.defaultDriver || null,
        notes: form.notes || null,
      }
      if (editing) return api.put(`/vehicles/${editing.id}`, payload)
      return api.post('/vehicles', payload)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vehicles'] })
      setOpen(false)
      setEditing(null)
      setForm(emptyForm)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/vehicles/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vehicles'] })
      setDeleteId(null)
    },
  })

  const statusOptions = useMemo(
    () => Object.entries(vehicleStatusLabels).map(([value, label]) => ({ value, label })),
    [],
  )

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setOpen(true)
  }

  function openEdit(v: Vehicle) {
    setEditing(v)
    setForm({
      plate: v.plate,
      type: v.type,
      model: v.model,
      brand: v.brand,
      year: v.year,
      capacityMotos: v.capacityMotos,
      defaultDriver: v.defaultDriver ?? '',
      status: v.status,
      notes: v.notes ?? '',
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
        title="Frota"
        description="Cadastro e situação das placas"
        actions={
          isAdmin ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Novo veículo
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar placa, marca ou modelo…" />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={statusOptions}
          placeholder="Todas as situações"
        />
        <Select
          value={type}
          onChange={(e) => setType(e.target.value)}
          options={[
            { value: 'TRUCK', label: 'Truck' },
            { value: 'CARRETA', label: 'Carreta' },
          ]}
          placeholder="Todos os tipos"
        />
        <Select
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          options={[
            { value: 'LSL', label: 'Frota LSL' },
            { value: 'AG', label: 'Frota AG' },
          ]}
          placeholder="LSL e AG"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="Nenhum veículo encontrado" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Placa</th>
                <th>Tipo</th>
                <th>Veículo</th>
                <th>Capacidade</th>
                <th>Motorista</th>
                <th>Situação</th>
                <th>Previsão retorno</th>
                {isAdmin && <th />}
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
                    <div className="font-medium">
                      {v.brand} {v.model}
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)]">{v.year}</div>
                  </td>
                  <td>{v.capacityMotos} motos</td>
                  <td>{v.defaultDriver ?? '—'}</td>
                  <td>{vehicleStatusLabels[v.status]}</td>
                  <td>{formatDate(v.expectedReturn)}</td>
                  {isAdmin && (
                    <td>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(v)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteId(v.id)}>
                          <Trash2 className="h-4 w-4 text-[var(--color-danger)]" />
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
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Editar veículo' : 'Novo veículo'}
        size="lg"
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
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Placa"
            value={form.plate}
            onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase() })}
            required
          />
          <Select
            label="Tipo"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as VehicleType })}
            options={[
              { value: 'TRUCK', label: 'Truck' },
              { value: 'CARRETA', label: 'Carreta' },
            ]}
          />
          <Input
            label="Marca"
            value={form.brand}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
            required
          />
          <Input
            label="Modelo"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            required
          />
          <Input
            label="Ano"
            type="number"
            value={form.year}
            onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
            required
          />
          <Input
            label="Capacidade (motos)"
            type="number"
            value={form.capacityMotos}
            onChange={(e) => setForm({ ...form, capacityMotos: Number(e.target.value) })}
            required
          />
          <Input
            label="Motorista padrão"
            value={form.defaultDriver}
            onChange={(e) => setForm({ ...form, defaultDriver: e.target.value })}
            placeholder="Opcional"
          />
          <Select
            label="Situação"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as VehicleStatus })}
            options={statusOptions}
          />
          <div className="sm:col-span-2">
            <Textarea
              label="Observações"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </form>
        {saveMutation.isError && (
          <p className="mt-3 text-sm text-[var(--color-danger)]">
            {(saveMutation.error as { response?: { data?: { error?: string } } })?.response?.data
              ?.error ?? 'Erro ao salvar'}
          </p>
        )}
      </Modal>

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Excluir veículo"
        message="Confirma a exclusão deste veículo? Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        danger
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
