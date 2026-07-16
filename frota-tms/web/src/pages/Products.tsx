import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import type { PriorityProduct, ProductsPanel } from '../types'
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
import { formatDate, toInputDate } from '../lib/format'
import { cn } from '../lib/cn'

const emptyForm = {
  product: '',
  code: '',
  lot: '',
  quantity: 1,
  expiryDate: toInputDate(new Date()),
  notes: '',
}

function ProductChip({ p }: { p: PriorityProduct }) {
  return (
    <div
      className={cn(
        'rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm',
        p.blinking && 'animate-blink',
        p.color === 'red' && 'border-red-500/40',
        p.color === 'orange' && 'border-orange-500/40',
        p.color === 'yellow' && 'border-amber-500/40',
        p.color === 'expired' && 'opacity-70',
      )}
    >
      <p className={cn('font-medium', `priority-${p.color}`)}>{p.product}</p>
      <p className="text-xs text-[var(--color-text-muted)]">
        {p.code} · Lote {p.lot} · {p.daysRemaining < 0 ? 'vencido' : `${p.daysRemaining} dias`}
      </p>
    </div>
  )
}

export function Products() {
  const qc = useQueryClient()
  const isAdmin = useAuthStore((s) => s.hasRole('ADMIN'))
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<PriorityProduct | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: panel } = useQuery({
    queryKey: ['products', 'panel'],
    queryFn: async () => (await api.get<ProductsPanel>('/products/panel')).data,
  })

  const { data = [], isLoading } = useQuery({
    queryKey: ['products', q],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (q) params.q = q
      return (await api.get<PriorityProduct[]>('/products', { params })).data
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        quantity: Number(form.quantity),
        notes: form.notes || null,
      }
      if (editing) return api.put(`/products/${editing.id}`, payload)
      return api.post('/products', payload)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['products'] })
      setOpen(false)
      setEditing(null)
      setForm(emptyForm)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/products/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['products'] })
      setDeleteId(null)
    },
  })

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setOpen(true)
  }

  function openEdit(p: PriorityProduct) {
    setEditing(p)
    setForm({
      product: p.product,
      code: p.code,
      lot: p.lot,
      quantity: p.quantity,
      expiryDate: toInputDate(p.expiryDate),
      notes: p.notes ?? '',
    })
    setOpen(true)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    saveMutation.mutate()
  }

  const sections: { key: keyof ProductsPanel; title: string; tone: string }[] = [
    { key: 'expired', title: 'Vencidos', tone: 'text-red-700' },
    { key: 'today', title: 'Vencem hoje', tone: 'text-red-600' },
    { key: 'in7', title: 'Até 7 dias', tone: 'text-orange-600' },
    { key: 'in15', title: 'Até 15 dias', tone: 'text-amber-600' },
    { key: 'in30', title: 'Até 30 dias', tone: 'text-yellow-700' },
  ]

  return (
    <div>
      <PageHeader
        title="Produtos Prioritários"
        description="Painel de validade e cadastro de cargas prioritárias"
        actions={
          isAdmin ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Novo produto
            </Button>
          ) : undefined
        }
      />

      {panel && (
        <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {sections.map((s) => {
            const items = panel[s.key] as PriorityProduct[]
            return (
              <div
                key={s.key}
                className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <h3 className={cn('font-display text-sm font-semibold', s.tone)}>{s.title}</h3>
                  <Badge>{items.length}</Badge>
                </div>
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {items.length === 0 ? (
                    <p className="text-xs text-[var(--color-text-muted)]">Nenhum</p>
                  ) : (
                    items.map((p) => <ProductChip key={p.id} p={p} />)
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mb-4 max-w-md">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar produto, código ou lote…" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : data.length === 0 ? (
        <EmptyState title="Nenhum produto encontrado" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Código</th>
                <th>Lote</th>
                <th>Qtd</th>
                <th>Validade</th>
                <th>Dias</th>
                {isAdmin && <th />}
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className={cn(p.blinking && 'animate-blink')}>
                  <td className="font-medium">{p.product}</td>
                  <td>{p.code}</td>
                  <td>{p.lot}</td>
                  <td>{p.quantity}</td>
                  <td>{formatDate(p.expiryDate)}</td>
                  <td className={cn('font-semibold', `priority-${p.color}`)}>{p.daysRemaining}</td>
                  {isAdmin && (
                    <td>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteId(p.id)}>
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
        title={editing ? 'Editar produto' : 'Novo produto'}
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
              label="Produto"
              value={form.product}
              onChange={(e) => setForm({ ...form, product: e.target.value })}
              required
            />
          </div>
          <Input
            label="Código"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            required
          />
          <Input
            label="Lote"
            value={form.lot}
            onChange={(e) => setForm({ ...form, lot: e.target.value })}
            required
          />
          <Input
            label="Quantidade"
            type="number"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
            required
          />
          <Input
            label="Validade"
            type="date"
            value={form.expiryDate}
            onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
            required
          />
          <div className="sm:col-span-2">
            <Textarea
              label="Observações"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Desativar produto"
        message="O produto será desativado. Confirma?"
        confirmLabel="Desativar"
        danger
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
