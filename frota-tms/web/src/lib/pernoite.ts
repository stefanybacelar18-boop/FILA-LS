import { differenceInCalendarDays, parseISO } from 'date-fns'

/** Noites de calendário entre duas datas YYYY-MM-DD (ou ISO). */
export function calendarNightsBetween(departure: string, arrival: string): number {
  const a = departure.slice(0, 10)
  const b = arrival.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return 0
  return Math.max(
    0,
    differenceInCalendarDays(parseISO(`${b}T12:00:00`), parseISO(`${a}T12:00:00`)),
  )
}

/** Teto padrão: no máximo 1 pernoite por roteiro. */
export function chargedPernoiteNights(calendarNights: number): number {
  return Math.max(0, Math.min(1, Math.trunc(calendarNights)))
}

export function addCalendarDaysYmd(ymd: string, days: number): string {
  const d = parseISO(`${ymd.slice(0, 10)}T12:00:00`)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
