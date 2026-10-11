import { monthlyDueDate } from '../utils/dates.js'

export function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

export function saoPauloParts(value) {
  const date = value instanceof Date ? value : new Date(value)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const pick = (type) => Number(parts.find((part) => part.type === type)?.value || '0')
  return { year: pick('year'), month: pick('month') - 1, day: pick('day') }
}

export function ehPagamentoMensalidade(transaction) {
  if (!transaction || transaction.type !== 'RECEITA' || !transaction.client_id) return false
  if (transaction.category === 'mensalidade') return true
  return /^mensalidade\b/i.test(String(transaction.description || ''))
}

export function idsMensalidadePaga(transactions) {
  return (transactions || []).filter(ehPagamentoMensalidade).map((transaction) => transaction.client_id)
}

export function mensalidadeJaLancada(transactions, clientId, dateStr) {
  const month = String(dateStr || '').slice(0, 7)
  if (!month || !clientId) return false
  return (transactions || []).some((transaction) => (
    ehPagamentoMensalidade(transaction)
    && String(transaction.client_id) === String(clientId)
    && String(transaction.date || '').slice(0, 7) === month
  ))
}

export function cobrancasMensalidade({ appointments, clients, viewDate, paidClientIds = [] }) {
  const viewY = viewDate.getFullYear()
  const viewM = viewDate.getMonth()
  const paid = new Set(paidClientIds.map(String))
  const porCliente = {}

  for (const appointment of appointments || []) {
    if (appointment.payment_method !== 'MENSALIDADE') continue
    const client = appointment.clients
    if (!client?.id) continue
    const when = saoPauloParts(appointment.start_time)
    const dueDay = client.monthly_due_day || 10
    const offset = client.monthly_due_offset == null ? 1 : Number(client.monthly_due_offset)
    const due = monthlyDueDate(when.year, when.month, dueDay, offset)
    if (due.getFullYear() !== viewY || due.getMonth() !== viewM) continue
    if (!porCliente[client.id]) {
      porCliente[client.id] = { ...client, servicosFeitos: 0, valorServicos: 0, vencimento: due }
    }
    porCliente[client.id].servicosFeitos += 1
    porCliente[client.id].valorServicos = roundMoney(porCliente[client.id].valorServicos + (Number(appointment.agreed_price) || 0))
  }

  for (const client of clients || []) {
    if (client.type !== 'MENSALISTA' || porCliente[client.id]) continue
    const dueDay = client.monthly_due_day || 10
    const offset = client.monthly_due_offset == null ? 1 : Number(client.monthly_due_offset)
    const serviceMonth = new Date(viewY, viewM - offset, 1)
    const due = monthlyDueDate(serviceMonth.getFullYear(), serviceMonth.getMonth(), dueDay, offset)
    if (due.getFullYear() !== viewY || due.getMonth() !== viewM) continue
    porCliente[client.id] = { ...client, servicosFeitos: 0, valorServicos: 0, vencimento: due }
  }

  return Object.values(porCliente)
    .filter((client) => !paid.has(String(client.id)))
    .map((client) => ({
      ...client,
      valorCobrar: roundMoney(Number(client.monthly_fee) > 0 ? Number(client.monthly_fee) : client.valorServicos),
    }))
    .filter((client) => client.valorCobrar > 0 || client.servicosFeitos > 0)
}
