import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { ArrowLeft, TrendingUp, TrendingDown, PlusCircle, Calendar, FileText, Trash2, PieChart, HelpCircle, Download, Printer, Target, Package } from 'lucide-react'
import { Link } from 'react-router-dom'
import Modal from '../components/Modal'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { exportToCsv, exportToPrint } from '../utils/exportReport'
import { formatCivilDate, money, monthRangeLocal, toDateInputValue } from '../utils/dates'
import toast from 'react-hot-toast'

const METODOS = ['PIX', 'DINHEIRO', 'CARTAO']
const FILTRO_LABEL = {
  TODOS: 'GERAL',
  SERVICO: 'SERVIÇOS',
  PRODUTO: 'PRODUTOS',
  MENSAL: 'MENSALIDADES',
  DESPESA: 'DESPESAS',
}

function categoriaDe(m) {
  if (m.category) return m.category
  if (m.origem === 'AGENDA') return 'servico'
  if (m.type === 'DESPESA') return 'despesa'
  if (m.client_id) return 'mensalidade'
  return 'receita'
}

export default function Financeiro() {
  const [loading, setLoading] = useState(true)
  const [dataAtual, setDataAtual] = useState(new Date())
  const [todasMovimentacoes, setTodasMovimentacoes] = useState([])
  const [mensalistasPendentes, setMensalistasPendentes] = useState([])
  const [filtroAtivo, setFiltroAtivo] = useState('TODOS')
  const [showForm, setShowForm] = useState(false)
  const [modal, setModal] = useState({ isOpen: false, type: 'info', title: '', message: '' })
  const [idParaExcluir, setIdParaExcluir] = useState(null)
  const [tipoLancamento, setTipoLancamento] = useState('DESPESA')
  const [desc, setDesc] = useState('')
  const [valor, setValor] = useState('')
  const [clientIdVinculado, setClientIdVinculado] = useState(null)
  const [dataLancamento, setDataLancamento] = useState('')
  const [metodoPagamento, setMetodoPagamento] = useState('PIX')
  const [estoque, setEstoque] = useState([])
  const [itemVendaId, setItemVendaId] = useState('')
  const [qtdVenda, setQtdVenda] = useState('1')
  const [metaMes, setMetaMes] = useState(0)
  const [editandoMeta, setEditandoMeta] = useState(false)
  const [metaInput, setMetaInput] = useState('')

  const mesFormatado = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(dataAtual)

  useEffect(() => {
    carregarFinanceiro()
  }, [dataAtual])

  const iniciarTutorial = () => {
    driver({
      showProgress: true,
      nextBtnText: 'Próximo',
      prevBtnText: 'Anterior',
      doneBtnText: 'Entendi!',
      steps: [
        { element: '#fin-nav', popover: { title: 'Navegação', description: 'Use as setas para trocar de mês.' } },
        { element: '#fin-grafico', popover: { title: 'Gráfico', description: 'Entradas, saídas e lucro do filtro atual.' } },
        { element: '#fin-novo', popover: { title: 'Lançamento', description: 'Despesa, receita extra ou venda de produto do estoque.' } },
        { element: '#fin-filtros', popover: { title: 'Filtros', description: 'Separe serviços, produtos, mensalidades e despesas.' } },
      ],
    }).drive()
  }

  async function carregarFinanceiro() {
    setLoading(true)
    const { start, end, startDay, endDay } = monthRangeLocal(dataAtual)

    const { data: agendamentos } = await supabase
      .from('appointments')
      .select('id, agreed_price, start_time, client_id, payment_method, clients (name, type), services (name)')
      .gte('start_time', start.toISOString())
      .lte('start_time', end.toISOString())
      .eq('status', 'CONCLUIDO')

    const { data: transacoes } = await supabase
      .from('transactions')
      .select('*')
      .gte('date', startDay)
      .lte('date', `${endDay}T23:59:59`)

    const { data: itens } = await supabase.from('inventory_items').select('*').order('name')
    setEstoque(itens || [])

    const idsPagosNoMes = transacoes
      ?.filter(t => t.type === 'RECEITA' && t.client_id)
      .map(t => t.client_id) || []

    const contagemServicosMensalistas = {}
    agendamentos?.forEach(a => {
      if (a.clients?.type === 'MENSALISTA') {
        contagemServicosMensalistas[a.client_id] = (contagemServicosMensalistas[a.client_id] || 0) + 1
      }
    })

    const agendaFormatada = agendamentos
      ?.filter(a => Number(a.agreed_price) > 0)
      .map(a => ({
        id: `agenda-${a.id}`,
        description: `${a.clients?.name} - ${a.services?.name}`,
        amount: Number(a.agreed_price),
        type: 'RECEITA',
        date: a.start_time,
        origem: 'AGENDA',
        category: 'servico',
        payment_method: a.payment_method,
      })) || []

    const manualFormatada = (transacoes || []).map(t => ({
      ...t,
      amount: Number(t.amount),
      origem: 'MANUAL',
      category: t.category || (t.type === 'DESPESA' ? 'despesa' : t.client_id ? 'mensalidade' : 'receita'),
    }))

    const listaFinal = [...agendaFormatada, ...manualFormatada]
    listaFinal.sort((a, b) => String(b.date).localeCompare(String(a.date)))
    setTodasMovimentacoes(listaFinal)

    const { data: clientesMensais } = await supabase.from('clients').select('*').eq('type', 'MENSALISTA')
    setMensalistasPendentes(
      clientesMensais?.filter(c => !idsPagosNoMes.includes(c.id)).map(c => ({
        ...c,
        servicosFeitos: contagemServicosMensalistas[c.id] || 0,
      })) || []
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: goal } = await supabase.from('financial_goals').select('target_amount')
        .eq('user_id', user.id)
        .eq('year', dataAtual.getFullYear())
        .eq('month', dataAtual.getMonth() + 1)
        .maybeSingle()
      setMetaMes(goal?.target_amount || 0)
    }

    setLoading(false)
  }

  async function salvarMeta() {
    const valorMeta = parseFloat(metaInput.replace(',', '.'))
    if (!valorMeta || valorMeta <= 0) return toast.error('Informe um valor válido')
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('financial_goals').upsert({
      user_id: user.id,
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

  const movimentacoesFiltradas = todasMovimentacoes.filter(m => {
    const cat = categoriaDe(m)
    if (filtroAtivo === 'TODOS') return true
    if (filtroAtivo === 'SERVICO') return cat === 'servico'
    if (filtroAtivo === 'PRODUTO') return cat === 'produto'
    if (filtroAtivo === 'MENSAL') return cat === 'mensalidade'
    if (filtroAtivo === 'DESPESA') return m.type === 'DESPESA' || cat === 'despesa'
    return true
  })

  const entradasVisiveis = movimentacoesFiltradas.filter(m => m.type === 'RECEITA').reduce((acc, curr) => acc + Number(curr.amount), 0)
  const saidasVisiveis = movimentacoesFiltradas.filter(m => m.type === 'DESPESA').reduce((acc, curr) => acc + Number(curr.amount), 0)
  const lucroVisivel = entradasVisiveis - saidasVisiveis
  const progressoMeta = metaMes > 0 ? Math.min(100, (entradasVisiveis / metaMes) * 100) : 0
  const dadosGrafico = [
    { name: 'Entradas', valor: entradasVisiveis, color: '#16a34a' },
    { name: 'Saídas', valor: saidasVisiveis, color: '#dc2626' },
    { name: 'Lucro', valor: lucroVisivel, color: '#2563eb' },
  ]

  function exportarCsv() {
    exportToCsv(movimentacoesFiltradas, mesFormatado, { entradas: entradasVisiveis, saidas: saidasVisiveis, lucro: lucroVisivel })
    toast.success('CSV exportado!')
  }

  function exportarPdf() {
    exportToPrint(movimentacoesFiltradas, mesFormatado, { entradas: entradasVisiveis, saidas: saidasVisiveis, lucro: lucroVisivel })
  }

  function abrirFormulario(tipo = 'DESPESA') {
    setTipoLancamento(tipo)
    setDesc('')
    setValor('')
    setClientIdVinculado(null)
    setItemVendaId('')
    setQtdVenda('1')
    setMetodoPagamento('PIX')
    setDataLancamento(toDateInputValue())
    setShowForm(true)
  }

  function abrirCobrancaRapida(cliente) {
    setTipoLancamento('RECEITA_MENSAL')
    setDesc(`Mensalidade ${cliente.name}`)
    setValor(cliente.monthly_fee ? String(cliente.monthly_fee) : '')
    setClientIdVinculado(cliente.id)
    setItemVendaId('')
    setMetodoPagamento('PIX')
    setDataLancamento(toDateInputValue())
    setShowForm(true)
  }

  function onEscolherProduto(id) {
    setItemVendaId(id)
    const item = estoque.find(i => i.id === id)
    if (item?.sale_price) setValor(String(item.sale_price))
    if (item && !desc) setDesc(`Venda: ${item.name}`)
  }

  async function handleSalvarLancamento(e) {
    e.preventDefault()
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
      const item = estoque.find(i => i.id === itemVendaId)
      if (!item) return toast.error('Escolha um produto do estoque')
      if (!amount || amount <= 0) return toast.error('Informe o preço de venda')
      if (qtd <= 0) return toast.error('Quantidade inválida')
      if (Number(item.quantity) < qtd) return toast.error(`Estoque insuficiente (${item.quantity} ${item.unit})`)
      category = 'produto'
      type = 'RECEITA'
      amount = amount * qtd
      description = `Venda: ${item.name} × ${qtd}`
      inventoryItemId = item.id
      quantity = qtd
    } else if (tipoLancamento === 'RECEITA_MENSAL') {
      if (!description || !amount) return toast.error('Preencha descrição e valor')
      category = 'mensalidade'
      type = 'RECEITA'
    } else if (tipoLancamento === 'RECEITA') {
      if (!description || !amount) return toast.error('Preencha descrição e valor')
      category = 'receita'
      type = 'RECEITA'
    } else {
      if (!description || !amount) return toast.error('Preencha descrição e valor')
      category = 'despesa'
      type = 'DESPESA'
    }

    const payload = {
      description,
      amount,
      type,
      date: new Date(`${dataLancamento}T12:00:00`).toISOString(),
      client_id: clientIdVinculado,
      user_id: user.id,
      category,
      payment_method: type === 'RECEITA' ? metodoPagamento : (metodoPagamento || null),
      inventory_item_id: inventoryItemId,
      quantity,
    }

    const { error } = await supabase.from('transactions').insert(payload)
    if (error) {
      if (/category|payment_method|inventory_item/i.test(error.message)) {
        return toast.error('Execute a migration 003_phase_b_financeiro.sql no Supabase.')
      }
      return toast.error(error.message)
    }

    if (inventoryItemId) {
      const item = estoque.find(i => i.id === inventoryItemId)
      await supabase.from('inventory_items').update({
        quantity: Math.max(0, Number(item.quantity) - qtd),
      }).eq('id', inventoryItemId)
    }

    setShowForm(false)
    setDesc('')
    setValor('')
    setClientIdVinculado(null)
    toast.success('Lançamento salvo')
    carregarFinanceiro()
  }

  const confirmarExclusao = (id) => {
    setIdParaExcluir(id)
    setModal({ isOpen: true, type: 'confirm', title: 'Excluir Lançamento?', message: 'Isso remove o valor do caixa. Se for venda de produto, a quantidade volta ao estoque.' })
  }

  const executarExclusao = async () => {
    if (!idParaExcluir) return
    const mov = todasMovimentacoes.find(m => m.id === idParaExcluir)
    if (mov?.inventory_item_id && mov?.quantity) {
      const item = estoque.find(i => i.id === mov.inventory_item_id)
      if (item) {
        await supabase.from('inventory_items').update({
          quantity: Number(item.quantity) + Number(mov.quantity),
        }).eq('id', mov.inventory_item_id)
      }
    }
    const { error } = await supabase.from('transactions').delete().eq('id', idParaExcluir)
    if (!error) {
      setModal({ isOpen: false })
      carregarFinanceiro()
    } else toast.error('Erro ao excluir')
  }

  const mudarMes = (d) => {
    const n = new Date(dataAtual)
    n.setMonth(n.getMonth() + d)
    setDataAtual(n)
  }

  function iconeMov(m) {
    const cat = categoriaDe(m)
    if (cat === 'servico' || m.origem === 'AGENDA') return <Calendar size={20} color="#2563eb" />
    if (cat === 'produto') return <Package size={20} color="#0f766e" />
    if (m.type === 'DESPESA') return <TrendingDown size={20} color="#dc2626" />
    return <FileText size={20} color="#6610f2" />
  }

  return (
    <div style={{ paddingBottom: '50px' }}>
      <Modal isOpen={modal.isOpen} onClose={() => setModal({ ...modal, isOpen: false })} type={modal.type} title={modal.title} message={modal.message} onConfirm={executarExclusao} />

      <div style={{ background: 'white', padding: '15px 20px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Link to="/" style={{ color: '#000' }}><ArrowLeft size={28} /></Link>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#000', textTransform: 'capitalize' }}>{mesFormatado}</h2>
        </div>
        <div id="fin-nav" style={{ display: 'flex', gap: '8px', flexShrink: 1, minWidth: 0, overflowX: 'auto' }}>
          <button onClick={iniciarTutorial} style={{ ...btnNavStyle, borderColor: '#d97706', color: '#d97706', background: '#fffbeb' }} title="Ajuda"><HelpCircle size={20} /></button>
          <button onClick={() => mudarMes(-1)} style={btnNavStyle}>&lt;</button>
          <button onClick={() => mudarMes(1)} style={btnNavStyle}>&gt;</button>
          <button onClick={exportarCsv} style={{ ...btnNavStyle, fontSize: '14px' }} title="Exportar CSV"><Download size={18} /></button>
          <button onClick={exportarPdf} style={{ ...btnNavStyle, fontSize: '14px' }} title="Imprimir/PDF"><Printer size={18} /></button>
        </div>
      </div>

      <div className="page-inner" style={{ padding: '20px' }}>
        {loading && <p style={{ textAlign: 'center', color: '#94a3b8' }}>Carregando...</p>}

        <div id="fin-meta" style={{ background: 'white', padding: '20px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', color: '#666', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Target size={16} color="#2563eb" /> Meta do mês
            </h3>
            {!editandoMeta && (
              <button onClick={() => { setEditandoMeta(true); setMetaInput(metaMes ? String(metaMes) : '') }} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                {metaMes ? 'Editar' : 'Definir meta'}
              </button>
            )}
          </div>
          {editandoMeta ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <input placeholder="Ex: 5000" value={metaInput} onChange={e => setMetaInput(e.target.value)} style={{ ...inputStyle, flex: 1 }} inputMode="decimal" />
              <button onClick={salvarMeta} style={{ padding: '10px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>Salvar</button>
              <button onClick={() => setEditandoMeta(false)} style={{ padding: '10px', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>X</button>
            </div>
          ) : metaMes > 0 ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
                <span>R$ {money(entradasVisiveis)} de R$ {money(metaMes)}</span>
                <strong style={{ color: progressoMeta >= 100 ? '#16a34a' : '#2563eb' }}>{progressoMeta.toFixed(0)}%</strong>
              </div>
              <div style={{ height: '10px', background: '#e2e8f0', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progressoMeta}%`, background: progressoMeta >= 100 ? '#16a34a' : '#2563eb' }} />
              </div>
            </>
          ) : (
            <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>Defina uma meta mensal para acompanhar seu progresso.</p>
          )}
        </div>

        <div id="fin-grafico" style={{ background: 'white', padding: '20px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #eee' }}>
          <h3 style={{ marginTop: 0, fontSize: '14px', color: '#666', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <PieChart size={16} /> Resumo do Mês
          </h3>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={dadosGrafico} margin={{ top: 5, right: 30, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} style={{ fontSize: '12px' }} />
                <YAxis axisLine={false} tickLine={false} style={{ fontSize: '12px' }} />
                <Tooltip cursor={{ fill: 'transparent' }} />
                <Bar dataKey="valor" radius={[4, 4, 0, 0]} barSize={40}>
                  {dadosGrafico.map((entry, index) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div id="fin-cards" style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', marginBottom: '15px' }}>
          <div style={{ flex: '1 1 150px', background: '#dcfce7', padding: '15px', borderRadius: '12px', border: '1px solid #16a34a' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#166534', marginBottom: '5px' }}><TrendingUp size={20} /> <strong>Entradas</strong></div>
            <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#14532d', display: 'block' }}>R$ {money(entradasVisiveis)}</span>
          </div>
          <div style={{ flex: '1 1 150px', background: '#fee2e2', padding: '15px', borderRadius: '12px', border: '1px solid #dc2626' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#991b1b', marginBottom: '5px' }}><TrendingDown size={20} /> <strong>Saídas</strong></div>
            <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#7f1d1d', display: 'block' }}>R$ {money(saidasVisiveis)}</span>
          </div>
        </div>

        <div id="fin-lucro" style={{ background: lucroVisivel >= 0 ? '#1e293b' : '#7f1d1d', color: 'white', padding: '15px', borderRadius: '12px', textAlign: 'center', marginBottom: '25px' }}>
          <span style={{ display: 'block', fontSize: '12px', opacity: 0.8 }}>
            {filtroAtivo === 'TODOS' ? 'LUCRO LÍQUIDO (GERAL)' : `RESULTADO (${FILTRO_LABEL[filtroAtivo]})`}
          </span>
          <strong style={{ fontSize: '28px' }}>R$ {money(lucroVisivel)}</strong>
        </div>

        {mensalistasPendentes.length > 0 && !showForm && (
          <div style={{ marginBottom: '30px' }}>
            <h3 style={{ color: '#6610f2', borderBottom: '2px solid #6610f2', paddingBottom: '5px' }}>Mensalidades a Receber</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {mensalistasPendentes.map(cliente => (
                <div key={cliente.id} style={{ background: 'white', padding: '15px', borderRadius: '8px', border: '1px solid #d8b4fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ display: 'block', color: '#4a044e' }}>{cliente.name}</strong>
                    <small style={{ color: '#666', display: 'block' }}>Vence dia {cliente.monthly_due_day}</small>
                    <span style={{ fontSize: '12px', color: '#2563eb', fontWeight: 'bold' }}>Fez {cliente.servicosFeitos} serviços este mês</span>
                  </div>
                  <button onClick={() => abrirCobrancaRapida(cliente)} style={{ background: '#6610f2', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Receber</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!showForm && (
          <button id="fin-novo" onClick={() => abrirFormulario('DESPESA')}
            style={{ width: '100%', padding: '15px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
            <PlusCircle /> Lançamento Manual
          </button>
        )}

        {showForm && (
          <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '2px solid #2563eb', marginBottom: '20px' }}>
            <h3 style={{ marginTop: 0 }}>{clientIdVinculado ? 'Receber Mensalidade' : 'Novo Lançamento'}</h3>
            {!clientIdVinculado && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '15px', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setTipoLancamento('DESPESA')} style={chip(tipoLancamento === 'DESPESA', '#dc2626', '#fee2e2')}>Despesa</button>
                <button type="button" onClick={() => setTipoLancamento('RECEITA')} style={chip(tipoLancamento === 'RECEITA', '#16a34a', '#dcfce7')}>Receita</button>
                <button type="button" onClick={() => setTipoLancamento('PRODUTO')} style={chip(tipoLancamento === 'PRODUTO', '#0f766e', '#ccfbf1')}>Venda de produto</button>
              </div>
            )}
            <form onSubmit={handleSalvarLancamento} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {tipoLancamento === 'PRODUTO' && (
                <>
                  <div>
                    <label style={lbl}>Produto do estoque</label>
                    <select value={itemVendaId} onChange={e => onEscolherProduto(e.target.value)} style={inputStyle}>
                      <option value="">Selecione...</option>
                      {estoque.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.quantity} {item.unit})
                        </option>
                      ))}
                    </select>
                    {estoque.length === 0 && <small style={{ color: '#dc2626' }}>Cadastre itens em Estoque primeiro.</small>}
                  </div>
                  <div>
                    <label style={lbl}>Quantidade</label>
                    <input value={qtdVenda} onChange={e => setQtdVenda(e.target.value)} style={inputStyle} inputMode="decimal" />
                  </div>
                  <div>
                    <label style={lbl}>Preço unitário (R$)</label>
                    <input type="number" step="0.01" value={valor} onChange={e => setValor(e.target.value)} style={inputStyle} />
                  </div>
                </>
              )}
              {tipoLancamento !== 'PRODUTO' && (
                <>
                  <div><label style={lbl}>Descrição</label><input value={desc} onChange={e => setDesc(e.target.value)} style={inputStyle} /></div>
                  <div>
                    <label style={lbl}>Valor (R$)</label>
                    <input type="number" step="0.01" value={valor} onChange={e => setValor(e.target.value)} style={inputStyle} />
                  </div>
                </>
              )}
              <div><label style={lbl}>Data</label><input type="date" value={dataLancamento} onChange={e => setDataLancamento(e.target.value)} style={inputStyle} /></div>
              {tipoLancamento !== 'DESPESA' && (
                <div>
                  <label style={lbl}>Pagamento</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {METODOS.map(m => (
                      <button type="button" key={m} onClick={() => setMetodoPagamento(m)} style={chip(metodoPagamento === m, '#2563eb', '#eff6ff')}>{m === 'CARTAO' ? 'Cartão' : m.charAt(0) + m.slice(1).toLowerCase()}</button>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ flex: 1, padding: '10px', background: '#ccc', border: 'none', borderRadius: '6px' }}>Cancelar</button>
                <button type="submit" style={{ flex: 1, padding: '10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>Salvar</button>
              </div>
            </form>
          </div>
        )}

        <div id="fin-filtros" style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '10px' }}>
          {['TODOS', 'SERVICO', 'PRODUTO', 'MENSAL', 'DESPESA'].map(f => (
            <button key={f} onClick={() => setFiltroAtivo(f)} style={filtroAtivo === f ? btnFiltroAtivo : btnFiltroInativo}>
              {f === 'TODOS' ? 'Todos' : f === 'SERVICO' ? 'Serviços' : f === 'PRODUTO' ? 'Produtos' : f === 'MENSAL' ? 'Mensalidades' : 'Despesas'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {movimentacoesFiltradas.length === 0 && <p style={{ textAlign: 'center', color: '#888' }}>Nada encontrado neste filtro.</p>}
          {movimentacoesFiltradas.map(m => (
            <div key={m.id} style={{
              background: 'white', padding: '15px', borderRadius: '8px', border: '1px solid #ddd',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderLeft: `5px solid ${m.type === 'RECEITA' ? '#16a34a' : '#dc2626'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {iconeMov(m)}
                <div>
                  <strong style={{ display: 'block', color: '#000' }}>{m.description}</strong>
                  <small style={{ color: '#666' }}>
                    {formatCivilDate(m.date)}
                    {m.payment_method ? ` · ${m.payment_method}` : ''}
                  </small>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontWeight: 'bold', color: m.type === 'RECEITA' ? '#16a34a' : '#dc2626', fontSize: '16px' }}>
                  {m.type === 'DESPESA' ? '-' : '+'} R$ {money(m.amount)}
                </span>
                {m.origem === 'MANUAL' && (
                  <button onClick={() => confirmarExclusao(m.id)} style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}>
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const lbl = { fontWeight: 'bold', fontSize: '12px', display: 'block', marginBottom: '4px' }
const inputStyle = { padding: '12px', borderRadius: '8px', border: '1px solid #999', fontSize: '16px', width: '100%', boxSizing: 'border-box' }
const btnNavStyle = { padding: '5px 15px', borderRadius: '5px', border: '1px solid #ccc', background: 'white', cursor: 'pointer', fontSize: '18px', fontWeight: 'bold' }
const btnFiltroBase = { padding: '8px 16px', borderRadius: '20px', border: '1px solid', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap' }
const btnFiltroAtivo = { ...btnFiltroBase, background: '#2563eb', color: 'white', borderColor: '#2563eb' }
const btnFiltroInativo = { ...btnFiltroBase, background: 'white', color: '#444', borderColor: '#ccc' }
function chip(active, color, bg) {
  return {
    padding: '8px 12px',
    borderRadius: '8px',
    border: `1px solid ${color}`,
    background: active ? bg : 'white',
    color,
    fontWeight: 'bold',
    cursor: 'pointer',
    fontSize: '13px',
  }
}
