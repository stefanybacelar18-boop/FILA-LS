import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Button, Input, Modal, Select, Spinner } from '../components/ui'

const WEEKDAYS = [
  { weekday: 1, label: 'Segunda' },
  { weekday: 2, label: 'Terça' },
  { weekday: 3, label: 'Quarta' },
  { weekday: 4, label: 'Quinta' },
  { weekday: 5, label: 'Sexta' },
  { weekday: 6, label: 'Sábado' },
  { weekday: 0, label: 'Domingo' },
]

type HourDraft = { weekday: number; closed: boolean; openTime: string; closeTime: string }
type ClosureKind = 'FECHADO' | 'ABRE' | 'HORARIO_REDUZIDO'
type ClosureDraft = {
  date: string
  kind: ClosureKind
  openTime: string
  closeTime: string
  note: string
}

type StoredCalendar = {
  hours: { weekday: number; closed: boolean; openTime: string | null; closeTime: string | null }[]
  closures: {
    date: string
    kind: ClosureKind
    openTime: string | null
    closeTime: string | null
    note: string | null
  }[]
}

function emptyHours(): HourDraft[] {
  return WEEKDAYS.map((day) => ({
    weekday: day.weekday,
    closed: day.weekday === 0,
    openTime: day.weekday === 0 ? '' : '08:00',
    closeTime: day.weekday === 0 ? '' : '18:00',
  }))
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
  const [hours, setHours] = useState<HourDraft[]>(emptyHours)
  const [closures, setClosures] = useState<ClosureDraft[]>([])
  const [useHours, setUseHours] = useState(false)
  const [error, setError] = useState('')

  const query = useQuery({
    queryKey: ['dealership', dealershipId, 'calendar'],
    queryFn: async () => (await api.get<StoredCalendar>(`/dealerships/${dealershipId}`)).data,
  })

  useEffect(() => {
    if (!query.data) return
    const stored = query.data.hours ?? []
    if (stored.length === 0) {
      setUseHours(false)
      setHours(emptyHours())
    } else {
      setUseHours(true)
      setHours(
        WEEKDAYS.map((day) => {
          const row = stored.find((hour) => hour.weekday === day.weekday)
          return {
            weekday: day.weekday,
            closed: row ? row.closed : true,
            openTime: row?.openTime ?? '',
            closeTime: row?.closeTime ?? '',
          }
        }),
      )
    }
    setClosures(
      (query.data.closures ?? []).map((closure) => ({
        date: dateInput(closure.date),
        kind: closure.kind,
        openTime: closure.openTime ?? '',
        closeTime: closure.closeTime ?? '',
        note: closure.note ?? '',
      })),
    )
  }, [query.data])

  const save = useMutation({
    mutationFn: async () =>
      api.put(`/dealerships/${dealershipId}/calendar`, {
        hours: useHours
          ? hours.map((hour) => ({
              weekday: hour.weekday,
              closed: hour.closed,
              openTime: hour.closed ? null : hour.openTime,
              closeTime: hour.closed ? null : hour.closeTime,
            }))
          : [],
        closures: closures
          .filter((closure) => closure.date)
          .map((closure) => ({
            date: closure.date,
            kind: closure.kind,
            openTime: closure.kind === 'HORARIO_REDUZIDO' ? closure.openTime : null,
            closeTime: closure.kind === 'HORARIO_REDUZIDO' ? closure.closeTime : null,
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
          'Não foi possível salvar o expediente.',
      )
    },
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={`Expediente · ${dealershipName}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={query.isLoading}>
            Salvar expediente
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
            Feriado nacional, 2 de julho na Bahia e 8 de julho em Sergipe entram sozinhos. Carnaval e
            Corpus Christi avisam, sem bloquear. Feriado e ponto facultativo do município lançam
            aqui.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useHours}
              onChange={(e) => setUseHours(e.target.checked)}
            />
            Cadastrar expediente semanal
          </label>
          {useHours && (
            <div className="space-y-2">
              {hours.map((hour, index) => (
                <div key={hour.weekday} className="grid grid-cols-[7rem_auto_1fr_1fr] items-center gap-2">
                  <span className="text-sm">{WEEKDAYS.find((day) => day.weekday === hour.weekday)?.label}</span>
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={hour.closed}
                      onChange={(e) =>
                        setHours((prev) =>
                          prev.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, closed: e.target.checked } : row,
                          ),
                        )
                      }
                    />
                    Fecha
                  </label>
                  <Input
                    type="time"
                    value={hour.openTime}
                    disabled={hour.closed}
                    onChange={(e) =>
                      setHours((prev) =>
                        prev.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, openTime: e.target.value } : row,
                        ),
                      )
                    }
                  />
                  <Input
                    type="time"
                    value={hour.closeTime}
                    disabled={hour.closed}
                    onChange={(e) =>
                      setHours((prev) =>
                        prev.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, closeTime: e.target.value } : row,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Fechamentos e exceções da cidade</p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  setClosures((prev) => [
                    ...prev,
                    { date: '', kind: 'FECHADO', openTime: '', closeTime: '', note: '' },
                  ])
                }
              >
                Adicionar data
              </Button>
            </div>
            {closures.length === 0 && (
              <p className="text-xs text-[var(--color-text-muted)]">
                Ex.: São João, aniversário da cidade, “não recebe caminhão”.
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
                        rowIndex === index ? { ...row, kind: e.target.value as ClosureKind } : row,
                      ),
                    )
                  }
                  options={[
                    { value: 'FECHADO', label: 'Fechada' },
                    { value: 'HORARIO_REDUZIDO', label: 'Horário reduzido' },
                    { value: 'ABRE', label: 'Abre mesmo em feriado' },
                  ]}
                />
                <Input
                  label="Motivo"
                  value={closure.note}
                  placeholder="São João"
                  onChange={(e) =>
                    setClosures((prev) =>
                      prev.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, note: e.target.value } : row,
                      ),
                    )
                  }
                />
                {closure.kind === 'HORARIO_REDUZIDO' && (
                  <>
                    <Input
                      label="Abre"
                      type="time"
                      value={closure.openTime}
                      onChange={(e) =>
                        setClosures((prev) =>
                          prev.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, openTime: e.target.value } : row,
                          ),
                        )
                      }
                    />
                    <Input
                      label="Fecha"
                      type="time"
                      value={closure.closeTime}
                      onChange={(e) =>
                        setClosures((prev) =>
                          prev.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, closeTime: e.target.value } : row,
                          ),
                        )
                      }
                    />
                  </>
                )}
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
