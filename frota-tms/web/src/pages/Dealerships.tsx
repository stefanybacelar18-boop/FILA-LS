import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, RefreshCw } from 'lucide-react'
import { api } from '../lib/api'
import type { AllowedVehicleType, Dealership } from '../types'
import {
  PageHeader,
  SearchInput,
  Select,
  Button,
  Modal,
  Input,
  Spinner,
  EmptyState,
  ConfirmModal,
  Badge,
} from '../components/ui'
import { useAuthStore } from '../stores/auth'

const emptyForm = {
  name: '',
  city: '',
  state: '',
  region: '',
  allowedVehicle: 'AMBOS' as AllowedVehicleType,
}

type DealershipWithPad = Dealership & {
  pad?: { distanceKm: number; avgTravelDays: number; lat: number; lng: number } | null
}

export function Dealerships() {
  const qc = useQueryClient()
  const isAdmin = useAuthStore((s) => s.hasRole('ADMIN'))
  const [q, setQ] = useState('')
  const [state, setState] = useState('')
  const [region, setRegion] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<DealershipWithPad | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: meta } = useQuery({
    queryKey: ['dealerships', 'meta'],
    queryFn: async () =>
      (
        await api.get<{
          states: string[]
          regions: string[]
          pad?: { lat: number; lng: number; formula: string; kmPerDay: number }
        }>('/dealerships/filters/meta')
      ).data,
  })

  const { data = [], isLoading } = useQuery({
    queryKey: ['dealerships', q, state, region],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (q) params.q = q
      if (state) params.state = state
      if (region) params.region = region
      return (await api.get<DealershipWithPad[]>('/dealerships', { params })).data
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        state: form.state.toUpperCase(),
      }
      if (editing) return api.put(`/dealerships/${editing.id}`, payload)
      return api.post('/dealerships', payload)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dealerships'] })
      setOpen(false)
      setEditing(null)
      setForm(emptyForm)
    },
  })

  const recalcMutation = useMutation({
    mutationFn: async () =>
      (await api.post<{ updated: number; skipped: number }>('/dealerships/recalculate-from-pad')).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dealerships'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/dealerships/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dealerships'] })
      setDeleteId(null)
    },
  })

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setOpen(true)
  }

  function openEdit(d: DealershipWithPad) {
    setEditing(d)
    setForm({
      name: d.name,
      city: d.city,
      state: d.state,
      region: d.region,
      allowedVehicle: d.allowedVehicle,
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
        title="Concessionárias"
        description={
          meta?.pad
            ? `Distância e tempo calculados do PAD (${meta.pad.lat}, ${meta.pad.lng}) · ${meta.pad.formula}`
            : 'Distância e tempo calculados a partir do PAD'
        }
        actions={
          isAdmin ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => recalcMutation.mutate()}
                loading={recalcMutation.isPending}
              >
                <RefreshCw className="h-4 w-4" />
                Recalcular do PAD
              </Button>
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Nova concessionária
              </Button>
            </div>
          ) : undefined
        }
      />

      {recalcMutation.isSuccess && (
        <p className="mb-3 text-sm text-[var(--color-success)]">
          Recalculado: {recalcMutation.data.updated} atualizadas
          {recalcMutation.data.skipped > 0
            ? ` · ${recalcMutation.data.skipped} sem coordenadas de cidade`
            : ''}
          .
        </p>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar nome, código, cidade ou região…" />
        <Select
          value={state}
          onChange={(e) => setState(e.target.value)}
          options={(meta?.states ?? []).map((s) => ({ value: s, label: s }))}
          placeholder="Todos os estados"
        />
        <Select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          options={(meta?.regions ?? []).map((r) => ({ value: r, label: r }))}
          placeholder="Todas as regiões"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : data.length === 0 ? (
        <EmptyState title="Nenhuma concessionária encontrada" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                <th>Cidade/UF</th>
                <th>Telefone</th>
                <th>Região</th>
                <th>Dist. PAD</th>
                <th>Retorno (dias)</th>
                <th>Status</th>
                {isAdmin && <th />}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id}>
                  <td className="text-xs text-[var(--color-text-muted)]">{d.code ?? '—'}</td>
                  <td className="font-medium">{d.name}</td>
                  <td>
                    {d.city}/{d.state}
                  </td>
                  <td className="text-xs">{d.phone ?? '—'}</td>
                  <td>{d.region}</td>
                  <td>{(d.pad?.distanceKm ?? d.distanceKm).toFixed(1)} km</td>
                  <td>{d.pad?.avgTravelDays ?? d.avgTravelDays} dias</td>
                  <td>
                    <Badge tone={d.active ? 'success' : 'default'}>
                      {d.active ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </td>
                  {isAdmin && (
                    <td>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(d)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteId(d.id)}>
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
        title={editing ? 'Editar concessionária' : 'Nova concessionária'}
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
          <div className="sm:col-span-2">
            <Input
              label="Nome"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <Input
            label="Cidade"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            required
          />
          <Input
            label="UF"
            value={form.state}
            maxLength={2}
            onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
            required
          />
          <Input
            label="Região"
            value={form.region}
            onChange={(e) => setForm({ ...form, region: e.target.value })}
            required
          />
          <Select
            label="Veículo permitido"
            value={form.allowedVehicle}
            onChange={(e) =>
              setForm({ ...form, allowedVehicle: e.target.value as AllowedVehicleType })
            }
            options={[
              { value: 'AMBOS', label: 'Ambos' },
              { value: 'TRUCK', label: 'Truck' },
              { value: 'CARRETA', label: 'Carreta' },
            ]}
          />
          <p className="sm:col-span-2 text-xs text-[var(--color-text-muted)]">
            Distância e previsão de retorno são calculadas automaticamente: PAD → cidade da
            concessionária (ida+volta ÷ 400 km/dia).
          </p>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Desativar concessionária"
        message="A concessionária será marcada como inativa. Confirma?"
        confirmLabel="Desativar"
        danger
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
