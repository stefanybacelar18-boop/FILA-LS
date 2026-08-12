import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Trip } from '../types'
import { formatDateTime } from '../lib/format'
import { Button, Modal, Textarea } from './ui'

type UndoReturnModalProps = {
  trip: Trip | null
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function UndoReturnModal({ trip, open, onClose, onSuccess }: UndoReturnModalProps) {
  const [reason, setReason] = useState('')
  const qc = useQueryClient()

  useEffect(() => {
    if (!open) setReason('')
  }, [open])

  const undoMutation = useMutation({
    mutationFn: async () => {
      if (!trip) throw new Error('Sem viagem')
      return api.post(`/trips/${trip.id}/unreturn`, { reason: reason.trim() })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['history'] })
      void qc.invalidateQueries({ queryKey: ['trips'] })
      void qc.invalidateQueries({ queryKey: ['returns'] })
      void qc.invalidateQueries({ queryKey: ['vehicles'] })
      void qc.invalidateQueries({ queryKey: ['routes'] })
      onSuccess?.()
      onClose()
    },
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={trip ? `Desfazer retorno — ${trip.vehicle.plate}` : 'Desfazer retorno'}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => undoMutation.mutate()}
            loading={undoMutation.isPending}
            disabled={reason.trim().length < 5}
          >
            Confirmar desfazer
          </Button>
        </>
      }
    >
      {trip && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            A viagem volta para <strong>Em andamento</strong> ou <strong>Atrasado</strong>, a placa
            retorna para <strong>Em viagem</strong> e o roteiro pode ser reaberto se tinha sido
            concluído por este retorno.
          </p>
          <div className="rounded-lg bg-[var(--color-surface-muted)] px-3 py-2 text-sm">
            <p>
              <strong>Destino:</strong> {trip.dealership.name}
            </p>
            <p>
              <strong>Retorno registrado:</strong>{' '}
              {trip.returnedAt ? formatDateTime(trip.returnedAt) : '—'}
            </p>
          </div>
          <Textarea
            label="Motivo do desfazer"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: cliquei em retornar por engano"
            required
          />
          {undoMutation.isError && (
            <p className="text-sm text-[var(--color-danger)]">
              {(undoMutation.error as { response?: { data?: { error?: string } } })?.response?.data
                ?.error ?? 'Não foi possível desfazer o retorno'}
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
