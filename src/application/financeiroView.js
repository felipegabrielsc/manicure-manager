import {
  aplicarFiltros,
  comSaldos,
  filtrarVisaoFinanceira,
  indicadoresFinanceiros,
  movimentacoesDoLivro,
  roundMoney,
  serieRecebimentos,
} from '../domain/financeiro.js'
import { classifyNewVsReturning, dailyCompare, paymentMix, sliceUntilDay, topClientsByVisits } from '../utils/financeInsights.js'
import { buildSalonReport } from '../utils/salonReports.js'
import { monthRangeLocal } from '../utils/dates.js'

export function chavesMeses(data, quantidade = 6) {
  const keys = []
  for (let i = quantidade - 1; i >= 0; i -= 1) {
    const dia = new Date(data.getFullYear(), data.getMonth() - i, 1)
    keys.push(`${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

export function diarioDoMes(payments, year, month) {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
  const days = new Date(year, month + 1, 0).getDate()
  const rows = Array.from({ length: days }, (_, index) => ({ day: index + 1, total: 0 }))
  for (const payment of payments || []) {
    const day = String(payment.cashDate || '')
    if (!day.startsWith(prefix)) continue
    const index = Number(day.slice(8, 10)) - 1
    if (index < 0 || index >= days) continue
    const sign = payment.entryType === 'ESTORNO' ? -1 : 1
    rows[index].total = roundMoney(rows[index].total + sign * Number(payment.amount || 0))
  }
  return rows
}

function noMes(dia, from, to) {
  const day = String(dia || '').slice(0, 10)
  return day >= from && day <= to
}

export function filtrarMovimentos(movimentos, { from, to, categoria = 'TODOS', pagamento = 'TODOS' } = {}) {
  return (movimentos || []).filter((item) => {
    if (!noMes(item.date, from, to)) return false
    if (categoria === 'SERVICO' && item.category !== 'servico') return false
    if (categoria === 'PRODUTO' && item.category !== 'produto') return false
    if (categoria === 'MENSAL' && item.category !== 'mensalidade') return false
    if (categoria === 'DESPESA' && item.type !== 'DESPESA') return false
    if (pagamento === 'MENSALIDADE') return item.category === 'mensalidade'
    if (pagamento !== 'TODOS' && item.payment_method !== pagamento) return false
    return true
  })
}

export function montarPainelFinanceiro({
  livroBruto,
  agendaJanela = [],
  dataAtual,
  isStaff = false,
  staffMemberId = null,
  staffFiltro = '',
  filtroServico = '',
  clientesNovos = { monthIds: [], prior: [] },
  metaMes = 0,
}) {
  const periodo = monthRangeLocal(dataAtual)
  const mesAnterior = monthRangeLocal(new Date(dataAtual.getFullYear(), dataAtual.getMonth() - 1, 1))
  const mesFormatado = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(dataAtual)
  const base = filtrarVisaoFinanceira({
    isStaff,
    staffId: staffMemberId,
    charges: livroBruto?.charges || [],
    payments: livroBruto?.payments || [],
    expenses: livroBruto?.expenses || [],
    commissions: livroBruto?.commissions || [],
  })
  const livro = aplicarFiltros(base, { staffId: staffFiltro, service: filtroServico })
  const indicadores = indicadoresFinanceiros({ ...livro, from: periodo.startDay, to: periodo.endDay })
  const anterior = indicadoresFinanceiros({ ...livro, from: mesAnterior.startDay, to: mesAnterior.endDay })
  const saldos = comSaldos(livro.charges, livro.payments)
  const abertas = saldos.filter((charge) => charge.pending > 0 && charge.countsAsRevenue !== false)
  const mensalidades = saldos.filter((charge) => (
    charge.kind === 'MENSALIDADE'
    && charge.clientId
    && charge.status !== 'CANCELADO'
    && (noMes(charge.competenceDate, periodo.startDay, periodo.endDay) || noMes(charge.dueDate, periodo.startDay, periodo.endDay))
  ))
  const comissoesMes = (livro.commissions || []).filter((item) => item.status !== 'CANCELADO')
  const aPagar = comissoesMes.filter((item) => item.status === 'PENDENTE')
  const movimentosTodos = movimentacoesDoLivro(livro)
  const agendaMes = agendaJanela.filter((item) => {
    const dia = new Date(item.start_time)
    return dia >= periodo.start && dia <= periodo.end
  })
  const concluidosMes = agendaMes.filter((item) => item.status === 'CONCLUIDO')
  const concluidosAnterior = agendaJanela.filter((item) => {
    if (item.status !== 'CONCLUIDO') return false
    const dia = new Date(item.start_time)
    return dia >= mesAnterior.start && dia <= mesAnterior.end
  })
  const servicos = [...new Set(saldos.map((charge) => charge.serviceName).filter(Boolean))]
  const serie = serieRecebimentos(livro.payments, chavesMeses(dataAtual))
  const diario = diarioDoMes(livro.payments, dataAtual.getFullYear(), dataAtual.getMonth())
  const relatorio = buildSalonReport(agendaMes)
  const progressoMeta = metaMes > 0 ? Math.min(100, (indicadores.recebimentos / metaMes) * 100) : 0
  const estornados = new Set(livro.payments.filter((payment) => payment.reversalOf).map((payment) => payment.reversalOf))
  const recNow = livro.payments.filter((payment) => noMes(payment.cashDate, periodo.startDay, periodo.endDay)).map((payment) => ({
    date: `${payment.cashDate}T12:00:00`,
    amount: payment.entryType === 'ESTORNO' ? -Number(payment.amount) : Number(payment.amount),
  }))
  const recPrev = livro.payments.filter((payment) => noMes(payment.cashDate, mesAnterior.startDay, mesAnterior.endDay)).map((payment) => ({
    date: `${payment.cashDate}T12:00:00`,
    amount: payment.entryType === 'ESTORNO' ? -Number(payment.amount) : Number(payment.amount),
  }))
  const moneyRows = dailyCompare(recNow, recPrev, dataAtual.getFullYear(), dataAtual.getMonth())
  const hojeData = new Date()
  const diaCorte = (hojeData.getFullYear() === dataAtual.getFullYear() && hojeData.getMonth() === dataAtual.getMonth())
    ? hojeData.getDate()
    : new Date(dataAtual.getFullYear(), dataAtual.getMonth() + 1, 0).getDate()
  const ateHoje = sliceUntilDay(moneyRows, diaCorte)
  const overview = {
    mesLabel: mesFormatado,
    mesAnteriorLabel: new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(mesAnterior.start),
    kpis: {
      faturamento: indicadores.faturamento,
      despesas: indicadores.despesasPagas,
      despesasPagas: indicadores.despesasPagas,
      lucro: indicadores.resultadoCaixa,
      resultadoCaixa: indicadores.resultadoCaixa,
      resultadoOperacional: indicadores.resultadoOperacional,
      recebimentos: indicadores.recebimentos,
      contasAReceber: indicadores.contasAReceber,
      prevResultadoCaixa: anterior.resultadoCaixa,
      prevLucro: anterior.resultadoCaixa,
      atendimentos: concluidosMes.length,
      ticket: concluidosMes.length ? indicadores.faturamento / concluidosMes.length : 0,
      prevFaturamento: anterior.faturamento,
      prevAtendimentos: concluidosAnterior.length,
      prevTicket: concluidosAnterior.length ? anterior.faturamento / concluidosAnterior.length : 0,
    },
    daily: moneyRows,
    comparacao: { dia: diaCorte, ...ateHoje },
    projecao: {
      confirmado: indicadores.faturamento,
      pendente: agendaMes.filter((item) => item.status === 'PENDENTE' || item.status === 'AGENDADO').reduce((sum, item) => sum + (Number(item.agreed_price) || 0), 0),
    },
    clientes: {
      ...classifyNewVsReturning(clientesNovos.monthIds, new Set(clientesNovos.prior)),
      top5: topClientsByVisits(concluidosMes),
    },
    pagamentos: paymentMix(livro.payments.filter((payment) => payment.entryType !== 'ESTORNO' && noMes(payment.cashDate, periodo.startDay, periodo.endDay)).map((payment) => ({
      payment_method: payment.method,
      amount: payment.amount,
    }))),
  }
  return {
    periodo,
    mesAnterior,
    mesFormatado,
    indicadores,
    anterior,
    saldos,
    abertas,
    mensalidades,
    comissoesMes,
    aPagar,
    movimentosTodos,
    agendaMes,
    concluidosMes,
    servicos,
    serie,
    diario,
    relatorio,
    progressoMeta,
    estornados,
    overview,
  }
}
