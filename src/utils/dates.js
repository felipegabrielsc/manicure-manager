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
