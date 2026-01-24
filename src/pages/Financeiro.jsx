// src/pages/Financeiro.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { ArrowLeft, TrendingUp, TrendingDown, PlusCircle, Calendar, FileText, Filter, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import Modal from '../components/Modal' // Usando nosso modal

export default function Financeiro() {
  const [loading, setLoading] = useState(true)
  const [dataAtual, setDataAtual] = useState(new Date())

  // Dados Brutos (Do Banco)
  const [todasMovimentacoes, setTodasMovimentacoes] = useState([])
  const [mensalistasPendentes, setMensalistasPendentes] = useState([])

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

  const mesFormatado = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(dataAtual)

  useEffect(() => {
    carregarFinanceiro()
  }, [dataAtual])

  async function carregarFinanceiro() {
    setLoading(true)
    const inicioMes = new Date(dataAtual.getFullYear(), dataAtual.getMonth(), 1)
    const fimMes = new Date(dataAtual.getFullYear(), dataAtual.getMonth() + 1, 0, 23, 59, 59)

    // 1. BUSCAR AGENDAMENTOS CONCLUÍDOS (Receita Automática)
    const { data: agendamentos } = await supabase
      .from('appointments')
      .select(`id, agreed_price, start_time, client_id, clients (name, type), services (name)`)
      .gte('start_time', inicioMes.toISOString())
      .lte('start_time', fimMes.toISOString())
      .eq('status', 'CONCLUIDO')

    // 2. BUSCAR TRANSAÇÕES MANUAIS (Despesas e Mensalidades Pagas)
    const { data: transacoes } = await supabase
      .from('transactions')
      .select('*')
      .gte('date', inicioMes.toISOString())
      .lte('date', fimMes.toISOString())

    // 3. PROCESSAMENTO DE DADOS
    // Filtrar IDs de quem já pagou mensalidade este mês
    const idsPagosNoMes = transacoes
      ?.filter(t => t.type === 'RECEITA' && t.client_id)
      .map(t => t.client_id) || []

    // Contar quantos serviços cada mensalista fez (para ajudar a calcular o valor)
    const contagemServicosMensalistas = {}
    agendamentos?.forEach(a => {
      if (a.clients?.type === 'MENSALISTA') {
        contagemServicosMensalistas[a.client_id] = (contagemServicosMensalistas[a.client_id] || 0) + 1
      }
    })

    // 4. UNIFICAR LISTAS PARA O HISTÓRICO
    const agendaFormatada = agendamentos
      ?.filter(a => a.agreed_price > 0) // Só mostra no histórico se gerou valor avulso
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

    // 5. LISTA DE MENSALISTAS A PAGAR
    const { data: clientesMensais } = await supabase.from('clients').select('*').eq('type', 'MENSALISTA')

    const pendentes = clientesMensais?.filter(c => !idsPagosNoMes.includes(c.id)).map(c => ({
      ...c,
      servicosFeitos: contagemServicosMensalistas[c.id] || 0 // Adiciona a contagem aqui
    })) || []

    setMensalistasPendentes(pendentes)
    setLoading(false)
  }

  // --- LÓGICA DE FILTROS E TOTAIS DINÂMICOS ---

  const movimentacoesFiltradas = todasMovimentacoes.filter(m => {
    if (filtroAtivo === 'TODOS') return true
    if (filtroAtivo === 'AVULSO') return m.origem === 'AGENDA'
    if (filtroAtivo === 'MENSAL') return m.origem === 'MANUAL' && m.type === 'RECEITA'
    if (filtroAtivo === 'DESPESA') return m.type === 'DESPESA'
    return true
  })

  // Calcula os totais baseados SOMENTE no que está visível pelo filtro
  const entradasVisiveis = movimentacoesFiltradas
    .filter(m => m.type === 'RECEITA')
    .reduce((acc, curr) => acc + curr.amount, 0)

  const saidasVisiveis = movimentacoesFiltradas
    .filter(m => m.type === 'DESPESA')
    .reduce((acc, curr) => acc + curr.amount, 0)

  const lucroVisivel = entradasVisiveis - saidasVisiveis

  // --- AÇÕES ---

  function abrirCobrancaRapida(cliente) {
    setTipoLancamento('RECEITA_MENSAL')
    setDesc(`Mensalidade ${cliente.name}`)
    // Se tiver valor fixo usa, senão deixa vazio pro usuário digitar
    setValor(cliente.monthly_fee ? cliente.monthly_fee.toString() : '')
    setClientIdVinculado(cliente.id)
    setDataLancamento(new Date().toISOString().split('T')[0])
    setShowForm(true)
  }

  async function handleSalvarLancamento(e) {
    e.preventDefault()
    if (!desc || !valor) return alert('Preencha descrição e valor!')

    const { error } = await supabase.from('transactions').insert({
      description: desc,
      amount: parseFloat(valor.replace(',', '.')),
      type: tipoLancamento === 'RECEITA_MENSAL' ? 'RECEITA' : 'DESPESA',
      date: dataLancamento ? new Date(dataLancamento).toISOString() : new Date().toISOString(),
      client_id: clientIdVinculado
    })

    if (!error) {
      setShowForm(false); setDesc(''); setValor(''); setClientIdVinculado(null);
      carregarFinanceiro()
    } else {
      alert('Erro: ' + error.message)
    }
  }

  // Lógica de Exclusão
  const confirmarExclusao = (id) => {
    setIdParaExcluir(id)
    setModal({
      isOpen: true, type: 'confirm', title: 'Excluir Lançamento?',
      message: 'Isso vai remover o valor do caixa. Se foi uma mensalidade, a cliente voltará para a lista de pendentes.'
    })
  }

  const executarExclusao = async () => {
    if (!idParaExcluir) return
    const { error } = await supabase.from('transactions').delete().eq('id', idParaExcluir)
    if (!error) {
      setModal({ isOpen: false })
      carregarFinanceiro()
    } else {
      alert('Erro ao excluir')
    }
  }

  const mudarMes = (d) => {
    const n = new Date(dataAtual); n.setMonth(n.getMonth() + d); setDataAtual(n)
  }

  return (
    <div style={{ paddingBottom: '50px' }}>
      <Modal
        isOpen={modal.isOpen} onClose={() => setModal({ ...modal, isOpen: false })}
        type={modal.type} title={modal.title} message={modal.message} onConfirm={executarExclusao}
      />

      {/* Cabeçalho */}
      <div style={{ background: 'white', padding: '15px 20px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Link to="/" style={{ color: '#000' }}><ArrowLeft size={28} /></Link>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#000', textTransform: 'capitalize' }}>{mesFormatado}</h2>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => mudarMes(-1)} style={btnNavStyle}>&lt;</button>
          <button onClick={() => mudarMes(1)} style={btnNavStyle}>&gt;</button>
        </div>
      </div>

      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>

        {/* CARDS DINÂMICOS (Mudam conforme o filtro) */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', marginBottom: '15px' }}>

          {/* Card Entradas */}
          <div style={{ flex: '1 1 150px', background: '#dcfce7', padding: '15px', borderRadius: '12px', border: '1px solid #16a34a' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#166534', marginBottom: '5px' }}>
              <TrendingUp size={20} /> <strong>Entradas</strong>
            </div>
            <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#14532d', display: 'block' }}>
              R$ {entradasVisiveis.toFixed(2)}
            </span>
          </div>

          {/* Card Saídas */}
          <div style={{ flex: '1 1 150px', background: '#fee2e2', padding: '15px', borderRadius: '12px', border: '1px solid #dc2626' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#991b1b', marginBottom: '5px' }}>
              <TrendingDown size={20} /> <strong>Saídas</strong>
            </div>
            <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#7f1d1d', display: 'block' }}>
              R$ {saidasVisiveis.toFixed(2)}
            </span>
          </div>

        </div>

        {/* LUCRO DINÂMICO */}
        <div style={{ background: lucroVisivel >= 0 ? '#1e293b' : '#7f1d1d', color: 'white', padding: '15px', borderRadius: '12px', textAlign: 'center', marginBottom: '25px', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}>
          <span style={{ display: 'block', fontSize: '12px', opacity: 0.8 }}>
            {filtroAtivo === 'TODOS' ? 'LUCRO LÍQUIDO (GERAL)' : `RESULTADO DO FILTRO (${filtroAtivo})`}
          </span>
          <strong style={{ fontSize: '28px' }}>R$ {lucroVisivel.toFixed(2)}</strong>
        </div>

        {/* ÁREA DE COBRANÇA MENSALISTA (Agora com contador de serviços) */}
        {mensalistasPendentes.length > 0 && !showForm && (
          <div style={{ marginBottom: '30px' }}>
            <h3 style={{ color: '#6610f2', borderBottom: '2px solid #6610f2', paddingBottom: '5px' }}>Mensalidades a Receber</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {mensalistasPendentes.map(cliente => (
                <div key={cliente.id} style={{ background: 'white', padding: '15px', borderRadius: '8px', border: '1px solid #d8b4fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ display: 'block', color: '#4a044e' }}>{cliente.name}</strong>
                    <small style={{ color: '#666', display: 'block' }}>Vence dia {cliente.monthly_due_day}</small>
                    {/* AQUI ESTÁ A AJUDA PARA ELA CALCULAR O VALOR: */}
                    <span style={{ fontSize: '12px', color: '#2563eb', fontWeight: 'bold' }}>
                      Fez {cliente.servicosFeitos} serviços este mês
                    </span>
                  </div>
                  <button
                    onClick={() => abrirCobrancaRapida(cliente)}
                    style={{ background: '#6610f2', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    Receber
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BOTÃO NOVO (Escondido se form aberto) */}
        {!showForm && (
          <button onClick={() => { setShowForm(true); setTipoLancamento('DESPESA'); setDesc(''); setValor(''); setClientIdVinculado(null); setDataLancamento(new Date().toISOString().split('T')[0]); }}
            style={{ width: '100%', padding: '15px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}
          >
            <PlusCircle /> Lançamento Manual
          </button>
        )}

        {/* FORMULÁRIO */}
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

              {/* VALOR EDITÁVEL */}
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

        {/* FILTROS */}
        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '10px' }}>
          <button onClick={() => setFiltroAtivo('TODOS')} style={filtroAtivo === 'TODOS' ? btnFiltroAtivo : btnFiltroInativo}>Todos</button>
          <button onClick={() => setFiltroAtivo('AVULSO')} style={filtroAtivo === 'AVULSO' ? btnFiltroAtivo : btnFiltroInativo}>Serviços</button>
          <button onClick={() => setFiltroAtivo('MENSAL')} style={filtroAtivo === 'MENSAL' ? btnFiltroAtivo : btnFiltroInativo}>Mensalidades</button>
          <button onClick={() => setFiltroAtivo('DESPESA')} style={filtroAtivo === 'DESPESA' ? btnFiltroAtivo : btnFiltroInativo}>Despesas</button>
        </div>

        {/* LISTA HISTÓRICO */}
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
                {/* BOTÃO DE EXCLUIR (SÓ PARA MANUAIS) */}
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