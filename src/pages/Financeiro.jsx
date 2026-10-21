import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, BarChart3, Calendar, Download, FileText, HelpCircle, MessageCircle, Package, PlusCircle, Printer, Target, Trash2, TrendingDown, Wallet } from 'lucide-react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import toast from 'react-hot-toast'
import { supabase } from '../supabaseClient'
import Modal from '../components/Modal'
import FinanceOverview from '../components/FinanceOverview'
import FinanceResumo from '../components/FinanceResumo'
import { useSessionProfile } from '../context/SessionProfile'
import {
  cancelarCobrancaRemota,
  estornarCobranca,
  mapCharge,
  mapCommission,
  mapExpense,
  mapPayment,
  quitarComissao,
  receberCobranca,
  sincronizarExistente,
  uniqById,
} from '../application/financeiroService'
import {
  aplicarFiltros,
  comSaldos,
  derivarLivro,
  filtrarVisaoFinanceira,
  indicadoresFinanceiros,
  movimentacoesDoLivro,
  roundMoney,
  serieRecebimentos,
} from '../domain/financeiro'
import { classifyNewVsReturning, dailyCompare, paymentMix, sliceUntilDay, topClientsByVisits } from '../utils/financeInsights'
import { buildSalonReport } from '../utils/salonReports'
import { exportAppointmentsCsv, exportToCsv, exportToPrint } from '../utils/exportReport'
import { formatCivilDate, money, monthRangeLocal, toDateInputValue } from '../utils/dates'
import { openWhatsApp } from '../utils/whatsapp'
import { marcarEnvioManual } from '../application/notificationService'
import { workspaceId } from '../utils/workspace'

const METODOS = ['PIX', 'DINHEIRO', 'CARTAO']
const ABAS = [
  ['visao', 'Visão geral'],
  ['mov', 'Movimentações'],
  ['receber', 'A receber'],
  ['pagar', 'A pagar'],
  ['mensal', 'Mensalidades'],
  ['comissao', 'Comissões'],
  ['relatorios', 'Relatórios'],
]
const STATUS_LABEL = {
  PENDENTE: 'Pendente',
  PARCIAL: 'Parcial',
  PAGO: 'Pago',
  ESTORNADO: 'Estornado',
  CANCELADO: 'Cancelado',
}

const selectAgenda = 'id, status, agreed_price, start_time, client_id, payment_method, staff_id, user_id, deposit_amount, deposit_status, discount_applied, staff_members (name, commission_percent), clients (id, name, type, phone, monthly_fee, monthly_due_day, monthly_due_offset), services (name, duration_minutes)'
const selectAgendaSemSinal = 'id, status, agreed_price, start_time, client_id, payment_method, staff_id, user_id, staff_members (name, commission_percent), clients (id, name, type, phone, monthly_fee, monthly_due_day, monthly_due_offset), services (name, duration_minutes)'

function chavesMeses(data, quantidade = 6) {
  const keys = []
  for (let i = quantidade - 1; i >= 0; i -= 1) {
    const dia = new Date(data.getFullYear(), data.getMonth() - i, 1)
    keys.push(`${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

function diarioDoMes(payments, year, month) {
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

export default function Financeiro() {
  const { profile } = useSessionProfile()
  const [loading, setLoading] = useState(true)
  const [dataAtual, setDataAtual] = useState(new Date())
  const [persistido, setPersistido] = useState(false)
  const [livroBruto, setLivroBruto] = useState(null)
  const [agendaJanela, setAgendaJanela] = useState([])
  const [clientesNovos, setClientesNovos] = useState({ monthIds: [], prior: [] })
  const [auditoria, setAuditoria] = useState([])
  const [filtroAtivo, setFiltroAtivo] = useState('TODOS')
  const [filtroPagamento, setFiltroPagamento] = useState('TODOS')
  const [filtroServico, setFiltroServico] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [cobrancaAlvo, setCobrancaAlvo] = useState(null)
  const [chaveAcao, setChaveAcao] = useState('')
  const [modal, setModal] = useState({ isOpen: false, type: 'info', title: '', message: '' })
  const [idParaExcluir, setIdParaExcluir] = useState(null)
  const [tipoLancamento, setTipoLancamento] = useState('DESPESA')
  const [desc, setDesc] = useState('')
  const [valor, setValor] = useState('')
  const [referencia, setReferencia] = useState('')
  const [clientIdVinculado, setClientIdVinculado] = useState(null)
  const [dataLancamento, setDataLancamento] = useState('')
  const [metodoPagamento, setMetodoPagamento] = useState('PIX')
  const [estoque, setEstoque] = useState([])
  const [itemVendaId, setItemVendaId] = useState('')
  const [qtdVenda, setQtdVenda] = useState('1')
  const [metaMes, setMetaMes] = useState(0)
  const [editandoMeta, setEditandoMeta] = useState(false)
  const [metaInput, setMetaInput] = useState('')
  const [caixaHoje, setCaixaHoje] = useState(null)
  const [staffList, setStaffList] = useState([])
  const [staffFiltro, setStaffFiltro] = useState('')
  const [aba, setAba] = useState('visao')

  const mesFormatado = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(dataAtual)
  const periodo = monthRangeLocal(dataAtual)
  const mesAnterior = monthRangeLocal(new Date(dataAtual.getFullYear(), dataAtual.getMonth() - 1, 1))
  const isStaff = !!profile?.is_staff

  useEffect(() => {
    carregarFinanceiro()
    // Recarrega ao trocar o mês ou quando o perfil do salão fica disponível.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataAtual, profile?.workspace_id])

  const iniciarTutorial = () => {
    driver({
      showProgress: true,
      nextBtnText: 'Próximo',
      prevBtnText: 'Anterior',
      doneBtnText: 'Entendi!',
      steps: [
        { element: '#fin-nav', popover: { title: 'Mês', description: 'Troque o mês para ver a competência e o caixa daquele período.' } },
        { element: '#fin-abas', popover: { title: 'Painel', description: 'Visão geral, recebimentos, contas, mensalidades, comissões e relatórios.' } },
        { element: '#fin-novo', popover: { title: 'Lançamento', description: 'Despesa, receita extra ou venda de produto. Recebimento de cobrança fica na conta.' } },
        { element: '#fin-filtros', popover: { title: 'Filtros', description: 'Profissional e serviço atualizam os números. A forma de pagamento filtra a lista.' } },
      ],
    }).drive()
  }

  async function carregarFinanceiro() {
    setLoading(true)
    const { start, end, startDay, endDay } = monthRangeLocal(dataAtual)
    const inicio = new Date(dataAtual.getFullYear(), dataAtual.getMonth() - 5, 1)
    const inicioDia = toDateInputValue(inicio)
    const probe = await supabase.from('financial_charges').select('id').limit(1)
    const temTabela = !probe.error
    setPersistido(temTabela)
    if (temTabela) await sincronizarExistente(supabase)

    let agendaQuery = await supabase.from('appointments').select(selectAgenda).gte('start_time', inicio.toISOString()).lte('start_time', end.toISOString())
    if (agendaQuery.error?.message?.includes('deposit_')) {
      agendaQuery = await supabase.from('appointments').select(selectAgendaSemSinal).gte('start_time', inicio.toISOString()).lte('start_time', end.toISOString())
    }
    const agenda = agendaQuery.data || []
    setAgendaJanela(agenda)

    const { data: transacoes } = await supabase.from('transactions').select('*').gte('date', inicioDia).lte('date', `${endDay}T23:59:59`)
    const { data: clientesMensais } = await supabase.from('clients').select('*').eq('type', 'MENSALISTA')
    const { data: itens } = await supabase.from('inventory_items').select('*').order('name')
    setEstoque(itens || [])
    const { data: equipe } = await supabase.from('staff_members').select('id, name').eq('active', true).order('name')
    setStaffList(equipe || [])

    let livro
    if (temTabela) {
      const [porCompetencia, porVencimento] = await Promise.all([
        supabase.from('financial_charges').select('*, clients(name, phone), staff_members(name)').gte('competence_date', inicioDia).lte('competence_date', endDay),
        supabase.from('financial_charges').select('*, clients(name, phone), staff_members(name)').gte('due_date', startDay).lte('due_date', endDay),
      ])
      if (porCompetencia.error || porVencimento.error) {
        toast.error('Não consegui ler as cobranças novas. Os números seguem o cálculo da agenda.')
        setPersistido(false)
      } else {
      let chargeRows = uniqById([...(porCompetencia.data || []), ...(porVencimento.data || [])])
      const recebidos = await supabase.from('financial_payments').select('*').gte('received_at', inicio.toISOString()).lte('received_at', end.toISOString())
      let paymentRows = recebidos.data || []
      const ids = chargeRows.map((charge) => charge.id)
      if (ids.length) {
        const ligados = await supabase.from('financial_payments').select('*').in('charge_id', ids)
        paymentRows = uniqById([...paymentRows, ...(ligados.data || [])])
      }
      const presentes = new Set(chargeRows.map((charge) => charge.id))
      const faltantes = [...new Set(paymentRows.map((payment) => payment.charge_id).filter((id) => id && !presentes.has(id)))]
      if (faltantes.length) {
        const extra = await supabase.from('financial_charges').select('*, clients(name, phone), staff_members(name)').in('id', faltantes)
        chargeRows = uniqById([...chargeRows, ...(extra.data || [])])
      }
      const comissoesQuery = await supabase.from('commission_entries').select('*').gte('recognized_at', startDay).lte('recognized_at', endDay)
      const auditQuery = await supabase.from('financial_audit_log').select('id, entity, action, created_at').order('created_at', { ascending: false }).limit(12)
      livro = {
        charges: chargeRows.map(mapCharge),
        payments: paymentRows.map(mapPayment),
        expenses: (transacoes || []).map(mapExpense).filter(Boolean),
        commissions: (comissoesQuery.data || []).map(mapCommission),
      }
      setAuditoria(auditQuery.data || [])
      }
    }
    if (!livro) {
      livro = derivarLivro({
        appointments: agenda,
        transactions: transacoes || [],
        clients: clientesMensais || [],
        viewDate: dataAtual,
      })
      setAuditoria([])
    }
    setLivroBruto(livro)

    const doMes = agenda.filter((item) => {
      const dia = new Date(item.start_time)
      return dia >= start && dia <= end
    })
    const concluidos = doMes.filter((item) => item.status === 'CONCLUIDO')
    const monthIds = concluidos.map((item) => item.client_id).filter(Boolean)
    let prior = []
    const uniqueIds = [...new Set(monthIds)]
    if (uniqueIds.length) {
      const { data } = await supabase.from('appointments').select('client_id').eq('status', 'CONCLUIDO').lt('start_time', start.toISOString()).in('client_id', uniqueIds)
      prior = (data || []).map((item) => item.client_id)
    }
    setClientesNovos({ monthIds, prior })

    const hoje = toDateInputValue()
    const hojeIni = new Date()
    hojeIni.setHours(0, 0, 0, 0)
    const hojeFim = new Date()
    hojeFim.setHours(23, 59, 59, 999)
    const [{ data: aptsHoje }, { data: txHoje }] = await Promise.all([
      supabase.from('appointments').select('id, status, agreed_price, start_time, payment_method, staff_id, client_id, clients(name), services(name), staff_members(name, commission_percent)').gte('start_time', hojeIni.toISOString()).lte('start_time', hojeFim.toISOString()),
      supabase.from('transactions').select('*').gte('date', hoje).lte('date', `${hoje}T23:59:59`),
    ])
    let livroHoje
    if (temTabela) {
      const pays = await supabase.from('financial_payments').select('*').gte('received_at', hojeIni.toISOString()).lte('received_at', hojeFim.toISOString())
      livroHoje = {
        charges: [],
        payments: (pays.data || []).map(mapPayment),
        expenses: (txHoje || []).map(mapExpense).filter(Boolean),
        commissions: [],
      }
    } else {
      livroHoje = derivarLivro({ appointments: aptsHoje || [], transactions: txHoje || [] })
    }
    const indHoje = indicadoresFinanceiros({ ...livroHoje, from: hoje, to: hoje })
    setCaixaHoje({
      entradas: indHoje.recebimentos,
      saidas: indHoje.despesasPagas,
      atendimentos: (aptsHoje || []).filter((item) => item.status === 'CONCLUIDO').length,
    })

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: goal } = await supabase.from('financial_goals').select('target_amount')
        .eq('user_id', workspaceId(profile, user.id))
        .eq('year', dataAtual.getFullYear())
        .eq('month', dataAtual.getMonth() + 1)
        .maybeSingle()
      setMetaMes(goal?.target_amount || 0)
    }
    setLoading(false)
  }

  const base = filtrarVisaoFinanceira({
    isStaff,
    staffId: profile?.staff_member_id,
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
    && (noMes(charge.competenceDate, periodo.startDay, periodo.endDay) || noMes(charge.dueDate, periodo.startDay, periodo.endDay))
  ))
  const comissoesMes = (livro.commissions || []).filter((item) => item.status !== 'CANCELADO')
  const aPagar = comissoesMes.filter((item) => item.status === 'PENDENTE')
  const movimentos = movimentacoesDoLivro(livro).filter((item) => {
    if (!noMes(item.date, periodo.startDay, periodo.endDay)) return false
    if (filtroAtivo === 'SERVICO' && item.category !== 'servico') return false
    if (filtroAtivo === 'PRODUTO' && item.category !== 'produto') return false
    if (filtroAtivo === 'MENSAL' && item.category !== 'mensalidade') return false
    if (filtroAtivo === 'DESPESA' && item.type !== 'DESPESA') return false
    if (filtroPagamento === 'MENSALIDADE') return item.category === 'mensalidade'
    if (filtroPagamento !== 'TODOS' && item.payment_method !== filtroPagamento) return false
    return true
  })
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

  async function salvarMeta() {
    const valorMeta = parseFloat(String(metaInput).replace(',', '.'))
    if (!valorMeta || valorMeta <= 0) return toast.error('Informe um valor válido')
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('financial_goals').upsert({
      user_id: workspaceId(profile, user.id),
      year: dataAtual.getFullYear(),
      month: dataAtual.getMonth() + 1,
      target_amount: valorMeta,
    }, { onConflict: 'user_id,year,month' })
    if (error) toast.error('Erro ao salvar meta. Execute a migration 002.')
    else {
      setMetaMes(valorMeta)
      setEditandoMeta(false)
      toast.success('Meta definida!')
    }
  }

  function abrirFormulario(tipo = 'DESPESA') {
    setCobrancaAlvo(null)
    setTipoLancamento(tipo)
    setDesc('')
    setValor('')
    setReferencia('')
    setClientIdVinculado(null)
    setItemVendaId('')
    setQtdVenda('1')
    setMetodoPagamento('PIX')
    setDataLancamento(toDateInputValue())
    setChaveAcao(crypto.randomUUID())
    setShowForm(true)
  }

  function abrirRecebimento(charge) {
    setShowForm(false)
    setCobrancaAlvo(charge)
    setValor(charge.pending ? String(charge.pending) : '')
    setReferencia('')
    setMetodoPagamento('PIX')
    setDataLancamento(toDateInputValue())
    setChaveAcao(crypto.randomUUID())
    setClientIdVinculado(charge.clientId || null)
    setDesc(charge.description || '')
  }

  async function cobrarWhatsApp(charge) {
    const venc = charge.dueDate ? formatCivilDate(charge.dueDate) : 'o vencimento'
    const ok = openWhatsApp(charge.phone, `Oi ${charge.clientName || 'cliente'}! Sua mensalidade vence em ${venc}, no valor de R$ ${money(charge.pending || charge.liquido)}. Pode pagar por PIX quando puder 💜`)
    if (!ok) return toast.error('Cliente sem WhatsApp no cadastro')
    await marcarEnvioManual(supabase, { clientId: charge.clientId, types: ['payment_reminder'] }).catch(() => {})
  }

  function onEscolherProduto(id) {
    setItemVendaId(id)
    const item = estoque.find((produto) => produto.id === id)
    if (item?.sale_price) setValor(String(item.sale_price))
    if (item && !desc) setDesc(`Venda: ${item.name}`)
  }

  async function handleReceber(event) {
    event.preventDefault()
    const amount = roundMoney(String(valor).replace(',', '.'))
    if (!cobrancaAlvo || amount <= 0) return toast.error('Informe o valor recebido')
    if (amount > cobrancaAlvo.pending + 0.001) return toast.error('Valor maior que o saldo da cobrança')
    if (!persistido) {
      if (cobrancaAlvo.kind !== 'MENSALIDADE') {
        return toast.error('Rode o SQL 040 no Supabase para registrar pagamentos parciais.')
      }
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('transactions').insert({
        description: cobrancaAlvo.description,
        amount,
        type: 'RECEITA',
        category: 'mensalidade',
        date: new Date(`${dataLancamento}T12:00:00`).toISOString(),
        client_id: cobrancaAlvo.clientId,
        user_id: workspaceId(profile, user.id),
        payment_method: metodoPagamento,
      })
      if (error) return toast.error(error.message)
      setCobrancaAlvo(null)
      toast.success('Recebimento salvo')
      carregarFinanceiro()
      return
    }
    const result = await receberCobranca(supabase, {
      chargeId: cobrancaAlvo.id,
      amount,
      method: metodoPagamento,
      reference: referencia,
      receivedOn: dataLancamento,
      idempotencyKey: chaveAcao,
    })
    if (!result.ok) return toast.error(result.missing ? 'Rode o SQL 040 no Supabase.' : result.error)
    setCobrancaAlvo(null)
    toast.success(result.duplicated ? 'Esse recebimento já estava registrado' : 'Recebimento salvo')
    carregarFinanceiro()
  }

  async function handleSalvarLancamento(event) {
    event.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return toast.error('Sessão expirada')
    const qtd = parseFloat(String(qtdVenda).replace(',', '.')) || 1
    let category = 'despesa'
    let type = 'DESPESA'
    let description = desc
    let amount = parseFloat(String(valor).replace(',', '.'))
    let inventoryItemId = null
    let quantity = null

    if (tipoLancamento === 'PRODUTO') {
      const item = estoque.find((produto) => produto.id === itemVendaId)
      if (!item) return toast.error('Escolha um produto do estoque')
      if (!amount || amount <= 0) return toast.error('Informe o preço de venda')
      if (qtd <= 0) return toast.error('Quantidade inválida')
      if (Number(item.quantity) < qtd) return toast.error(`Estoque insuficiente (${item.quantity} ${item.unit})`)
      category = 'produto'
      type = 'RECEITA'
      amount = roundMoney(amount * qtd)
      description = `Venda: ${item.name} × ${qtd}`
      inventoryItemId = item.id
      quantity = qtd
    } else if (tipoLancamento === 'RECEITA') {
      if (!description || !amount) return toast.error('Preencha descrição e valor')
      category = 'receita'
      type = 'RECEITA'
    } else {
      if (!description || !amount) return toast.error('Preencha descrição e valor')
    }

    const payload = {
      description,
      amount,
      type,
      date: new Date(`${dataLancamento}T12:00:00`).toISOString(),
      client_id: clientIdVinculado,
      user_id: workspaceId(profile, user.id),
      category,
      payment_method: metodoPagamento || null,
      inventory_item_id: inventoryItemId,
      quantity,
    }
    if (persistido) payload.idempotency_key = chaveAcao
    const { error } = await supabase.from('transactions').insert(payload)
    if (error && !/duplicate|idempotency/i.test(error.message || '')) {
      if (/category|payment_method|inventory_item|idempotency/i.test(error.message)) {
        return toast.error('Execute a migration 040_financeiro_recebimentos.sql no Supabase.')
      }
      return toast.error(error.message)
    }
    if (inventoryItemId && !error) {
      const item = estoque.find((produto) => produto.id === inventoryItemId)
      await supabase.from('inventory_items').update({ quantity: Math.max(0, Number(item.quantity) - qtd) }).eq('id', inventoryItemId)
    }
    if (persistido) await sincronizarExistente(supabase)
    setShowForm(false)
    toast.success(error ? 'Lançamento já estava registrado' : 'Lançamento salvo')
    carregarFinanceiro()
  }

  async function executarExclusao() {
    if (!idParaExcluir) return
    const expense = (livroBruto?.expenses || []).find((item) => item.id === idParaExcluir)
    if (expense?.inventoryItemId && expense.quantity) {
      const item = estoque.find((produto) => produto.id === expense.inventoryItemId)
      if (item) {
        await supabase.from('inventory_items').update({
          quantity: Number(item.quantity) + Number(expense.quantity),
        }).eq('id', expense.inventoryItemId)
      }
    }
    const { error } = await supabase.from('transactions').delete().eq('id', idParaExcluir)
    if (!error) {
      setModal({ isOpen: false })
      carregarFinanceiro()
    } else toast.error(error.message || 'Erro ao excluir')
  }

  async function estornar(payment) {
    if (!persistido) return toast.error('Rode o SQL 040 no Supabase para estornar.')
    const result = await estornarCobranca(supabase, {
      paymentId: payment.id,
      receivedOn: toDateInputValue(),
      idempotencyKey: crypto.randomUUID(),
    })
    if (!result.ok) return toast.error(result.error)
    toast.success(result.duplicated ? 'Estorno já registrado' : 'Recebimento estornado')
    carregarFinanceiro()
  }

  async function cancelar(charge) {
    if (!persistido) return toast.error('Rode o SQL 040 no Supabase para cancelar a cobrança.')
    const result = await cancelarCobrancaRemota(supabase, charge.id)
    if (!result.ok) return toast.error(result.error)
    toast.success('Cobrança cancelada')
    carregarFinanceiro()
  }

  async function pagarComissao(commission) {
    if (!persistido || commission.estimated) return toast.error('Rode o SQL 040 no Supabase para quitar a comissão sem recalcular o passado.')
    const result = await quitarComissao(supabase, {
      commissionId: commission.id,
      paidOn: toDateInputValue(),
      method: 'PIX',
      idempotencyKey: `comissao-${commission.id}`,
    })
    if (!result.ok) return toast.error(result.error)
    toast.success(result.duplicated ? 'Comissão já estava paga' : 'Comissão lançada nas despesas')
    carregarFinanceiro()
  }

  function mudarMes(delta) {
    const nova = new Date(dataAtual)
    nova.setMonth(nova.getMonth() + delta)
    setDataAtual(nova)
  }

  function iconeMov(item) {
    if (item.category === 'servico') return <Calendar size={20} color="#2563eb" />
    if (item.category === 'produto') return <Package size={20} color="#0f766e" />
    if (item.type === 'DESPESA' || item.type === 'ESTORNO') return <TrendingDown size={20} color="#dc2626" />
    return <FileText size={20} color="#6610f2" />
  }

  return (
    <div style={{ paddingBottom: 50 }}>
      <Modal isOpen={modal.isOpen} onClose={() => setModal({ ...modal, isOpen: false })} type={modal.type} title={modal.title} message={modal.message} onConfirm={executarExclusao} />
      <div className="ui-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link to="/" style={{ color: '#000' }}><ArrowLeft size={28} /></Link>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Financeiro</h2>
            <small style={{ color: '#64748b', textTransform: 'capitalize' }}>{mesFormatado}</small>
          </div>
        </div>
        <div id="fin-nav" style={{ display: 'flex', gap: 8, minWidth: 0, overflowX: 'auto' }}>
          <button type="button" onClick={iniciarTutorial} style={{ ...btnNavStyle, borderColor: '#d97706', color: '#d97706', background: '#fffbeb' }} title="Ajuda"><HelpCircle size={20} /></button>
          <button type="button" onClick={() => mudarMes(-1)} style={btnNavStyle}>&lt;</button>
          <button type="button" onClick={() => mudarMes(1)} style={btnNavStyle}>&gt;</button>
          <button type="button" onClick={() => { exportToCsv(movimentos, mesFormatado, { entradas: indicadores.recebimentos, saidas: indicadores.despesasPagas, lucro: indicadores.resultadoCaixa }); toast.success('CSV exportado!') }} style={btnNavStyle} title="Exportar CSV"><Download size={18} /></button>
          <button type="button" onClick={() => exportAppointmentsCsv(agendaMes, mesFormatado)} style={{ ...btnNavStyle, fontSize: 12 }} title="Exportar agenda do mês">Agenda</button>
          <button type="button" onClick={() => exportToPrint(movimentos, mesFormatado, { entradas: indicadores.recebimentos, saidas: indicadores.despesasPagas, lucro: indicadores.resultadoCaixa })} style={btnNavStyle} title="Imprimir/PDF"><Printer size={18} /></button>
        </div>
      </div>

      <div className="page-inner" style={{ padding: 20 }}>
        {loading && <p style={{ textAlign: 'center', color: '#94a3b8' }}>Carregando...</p>}
        {!persistido && !loading && (
          <p style={{ background: '#fff7ed', color: '#9a3412', borderRadius: 12, padding: 12, fontSize: 13 }}>
            Os números já separam faturamento e caixa. Para gravar pagamento parcial, estorno e comissão histórica, rode o SQL 040 no Supabase. Faça um backup antes.
          </p>
        )}
        {isStaff && (
          <p style={{ color: '#64748b', fontSize: 13 }}>Seu acesso mostra os atendimentos e as comissões deste profissional.</p>
        )}

        <div id="fin-abas" className="fin-tabs">
          {ABAS.filter(([id]) => !isStaff || !['pagar', 'relatorios'].includes(id) || id === 'pagar').map(([id, label]) => (
            <button key={id} type="button" className={aba === id ? 'is-on' : ''} onClick={() => setAba(id)}>
              {id === 'visao' ? <Wallet size={16} /> : null}
              {id === 'relatorios' ? <BarChart3 size={16} /> : null}
              {label}
            </button>
          ))}
        </div>

        {(staffList.length > 0 || servicos.length > 0) && (
          <div id="fin-filtros" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {staffList.length > 0 && !isStaff && (
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
                <button type="button" onClick={() => setStaffFiltro('')} style={staffFiltro ? btnFiltroInativo : btnFiltroAtivo}>Todas</button>
                {staffList.map((staff) => (
                  <button key={staff.id} type="button" onClick={() => setStaffFiltro(staff.id)} style={staffFiltro === staff.id ? btnFiltroAtivo : btnFiltroInativo}>{staff.name}</button>
                ))}
              </div>
            )}
            {servicos.length > 0 && (
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
                <button type="button" onClick={() => setFiltroServico('')} style={filtroServico ? btnFiltroInativo : btnFiltroAtivo}>Serviços</button>
                {servicos.map((nome) => (
                  <button key={nome} type="button" onClick={() => setFiltroServico(nome)} style={filtroServico === nome ? btnFiltroAtivo : btnFiltroInativo}>{nome}</button>
                ))}
              </div>
            )}
          </div>
        )}

        {aba === 'visao' && livroBruto && (
          <>
            <FinanceResumo mesLabel={mesFormatado} indicadores={indicadores} serieMensal={serie} diario={diario} />
            {caixaHoje && (
              <div className="ui-card" style={{ padding: 16, margin: '14px 0' }}>
                <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>Caixa de hoje</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div><span style={mini}>Recebido</span><strong>R$ {money(caixaHoje.entradas)}</strong></div>
                  <div><span style={mini}>Saídas</span><strong>R$ {money(caixaHoje.saidas)}</strong></div>
                  <div><span style={mini}>Atendimentos</span><strong>{caixaHoje.atendimentos}</strong></div>
                </div>
              </div>
            )}
            {!isStaff && (
              <button id="fin-novo" type="button" onClick={() => { setAba('mov'); abrirFormulario('DESPESA') }} style={{ ...btnCheio, marginTop: 14 }}>
                <PlusCircle /> Lançamento manual
              </button>
            )}
            {!isStaff && (
              <div className="ui-card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: 14, display: 'flex', gap: 6, alignItems: 'center' }}><Target size={16} color="#2563eb" /> Meta do mês</h3>
                  {!editandoMeta && <button type="button" onClick={() => { setEditandoMeta(true); setMetaInput(metaMes ? String(metaMes) : '') }} style={linkBtn}>{metaMes ? 'Editar' : 'Definir meta'}</button>}
                </div>
                {editandoMeta ? (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <input value={metaInput} onChange={(event) => setMetaInput(event.target.value)} style={{ ...inputStyle, flex: 1 }} inputMode="decimal" placeholder="Ex: 5000" />
                    <button type="button" onClick={salvarMeta} style={btnSalvar}>Salvar</button>
                  </div>
                ) : metaMes > 0 ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span>R$ {money(indicadores.recebimentos)} de R$ {money(metaMes)}</span><strong>{progressoMeta.toFixed(0)}%</strong></div>
                    <div style={{ height: 10, background: '#e2e8f0', borderRadius: 5, overflow: 'hidden', marginTop: 8 }}><div style={{ height: '100%', width: `${progressoMeta}%`, background: '#2563eb' }} /></div>
                  </div>
                ) : <p style={{ color: '#94a3b8', fontSize: 13 }}>A meta acompanha o dinheiro recebido no mês.</p>}
              </div>
            )}
          </>
        )}

        {aba === 'mov' && (
          <>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 8 }}>
              {[['TODOS', 'Todos'], ['SERVICO', 'Serviços'], ['PRODUTO', 'Produtos'], ['MENSAL', 'Mensalidades'], ['DESPESA', 'Despesas']].map(([id, label]) => (
                <button key={id} type="button" onClick={() => setFiltroAtivo(id)} style={filtroAtivo === id ? btnFiltroAtivo : btnFiltroInativo}>{label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 14 }}>
              {[['TODOS', 'Pagamento'], ['PIX', 'PIX'], ['DINHEIRO', 'Dinheiro'], ['CARTAO', 'Cartão'], ['MENSALIDADE', 'Mensalidade']].map(([id, label]) => (
                <button key={id} type="button" onClick={() => setFiltroPagamento(id)} style={filtroPagamento === id ? btnFiltroAtivo : btnFiltroInativo}>{label}</button>
              ))}
            </div>
            {!isStaff && !showForm && !cobrancaAlvo && (
              <button type="button" onClick={() => abrirFormulario('DESPESA')} style={btnCheio}><PlusCircle /> Lançamento manual</button>
            )}
            {showForm && (
              <form onSubmit={handleSalvarLancamento} className="ui-card" style={{ padding: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  <button type="button" onClick={() => setTipoLancamento('DESPESA')} style={chip(tipoLancamento === 'DESPESA', '#dc2626', '#fee2e2')}>Despesa</button>
                  <button type="button" onClick={() => setTipoLancamento('RECEITA')} style={chip(tipoLancamento === 'RECEITA', '#16a34a', '#dcfce7')}>Receita</button>
                  <button type="button" onClick={() => setTipoLancamento('PRODUTO')} style={chip(tipoLancamento === 'PRODUTO', '#0f766e', '#ccfbf1')}>Venda de produto</button>
                </div>
                {tipoLancamento === 'PRODUTO' ? (
                  <>
                    <label style={lbl}>Produto</label>
                    <select value={itemVendaId} onChange={(event) => onEscolherProduto(event.target.value)} style={inputStyle}>
                      <option value="">Selecione...</option>
                      {estoque.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.quantity} {item.unit})</option>)}
                    </select>
                    <label style={lbl}>Quantidade</label>
                    <input value={qtdVenda} onChange={(event) => setQtdVenda(event.target.value)} style={inputStyle} inputMode="decimal" />
                    <label style={lbl}>Preço unitário</label>
                    <input type="number" step="0.01" value={valor} onChange={(event) => setValor(event.target.value)} style={inputStyle} />
                  </>
                ) : (
                  <>
                    <label style={lbl}>Descrição</label>
                    <input value={desc} onChange={(event) => setDesc(event.target.value)} style={inputStyle} />
                    <label style={lbl}>Valor</label>
                    <input type="number" step="0.01" value={valor} onChange={(event) => setValor(event.target.value)} style={inputStyle} />
                  </>
                )}
                <label style={lbl}>Data</label>
                <input type="date" value={dataLancamento} onChange={(event) => setDataLancamento(event.target.value)} style={inputStyle} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
                  {METODOS.map((metodo) => (
                    <button type="button" key={metodo} onClick={() => setMetodoPagamento(metodo)} style={chip(metodoPagamento === metodo, '#2563eb', '#eff6ff')}>{metodo === 'CARTAO' ? 'Cartão' : metodo}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setShowForm(false)} style={btnCinza}>Cancelar</button>
                  <button type="submit" style={btnSalvar}>Salvar</button>
                </div>
              </form>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {movimentos.length === 0 && <p style={{ textAlign: 'center', color: '#888' }}>Nada encontrado neste filtro.</p>}
              {movimentos.map((item) => (
                <div key={item.id} style={{ background: 'white', padding: 15, borderRadius: 8, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', borderLeft: `5px solid ${item.type === 'DESPESA' || item.type === 'ESTORNO' ? '#dc2626' : '#16a34a'}` }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {iconeMov(item)}
                    <div>
                      <strong style={{ display: 'block' }}>{item.description}</strong>
                      <small style={{ color: '#666' }}>{formatCivilDate(item.date)}{item.payment_method ? ` · ${item.payment_method}` : ''}</small>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong style={{ color: item.type === 'DESPESA' || item.type === 'ESTORNO' ? '#dc2626' : '#16a34a' }}>{item.type === 'DESPESA' || item.type === 'ESTORNO' ? '-' : '+'} R$ {money(item.amount)}</strong>
                    {item.type === 'RECEITA' && persistido && item.id && !estornados.has(item.id) && String(item.id).includes('-') && (
                      <button type="button" onClick={() => estornar(item)} style={linkBtn}>Estornar</button>
                    )}
                    {item.type === 'DESPESA' && item.transactionId && (
                      <button type="button" onClick={() => { setIdParaExcluir(item.transactionId); setModal({ isOpen: true, type: 'confirm', title: 'Excluir lançamento?', message: 'Isso remove a despesa do caixa. Se for venda de produto, a quantidade volta ao estoque.' }) }} style={{ background: 'none', border: 'none', color: '#94a3b8' }}><Trash2 size={18} /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {aba === 'receber' && (
          <ListaCobrancas charges={abertas} onReceber={abrirRecebimento} onCancelar={cancelar} persistido={persistido} />
        )}

        {aba === 'pagar' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {aPagar.length === 0 && <p style={{ color: '#64748b' }}>Nenhuma comissão pendente neste mês.</p>}
            {aPagar.map((item) => (
              <article key={item.id} className="ui-card" style={{ padding: 14 }}>
                <strong>{item.staffName}</strong>
                <p style={{ margin: '6px 0', color: '#475569' }}>R$ {money(item.amountDue)} · {item.percentApplied}% sobre R$ {money(item.baseAmount)}</p>
                <button type="button" onClick={() => pagarComissao(item)} style={btnSalvar}>Marcar como paga</button>
              </article>
            ))}
          </div>
        )}

        {aba === 'mensal' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {mensalidades.length === 0 && <p style={{ color: '#64748b' }}>Nenhuma mensalidade neste mês.</p>}
            {mensalidades.map((charge) => (
              <article key={charge.id} className="ui-card" style={{ padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{charge.description}</strong>
                  <span className={`fin-status fin-status-${charge.status}`}>{STATUS_LABEL[charge.status] || charge.status}</span>
                </div>
                <p style={{ margin: '8px 0 0', color: '#475569' }}>{charge.clientName} · vence {formatCivilDate(charge.dueDate)}</p>
                <p style={{ margin: '8px 0 0' }}>Valor da cobrança <strong>R$ {money(charge.liquido)}</strong></p>
                <p style={{ margin: '4px 0 0' }}>Valor recebido <strong>R$ {money(charge.received)}</strong></p>
                <p style={{ margin: '4px 0 12px' }}>Saldo pendente <strong>R$ {money(charge.pending)}</strong></p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => cobrarWhatsApp(charge)} style={{ ...btnSalvar, background: '#25D366' }}><MessageCircle size={16} /></button>
                  {charge.pending > 0 && <button type="button" onClick={() => abrirRecebimento(charge)} style={btnSalvar}>Receber</button>}
                </div>
              </article>
            ))}
          </div>
        )}

        {aba === 'comissao' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {comissoesMes.some((item) => item.estimated) && <p style={{ color: '#9a3412', fontSize: 13 }}>Estas comissões ainda usam o percentual atual. Depois do SQL 040, uma mudança futura não altera o que já foi gravado.</p>}
            {comissoesMes.length === 0 && <p style={{ color: '#64748b' }}>Nenhuma comissão neste mês.</p>}
            {comissoesMes.map((item) => (
              <article key={item.id} className="ui-card" style={{ padding: 14, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <strong>{item.staffName}</strong>
                  <div style={{ color: '#475569', fontSize: 13 }}>Serviço R$ {money(item.baseAmount)} · {item.percentApplied}% · devida R$ {money(item.amountDue)}</div>
                </div>
                <span className={`fin-status fin-status-${item.status === 'PAGO' ? 'PAGO' : 'PENDENTE'}`}>{item.status === 'PAGO' ? 'Paga' : 'Pendente'}</span>
              </article>
            ))}
          </div>
        )}

        {aba === 'relatorios' && (
          <>
            <div className="ui-card" style={{ padding: 16, marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>Painel do salão</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <div><span style={mini}>Ocupação</span><strong>{relatorio.ocupacao}%</strong></div>
                <div><span style={mini}>Faltas</span><strong>{relatorio.faltas}%</strong></div>
                <div><span style={mini}>Retorno</span><strong>{relatorio.retorno}%</strong></div>
              </div>
            </div>
            <FinanceOverview {...overview} />
            {auditoria.length > 0 && (
              <div className="ui-card" style={{ padding: 16 }}>
                <h3 style={{ marginTop: 0 }}>Auditoria recente</h3>
                {auditoria.map((item) => (
                  <p key={item.id} style={{ margin: '6px 0', fontSize: 13, color: '#475569' }}>
                    {item.action} em {item.entity} · {formatCivilDate(item.created_at)}
                  </p>
                ))}
              </div>
            )}
          </>
        )}

        {cobrancaAlvo && (
          <form onSubmit={handleReceber} className="ui-card" style={{ padding: 16, marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>Receber {cobrancaAlvo.description}</h3>
            <p style={{ color: '#475569' }}>Saldo pendente R$ {money(cobrancaAlvo.pending)}. Pode receber uma parte.</p>
            <label style={lbl}>Valor</label>
            <input type="number" step="0.01" value={valor} onChange={(event) => setValor(event.target.value)} style={inputStyle} />
            <label style={lbl}>Data efetiva</label>
            <input type="date" value={dataLancamento} onChange={(event) => setDataLancamento(event.target.value)} style={inputStyle} />
            <label style={lbl}>Referência</label>
            <input value={referencia} onChange={(event) => setReferencia(event.target.value)} style={inputStyle} placeholder="NSU, comprovante, observação" />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
              {METODOS.map((metodo) => (
                <button type="button" key={metodo} onClick={() => setMetodoPagamento(metodo)} style={chip(metodoPagamento === metodo, '#2563eb', '#eff6ff')}>{metodo === 'CARTAO' ? 'Cartão' : metodo}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setCobrancaAlvo(null)} style={btnCinza}>Cancelar</button>
              <button type="submit" style={btnSalvar}>Confirmar</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function ListaCobrancas({ charges, onReceber, onCancelar, persistido }) {
  if (!charges.length) return <p style={{ color: '#64748b' }}>Nenhuma conta em aberto neste recorte.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {charges.map((charge) => (
        <article key={charge.id} className="ui-card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <strong>{charge.description}</strong>
            <span className={`fin-status fin-status-${charge.status}`}>{STATUS_LABEL[charge.status]}</span>
          </div>
          <p style={{ margin: '8px 0' }}>Cobrado R$ {money(charge.liquido)} · recebido R$ {money(charge.received)} · falta R$ {money(charge.pending)}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => onReceber(charge)} style={btnSalvar}>Receber</button>
            {persistido && charge.received <= 0 && <button type="button" onClick={() => onCancelar(charge)} style={btnCinza}>Cancelar</button>}
          </div>
        </article>
      ))}
    </div>
  )
}

const mini = { display: 'block', color: '#64748b', fontSize: 12 }
const lbl = { fontWeight: 'bold', fontSize: 12, display: 'block', margin: '8px 0 4px' }
const inputStyle = { padding: 12, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 16, width: '100%', boxSizing: 'border-box' }
const btnNavStyle = { padding: '5px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontWeight: 'bold' }
const btnFiltroBase = { padding: '8px 14px', borderRadius: 20, border: '1px solid', cursor: 'pointer', fontSize: 14, fontWeight: 'bold', whiteSpace: 'nowrap' }
const btnFiltroAtivo = { ...btnFiltroBase, background: '#2563eb', color: 'white', borderColor: '#2563eb' }
const btnFiltroInativo = { ...btnFiltroBase, background: 'white', color: '#334155', borderColor: '#cbd5e1' }
const btnSalvar = { padding: '10px 14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }
const btnCinza = { padding: '10px 14px', background: '#e2e8f0', border: 'none', borderRadius: 8, cursor: 'pointer' }
const btnCheio = { width: '100%', padding: 15, background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }
const linkBtn = { background: 'none', border: 'none', color: '#2563eb', fontWeight: 'bold', cursor: 'pointer' }
function chip(active, color, bg) {
  return { padding: '8px 12px', borderRadius: 8, border: `1px solid ${color}`, background: active ? bg : 'white', color, fontWeight: 'bold', cursor: 'pointer' }
}
