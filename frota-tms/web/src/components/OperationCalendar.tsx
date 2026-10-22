import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '../lib/api'
import { cn } from '../lib/cn'

type Tone = 'risk' | 'warn' | 'info'

type CalendarDay = {
  date: string
  tone: Tone
  items: { tone: Tone; label: string }[]
}

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function monthBounds(year: number, month: number) {
  const last = new Date(year, month + 1, 0).getDate()
  return {
    from: `${year}-${pad(month + 1)}-01`,
    to: `${year}-${pad(month + 1)}-${pad(last)}`,
  }
}

function dayKey(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

function monthCells(year: number, month: number): (number | null)[] {
  const startPad = new Date(year, month, 1).getDay()
  const count = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = Array.from({ length: startPad }, () => null)
  for (let day = 1; day <= count; day += 1) cells.push(day)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function toneClass(tone: Tone | undefined, selected: boolean) {
  return cn(
    'flex h-9 w-full items-center justify-center rounded-md text-sm tabular-nums',
    tone === 'risk' && 'bg-red-500/15 font-semibold text-[var(--color-danger)]',
    tone === 'warn' && 'bg-amber-500/20 font-semibold text-[var(--color-warning)]',
    tone === 'info' && 'bg-[var(--color-primary-muted)] font-medium text-[var(--color-primary)]',
    !tone && 'text-[var(--color-text)] hover:bg-[var(--color-surface-2)]',
    selected && 'ring-2 ring-[var(--color-primary)]',
  )
}

export function OperationCalendar() {
  const today = new Date()
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [selected, setSelected] = useState<string | null>(null)
  const bounds = monthBounds(cursor.year, cursor.month)
  const todayKey = dayKey(today.getFullYear(), today.getMonth(), today.getDate())

  const { data, isLoading, isError } = useQuery({
    queryKey: ['operation-calendar', bounds.from, bounds.to],
    queryFn: async () =>
      (
        await api.get<{ days: CalendarDay[] }>('/dealerships/calendar', {
          params: bounds,
        })
      ).data,
  })

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarDay>()
    for (const day of data?.days ?? []) map.set(day.date, day)
    return map
  }, [data])

  const cells = monthCells(cursor.year, cursor.month)
  const selectedDay = selected ? byDate.get(selected) : undefined

  function shift(delta: number) {
    const next = new Date(cursor.year, cursor.month + delta, 1)
    setCursor({ year: next.getFullYear(), month: next.getMonth() })
    setSelected(null)
  }

  return (
    <section className="mb-5 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold capitalize">
            {MONTHS[cursor.month]} {cursor.year}
          </h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            Vermelho segura a carga ou a loja. Amarelo só avisa.
          </p>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            className="rounded-md border border-[var(--color-border)] p-1.5 hover:bg-[var(--color-surface-2)]"
            onClick={() => shift(-1)}
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-md border border-[var(--color-border)] p-1.5 hover:bg-[var(--color-surface-2)]"
            onClick={() => shift(1)}
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-[var(--color-text-muted)]">
        {WEEKDAYS.map((label) => (
          <div key={label} className="py-1">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, index) => {
          if (!day) return <div key={`empty-${index}`} />
          const date = dayKey(cursor.year, cursor.month, day)
          const marked = byDate.get(date)
          return (
            <button
              key={date}
              type="button"
              className={cn(
                toneClass(marked?.tone, selected === date),
                date === todayKey && selected !== date && 'ring-1 ring-[var(--color-border-strong)]',
              )}
              onClick={() => setSelected(date)}
              aria-label={date}
              aria-pressed={selected === date}
            >
              {day}
            </button>
          )
        })}
      </div>

      <div className="mt-3 text-sm">
        {isLoading && <p className="text-[var(--color-text-muted)]">Carregando calendário…</p>}
        {isError && (
          <p className="text-[var(--color-danger)]">Não foi possível carregar o calendário.</p>
        )}
        {!isLoading && !isError && selected && selectedDay && (
          <ul className="space-y-1">
            {selectedDay.items.map((item) => (
              <li
                key={item.label}
                className={cn(
                  item.tone === 'risk' && 'text-[var(--color-danger)]',
                  item.tone === 'warn' && 'text-[var(--color-warning)]',
                  item.tone === 'info' && 'text-[var(--color-text)]',
                )}
              >
                {item.label}
              </li>
            ))}
          </ul>
        )}
        {!isLoading && !isError && selected && !selectedDay && (
          <p className="text-[var(--color-text-muted)]">
            {selected.split('-').reverse().join('/')} sem feriado.
          </p>
        )}
        {!isLoading && !isError && !selected && (
          <p className="text-[var(--color-text-muted)]">
            Toque num dia para ver o feriado nacional, estadual ou municipal das lojas.
          </p>
        )}
      </div>
    </section>
  )
}
