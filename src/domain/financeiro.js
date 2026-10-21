import { monthlyDueDate, toDateInputValue } from '../utils/dates.js'

/** Comissão nasce na conclusão do atendimento, com o percentual daquele momento. */
export const REGRA_COMISSAO = 'CONCLUSAO'

const METODOS_CAIXA = new Set(['PIX', 'DINHEIRO', 'CARTAO', 'OUTRO'])

export function roundMoney(value) {
  const n = Number(String(value ?? '').replace(',', '.'))
  if (!Number.isFinite(n)) return 0
  const negative = n < 0
  const cents = Math.round((Math.abs(n) + 1e-8) * 100)
  return (negative ? -1 : 1) * cents / 100
}

export function civilDate(value) {
  if (value == null || value === '') return ''
  if (value instanceof Date) {
    return formatParts(value)
  }
  const raw = String(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const local = raw.match(/^(\d{4}-\d{2}-\d{2})T/)
  const hasZone = /Z$|[+-]\d{2}:\d{2}$/.test(raw)
  if (local && !hasZone) return local[1]
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return ''
  return formatParts(date)
}

function formatParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const pick = (type) => parts.find((part) => part.type === type)?.value || ''
  return `${pick('year')}-${pick('month')}-${pick('day')}`
}

function monthIndex(date) {
  const day = civilDate(date)
  if (!day) return null
  return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) - 1, day }
}

export function noPeriodo(dia, from, to) {
  const day = civilDate(dia)
  if (!day || !from || !to) return false
  return day >= from && day <= to
}

export function netReceived(payments) {
  let net = 0
  for (const payment of payments || []) {
    const amount = roundMoney(payment.amount)
    net = roundMoney(net + (payment.entryType === 'ESTORNO' ? -amount : amount))
  }
  return net
}

export function statusFinanceiro({ originalAmount, discountAmount = 0, payments = [], cancelled = false }) {
  if (cancelled) return 'CANCELADO'
  const liquido = roundMoney(Math.max(0, Number(originalAmount) - Number(discountAmount)))
  let received = 0
  let reversed = 0
  for (const payment of payments || []) {
    const amount = roundMoney(payment.amount)
    if (payment.entryType === 'ESTORNO') reversed = roundMoney(reversed + amount)
    else received = roundMoney(received + amount)
  }
  const net = roundMoney(received - reversed)
  if (reversed > 0 && net <= 0 && received > 0) return 'ESTORNADO'
  if (net <= 0) return 'PENDENTE'
  if (net + 0.001 < liquido) return 'PARCIAL'
  return 'PAGO'
}

export function saldoDe(charge, payments = []) {
  const daCobranca = (payments || []).filter((payment) => payment.chargeId === charge.id)
  if (charge.countsAsRevenue === false) {
    return {
      status: charge.cancelled ? 'CANCELADO' : 'PAGO',
      liquido: 0,
      received: 0,
      pending: 0,
    }
  }
  const status = statusFinanceiro({
    originalAmount: charge.originalAmount,
    discountAmount: charge.discountAmount,
    payments: daCobranca,
    cancelled: charge.cancelled,
  })
  const liquido = roundMoney((Number(charge.originalAmount) || 0) - (Number(charge.discountAmount) || 0))
  const received = netReceived(daCobranca)
  const pending = status === 'PAGO' || status === 'CANCELADO' || status === 'ESTORNADO'
    ? 0
    : roundMoney(Math.max(0, liquido - Math.max(0, received)))
  return { status, liquido, received: roundMoney(Math.max(0, received)), pending }
}

export function comSaldos(charges, payments) {
  return (charges || []).map((charge) => ({ ...charge, ...saldoDe(charge, payments) }))
}

export function snapshotComissao({
  id,
  appointmentId,
  staffId,
  staffName,
  percent,
  baseAmount,
  recognizedAt,
  status = 'PENDENTE',
}) {
  const base = roundMoney(baseAmount)
  const pct = roundMoney(percent)
  return {
    id: id || `com-${appointmentId}`,
    appointmentId,
    staffId,
    staffName: staffName || 'Profissional',
    percentApplied: pct,
    baseAmount: base,
    amountDue: roundMoney(base * (pct / 100)),
    recognizedAt: civilDate(recognizedAt),
    status,
    estimated: false,
  }
}

/** Percentual novo não recalcula uma comissão já gravada. */
export function comissaoDevida({ historica, baseAmount, percentualAtual, staffId, staffName, appointmentId, recognizedAt }) {
  if (historica) {
    return {
      ...historica,
      percentApplied: historica.percentApplied,
      baseAmount: historica.baseAmount,
      amountDue: historica.amountDue,
    }
  }
  return snapshotComissao({
    appointmentId,
    staffId,
    staffName,
    percent: percentualAtual,
    baseAmount,
    recognizedAt,
  })
}

function ehMensalidade(transaction) {
  if (!transaction || transaction.type !== 'RECEITA') return false
  if (transaction.category === 'mensalidade') return true
  return /^mensalidade\b/i.test(String(transaction.description || ''))
}

function pendenteDe(charge, payments) {
  return saldoDe(charge, payments).pending
}

function escolherCobrancaMensal(lista, payments, cashDate) {
  const mes = civilDate(cashDate).slice(0, 7)
  const abertas = lista.filter((charge) => pendenteDe(charge, payments) > 0)
  const pool = abertas.length ? abertas : lista
  return pool.find((charge) => String(charge.dueDate).slice(0, 7) === mes)
    || pool.find((charge) => String(charge.competenceDate).slice(0, 7) === mes)
    || [...pool].filter((charge) => String(charge.dueDate).slice(0, 7) < mes).sort((a, b) => String(b.dueDate).localeCompare(String(a.dueDate)))[0]
    || [...pool].filter((charge) => String(charge.dueDate).slice(0, 7) > mes).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0]
    || null
}

function nomeMes(competenceDate) {
  const [year, month] = String(competenceDate).split('-').map(Number)
  if (!year || !month) return competenceDate
  const raw = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

export function derivarLivro({ appointments = [], transactions = [], clients = [], viewDate = null }) {
  const charges = []
  const payments = []
  const expenses = []
  const commissions = []
  const mensalGroups = new Map()

  for (const appointment of appointments) {
    if (appointment.status !== 'CONCLUIDO') continue
    const method = appointment.payment_method || 'PENDENTE'
    const price = roundMoney(appointment.agreed_price)
    const when = civilDate(appointment.start_time)
    if (method === 'MENSALIDADE') {
      const parts = monthIndex(appointment.start_time)
      if (!parts || !appointment.client_id) continue
      const key = `${appointment.client_id}:${parts.year}-${String(parts.month + 1).padStart(2, '0')}`
      if (!mensalGroups.has(key)) {
        mensalGroups.set(key, {
          client: { ...(appointment.clients || {}), id: appointment.client_id },
          parts,
          visits: [],
        })
      }
      mensalGroups.get(key).visits.push(appointment)
      continue
    }

    const depositPaid = appointment.deposit_status === 'paid' || appointment.deposit_status === 'applied'
    const deposit = depositPaid ? roundMoney(Math.min(Number(appointment.deposit_amount) || 0, price)) : 0
    const chargeId = `apt-${appointment.id}`
    const counts = method !== 'PACOTE'
    charges.push({
      id: chargeId,
      userId: appointment.user_id || null,
      kind: 'ATENDIMENTO',
      sourceKey: `atendimento:${appointment.id}`,
      appointmentId: appointment.id,
      clientId: appointment.client_id || null,
      clientName: appointment.clients?.name || '',
      staffId: appointment.staff_id || null,
      serviceName: appointment.services?.name || '',
      description: `${appointment.clients?.name || 'Cliente'} — ${appointment.services?.name || 'Serviço'}`,
      competenceDate: when,
      dueDate: when,
      originalAmount: price,
      discountAmount: 0,
      countsAsRevenue: counts,
      cancelled: false,
    })
    if (deposit > 0) {
      payments.push({
        id: `dep-${appointment.id}`,
        chargeId,
        amount: deposit,
        method: 'PIX',
        entryType: 'RECEBIMENTO',
        cashDate: when,
        idempotencyKey: `deposito:${appointment.id}`,
        reference: 'Sinal',
      })
    }
    if (METODOS_CAIXA.has(method)) {
      const rest = roundMoney(price - deposit)
      if (rest > 0) {
        payments.push({
          id: `quit-${appointment.id}`,
          chargeId,
          amount: rest,
          method,
          entryType: 'RECEBIMENTO',
          cashDate: when,
          idempotencyKey: `quitacao:${appointment.id}`,
          reference: '',
        })
      }
    }
    const percent = Number(appointment.staff_members?.commission_percent) || 0
    if (counts && appointment.staff_id && percent > 0) {
      commissions.push({
        ...snapshotComissao({
          appointmentId: appointment.id,
          staffId: appointment.staff_id,
          staffName: appointment.staff_members?.name,
          percent,
          baseAmount: price,
          recognizedAt: when,
        }),
        estimated: true,
      })
    }
  }

  if (viewDate) {
    for (const client of clients) {
      if (client.type !== 'MENSALISTA' || !(Number(client.monthly_fee) > 0)) continue
      const offset = client.monthly_due_offset == null ? 1 : Number(client.monthly_due_offset)
      const service = new Date(viewDate.getFullYear(), viewDate.getMonth() - offset, 1)
      const due = monthlyDueDate(service.getFullYear(), service.getMonth(), client.monthly_due_day || 10, offset)
      if (due.getFullYear() !== viewDate.getFullYear() || due.getMonth() !== viewDate.getMonth()) continue
      const key = `${client.id}:${service.getFullYear()}-${String(service.getMonth() + 1).padStart(2, '0')}`
      if (mensalGroups.has(key)) continue
      mensalGroups.set(key, {
        client,
        parts: { year: service.getFullYear(), month: service.getMonth() },
        visits: [],
      })
    }
  }

  for (const [key, group] of mensalGroups) {
    const client = group.client
    const visitsTotal = roundMoney(group.visits.reduce((sum, visit) => sum + (Number(visit.agreed_price) || 0), 0))
    const fee = Number(client.monthly_fee) > 0 ? roundMoney(client.monthly_fee) : visitsTotal
    const due = monthlyDueDate(
      group.parts.year,
      group.parts.month,
      client.monthly_due_day || 10,
      client.monthly_due_offset == null ? 1 : Number(client.monthly_due_offset),
    )
    const competenceDate = `${group.parts.year}-${String(group.parts.month + 1).padStart(2, '0')}-01`
    charges.push({
      id: `mensal-${key}`,
      userId: client.user_id || null,
      kind: 'MENSALIDADE',
      sourceKey: `mensalidade:${client.id}:${competenceDate.slice(0, 7)}`,
      appointmentId: null,
      clientId: client.id,
      clientName: client.name || '',
      phone: client.phone || '',
      staffId: null,
      serviceName: 'Mensalidade',
      description: `Mensalidade — ${nomeMes(competenceDate)}`,
      competenceDate,
      dueDate: toDateInputValue(due),
      originalAmount: fee,
      discountAmount: roundMoney(client.discount_amount || 0),
      countsAsRevenue: true,
      cancelled: false,
      visits: group.visits.length,
    })
  }

  const mensalPayments = []
  for (const transaction of transactions) {
    if (transaction.charge_id || transaction.payment_id) continue
    if (transaction.type === 'DESPESA') {
      expenses.push({
        id: transaction.id,
        userId: transaction.user_id || null,
        amount: roundMoney(transaction.amount),
        cashDate: civilDate(transaction.date),
        category: transaction.category || 'despesa',
        description: transaction.description || 'Despesa',
        commissionEntryId: transaction.commission_entry_id || null,
        paymentMethod: transaction.payment_method || null,
        staffId: transaction.staff_id || null,
      })
      continue
    }
    if (transaction.type !== 'RECEITA') continue
    if (ehMensalidade(transaction)) {
      mensalPayments.push(transaction)
      continue
    }
    const id = `tx-${transaction.id}`
    const dia = civilDate(transaction.date)
    charges.push({
      id,
      userId: transaction.user_id || null,
      kind: transaction.category === 'produto' ? 'VENDA' : 'MANUAL',
      sourceKey: `venda:${transaction.id}`,
      appointmentId: null,
      clientId: transaction.client_id || null,
      clientName: '',
      staffId: null,
      serviceName: transaction.category === 'produto' ? 'Produto' : '',
      description: transaction.description || 'Receita',
      competenceDate: dia,
      dueDate: dia,
      originalAmount: roundMoney(transaction.amount),
      discountAmount: 0,
      countsAsRevenue: true,
      cancelled: false,
      transactionId: transaction.id,
    })
    payments.push({
      id: `pay-${transaction.id}`,
      chargeId: id,
      amount: roundMoney(transaction.amount),
      method: transaction.payment_method || 'OUTRO',
      entryType: 'RECEBIMENTO',
      cashDate: dia,
      idempotencyKey: `legacy-tx:${transaction.id}`,
      transactionId: transaction.id,
      reference: '',
    })
  }

  const ordenados = [...mensalPayments].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  for (const transaction of ordenados) {
    const lista = charges.filter((charge) => charge.kind === 'MENSALIDADE' && String(charge.clientId) === String(transaction.client_id))
    const dia = civilDate(transaction.date)
    const alvo = escolherCobrancaMensal(lista, payments, dia)
    payments.push({
      id: `mpay-${transaction.id}`,
      chargeId: alvo?.id || null,
      amount: roundMoney(transaction.amount),
      method: transaction.payment_method || 'PIX',
      entryType: 'RECEBIMENTO',
      cashDate: dia,
      idempotencyKey: `legacy-tx:${transaction.id}`,
      transactionId: transaction.id,
      reference: transaction.description || '',
    })
  }

  return { charges, payments, expenses, commissions }
}

export function aplicarRecebimento(livro, payment) {
  const payments = livro.payments || []
  const existing = payments.find((item) => item.idempotencyKey && item.idempotencyKey === payment.idempotencyKey)
  if (existing) return { ...livro, payments, duplicated: true, payment: existing }
  const charge = (livro.charges || []).find((item) => item.id === payment.chargeId)
  if (!charge) return { ...livro, error: 'Cobrança não encontrada' }
  if (charge.cancelled || saldoDe(charge, payments).status === 'CANCELADO') {
    return { ...livro, error: 'Cobrança cancelada' }
  }
  const amount = roundMoney(payment.amount)
  if (amount <= 0) return { ...livro, error: 'Valor inválido' }
  const pending = saldoDe(charge, payments).pending
  if (amount > pending + 0.001) return { ...livro, error: 'Valor maior que o saldo da cobrança' }
  const next = {
    ...payment,
    amount,
    entryType: 'RECEBIMENTO',
    cashDate: civilDate(payment.cashDate),
  }
  return { ...livro, payments: [...payments, next], duplicated: false, payment: next, error: null }
}

export function estornarRecebimento(livro, { paymentId, cashDate, idempotencyKey }) {
  const payments = livro.payments || []
  const replay = payments.find((item) => item.idempotencyKey && item.idempotencyKey === idempotencyKey)
  if (replay) return { ...livro, duplicated: true, payment: replay }
  const original = payments.find((item) => item.id === paymentId)
  if (!original || original.entryType === 'ESTORNO') return { ...livro, error: 'Recebimento não encontrado' }
  const already = payments.find((item) => item.reversalOf === paymentId)
  if (already) return { ...livro, duplicated: true, payment: already }
  const estorno = {
    id: `est-${paymentId}`,
    chargeId: original.chargeId,
    amount: original.amount,
    method: original.method,
    entryType: 'ESTORNO',
    reversalOf: paymentId,
    cashDate: civilDate(cashDate),
    idempotencyKey,
    reference: 'Estorno',
  }
  return { ...livro, payments: [...payments, estorno], duplicated: false, payment: estorno, error: null }
}

export function cancelarCobranca(livro, chargeId) {
  const charge = (livro.charges || []).find((item) => item.id === chargeId)
  if (!charge) return { ...livro, error: 'Cobrança não encontrada' }
  if (netReceived((livro.payments || []).filter((payment) => payment.chargeId === chargeId)) > 0) {
    return { ...livro, error: 'Estorne os recebimentos antes de cancelar' }
  }
  return {
    ...livro,
    error: null,
    charges: livro.charges.map((item) => (item.id === chargeId ? { ...item, cancelled: true } : item)),
  }
}

function despesaOperacional(expense) {
  if (!expense) return false
  if (expense.category === 'estorno') return false
  if (expense.category === 'comissao') return false
  if (expense.commissionEntryId) return false
  return true
}

export function indicadoresFinanceiros({ charges = [], payments = [], expenses = [], commissions = [], from, to }) {
  let faturamento = 0
  for (const charge of charges) {
    if (charge.cancelled || charge.countsAsRevenue === false) continue
    if (!noPeriodo(charge.competenceDate, from, to)) continue
    faturamento = roundMoney(faturamento + (Number(charge.originalAmount) || 0) - (Number(charge.discountAmount) || 0))
  }
  for (const payment of payments) {
    if (payment.entryType !== 'ESTORNO' || !noPeriodo(payment.cashDate, from, to)) continue
    const charge = charges.find((item) => item.id === payment.chargeId)
    if (!charge || charge.cancelled || charge.countsAsRevenue === false) continue
    faturamento = roundMoney(faturamento - payment.amount)
  }

  let recebimentos = 0
  for (const payment of payments) {
    if (!noPeriodo(payment.cashDate, from, to)) continue
    const amount = roundMoney(payment.amount)
    recebimentos = roundMoney(recebimentos + (payment.entryType === 'ESTORNO' ? -amount : amount))
  }

  let contasAReceber = 0
  for (const charge of comSaldos(charges, payments)) {
    if (charge.countsAsRevenue === false || charge.pending <= 0) continue
    const noMes = noPeriodo(charge.competenceDate, from, to) || noPeriodo(charge.dueDate, from, to)
    if (!noMes) continue
    contasAReceber = roundMoney(contasAReceber + charge.pending)
  }

  let despesasPagas = 0
  let despesasOperacionais = 0
  for (const expense of expenses) {
    if (!noPeriodo(expense.cashDate, from, to)) continue
    if (expense.category === 'estorno') continue
    const amount = roundMoney(expense.amount)
    despesasPagas = roundMoney(despesasPagas + amount)
    if (despesaOperacional(expense)) despesasOperacionais = roundMoney(despesasOperacionais + amount)
  }

  let contasAPagar = 0
  let comissoesReconhecidas = 0
  for (const commission of commissions) {
    if (commission.status === 'CANCELADO') continue
    if (!noPeriodo(commission.recognizedAt, from, to)) continue
    comissoesReconhecidas = roundMoney(comissoesReconhecidas + commission.amountDue)
    if (commission.status === 'PENDENTE') contasAPagar = roundMoney(contasAPagar + commission.amountDue)
  }

  return {
    faturamento,
    recebimentos,
    contasAReceber,
    despesasPagas,
    contasAPagar,
    resultadoCaixa: roundMoney(recebimentos - despesasPagas),
    resultadoOperacional: roundMoney(faturamento - despesasOperacionais - comissoesReconhecidas),
    comissoesReconhecidas,
    despesasOperacionais,
  }
}

export function filtrarVisaoFinanceira({ isStaff, staffId, charges, payments, expenses, commissions }) {
  if (!isStaff) return { charges, payments, expenses, commissions }
  const minhas = (charges || []).filter((charge) => charge.staffId && String(charge.staffId) === String(staffId))
  const ids = new Set(minhas.map((charge) => charge.id))
  return {
    charges: minhas,
    payments: (payments || []).filter((payment) => ids.has(payment.chargeId)),
    expenses: [],
    commissions: (commissions || []).filter((commission) => String(commission.staffId) === String(staffId)),
  }
}

export function doWorkspace(rows, workspaceId) {
  return (rows || []).filter((row) => row.userId === workspaceId)
}

export function aplicarFiltros(livro, { staffId = '', method = '', service = '' } = {}) {
  let charges = livro.charges || []
  if (staffId) charges = charges.filter((charge) => String(charge.staffId || '') === String(staffId))
  if (service) charges = charges.filter((charge) => charge.serviceName === service)
  const ids = new Set(charges.map((charge) => charge.id))
  let payments = (livro.payments || []).filter((payment) => !payment.chargeId || ids.has(payment.chargeId))
  if (method) payments = payments.filter((payment) => payment.method === method)
  let expenses = livro.expenses || []
  if (staffId || service) expenses = []
  let commissions = livro.commissions || []
  if (staffId) commissions = commissions.filter((commission) => String(commission.staffId) === String(staffId))
  if (service) {
    const appointments = new Set(charges.map((charge) => charge.appointmentId).filter(Boolean))
    commissions = commissions.filter((commission) => appointments.has(commission.appointmentId))
  }
  return { charges, payments, expenses, commissions }
}

export function serieRecebimentos(payments, monthKeys) {
  return (monthKeys || []).map((key) => {
    let total = 0
    for (const payment of payments || []) {
      if (!String(payment.cashDate || '').startsWith(key)) continue
      const amount = roundMoney(payment.amount)
      total = roundMoney(total + (payment.entryType === 'ESTORNO' ? -amount : amount))
    }
    const [year, month] = key.split('-').map(Number)
    const label = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(year, month - 1, 1)).replace('.', '')
    return { key, label: label.charAt(0).toUpperCase() + label.slice(1), total }
  })
}

export function movimentacoesDoLivro(livro) {
  const charges = new Map((livro.charges || []).map((charge) => [charge.id, charge]))
  const rows = []
  for (const payment of livro.payments || []) {
    const charge = charges.get(payment.chargeId)
    rows.push({
      id: payment.id,
      description: payment.entryType === 'ESTORNO'
        ? `Estorno · ${charge?.description || payment.reference || 'Recebimento'}`
        : (charge?.description || payment.reference || 'Recebimento'),
      amount: roundMoney(payment.amount),
      type: payment.entryType === 'ESTORNO' ? 'ESTORNO' : 'RECEITA',
      date: payment.cashDate,
      payment_method: payment.method,
      origem: charge?.kind === 'ATENDIMENTO' ? 'AGENDA' : 'MANUAL',
      category: charge?.kind === 'MENSALIDADE' ? 'mensalidade' : charge?.kind === 'VENDA' ? 'produto' : charge?.kind === 'ATENDIMENTO' ? 'servico' : 'receita',
      staff_id: charge?.staffId || null,
      staff_name: charge?.staffName || '',
      service_name: charge?.serviceName || '',
      chargeId: payment.chargeId || null,
      transactionId: payment.transactionId || null,
    })
  }
  for (const expense of livro.expenses || []) {
    rows.push({
      id: expense.id,
      description: expense.description,
      amount: roundMoney(expense.amount),
      type: 'DESPESA',
      date: expense.cashDate,
      payment_method: expense.paymentMethod,
      origem: 'MANUAL',
      category: expense.category || 'despesa',
      staff_id: expense.staffId || null,
      transactionId: expense.id,
      chargeId: null,
    })
  }
  rows.sort((a, b) => String(b.date).localeCompare(String(a.date)))
  return rows
}
