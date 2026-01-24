// src/pages/Financeiro.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { ArrowLeft, TrendingUp, TrendingDown, PlusCircle, Calendar, FileText, Filter } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Financeiro() {
  const [loading, setLoading] = useState(true)
  const [dataAtual, setDataAtual] = useState(new Date())
  
  // Dashboard
  const [totalAvulso, setTotalAvulso] = useState(0)
  const [totalMensalidades, setTotalMensalidades] = useState(0)
  const [totalDespesas, setTotalDespesas] = useState(0)
  
  // Listas
  const [movimentacoes, setMovimentacoes] = useState([])
  const [mensalistasPendentes, setMensalistasPendentes] = useState([])

  // NOVO: Estado do Filtro ('TODOS', 'AVULSO', 'MENSAL', 'DESPESA')
  const [filtroAtivo, setFiltroAtivo] = useState('TODOS')

  // Formulário
  const [showForm, setShowForm] = useState(false)
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

    // 1. BUSCAR AGENDAMENTOS CONCLUÍDOS
    const { data: agendamentos } = await supabase
      .from('appointments')
      .select(`id, agreed_price, start_time, clients (name), services (name)`)
      .gte('start_time', inicioMes.toISOString())
      .lte('start_time', fimMes.toISOString())
      .gt('agreed_price', 0)
      .eq('status', 'CONCLUIDO')

    const somaAvulso = agendamentos?.reduce((acc, curr) => acc + curr.agreed_price, 0) || 0
    setTotalAvulso(somaAvulso)

    // 2. BUSCAR TRANSAÇÕES MANUAIS
    const { data: transacoes } = await supabase
      .from('transactions')
      .select('*')
      .gte('date', inicioMes.toISOString())
      .lte('date', fimMes.toISOString())

    let somaMensal = 0, somaDesp = 0
    const idsPagosNoMes = []

    transacoes?.forEach(t => {
      if (t.type === 'RECEITA') {
        somaMensal += t.amount
        if(t.client_id) idsPagosNoMes.push(t.client_id)
      }
      if (t.type === 'DESPESA') somaDesp += t.amount
    })

    setTotalMensalidades(somaMensal)
    setTotalDespesas(somaDesp)

    // 3. FUSÃO DAS LISTAS
    const agendamentosFormatados = agendamentos?.map(a => ({
      id: `agenda-${a.id}`,
      description: `${a.clients?.name} - ${a.services?.name}`,
      amount: a.agreed_price,
      type: 'RECEITA',
      date: a.start_time,
      origem: 'AGENDA' // Identificador chave
    })) || []

    const transacoesFormatadas = transacoes?.map(t => ({
      ...t,
      origem: 'MANUAL'
    })) || []

    const listaCompleta = [...agendamentosFormatados, ...transacoesFormatadas]
    listaCompleta.sort((a, b) => new Date(b.date) - new Date(a.date))

    setMovimentacoes(listaCompleta)

    // 4. Pendentes
    const { data: clientesMensais } = await supabase
      .from('clients')
      .select('*')
      .eq('type', 'MENSALISTA')

    const pendentes = clientesMensais?.filter(c => !idsPagosNoMes.includes(c.id)) || []
    setMensalistasPendentes(pendentes)

    setLoading(false)
  }

  function abrirCobrancaRapida(cliente) {
    setTipoLancamento('RECEITA_MENSAL')
    setDesc(`Mensalidade ${cliente.name}`)
    setValor(cliente.monthly_fee ? cliente.monthly_fee.toString() : '0')
    setClientIdVinculado(cliente.id)
    const hoje = new Date().toISOString().split('T')[0]
    setDataLancamento(hoje)
    setShowForm(true)
  }

  async function handleSalvarLancamento(e) {
    e.preventDefault()
    if (!desc || !valor) return alert('Preencha tudo!')
    const tipoFinal = tipoLancamento === 'RECEITA_MENSAL' ? 'RECEITA' : 'DESPESA'
    const dataFinal = dataLancamento ? new Date(dataLancamento).toISOString() : new Date().toISOString()

    const { error } = await supabase.from('transactions').insert({
      description: desc,
      amount: parseFloat(valor.replace(',', '.')),
      type: tipoFinal,
      date: dataFinal,
      client_id: clientIdVinculado
    })

    if (error) {
      alert('Erro: ' + error.message)
    } else {
      setDesc(''); setValor(''); setClientIdVinculado(null); setDataLancamento(''); setShowForm(false)
      carregarFinanceiro()
    }
  }

  const mudarMes = (direcao) => {
    const novo = new Date(dataAtual)
    novo.setMonth(novo.getMonth() + direcao)
    setDataAtual(novo)
  }

  const lucroLiquido = (totalAvulso + totalMensalidades) - totalDespesas

  // LÓGICA DE FILTRAGEM
  const movimentacoesFiltradas = movimentacoes.filter(m => {
    if (filtroAtivo === 'TODOS') return true
    if (filtroAtivo === 'AVULSO') return m.origem === 'AGENDA' // Serviços feitos no dia a dia
    if (filtroAtivo === 'MENSAL') return m.origem === 'MANUAL' && m.type === 'RECEITA' // Pagamentos de pacotes
    if (filtroAtivo === 'DESPESA') return m.type === 'DESPESA' // Contas pagas
    return true
  })

  return (
    <div style={{ paddingBottom: '50px' }}>
      
      {/* Cabeçalho */}
      <div style={{ background: 'white', padding: '15px 20px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
            <Link to="/" style={{ color: '#000' }}><ArrowLeft size={28} /></Link>
            <h2 style={{ margin: 0, fontSize: '18px', color: '#000', textTransform: 'capitalize' }}>{mesFormatado}</h2>
        </div>
        <div style={{display: 'flex', gap: '10px'}}>
            <button onClick={() => mudarMes(-1)} style={btnNavStyle}>&lt;</button>
            <button onClick={() => mudarMes(1)} style={btnNavStyle}>&gt;</button>
        </div>
      </div>

      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
        
        {/* CARDS RESUMO (Sempre visíveis para ela não perder a noção do todo) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
            <div style={{ background: '#dcfce7', padding: '15px', borderRadius: '12px', border: '1px solid #16a34a' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#166534', marginBottom: '5px' }}>
                    <TrendingUp size={20} /> <strong>Entradas</strong>
                </div>
                <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#14532d', display: 'block' }}>R$ {(totalAvulso + totalMensalidades).toFixed(2)}</span>
            </div>

            <div style={{ background: '#fee2e2', padding: '15px', borderRadius: '12px', border: '1px solid #dc2626' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#991b1b', marginBottom: '5px' }}>
                    <TrendingDown size={20} /> <strong>Saídas</strong>
                </div>
                <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#7f1d1d', display: 'block' }}>R$ {totalDespesas.toFixed(2)}</span>
            </div>
        </div>

        {/* LUCRO LÍQUIDO */}
        <div style={{ background: lucroLiquido >= 0 ? '#1e293b' : '#7f1d1d', color: 'white', padding: '20px', borderRadius: '12px', textAlign: 'center', marginBottom: '30px', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}>
            <span style={{ display: 'block', fontSize: '14px', opacity: 0.8 }}>LUCRO LÍQUIDO (REALIZADO)</span>
            <strong style={{ fontSize: '32px' }}>R$ {lucroLiquido.toFixed(2)}</strong>
        </div>

        {/* MENSALIDADES PENDENTES (Só mostra se tiver) */}
        {mensalistasPendentes.length > 0 && !showForm && (
          <div style={{ marginBottom: '30px' }}>
            <h3 style={{ color: '#000', borderBottom: '2px solid #6610f2', paddingBottom: '5px', color: '#6610f2' }}>Mensalidades a Receber</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {mensalistasPendentes.map(cliente => (
                <div key={cliente.id} style={{ background: 'white', padding: '15px', borderRadius: '8px', border: '1px solid #d8b4fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{display: 'block', color: '#4a044e'}}>{cliente.name}</strong>
                    <small style={{color: '#666'}}>Vence dia {cliente.monthly_due_day}</small>
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

        {/* BOTÃO ADICIONAR (Esconde quando form está aberto) */}
        {!showForm && (
            <button 
                onClick={() => {
                  setShowForm(true); 
                  setTipoLancamento('DESPESA'); 
                  setDesc(''); setValor(''); setClientIdVinculado(null);
                  setDataLancamento(new Date().toISOString().split('T')[0]); 
                }}
                style={{ width: '100%', padding: '15px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '30px' }}
            >
                <PlusCircle /> Lançamento Manual
            </button>
        )}

        {/* FORMULÁRIO DE CADASTRO MANUAL */}
        {showForm && (
            <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '2px solid #2563eb', marginBottom: '20px' }}>
                <h3 style={{ marginTop: 0 }}>{clientIdVinculado ? 'Confirmar Mensalidade' : 'Novo Lançamento'}</h3>
                {!clientIdVinculado && (
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                      <button onClick={() => setTipoLancamento('DESPESA')} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #dc2626', background: tipoLancamento === 'DESPESA' ? '#fee2e2' : 'white', color: '#dc2626', fontWeight: 'bold' }}>Despesa</button>
                      <button onClick={() => setTipoLancamento('RECEITA_MENSAL')} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #16a34a', background: tipoLancamento === 'RECEITA_MENSAL' ? '#dcfce7' : 'white', color: '#16a34a', fontWeight: 'bold' }}>Receita</button>
                  </div>
                )}
                <form onSubmit={handleSalvarLancamento} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div><label style={{display:'block', fontWeight:'bold', fontSize:'12px'}}>Descrição</label><input value={desc} onChange={e => setDesc(e.target.value)} style={inputStyle} /></div>
                    <div><label style={{display:'block', fontWeight:'bold', fontSize:'12px'}}>Valor (R$)</label><input type="number" step="0.01" value={valor} onChange={e => setValor(e.target.value)} style={inputStyle} /></div>
                    <div><label style={{display:'block', fontWeight:'bold', fontSize:'12px'}}>Data</label><input type="date" value={dataLancamento} onChange={e => setDataLancamento(e.target.value)} style={inputStyle} /></div>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                        <button type="button" onClick={() => setShowForm(false)} style={{ flex: 1, padding: '10px', background: '#ccc', border: 'none', borderRadius: '6px' }}>Cancelar</button>
                        <button type="submit" style={{ flex: 1, padding: '10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>Confirmar</button>
                    </div>
                </form>
            </div>
        )}

        {/* --- ÁREA DO HISTÓRICO COM FILTRO --- */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px', marginTop: '10px' }}>
          <h3 style={{ margin: 0, color: '#000', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={20} /> Histórico
          </h3>
        </div>

        {/* BOTÕES DE FILTRO (SCROLL HORIZONTAL PARA MOBILE) */}
        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '10px' }}>
          <button onClick={() => setFiltroAtivo('TODOS')} style={filtroAtivo === 'TODOS' ? btnFiltroAtivo : btnFiltroInativo}>Todos</button>
          <button onClick={() => setFiltroAtivo('AVULSO')} style={filtroAtivo === 'AVULSO' ? btnFiltroAtivo : btnFiltroInativo}>Serviços</button>
          <button onClick={() => setFiltroAtivo('MENSAL')} style={filtroAtivo === 'MENSAL' ? btnFiltroAtivo : btnFiltroInativo}>Mensalidades</button>
          <button onClick={() => setFiltroAtivo('DESPESA')} style={filtroAtivo === 'DESPESA' ? btnFiltroAtivo : btnFiltroInativo}>Despesas</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {movimentacoesFiltradas.length === 0 && (
              <p style={{ color: '#666', textAlign: 'center', padding: '20px', background: '#f8f9fa', borderRadius: '8px' }}>
                Nada encontrado neste filtro.
              </p>
            )}

            {movimentacoesFiltradas.map(m => (
                <div key={m.id} style={{ 
                    background: 'white', padding: '15px', borderRadius: '8px', border: '1px solid #ddd', 
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                    borderLeft: `5px solid ${m.type === 'RECEITA' ? '#16a34a' : '#dc2626'}` 
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {/* Ícones Contextuais */}
                        {m.origem === 'AGENDA' && <Calendar size={20} color="#2563eb" />}
                        {m.origem === 'MANUAL' && m.type === 'RECEITA' && <FileText size={20} color="#6610f2" />} 
                        {m.type === 'DESPESA' && <TrendingDown size={20} color="#dc2626" />}

                        <div>
                            <strong style={{ display: 'block', color: '#000' }}>{m.description}</strong>
                            <small style={{ color: '#666' }}>
                              {new Date(m.date).toLocaleDateString('pt-BR')} 
                            </small>
                        </div>
                    </div>
                    <span style={{ fontWeight: 'bold', color: m.type === 'RECEITA' ? '#16a34a' : '#dc2626', fontSize: '18px' }}>
                        {m.type === 'DESPESA' ? '-' : '+'} R$ {m.amount.toFixed(2)}
                    </span>
                </div>
            ))}
        </div>

      </div>
    </div>
  )
}

// Estilos
const inputStyle = { padding: '12px', borderRadius: '8px', border: '1px solid #999', fontSize: '16px', width: '100%', boxSizing: 'border-box' }
const btnNavStyle = { padding: '5px 15px', borderRadius: '5px', border: '1px solid #ccc', background: 'white', cursor: 'pointer', fontSize: '18px', fontWeight: 'bold' }

const btnFiltroBase = {
  padding: '8px 16px',
  borderRadius: '20px',
  border: '1px solid',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 'bold',
  whiteSpace: 'nowrap'
}

const btnFiltroAtivo = {
  ...btnFiltroBase,
  background: '#2563eb',
  color: 'white',
  borderColor: '#2563eb'
}

const btnFiltroInativo = {
  ...btnFiltroBase,
  background: 'white',
  color: '#444',
  borderColor: '#ccc'
}