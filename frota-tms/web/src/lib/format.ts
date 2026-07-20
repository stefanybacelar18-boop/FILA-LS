import { format, parseISO, isValid } from 'date-fns'
import { ptBR } from 'date-fns/locale'

/** Extrai YYYY-MM-DD sem aplicar fuso (evita dia -1 no Brasil). */
function calendarDay(value: string | Date): string | null {
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/)
    if (m) return m[1]
    const d = parseISO(value)
    if (!isValid(d)) return null
    // Instant com hora: usa componentes locais só se não for meia-noite UTC de data de calendário
    return format(d, 'yyyy-MM-dd')
  }
  if (!isValid(value)) return null
  return format(value, 'yyyy-MM-dd')
}

/** Data de calendário (roteiro/retorno) — não desloca por fuso. */
export function formatDate(value?: string | Date | null, pattern = 'dd/MM/yyyy') {
  if (!value) return '—'
  const day = calendarDay(value)
  if (!day) return '—'
  // Monta meio-dia local para formatar só o dia sem risco de virada
  const d = parseISO(`${day}T12:00:00`)
  if (!isValid(d)) return '—'
  return format(d, pattern, { locale: ptBR })
}

export function formatDateTime(value?: string | Date | null) {
  if (!value) return '—'
  const d = typeof value === 'string' ? parseISO(value) : value
  if (!isValid(d)) return '—'
  return format(d, 'dd/MM/yyyy HH:mm', { locale: ptBR })
}

export function toInputDate(value?: string | Date | null) {
  if (!value) return ''
  return calendarDay(value) ?? ''
}
