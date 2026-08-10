import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarClock } from 'lucide-react'
import { api } from '../lib/api'
import type { Trip } from '../types'
import { Button, Input, Modal } from './ui'
import { combineDateAndTime, toInputDate, toInputTime } from '../lib/format'

type Props = {
  trip: Trip | null
  onClose: () => void
  onSuccess?: () => void
}

export function TripScheduleModal({ trip, onClose, onSuccess }: Props) {
  const qc = useQueryClient()
  const [departureDate, setDepartureDate] = useState('')
  const [departureTime, setDepartureTime] = useState('06:00')
  const [expectedDate, setExpectedDate] = useState('')
  const [expectedTime, setExpectedTime] = useState('06:00')
  const [shiftReturn, setShiftReturn] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!trip) return
    setDepartureDate(toInputDate(trip.departureAt))
    setDepartureTime(toInputTime(trip.departureAt))
    setExpectedDate(toInputDate(trip.expectedReturn))
    setExpectedTime(toInputTime(trip.expectedReturn))
    setShiftReturn(true)
    setError('')
  }, [trip])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!trip) return
      const departureAt = combineDateAndTime(departureDate, departureTime)
      const body: { departureAt: string; expectedReturn?: string } = {
        departureAt: departureAt.toISOString(),
      }
      if (!shiftReturn) {
        body.expectedReturn = combineDateAndTime(expectedDate, expectedTime).toISOString()
      }
      return api.patch(`/trips/${trip.id}/schedule`, body)
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['returns'] })
      await qc.invalidateQueries({ queryKey: ['trips'] })
      await qc.invalidateQueries({ queryKey: ['history'] })
      await qc.invalidateQueries({ queryKey: ['dashboard'] })
      await qc.invalidateQueries({ queryKey: ['pernoites'] })
      onSuccess?.()
      onClose()
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Não foi possível salvar as datas.',
      )
    },
  })

  if (!trip) return null

  return (
    <Modal
      open={!!trip}
      onClose={onClose}
      title={`Ajustar datas — ${trip.vehicle.plate}`}
    >
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-text-muted)]">
          Altere o início da viagem e a previsão de retorno. Funciona para viagens em andamento e
          já concluídas. Apenas administrador.
        </p>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs">
          <p>
            <span className="text-[var(--color-text-muted)]">Roteiro:</span> {trip.route?.name ?? '—'}
          </p>
          <p>
            <span className="text-[var(--color-text-muted)]">Destino:</span> {trip.dealership.name}
          </p>
          {trip.driverName && (
            <p>
              <span className="text-[var(--color-text-muted)]">Motorista:</span> {trip.driverName}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Input
            label="Data de saída"
            type="date"
            value={departureDate}
            onChange={(e) => setDepartureDate(e.target.value)}
            required
          />
          <Input
            label="Hora de saída"
            type="time"
            value={departureTime}
            onChange={(e) => setDepartureTime(e.target.value)}
            required
          />
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setDepartureDate(toInputDate(new Date()))}
        >
          Usar hoje como data de saída
        </Button>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={shiftReturn}
            onChange={(e) => setShiftReturn(e.target.checked)}
          />
          <span>
            Mover a previsão de retorno na mesma quantidade de dias que a saída (mantém a duração
            da viagem).
          </span>
        </label>

        {!shiftReturn && (
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Data previsão retorno"
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
              required
            />
            <Input
              label="Hora previsão retorno"
              type="time"
              value={expectedTime}
              onChange={(e) => setExpectedTime(e.target.value)}
              required
            />
          </div>
        )}

        {error && (
          <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={saveMutation.isPending}
            disabled={!departureDate}
            onClick={() => saveMutation.mutate()}
          >
            <CalendarClock className="h-4 w-4" />
            Salvar datas
          </Button>
        </div>
      </div>
    </Modal>
  )
}
