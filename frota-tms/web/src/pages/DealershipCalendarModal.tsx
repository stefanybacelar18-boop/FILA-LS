import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Button, Input, Modal, Select, Spinner } from '../components/ui'

type ClosureKind = 'FECHADO' | 'ABRE' | 'HORARIO_REDUZIDO'
type ClosureDraft = {
  date: string
  kind: 'FECHADO' | 'ABRE'
  note: string
}

type StoredCalendar = {
  closures: {
    date: string
    kind: ClosureKind
    note: string | null
  }[]
}

function dateInput(value: string): string {
  return value.slice(0, 10)
}

export function DealershipCalendarModal({
  dealershipId,
  dealershipName,
  onClose,
}: {
  dealershipId: string
  dealershipName: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [closures, setClosures] = useState<ClosureDraft[]>([])
  const [error, setError] = useState('')

  const query = useQuery({
    queryKey: ['dealership', dealershipId, 'calendar'],
    queryFn: async () => (await api.get<StoredCalendar>(`/dealerships/${dealershipId}`)).data,
  })

  useEffect(() => {
    if (!query.data) return
    setClosures(
      (query.data.closures ?? []).map((closure) => ({
        date: dateInput(closure.date),
        kind: closure.kind === 'ABRE' ? 'ABRE' : 'FECHADO',
        note: closure.note ?? '',
      })),
    )
  }, [query.data])

  const save = useMutation({
    mutationFn: async () =>
      api.put(`/dealerships/${dealershipId}/calendar`, {
        hours: [],
        closures: closures
          .filter((closure) => closure.date)
          .map((closure) => ({
            date: closure.date,
            kind: closure.kind,
            openTime: null,
            closeTime: null,
            note: closure.note.trim() || null,
          })),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['dealerships'] })
      await qc.invalidateQueries({ queryKey: ['routes'] })
      onClose()
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Não foi possível salvar os feriados.',
      )
    },
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={`Feriados · ${dealershipName}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={query.isLoading}>
            Salvar
          </Button>
        </>
      }
    >
      {query.isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-text-muted)]">
            Feriado nacional, estadual e municipal da cidade entram sozinhos, pelo endereço da loja.
            Não precisa lançar horário. Aqui só entra exceção: a loja fecha num dia comum, ou abre
            mesmo em feriado.
          </p>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Exceções desta loja</p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setClosures((prev) => [...prev, { date: '', kind: 'FECHADO', note: '' }])}
              >
                Adicionar data
              </Button>
            </div>
            {closures.length === 0 && (
              <p className="text-xs text-[var(--color-text-muted)]">
                Ex.: a loja confirmou que recebe no São João, ou não recebe caminhão num dia comum.
              </p>
            )}
            {closures.map((closure, index) => (
              <div key={index} className="grid gap-2 rounded border border-[var(--color-border)] p-2 sm:grid-cols-2">
                <Input
                  label="Data"
                  type="date"
                  value={closure.date}
                  onChange={(e) =>
                    setClosures((prev) =>
                      prev.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, date: e.target.value } : row,
                      ),
                    )
                  }
                />
                <Select
                  label="Tipo"
                  value={closure.kind}
                  onChange={(e) =>
                    setClosures((prev) =>
                      prev.map((row, rowIndex) =>
                        rowIndex === index
                          ? { ...row, kind: e.target.value === 'ABRE' ? 'ABRE' : 'FECHADO' }
                          : row,
                      ),
                    )
                  }
                  options={[
                    { value: 'FECHADO', label: 'Fechada' },
                    { value: 'ABRE', label: 'Abre mesmo em feriado' },
                  ]}
                />
                <Input
                  label="Motivo"
                  value={closure.note}
                  placeholder="Não recebe caminhão"
                  onChange={(e) =>
                    setClosures((prev) =>
                      prev.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, note: e.target.value } : row,
                      ),
                    )
                  }
                />
                <div className="sm:col-span-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setClosures((prev) => prev.filter((_, rowIndex) => rowIndex !== index))}
                  >
                    Remover
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        </div>
      )}
    </Modal>
  )
}
