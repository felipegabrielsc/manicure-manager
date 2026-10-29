import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, BarChart3, Calendar, Download, FileText, HelpCircle, MessageCircle, Package, PlusCircle, Printer, Target, Trash2, TrendingDown, Wallet } from 'lucide-react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import toast from 'react-hot-toast'
import { supabase } from '../supabaseClient'
import Modal from '../components/Modal'
import FinanceResumo from '../components/FinanceResumo'
import { useSessionProfile } from '../context/SessionProfile'
import {
  cancelarCobrancaRemota,
  estornarCobranca,
  quitarComissao,
  receberCobranca,
  sincronizarExistente,
} from '../application/financeiroService'
import { roundMoney } from '../domain/financeiro'
import { exportAppointmentsCsv, exportToCsv, exportToPrint } from '../utils/exportReport'
import { formatCivilDate, money, toDateInputValue } from '../utils/dates'
import { openWhatsApp } from '../utils/whatsapp'
import { marcarEnvioManual } from '../application/notificationService'
import { workspaceId } from '../utils/workspace'
import { chaveFinanceiro, gravarSeAtual, invalidarFinanceiro, lerCache, versaoCache } from '../application/financeiroCache'
import { buscarPrincipalFinanceiro, buscarSecundarioFinanceiro } from '../application/financeiroLoad'
import {
  decidirSincronizacao,
  marcarFinanceiroSujo,
  marcarSincronizado,
  planejarCarregamento,
  precisaRecarregarAposSync,
  sincronizacaoEmCurso,
  sincronizarControlada,
} from '../application/financeiroSync'
import { criarMedidor } from '../application/financeiroTiming'
import { filtrarMovimentos, montarPainelFinanceiro } from '../application/financeiroView'

const FinanceOverview = lazy(() => import('../components/FinanceOverview'))

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
  const [erros, setErros] = useState({})
  const [erroPrincipal, setErroPrincipal] = useState('')
  const [sincronizando, setSincronizando] = useState(false)
  const [erroSync, setErroSync] = useState('')
  const [carregandoSecundario, setCarregandoSecundario] = useState(false)
  const [limiteMov, setLimiteMov] = useState(40)
  const geracao = useRef(0)

  const mesFormatado = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(dataAtual)
  const isStaff = !!profile?.is_staff
  const ws = workspaceId(profile)

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

  useEffect(() => {
    setLimiteMov(40)
  }, [filtroAtivo, filtroPagamento, dataAtual, staffFiltro, filtroServico])

  function aplicarPacote(pacote) {
    if ('persistido' in pacote) setPersistido(pacote.persistido)
    if ('livro' in pacote) setLivroBruto(pacote.livro)
    if ('agenda' in pacote) setAgendaJanela(pacote.agenda)
    if ('auditoria' in pacote) setAuditoria(pacote.auditoria)
    if ('estoque' in pacote) setEstoque(pacote.estoque)
    if ('staffList' in pacote) setStaffList(pacote.staffList)
    if ('clientesNovos' in pacote) setClientesNovos(pacote.clientesNovos)
    if ('caixaHoje' in pacote) setCaixaHoje(pacote.caixaHoje)
    if ('metaMes' in pacote) setMetaMes(pacote.metaMes)
    if ('erros' in pacote) setErros((atual) => ({ ...atual, ...pacote.erros }))
  }

  function chaveDoMes() {
    return chaveFinanceiro(ws, dataAtual.getFullYear(), dataAtual.getMonth())
  }

  function publicarPrincipal(principal, versao) {
    if (principal.erroPrincipal) {
      setErroPrincipal(principal.erroPrincipal)
      if (principal.erroPrincipal.includes('cobranças')) toast.error(principal.erroPrincipal)
    } else {
      setErroPrincipal('')
    }
    aplicarPacote({
      persistido: principal.persistido,
      livro: principal.livro,
      agenda: principal.agenda || [],
      erros: principal.erros || {},
    })
    const incompleto = principal.erroPrincipal || principal.erros?.despesas || principal.erros?.comissao
    if (!principal.livro || incompleto) return
    gravarSeAtual(chaveDoMes(), {
      persistido: principal.persistido,
      livro: principal.livro,
      agenda: principal.agenda || [],
      secundarioCompleto: false,
    }, Date.now(), versao)
  }

  async function aposSincronizacao(token, sync) {
    if (geracao.current !== token) return
    setSincronizando(false)
    if (!sync?.ok) {
      setErroSync(sync?.error || 'Não consegui conferir os lançamentos. Os números podem estar incompletos.')
      return
    }
    marcarSincronizado(ws, Date.now())
    setErroSync('')
    if (!precisaRecarregarAposSync(sync)) return
    const deNovo = await buscarPrincipalFinanceiro(supabase, {
      dataAtual,
      temTabela: true,
      medidor: criarMedidor('financeiro-sync'),
    })
    if (geracao.current !== token) return
    publicarPrincipal(deNovo, versaoCache(chaveDoMes()))
  }

  async function carregarSecundario(token, temTabela, agenda, versao) {
    setCarregandoSecundario(true)
    const medidor = criarMedidor('financeiro-secundario')
    const secundario = await buscarSecundarioFinanceiro(supabase, {
      dataAtual,
      temTabela,
      agenda,
      workspaceId: ws,
      medidor,
    })
    medidor.fim({ fase: 'secundario' })
    if (geracao.current !== token) return
    const pacote = { erros: secundario.erros || {} }
    if (!secundario.erros?.equipe) pacote.staffList = secundario.staffList
    if (!secundario.erros?.estoque) pacote.estoque = secundario.estoque
    if (!secundario.erros?.auditoria) pacote.auditoria = secundario.auditoria
    if (!secundario.erros?.clientes) pacote.clientesNovos = secundario.clientesNovos
    if (!secundario.erros?.caixa && secundario.caixaHoje) pacote.caixaHoje = secundario.caixaHoje
    if (!secundario.erros?.meta) pacote.metaMes = secundario.metaMes
    aplicarPacote(pacote)
    const chave = chaveDoMes()
    const anterior = lerCache(chave, Date.now())
    if (anterior?.valor?.livro) {
      gravarSeAtual(chave, {
        ...anterior.valor,
        ...pacote,
        secundarioCompleto: true,
      }, Date.now(), versao)
    }
    setCarregandoSecundario(false)
  }

  async function carregarFinanceiro() {
    const token = ++geracao.current
    const medidor = criarMedidor()
    const chave = chaveFinanceiro(ws, dataAtual.getFullYear(), dataAtual.getMonth())
    const agora = Date.now()
    const cacheItem = lerCache(chave, agora)
    const versao = versaoCache(chave)
    const decisaoCache = decidirSincronizacao({
      temTabela: cacheItem ? cacheItem.valor?.persistido !== false : false,
      workspaceId: ws,
      agora,
    })
    const plano = planejarCarregamento({
      cacheItem,
      decisao: decisaoCache,
      sincronizando: !!sincronizacaoEmCurso(ws),
    })

    if (plano.usarCache) {
      aplicarPacote(cacheItem.valor)
      setErroPrincipal('')
      setLoading(false)
      medidor.fim({ origem: 'cache' })
      if (!cacheItem.valor?.secundarioCompleto) {
        carregarSecundario(token, !!cacheItem.valor?.persistido, cacheItem.valor?.agenda || [], versao)
      }
      if (plano.acompanharSync) {
        setSincronizando(true)
        sincronizacaoEmCurso(ws).then((sync) => aposSincronizacao(token, sync))
      }
      return
    }

    setLoading(true)
    setErroPrincipal('')
    setErros({})
    const probe = await medidor.etapa('tabela', () => supabase.from('financial_charges').select('id').limit(1))
    if (geracao.current !== token) return
    const mensagemProbe = probe.error?.message || ''
    const tabelaAusente = !!probe.error && /schema cache|does not exist|financial_charges|PGRST205|PGRST202|404/i.test(mensagemProbe)
    if (probe.error && !tabelaAusente) {
      setErroPrincipal('Não consegui consultar o financeiro. Tente de novo.')
      setLoading(false)
      medidor.fim({ origem: 'erro' })
      return
    }
    const temTabela = !probe.error
    setPersistido(temTabela)
    const decisao = decidirSincronizacao({ temTabela, workspaceId: ws, agora: Date.now() })
    let syncPromise = null
    if (decisao.executar && decisao.bloquearLeitura) {
      setSincronizando(true)
      const sync = await medidor.etapa('sincronizacao', () => sincronizarControlada(supabase, ws))
      if (geracao.current !== token) return
      setSincronizando(false)
      if (!sync.ok) setErroSync(sync.error || 'Não consegui conferir os lançamentos. Os números podem estar incompletos.')
      else {
        marcarSincronizado(ws, Date.now())
        setErroSync('')
      }
    } else if (decisao.executar) {
      setSincronizando(true)
      syncPromise = medidor.etapa('sincronizacao', () => sincronizarControlada(supabase, ws))
    } else {
      console.info('[financeiro] sincronizacao ignorada', decisao.motivo)
    }

    const principal = await buscarPrincipalFinanceiro(supabase, { dataAtual, temTabela, medidor })
    if (geracao.current !== token) return
    publicarPrincipal(principal, versao)
    setLoading(false)
    medidor.fim({ origem: 'rede', sync: decisao.motivo })
    carregarSecundario(token, principal.persistido, principal.agenda || [], versao)
    if (syncPromise) {
      const sync = await syncPromise
      await aposSincronizacao(token, sync)
    }
  }

  function recarregar() {
    invalidarFinanceiro(ws)
    carregarFinanceiro()
  }

  const painel = useMemo(() => (
    livroBruto ? montarPainelFinanceiro({
      livroBruto,
      agendaJanela,
      dataAtual,
      isStaff,
      staffMemberId: profile?.staff_member_id,
      staffFiltro,
      filtroServico,
      clientesNovos,
      metaMes,
    }) : null
  ), [livroBruto, agendaJanela, dataAtual, isStaff, profile?.staff_member_id, staffFiltro, filtroServico, clientesNovos, metaMes])

  const indicadores = painel?.indicadores || {
    recebimentos: 0,
    despesasPagas: 0,
    resultadoCaixa: 0,
    resultadoOperacional: 0,
    faturamento: 0,
    contasAReceber: 0,
  }
  const abertas = painel?.abertas || []
  const mensalidades = painel?.mensalidades || []
  const comissoesMes = painel?.comissoesMes || []
  const aPagar = painel?.aPagar || []
  const agendaMes = painel?.agendaMes || []
  const servicos = painel?.servicos || []
  const serie = painel?.serie || []
  const diario = painel?.diario || []
  const relatorio = painel?.relatorio || { ocupacao: 0, faltas: 0, retorno: 0 }
  const progressoMeta = painel?.progressoMeta || 0
  const estornados = painel?.estornados || new Set()
  const overview = painel?.overview
  const movimentos = useMemo(() => filtrarMovimentos(painel?.movimentosTodos || [], {
    from: painel?.periodo?.startDay,
    to: painel?.periodo?.endDay,
    categoria: filtroAtivo,
    pagamento: filtroPagamento,
  }), [painel, filtroAtivo, filtroPagamento])

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
      invalidarFinanceiro(ws)
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
      recarregar()
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
    recarregar()
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
    if (persistido) {
      marcarFinanceiroSujo(ws)
      const sync = await sincronizarExistente(supabase)
      if (!sync.ok) {
        const aviso = sync.error || 'Não consegui vincular o lançamento. Os números podem estar incompletos.'
        setErroSync(aviso)
        toast.error(aviso)
      } else {
        marcarSincronizado(ws, Date.now())
        setErroSync('')
      }
    }
    setShowForm(false)
    toast.success(error ? 'Lançamento já estava registrado' : 'Lançamento salvo')
    recarregar()
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
      recarregar()
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
    recarregar()
  }

  async function cancelar(charge) {
    if (!persistido) return toast.error('Rode o SQL 040 no Supabase para cancelar a cobrança.')
    const result = await cancelarCobrancaRemota(supabase, charge.id)
    if (!result.ok) return toast.error(result.error)
    toast.success('Cobrança cancelada')
    recarregar()
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
    recarregar()
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
        {erroPrincipal && (
          <p className="fin-erro">
            {erroPrincipal}{' '}
            <button type="button" onClick={recarregar} style={linkBtn}>Tentar de novo</button>
          </p>
        )}
        {erroSync && <p className="fin-aviso">{erroSync}</p>}
        {sincronizando && <p style={{ color: '#64748b', fontSize: 13 }}>Conferindo lançamentos novos…</p>}
        {erros.despesas && <p className="fin-aviso">{erros.despesas}</p>}
        {!persistido && !loading && !erroPrincipal && (
          <p className="fin-aviso">
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

        {aba === 'visao' && loading && !livroBruto && <EsqueletoFinanceiro />}
        {aba === 'visao' && livroBruto && (
          <>
            <FinanceResumo mesLabel={mesFormatado} indicadores={indicadores} serieMensal={serie} diario={diario} />
            {abertas.length > 0 && (
              <div className="ui-card" style={{ padding: 16, marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: 14 }}>Em aberto neste mês</h3>
                  <button type="button" onClick={() => setAba('receber')} style={linkBtn}>Ver todas</button>
                </div>
                {abertas.slice(0, 4).map((charge) => (
                  <p key={charge.id} style={{ margin: '8px 0 0', color: '#475569', fontSize: 14 }}>
                    {charge.clientName || charge.description} · {charge.kind === 'MENSALIDADE' ? 'Mensalidade' : 'A receber'} · falta R$ {money(charge.pending)}
                  </p>
                ))}
              </div>
            )}
            {erros.comissao && <p className="fin-aviso">{erros.comissao}</p>}
            {carregandoSecundario && !caixaHoje && <div className="fin-skeleton" style={{ margin: '14px 0' }} />}
            {erros.caixa && <p className="fin-aviso">{erros.caixa}</p>}
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
                ) : erros.meta ? <p className="fin-aviso">{erros.meta}</p> : metaMes > 0 ? (
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
                    {erros.estoque && <p className="fin-aviso">{erros.estoque}</p>}
                    {carregandoSecundario && estoque.length === 0 && <div className="fin-skeleton" />}
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
              {loading && !livroBruto && <EsqueletoFinanceiro />}
              {!loading && movimentos.length === 0 && <p style={{ textAlign: 'center', color: '#888' }}>Nada encontrado neste filtro.</p>}
              {movimentos.slice(0, limiteMov).map((item) => (
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
              {movimentos.length > limiteMov && (
                <button type="button" onClick={() => setLimiteMov((atual) => atual + 40)} style={{ ...btnCinza, width: '100%' }}>
                  Mostrar mais ({movimentos.length - limiteMov})
                </button>
              )}
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
            {erros.comissao && <p className="fin-aviso">{erros.comissao}</p>}
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
            {overview && (
              <Suspense fallback={<div className="fin-skeleton" style={{ height: 180 }} />}>
                <FinanceOverview {...overview} />
              </Suspense>
            )}
            {erros.auditoria && <p className="fin-aviso">{erros.auditoria}</p>}
            {carregandoSecundario && auditoria.length === 0 && <div className="fin-skeleton" />}
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

function EsqueletoFinanceiro() {
  return (
    <div className="fin-kpis" aria-hidden="true">
      <div className="fin-skeleton" />
      <div className="fin-skeleton" />
      <div className="fin-skeleton" />
      <div className="fin-skeleton" />
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
