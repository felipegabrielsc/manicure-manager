// src/pages/Financeiro.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { ArrowLeft, TrendingUp, TrendingDown, PlusCircle, Calendar, FileText, Filter, Trash2, PieChart, HelpCircle, Download, Printer, Target } from 'lucide-react'
import { Link } from 'react-router-dom'
import Modal from '../components/Modal'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { exportToCsv, exportToPrint } from '../utils/exportReport'
import toast from 'react-hot-toast'

export default function Financeiro() {
  const [loading, setLoading] = useState(true)
  const [dataAtual, setDataAtual] = useState(new Date())

  // Dados Brutos (Do Banco)
  const [todasMovimentacoes, setTodasMovimentacoes] = useState([])
  const [mensalistasPendentes, setMensalistasPendentes] = useState([])
  
  // ESTADO DO GRÁFICO
  const [dadosGrafico, setDadosGrafico] = useState([])

  // Filtros
  const [filtroAtivo, setFiltroAtivo] = useState('TODOS')

  // Modais e Formulários
  const [showForm, setShowForm] = useState(false)
  const [modal, setModal] = useState({ isOpen: false, type: 'info', title: '', message: '' })
  const [idParaExcluir, setIdParaExcluir] = useState(null)

  // Estados do Form
  const [tipoLancamento, setTipoLancamento] = useState('DESPESA')
  const [desc, setDesc] = useState('')
  const [valor, setValor] = useState('')
  const [clientIdVinculado, setClientIdVinculado] = useState(null)
  const [dataLancamento, setDataLancamento] = useState('')
  const [metaMes, setMetaMes] = useState(0)
  const [editandoMeta, setEditandoMeta] = useState(false)
  const [metaInput, setMetaInput] = useState('')

  const mesFormatado = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(dataAtual)

  useEffect(() => {
    carregarFinanceiro()
  }, [dataAtual])

  // --- FUNÇÃO DO TUTORIAL FINANCEIRO ---
  const iniciarTutorial = () => {
    const driverObj = driver({
      showProgress: true,
      nextBtnText: 'Próximo',
      prevBtnText: 'Anterior',
      doneBtnText: 'Entendi!',
      steps: [
        { 
          element: '#fin-nav', 
          popover: { title: 'Navegação', description: 'Use as setas para trocar de mês e ver o histórico financeiro.' } 
        },
        { 
          element: '#fin-grafico', 
          popover: { title: 'Gráfico Visual', description: 'Acompanhe visualmente suas Entradas (Verde), Saídas (Vermelho) e Lucro (Azul).' } 
        },
        { 
          element: '#fin-cards', 
          popover: { title: 'Resumo', description: 'Aqui estão os totais somados do mês selecionado.' } 
        },
        { 
          element: '#fin-lucro', 
          popover: { title: 'Seu Lucro', description: 'O valor que realmente sobra no seu bolso (Entradas - Saídas).' } 
        },
        { 
          element: '#fin-novo', 
          popover: { title: 'Lançamento Manual', description: 'Use este botão para adicionar despesas (ex: Acetona, Luz) ou receitas extras que não vieram da agenda.' } 
        },
        { 
          element: '#fin-filtros', 
          popover: { title: 'Filtros', description: 'Clique aqui para ver apenas Despesas, apenas Serviços ou tudo junto.' } 
        }
      ]
    });
    driverObj.drive();
  }

  async function carregarFinanceiro() {
    setLoading(true)
    const inicioMes = new Date(dataAtual.getFullYear(), dataAtual.getMonth(), 1)
    const fimMes = new Date(dataAtual.getFullYear(), dataAtual.getMonth() + 1, 0, 23, 59, 59)

    // 1. BUSCAR AGENDAMENTOS CONCLUÍDOS
    const { data: agendamentos } = await supabase
      .from('appointments')
      .select(`id, agreed_price, start_time, client_id, clients (name, type), services (name)`)
      .gte('start_time', inicioMes.toISOString())
      .lte('start_time', fimMes.toISOString())
      .eq('status', 'CONCLUIDO')

    // 2. BUSCAR TRANSAÇÕES MANUAIS
    const { data: transacoes } = await supabase
      .from('transactions')
      .select('*')
      .gte('date', inicioMes.toISOString())
      .lte('date', fimMes.toISOString())

    // 3. PROCESSAMENTO DE DADOS
    const idsPagosNoMes = transacoes
      ?.filter(t => t.type === 'RECEITA' && t.client_id)
      .map(t => t.client_id) || []

    const contagemServicosMensalistas = {}
    agendamentos?.forEach(a => {
      if (a.clients?.type === 'MENSALISTA') {
        contagemServicosMensalistas[a.client_id] = (contagemServicosMensalistas[a.client_id] || 0) + 1
      }
    })

    // 4. UNIFICAR LISTAS
    const agendaFormatada = agendamentos
      ?.filter(a => a.agreed_price > 0)
      .map(a => ({
        id: `agenda-${a.id}`,
        description: `${a.clients?.name} - ${a.services?.name}`,
        amount: a.agreed_price,
        type: 'RECEITA',
        date: a.start_time,
        origem: 'AGENDA'
      })) || []

    const manualFormatada = transacoes?.map(t => ({ ...t, origem: 'MANUAL' })) || []

    const listaFinal = [...agendaFormatada, ...manualFormatada]
    listaFinal.sort((a, b) => new Date(b.date) - new Date(a.date))
    setTodasMovimentacoes(listaFinal)

    // 5. CÁLCULO PARA O GRÁFICO
    const totalEntradas = listaFinal.filter(m => m.type === 'RECEITA').reduce((acc, c) => acc + c.amount, 0)
    const totalSaidas = listaFinal.filter(m => m.type === 'DESPESA').reduce((acc, c) => acc + c.amount, 0)
    
    setDadosGrafico([
      { name: 'Entradas', valor: totalEntradas, color: '#16a34a' },
      { name: 'Saídas', valor: totalSaidas, color: '#dc2626' },
      { name: 'Lucro', valor: totalEntradas - totalSaidas, color: '#2563eb' }
    ])

    // 6. MENSALISTAS
    const { data: clientesMensais } = await supabase.from('clients').select('*').eq('type', 'MENSALISTA')
    const pendentes = clientesMensais?.filter(c => !idsPagosNoMes.includes(c.id)).map(c => ({
      ...c,
      servicosFeitos: contagemServicosMensalistas[c.id] || 0
    })) || []

    setMensalistasPendentes(pendentes)

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
    const valor = parseFloat(metaInput.replace(',', '.'))
    if (!valor || valor <= 0) return toast.error('Informe um valor válido')

    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('financial_goals').upsert({
      user_id: user.id,
      year: dataAtual.getFullYear(),
      month: dataAtual.getMonth() + 1,
      target_amount: valor,
    }, { onConflict: 'user_id,year,month' })

    if (error) toast.error('Erro ao salvar meta. Execute a migration 002.')
    else {
      setMetaMes(valor)
      setEditandoMeta(false)
      toast.success('Meta definida!')
    }
  }

  function exportarCsv() {
    exportToCsv(movimentacoesFiltradas, mesFormatado, { entradas: entradasVisiveis, saidas: saidasVisiveis, lucro: lucroVisivel })
    toast.success('CSV exportado!')
  }

  function exportarPdf() {
    exportToPrint(movimentacoesFiltradas, mesFormatado, { entradas: entradasVisiveis, saidas: saidasVisiveis, lucro: lucroVisivel })
  }

  // --- LÓGICA DE FILTROS E TOTAIS DINÂMICOS ---
  const movimentacoesFiltradas = todasMovimentacoes.filter(m => {
    if (filtroAtivo === 'TODOS') return true
    if (filtroAtivo === 'AVULSO') return m.origem === 'AGENDA'
    if (filtroAtivo === 'MENSAL') return m.origem === 'MANUAL' && m.type === 'RECEITA'
    if (filtroAtivo === 'DESPESA') return m.type === 'DESPESA'
    return true
  })

  const entradasVisiveis = movimentacoesFiltradas.filter(m => m.type === 'RECEITA').reduce((acc, curr) => acc + curr.amount, 0)
  const saidasVisiveis = movimentacoesFiltradas.filter(m => m.type === 'DESPESA').reduce((acc, curr) => acc + curr.amount, 0)
  const lucroVisivel = entradasVisiveis - saidasVisiveis
  const progressoMeta = metaMes > 0 ? Math.min(100, (entradasVisiveis / metaMes) * 100) : 0

  // --- AÇÕES ---
  function abrirCobrancaRapida(cliente) {
    setTipoLancamento('RECEITA_MENSAL')
    setDesc(`Mensalidade ${cliente.name}`)
    setValor(cliente.monthly_fee ? cliente.monthly_fee.toString() : '')
    setClientIdVinculado(cliente.id)
    setDataLancamento(new Date().toISOString().split('T')[0])
    setShowForm(true)
  }

  async function handleSalvarLancamento(e) {
    e.preventDefault()
    if (!desc || !valor) return alert('Preencha descrição e valor!')
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('transactions').insert({
      description: desc,
      amount: parseFloat(valor.replace(',', '.')),
      type: tipoLancamento === 'RECEITA_MENSAL' ? 'RECEITA' : 'DESPESA',
      date: dataLancamento ? new Date(dataLancamento).toISOString() : new Date().toISOString(),
      client_id: clientIdVinculado,
      user_id: user ? user.id : null 
    })
    if (!error) { setShowForm(false); setDesc(''); setValor(''); setClientIdVinculado(null); carregarFinanceiro() } 
    else { alert('Erro: ' + error.message) }
  }

  const confirmarExclusao = (id) => {
    setIdParaExcluir(id)
    setModal({ isOpen: true, type: 'confirm', title: 'Excluir Lançamento?', message: 'Isso vai remover o valor do caixa.' })
  }

  const executarExclusao = async () => {
    if (!idParaExcluir) return
    const { error } = await supabase.from('transactions').delete().eq('id', idParaExcluir)
    if (!error) { setModal({ isOpen: false }); carregarFinanceiro() } 
    else { alert('Erro ao excluir') }
  }

  const mudarMes = (d) => {
    const n = new Date(dataAtual); n.setMonth(n.getMonth() + d); setDataAtual(n)
  }

  return (
    <div style={{ paddingBottom: '50px' }}>
      <Modal isOpen={modal.isOpen} onClose={() => setModal({ ...modal, isOpen: false })} type={modal.type} title={modal.title} message={modal.message} onConfirm={executarExclusao} />

      <div style={{ background: 'white', padding: '15px 20px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Link to="/" style={{ color: '#000' }}><ArrowLeft size={28} /></Link>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#000', textTransform: 'capitalize' }}>{mesFormatado}</h2>
        </div>
        
        {/* GRUPO DE NAVEGAÇÃO E TUTORIAL */}
        <div id="fin-nav" style={{ display: 'flex', gap: '10px' }}>
           {/* BOTÃO TUTORIAL */}
           <button 
              onClick={iniciarTutorial}
              style={{...btnNavStyle, borderColor: '#d97706', color: '#d97706', background: '#fffbeb'}}
              title="Ajuda"
           >
              <HelpCircle size={20} />
           </button>

           <button onClick={() => mudarMes(-1)} style={btnNavStyle}>&lt;</button>
           <button onClick={() => mudarMes(1)} style={btnNavStyle}>&gt;</button>
           <button onClick={exportarCsv} style={{...btnNavStyle, fontSize:'14px'}} title="Exportar CSV"><Download size={18}/></button>
           <button onClick={exportarPdf} style={{...btnNavStyle, fontSize:'14px'}} title="Imprimir/PDF"><Printer size={18}/></button>
        </div>
      </div>

      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>

        {/* META FINANCEIRA */}
        <div id="fin-meta" style={{ background: 'white', padding: '20px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', color: '#666', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Target size={16} color="#2563eb" /> Meta do mês
            </h3>
            {!editandoMeta ? (
              <button onClick={() => { setEditandoMeta(true); setMetaInput(metaMes ? metaMes.toString() : '') }} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                {metaMes ? 'Editar' : 'Definir meta'}
              </button>
            ) : null}
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
                <span>R$ {entradasVisiveis.toFixed(2)} de R$ {Number(metaMes).toFixed(2)}</span>
                <strong style={{ color: progressoMeta >= 100 ? '#16a34a' : '#2563eb' }}>{progressoMeta.toFixed(0)}%</strong>
              </div>
              <div style={{ height: '10px', background: '#e2e8f0', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progressoMeta}%`, background: progressoMeta >= 100 ? '#16a34a' : '#2563eb', transition: 'width 0.3s' }} />
              </div>
              {progressoMeta >= 100 && <p style={{ color: '#16a34a', fontSize: '13px', margin: '8px 0 0', fontWeight: 'bold' }}>Meta batida!</p>}
            </>
          ) : (
            <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>Defina uma meta mensal para acompanhar seu progresso.</p>
          )}
        </div>

        {/* --- GRÁFICO (COM ID) --- */}
        <div id="fin-grafico" style={{ background: 'white', padding: '20px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #eee', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <h3 style={{marginTop:0, fontSize:'14px', color:'#666', marginBottom:'20px', display:'flex', alignItems:'center', gap:'5px'}}>
                <PieChart size={16}/> Resumo do Mês
            </h3>
            <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                    <BarChart data={dadosGrafico} margin={{ top: 5, right: 30, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} style={{ fontSize: '12px' }} />
                        <YAxis axisLine={false} tickLine={false} style={{ fontSize: '12px' }} />
                        <Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius:'8px', border:'none', boxShadow:'0 4px 12px rgba(0,0,0,0.1)'}} />
                        <Bar dataKey="valor" radius={[4, 4, 0, 0]} barSize={40}>
                            {dadosGrafico.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* CARDS DINÂMICOS (COM ID) */}
        <div id="fin-cards" style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', marginBottom: '15px' }}>
          <div style={{ flex: '1 1 150px', background: '#dcfce7', padding: '15px', borderRadius: '12px', border: '1px solid #16a34a' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#166534', marginBottom: '5px' }}>
              <TrendingUp size={20} /> <strong>Entradas</strong>
            </div>
            <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#14532d', display: 'block' }}>R$ {entradasVisiveis.toFixed(2)}</span>
          </div>

          <div style={{ flex: '1 1 150px', background: '#fee2e2', padding: '15px', borderRadius: '12px', border: '1px solid #dc2626' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#991b1b', marginBottom: '5px' }}>
              <TrendingDown size={20} /> <strong>Saídas</strong>
            </div>
            <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#7f1d1d', display: 'block' }}>R$ {saidasVisiveis.toFixed(2)}</span>
          </div>
        </div>

        {/* LUCRO DINÂMICO (COM ID) */}
        <div id="fin-lucro" style={{ background: lucroVisivel >= 0 ? '#1e293b' : '#7f1d1d', color: 'white', padding: '15px', borderRadius: '12px', textAlign: 'center', marginBottom: '25px', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}>
          <span style={{ display: 'block', fontSize: '12px', opacity: 0.8 }}>
            {filtroAtivo === 'TODOS' ? 'LUCRO LÍQUIDO (GERAL)' : `RESULTADO DO FILTRO (${filtroAtivo})`}
          </span>
          <strong style={{ fontSize: '28px' }}>R$ {lucroVisivel.toFixed(2)}</strong>
        </div>

        {/* MENSALISTAS */}
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

        {/* BOTÃO NOVO (COM ID) */}
        {!showForm && (
          <button id="fin-novo" onClick={() => { setShowForm(true); setTipoLancamento('DESPESA'); setDesc(''); setValor(''); setClientIdVinculado(null); setDataLancamento(new Date().toISOString().split('T')[0]); }}
            style={{ width: '100%', padding: '15px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
            <PlusCircle /> Lançamento Manual
          </button>
        )}

        {showForm && (
          <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '2px solid #2563eb', marginBottom: '20px' }}>
            <h3 style={{ marginTop: 0 }}>{clientIdVinculado ? 'Receber Mensalidade' : 'Novo Lançamento'}</h3>
            {!clientIdVinculado && (
              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <button onClick={() => setTipoLancamento('DESPESA')} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #dc2626', background: tipoLancamento === 'DESPESA' ? '#fee2e2' : 'white', color: '#dc2626', fontWeight: 'bold' }}>Despesa</button>
                <button onClick={() => setTipoLancamento('RECEITA_MENSAL')} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #16a34a', background: tipoLancamento === 'RECEITA_MENSAL' ? '#dcfce7' : 'white', color: '#16a34a', fontWeight: 'bold' }}>Receita</button>
              </div>
            )}
            <form onSubmit={handleSalvarLancamento} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div><label style={{ fontWeight: 'bold', fontSize: '12px' }}>Descrição</label><input value={desc} onChange={e => setDesc(e.target.value)} style={inputStyle} /></div>
              <div>
                <label style={{ fontWeight: 'bold', fontSize: '12px' }}>Valor a Cobrar (R$)</label>
                <input type="number" step="0.01" value={valor} onChange={e => setValor(e.target.value)} style={inputStyle} placeholder={clientIdVinculado ? "Digite o valor calculado" : "0.00"} />
                {clientIdVinculado && <small style={{ color: '#666' }}>Edite conforme a quantidade de serviços.</small>}
              </div>
              <div><label style={{ fontWeight: 'bold', fontSize: '12px' }}>Data</label><input type="date" value={dataLancamento} onChange={e => setDataLancamento(e.target.value)} style={inputStyle} /></div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ flex: 1, padding: '10px', background: '#ccc', border: 'none', borderRadius: '6px' }}>Cancelar</button>
                <button type="submit" style={{ flex: 1, padding: '10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>Salvar</button>
              </div>
            </form>
          </div>
        )}

        {/* FILTROS (COM ID) */}
        <div id="fin-filtros" style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '10px' }}>
          <button onClick={() => setFiltroAtivo('TODOS')} style={filtroAtivo === 'TODOS' ? btnFiltroAtivo : btnFiltroInativo}>Todos</button>
          <button onClick={() => setFiltroAtivo('AVULSO')} style={filtroAtivo === 'AVULSO' ? btnFiltroAtivo : btnFiltroInativo}>Serviços</button>
          <button onClick={() => setFiltroAtivo('MENSAL')} style={filtroAtivo === 'MENSAL' ? btnFiltroAtivo : btnFiltroInativo}>Mensalidades</button>
          <button onClick={() => setFiltroAtivo('DESPESA')} style={filtroAtivo === 'DESPESA' ? btnFiltroAtivo : btnFiltroInativo}>Despesas</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {movimentacoesFiltradas.length === 0 && <p style={{ textAlign: 'center', color: '#888' }}>Nada encontrado neste filtro.</p>}
          {movimentacoesFiltradas.map(m => (
            <div key={m.id} style={{
              background: 'white', padding: '15px', borderRadius: '8px', border: '1px solid #ddd',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderLeft: `5px solid ${m.type === 'RECEITA' ? '#16a34a' : '#dc2626'}`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {m.origem === 'AGENDA' && <Calendar size={20} color="#2563eb" />}
                {m.origem === 'MANUAL' && m.type === 'RECEITA' && <FileText size={20} color="#6610f2" />}
                {m.type === 'DESPESA' && <TrendingDown size={20} color="#dc2626" />}
                <div>
                  <strong style={{ display: 'block', color: '#000' }}>{m.description}</strong>
                  <small style={{ color: '#666' }}>{new Date(m.date).toLocaleDateString('pt-BR')}</small>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontWeight: 'bold', color: m.type === 'RECEITA' ? '#16a34a' : '#dc2626', fontSize: '16px' }}>
                  {m.type === 'DESPESA' ? '-' : '+'} R$ {m.amount.toFixed(2)}
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

const inputStyle = { padding: '12px', borderRadius: '8px', border: '1px solid #999', fontSize: '16px', width: '100%', boxSizing: 'border-box' }
const btnNavStyle = { padding: '5px 15px', borderRadius: '5px', border: '1px solid #ccc', background: 'white', cursor: 'pointer', fontSize: '18px', fontWeight: 'bold' }
const btnFiltroBase = { padding: '8px 16px', borderRadius: '20px', border: '1px solid', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap' }
const btnFiltroAtivo = { ...btnFiltroBase, background: '#2563eb', color: 'white', borderColor: '#2563eb' }
const btnFiltroInativo = { ...btnFiltroBase, background: 'white', color: '#444', borderColor: '#ccc' }