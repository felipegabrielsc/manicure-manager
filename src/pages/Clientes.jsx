// src/pages/Clientes.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { ArrowLeft, Search, User, Plus, Trash2, Edit2, DollarSign, Calendar, X, ChevronDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import Modal from '../components/Modal' // Usando seu modal existente se houver, ou criando um simples aqui

export default function Clientes() {
  const [loading, setLoading] = useState(true)
  const [clientes, setClientes] = useState([])
  const [busca, setBusca] = useState('')
  const [filtroPeriodo, setFiltroPeriodo] = useState('MES') // 'MES' ou 'TOTAL'

  // Estados para Modal de Novo/Editar
  const [modalAberto, setModalAberto] = useState(false)
  const [nomeCliente, setNomeCliente] = useState('')
  const [phoneCliente, setPhoneCliente] = useState('')
  const [idEdicao, setIdEdicao] = useState(null)

  // Estados para Modal de Histórico
  const [clienteSelecionada, setClienteSelecionada] = useState(null)

  useEffect(() => {
    carregarDados()
  }, [filtroPeriodo]) // Recarrega quando muda o filtro

  async function carregarDados() {
    setLoading(true)
    
    // 1. Busca Clientes
    const { data: clientsData, error: errClients } = await supabase
      .from('clients')
      .select('*')
      .order('name')

    if (errClients) { toast.error('Erro ao carregar clientes'); return; }

    // 2. Busca Agendamentos CONCLUÍDOS para calcular gastos
    let query = supabase
      .from('appointments')
      .select('client_id, agreed_price, start_time, services(name)')
      .eq('status', 'CONCLUIDO')

    // Aplica filtro de data se for "MES"
    if (filtroPeriodo === 'MES') {
        const hoje = new Date()
        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString()
        const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59).toISOString()
        query = query.gte('start_time', inicioMes).lte('start_time', fimMes)
    }

    const { data: appointmentsData } = await query

    // 3. Junta as informações (Map Reduce manual)
    const clientesComGasto = clientsData.map(cliente => {
        // Pega todos os agendamentos dessa cliente
        const servicosFeitos = appointmentsData?.filter(app => app.client_id === cliente.id) || []
        
        // Soma o valor
        const totalGasto = servicosFeitos.reduce((acc, curr) => acc + (Number(curr.agreed_price) || 0), 0)

        return {
            ...cliente,
            totalGasto,
            historico: servicosFeitos // Guarda para exibir no modal
        }
    })

    // Ordena quem gastou mais primeiro
    clientesComGasto.sort((a, b) => b.totalGasto - a.totalGasto)

    setClientes(clientesComGasto)
    setLoading(false)
  }

  const salvarCliente = async (e) => {
    e.preventDefault()
    if (!nomeCliente || !phoneCliente) return toast.error('Preencha os campos')

    const user = (await supabase.auth.getUser()).data.user
    const dados = { 
        name: nomeCliente, 
        phone: phoneCliente, 
        user_id: user.id,
        type: 'AVULSO' // Padrão
    }

    let error
    if (idEdicao) {
        const res = await supabase.from('clients').update(dados).eq('id', idEdicao)
        error = res.error
    } else {
        const res = await supabase.from('clients').insert(dados)
        error = res.error
    }

    if (error) toast.error('Erro ao salvar')
    else {
        toast.success('Cliente salva!')
        setModalAberto(false)
        limparForm()
        carregarDados()
    }
  }

  const deletarCliente = async (id) => {
      if(!window.confirm("Tem certeza? Isso apaga o histórico dela.")) return;
      const { error } = await supabase.from('clients').delete().eq('id', id)
      if (error) toast.error('Erro ao excluir')
      else { toast.success('Excluída'); carregarDados(); }
  }

  const abrirEdicao = (c, e) => {
      e.stopPropagation() // Para não abrir o histórico
      setIdEdicao(c.id)
      setNomeCliente(c.name)
      setPhoneCliente(c.phone)
      setModalAberto(true)
  }

  const limparForm = () => { setIdEdicao(null); setNomeCliente(''); setPhoneCliente('') }

  const filtrarLista = clientes.filter(c => c.name.toLowerCase().includes(busca.toLowerCase()))

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', paddingBottom: '80px', fontFamily: 'sans-serif' }}>
      
      {/* CABEÇALHO */}
      <div style={{ background: 'white', padding: '15px 20px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
            <Link to="/" style={{ color: '#000' }}><ArrowLeft size={24} /></Link>
            <h2 style={{ margin: 0, fontSize: '20px' }}>Clientes</h2>
        </div>
        <button onClick={() => { limparForm(); setModalAberto(true) }} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Plus size={24} />
        </button>
      </div>

      {/* FILTROS E BUSCA */}
      <div style={{ padding: '20px 20px 0 20px', maxWidth: '600px', margin: '0 auto' }}>
        
        {/* Barra de Busca */}
        <div style={{ position: 'relative', marginBottom: '15px' }}>
            <Search size={20} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '12px' }} />
            <input 
                placeholder="Buscar cliente..." 
                value={busca}
                onChange={e => setBusca(e.target.value)}
                style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', boxSizing:'border-box' }} 
            />
        </div>

        {/* Filtro de Gasto */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button 
                onClick={() => setFiltroPeriodo('MES')}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: filtroPeriodo === 'MES' ? '1px solid #2563eb' : '1px solid #e2e8f0', background: filtroPeriodo === 'MES' ? '#eff6ff' : 'white', color: filtroPeriodo === 'MES' ? '#2563eb' : '#64748b', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}
            >
                📅 Este Mês
            </button>
            <button 
                onClick={() => setFiltroPeriodo('TOTAL')}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: filtroPeriodo === 'TOTAL' ? '1px solid #2563eb' : '1px solid #e2e8f0', background: filtroPeriodo === 'TOTAL' ? '#eff6ff' : 'white', color: filtroPeriodo === 'TOTAL' ? '#2563eb' : '#64748b', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}
            >
                ♾️ Tudo
            </button>
        </div>

        {/* LISTA DE CLIENTES */}
        {loading ? <div style={{textAlign:'center', color:'#666'}}>Carregando...</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filtrarLista.map(cliente => (
                    <div 
                        key={cliente.id} 
                        onClick={() => setClienteSelecionada(cliente)}
                        style={{ background: 'white', borderRadius: '12px', padding: '15px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                    >
                        {/* Info Principal */}
                        <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                            <div style={{width:'40px', height:'40px', background:'#f1f5f9', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', color:'#64748b'}}>
                                <User size={20}/>
                            </div>
                            <div>
                                <h3 style={{margin:0, fontSize:'16px', color:'#1e293b'}}>{cliente.name}</h3>
                                <span style={{fontSize:'12px', color:'#64748b'}}>{cliente.phone}</span>
                            </div>
                        </div>

                        {/* Valor Gasto (O Destaque) */}
                        <div style={{textAlign:'right'}}>
                            <span style={{display:'block', fontSize:'10px', color:'#64748b', fontWeight:'bold'}}>GASTOU</span>
                            <span style={{color: cliente.totalGasto > 0 ? '#16a34a' : '#94a3b8', fontWeight: 'bold', fontSize: '16px'}}>
                                R$ {cliente.totalGasto}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        )}
      </div>

      {/* --- MODAL HISTÓRICO DA CLIENTE --- */}
      {clienteSelecionada && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={(e) => { if(e.target === e.currentTarget) setClienteSelecionada(null) }}>
            <div style={{ background: 'white', width: '100%', maxWidth: '600px', borderRadius: '20px 20px 0 0', padding: '25px', maxHeight: '80vh', overflowY: 'auto', animation: 'slideUp 0.3s ease-out' }}>
                
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
                    <div>
                        <h2 style={{margin:0}}>{clienteSelecionada.name}</h2>
                        <p style={{margin:0, color:'#666', fontSize:'14px'}}>Extrato de Serviços ({filtroPeriodo === 'MES' ? 'Mês Atual' : 'Total'})</p>
                    </div>
                    <button onClick={() => setClienteSelecionada(null)} style={{background:'none', border:'none'}}><X/></button>
                </div>

                <div style={{background:'#f0fdf4', padding:'15px', borderRadius:'12px', textAlign:'center', marginBottom:'20px', border:'1px solid #bbf7d0'}}>
                    <span style={{color:'#166534', fontSize:'12px', fontWeight:'bold'}}>TOTAL INVESTIDO NA BELEZA</span>
                    <div style={{fontSize:'32px', fontWeight:'bold', color:'#15803d'}}>R$ {clienteSelecionada.totalGasto}</div>
                </div>

                <h4 style={{marginBottom:'10px', color:'#64748b'}}>Histórico Detalhado:</h4>
                {clienteSelecionada.historico.length === 0 ? (
                    <p style={{textAlign:'center', color:'#999'}}>Nenhum serviço encontrado neste período.</p>
                ) : (
                    <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                        {clienteSelecionada.historico.map((item, idx) => (
                            <div key={idx} style={{display:'flex', justifyContent:'space-between', padding:'10px', borderBottom:'1px solid #f1f5f9'}}>
                                <div>
                                    <strong style={{display:'block', fontSize:'14px', color:'#333'}}>{item.services?.name || 'Serviço'}</strong>
                                    <span style={{fontSize:'12px', color:'#999'}}>
                                        {new Date(item.start_time).toLocaleDateString('pt-BR')} às {new Date(item.start_time).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}
                                    </span>
                                </div>
                                <span style={{fontWeight:'bold', color:'#16a34a'}}>R$ {item.agreed_price}</span>
                            </div>
                        ))}
                    </div>
                )}

                <div style={{display:'flex', gap:'10px', marginTop:'25px', borderTop:'1px solid #eee', paddingTop:'20px'}}>
                    <button onClick={() => { setClienteSelecionada(null); abrirEdicao(clienteSelecionada, { stopPropagation: ()=>{} }) }} style={{flex:1, padding:'12px', background:'white', border:'1px solid #2563eb', color:'#2563eb', borderRadius:'8px', fontWeight:'bold', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'5px'}}>
                        <Edit2 size={16}/> Editar Dados
                    </button>
                    <button onClick={() => { setClienteSelecionada(null); deletarCliente(clienteSelecionada.id) }} style={{flex:1, padding:'12px', background:'#fee2e2', border:'none', color:'#dc2626', borderRadius:'8px', fontWeight:'bold', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'5px'}}>
                        <Trash2 size={16}/> Excluir
                    </button>
                </div>

            </div>
        </div>
      )}

      {/* --- MODAL NOVO/EDITAR --- */}
      {modalAberto && (
        <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', zIndex:60, display:'flex', alignItems:'center', justifyContent:'center'}} onClick={(e)=>{if(e.target===e.currentTarget) setModalAberto(false)}}>
             <div style={{background:'white', padding:'25px', borderRadius:'16px', width:'90%', maxWidth:'400px'}}>
                 <h3 style={{marginTop:0}}>{idEdicao ? 'Editar Cliente' : 'Nova Cliente'}</h3>
                 <form onSubmit={salvarCliente}>
                     <div style={{marginBottom:'15px'}}>
                         <label style={{display:'block', fontSize:'12px', fontWeight:'bold', marginBottom:'5px'}}>Nome</label>
                         <input required value={nomeCliente} onChange={e=>setNomeCliente(e.target.value)} style={inputStyle} placeholder="Ex: Maria Silva" />
                     </div>
                     <div style={{marginBottom:'20px'}}>
                         <label style={{display:'block', fontSize:'12px', fontWeight:'bold', marginBottom:'5px'}}>WhatsApp</label>
                         <input required value={phoneCliente} onChange={e=>setPhoneCliente(e.target.value)} style={inputStyle} placeholder="(00) 00000-0000" />
                     </div>
                     <button type="submit" style={btnStyle}>Salvar</button>
                 </form>
             </div>
        </div>
      )}

      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
    </div>
  )
}

const inputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc', boxSizing:'border-box' }
const btnStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: 'none', background: '#2563eb', color: 'white', fontWeight: 'bold', cursor:'pointer' }