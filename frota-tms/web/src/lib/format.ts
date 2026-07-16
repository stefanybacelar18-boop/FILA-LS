import { format, parseISO, isValid } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function formatDate(value?: string | Date | null, pattern = 'dd/MM/yyyy') {
  if (!value) return '—'
  const d = typeof value === 'string' ? parseISO(value) : value
  if (!isValid(d)) return '—'
  return format(d, pattern, { locale: ptBR })
}

export function formatDateTime(value?: string | Date | null) {
  return formatDate(value, 'dd/MM/yyyy HH:mm')
}

export function toInputDate(value?: string | Date | null) {
  if (!value) return ''
  const d = typeof value === 'string' ? parseISO(value) : value
  if (!isValid(d)) return ''
  return format(d, 'yyyy-MM-dd')
}
