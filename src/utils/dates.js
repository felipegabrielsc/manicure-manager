/** Data civil no fuso local — evita o salto de um dia do UTC. */

export function toDateInputValue(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function dateInputToDb(dateStr) {
  if (!dateStr) return toDateInputValue()
  const part = String(dateStr).slice(0, 10)
  return `${part}T12:00:00`
}

export function formatCivilDate(value) {
  if (!value) return ''
  const raw = String(value)
  const isoDay = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoDay) return `${isoDay[3]}/${isoDay[2]}/${isoDay[1]}`
  return new Date(value).toLocaleDateString('pt-BR')
}

export function monthRangeLocal(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
  return {
    start,
    end,
    startDay: toDateInputValue(start),
    endDay: toDateInputValue(end),
  }
}

export function money(value) {
  return Number(value || 0).toFixed(2)
}

export function lastDayOfMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

export function clampDueDay(year, monthIndex, dueDay) {
  const last = lastDayOfMonth(year, monthIndex)
  const n = Number(dueDay)
  if (!n || n < 1) return last
  return Math.min(n, last)
}

/** Vencimento da mensalidade a partir do mês em que os serviços foram feitos. */
export function monthlyDueDate(serviceYear, serviceMonthIndex, dueDay = 10, offsetMonths = 1) {
  const due = new Date(serviceYear, serviceMonthIndex + Number(offsetMonths || 0), 1)
  const day = clampDueDay(due.getFullYear(), due.getMonth(), dueDay)
  return new Date(due.getFullYear(), due.getMonth(), day)
}

export function serviceMonthForDue(viewDate, offsetMonths = 1) {
  return new Date(viewDate.getFullYear(), viewDate.getMonth() - Number(offsetMonths || 0), 1)
}

/** Postgres time (`09:00:00`) → valor válido para `<input type="time">`. */
export function toTimeInput(value, fallback = '09:00') {
  if (value == null || value === '') return fallback
  const match = String(value).match(/(\d{1,2}):(\d{2})/)
  if (!match) return fallback
  return `${String(match[1]).padStart(2, '0')}:${match[2]}`
}

