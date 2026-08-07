import { useState } from 'react'
import { Input } from '../ui'
import type { LogbookReportExtras, LogbookStopEntry } from '../../types/logbook'

type Props = {
  stops: LogbookStopEntry[]
  extras: LogbookReportExtras
  observations: string
  disabled?: boolean
  onStopsChange: (stops: LogbookStopEntry[]) => void
  onExtrasChange: (extras: LogbookReportExtras) => void
  onObservationsChange: (v: string) => void
}

function numOrEmpty(v: string): number | null {
  if (!v.trim()) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function StopCard({
  stop,
  disabled,
  onChange,
}: {
  stop: LogbookStopEntry
  disabled?: boolean
  onChange: (patch: Partial<LogbookStopEntry>) => void
}) {
  const hasPlan = stop.plannedMotoCount != null && stop.plannedMotoCount > 0

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">
          {stop.order}ª parada
          {hasPlan && (
            <span className="ml-2 text-xs font-normal text-[var(--color-text-muted)]">
              previsto: {stop.plannedMotoCount} motos
            </span>
          )}
        </p>
      </div>
      <div className="space-y-2">
        <Input
          label="Concessionária"
          value={stop.dealershipName}
          onChange={(e) => onChange({ dealershipName: e.target.value })}
          disabled={disabled}
        />
        <Input
          label="Cidade"
          value={stop.city}
          onChange={(e) => onChange({ city: e.target.value })}
          disabled={disabled}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="KM chegada"
            type="number"
            value={stop.kmArrival ?? ''}
            onChange={(e) => onChange({ kmArrival: numOrEmpty(e.target.value) })}
            disabled={disabled}
          />
          <Input
            label="Horário chegada"
            placeholder="08:30"
            value={stop.arrivalTime ?? ''}
            onChange={(e) => onChange({ arrivalTime: e.target.value })}
            disabled={disabled}
          />
          <Input
            label="Horário saída"
            placeholder="09:15"
            value={stop.departureTime ?? ''}
            onChange={(e) => onChange({ departureTime: e.target.value })}
            disabled={disabled}
          />
          <Input
            label="Caixa (qtde)"
            type="number"
            value={stop.boxQty ?? ''}
            onChange={(e) => onChange({ boxQty: numOrEmpty(e.target.value) })}
            disabled={disabled}
          />
          <Input
            label="Motos (qtde)"
            type="number"
            value={stop.motoQty ?? ''}
            onChange={(e) => onChange({ motoQty: numOrEmpty(e.target.value) })}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  )
}

export function ReportStopsForm({
  stops,
  extras,
  observations,
  disabled,
  onStopsChange,
  onExtrasChange,
  onObservationsChange,
}: Props) {
  const [extraRows, setExtraRows] = useState(0)

  const updateStop = (order: number, patch: Partial<LogbookStopEntry>) => {
    onStopsChange(stops.map((s) => (s.order === order ? { ...s, ...patch } : s)))
  }

  const filledCount = stops.filter((s) => s.dealershipName.trim() || s.city.trim()).length
  const showUntil = Math.min(10, Math.max(1, filledCount + 1 + extraRows))
  const visibleStops = stops.filter((s) => s.order <= showUntil)

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-text-muted)]">
        Registre cada parada com concessionária, cidade, horários e quantidade de motos (caixa ou motor),
        como no relatório de bordo em papel.
      </p>

      {visibleStops.map((stop) => (
        <StopCard
          key={stop.order}
          stop={stop}
          disabled={disabled}
          onChange={(patch) => updateStop(stop.order, patch)}
        />
      ))}

      {showUntil < 10 && !disabled && (
        <button
          type="button"
          className="w-full rounded-lg border border-dashed border-[var(--color-border)] py-2 text-sm text-[var(--color-primary)]"
          onClick={() => setExtraRows((n) => n + 1)}
        >
          + Adicionar parada
        </button>
      )}

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-2">
        <p className="text-sm font-semibold">Almoço / janta</p>
        {extras.meals.map((meal, i) => (
          <div key={i} className="grid grid-cols-2 gap-2">
            <Input
              label={`Data (${i + 1})`}
              placeholder="07/08/26"
              value={meal.date ?? ''}
              onChange={(e) => {
                const meals = [...extras.meals]
                meals[i] = { ...meals[i], date: e.target.value }
                onExtrasChange({ ...extras, meals })
              }}
              disabled={disabled}
            />
            <Input
              label="Cidade"
              value={meal.city ?? ''}
              onChange={(e) => {
                const meals = [...extras.meals]
                meals[i] = { ...meals[i], city: e.target.value }
                onExtrasChange({ ...extras, meals })
              }}
              disabled={disabled}
            />
            <Input
              label="Início"
              placeholder="12:30"
              value={meal.startTime ?? ''}
              onChange={(e) => {
                const meals = [...extras.meals]
                meals[i] = { ...meals[i], startTime: e.target.value }
                onExtrasChange({ ...extras, meals })
              }}
              disabled={disabled}
            />
            <Input
              label="Fim"
              placeholder="13:30"
              value={meal.endTime ?? ''}
              onChange={(e) => {
                const meals = [...extras.meals]
                meals[i] = { ...meals[i], endTime: e.target.value }
                onExtrasChange({ ...extras, meals })
              }}
              disabled={disabled}
            />
          </div>
        ))}
      </div>

      <Input
        label="Observações da viagem"
        value={observations}
        onChange={(e) => onObservationsChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  )
}
