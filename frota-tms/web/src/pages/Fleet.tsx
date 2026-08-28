import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Ban, RotateCcw } from 'lucide-react'
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
  Badge,
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
      void qc.invalidateQueries({ queryKey: ['vehicles-available'] })
      void qc.invalidateQueries({ queryKey: ['plates-board'] })
      void qc.invalidateQueries({ queryKey: ['vehicles-availability-summary'] })
      setDeleteId(null)
    },
  })

  const activateMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/vehicles/${id}/activate`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vehicles'] })
      void qc.invalidateQueries({ queryKey: ['vehicles-available'] })
      void qc.invalidateQueries({ queryKey: ['plates-board'] })
      void qc.invalidateQueries({ queryKey: ['vehicles-availability-summary'] })
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
        description="Cadastro e situação das placas. Desative para tirar da operação sem apagar o histórico."
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
      {activateMutation.isError && (
        <p className="mb-3 text-sm text-[var(--color-danger)]">
          {(activateMutation.error as { response?: { data?: { error?: string } } })?.response?.data
            ?.error ?? 'Não foi possível reativar o veículo'}
        </p>
      )}

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
                <tr key={v.id} className={v.active === false ? 'opacity-60' : undefined}>
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
                  <td>
                    <div className="flex flex-col gap-1">
                      {v.active === false ? (
                        <Badge>Inativo</Badge>
                      ) : (
                        <span>{vehicleStatusLabels[v.status]}</span>
                      )}
                    </div>
                  </td>
                  <td>{formatDate(v.expectedReturn)}</td>
                  {isAdmin && (
                    <td>
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(v)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {v.active === false ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={activateMutation.isPending}
                            onClick={() => activateMutation.mutate(v.id)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Ativar
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => setDeleteId(v.id)}>
                            <Ban className="h-3.5 w-3.5" />
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
        onClose={() => {
          setDeleteId(null)
          deleteMutation.reset()
        }}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Desativar veículo"
        message="Este veículo deixa de aparecer em Definir placa e na frota disponível. O histórico de viagens é mantido. Você pode reativar depois."
        confirmLabel="Desativar"
        danger
        loading={deleteMutation.isPending}
        error={
          deleteMutation.isError
            ? ((deleteMutation.error as { response?: { data?: { error?: string } } })?.response
                ?.data?.error ?? 'Não foi possível desativar o veículo')
            : null
        }
      />
    </div>
  )
}
