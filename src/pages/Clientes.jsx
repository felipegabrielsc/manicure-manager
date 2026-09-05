// src/pages/Clientes.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { ArrowLeft, Search, User, Plus, Trash2, Edit2, X, HelpCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import Modal from '../components/Modal' 

// 1. IMPORTAÇÃO DO TUTORIAL (Igual ao Financeiro)
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

export default function Clientes() {
  const [loading, setLoading] = useState(true)
  const [clientes, setClientes] = useState([])
  const [busca, setBusca] = useState('')
  const [filtroPeriodo, setFiltroPeriodo] = useState('MES')

  // Estados para Modal de Novo/Editar
  const [modalAberto, setModalAberto] = useState(false)
  const [nomeCliente, setNomeCliente] = useState('')
  const [phoneCliente, setPhoneCliente] = useState('')
  const [idEdicao, setIdEdicao] = useState(null)

  // Estados para Modal de Histórico
  const [clienteSelecionada, setClienteSelecionada] = useState(null)

  // Estados para o Modal de Confirmação (Delete)
  const [alertModal, setAlertModal] = useState({ isOpen: false, type: 'info', title: '', message: '' })
  const [acaoConfirmacao, setAcaoConfirmacao] = useState(null)

  useEffect(() => {
    carregarDados()
  }, [filtroPeriodo])

  // --- 2. CONFIGURAÇÃO DO TUTORIAL INTERATIVO ---
  const iniciarTutorial = () => {
    const driverObj = driver({
      showProgress: true,
      nextBtnText: 'Próximo',
      prevBtnText: 'Anterior',
      doneBtnText: 'Entendi!',
      steps: [
        { 
          element: '#cli-novo', 
          popover: { title: 'Nova Cliente', description: 'Clique aqui para cadastrar uma nova cliente manualmente.' } 
        },
        { 
          element: '#cli-busca', 
          popover: { title: 'Pesquisa', description: 'Digite o nome para encontrar alguém rapidamente.' } 
        },
        { 
          element: '#cli-filtros', 
          popover: { title: 'Ranking de Gastos', description: 'Escolha "Este Mês" para ver quem está gastando agora, ou "Tudo" para ver as clientes mais fiéis da história.' } 
        },
        { 
          element: '#cli-lista', 
          popover: { title: 'Lista Inteligente', description: 'As clientes são ordenadas pelo valor gasto. Quem gasta mais aparece no topo (em verde).' } 
        },
        { 
          element: '#cli-detalhes', 
          popover: { title: 'Histórico', description: 'Clique em qualquer cliente para ver o histórico detalhado de serviços e datas.' } 
        }
      ]
    });
    driverObj.drive();
  }

  const formatarTelefone = (value) => {
    if (!value) return ""
    const numbers = value.replace(/\D/g, '')
    return numbers
      .replace(/^(\d{2})(\d)/g, '($1) $2')
      .replace(/(\d)(\d{4})$/, '$1-$2')
      .substring(0, 15)
  }

  async function carregarDados() {
    setLoading(true)
    const { data: clientsData, error: errClients } = await supabase.from('clients').select('*').order('name')
    if (errClients) { toast.error('Erro ao carregar clientes'); return; }

    let query = supabase.from('appointments').select('client_id, agreed_price, start_time, services(name)').eq('status', 'CONCLUIDO')

    if (filtroPeriodo === 'MES') {
        const hoje = new Date()
        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString()
        const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59).toISOString()
        query = query.gte('start_time', inicioMes).lte('start_time', fimMes)
    }

    const { data: appointmentsData } = await query

    const clientesComGasto = clientsData.map(cliente => {
        const servicosFeitos = appointmentsData?.filter(app => app.client_id === cliente.id) || []
        const totalGasto = servicosFeitos.reduce((acc, curr) => acc + (Number(curr.agreed_price) || 0), 0)

        return { ...cliente, totalGasto, historico: servicosFeitos }
    })

    clientesComGasto.sort((a, b) => b.totalGasto - a.totalGasto)
    setClientes(clientesComGasto)
    setLoading(false)
  }

  const salvarCliente = async (e) => {
    e.preventDefault()
    if (!nomeCliente || !phoneCliente) return toast.error('Preencha os campos')
    const user = (await supabase.auth.getUser()).data.user
    const dados = { name: nomeCliente, phone: phoneCliente, user_id: user.id, type: 'AVULSO' }

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

  const confirmarExclusao = async (id) => {
      const toastId = toast.loading('Verificando histórico...')
      const { count, error } = await supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('client_id', id)
      toast.dismiss(toastId)

      if (error) return toast.error('Erro ao verificar histórico.')

      if (count > 0) {
        setAlertModal({
            isOpen: true,
            type: 'info',
            title: 'Não é possível excluir',
            message: `Esta cliente possui ${count} agendamentos no histórico. Excluí-la apagaria o registro financeiro.`
        })
        setAcaoConfirmacao(null) 
        return;
      }

      setAcaoConfirmacao(() => async () => {
          const { error: deleteError } = await supabase.from('clients').delete().eq('id', id)
          if (deleteError) toast.error('Erro ao excluir.')
          else {
              toast.success('Cliente excluída')
              setClienteSelecionada(null) 
              carregarDados()
          }
          setAlertModal({ ...alertModal, isOpen: false })
      })

      setAlertModal({ isOpen: true, type: 'confirm', title: 'Excluir Cliente?', message: 'Esta cliente não tem histórico. Deseja removê-la?' })
  }

  const handleModalConfirm = () => { if (acaoConfirmacao) acaoConfirmacao() }

  const abrirEdicao = (c, e) => {
      e.stopPropagation()
      setIdEdicao(c.id)
      setNomeCliente(c.name)
      setPhoneCliente(c.phone)
      setModalAberto(true)
  }

  const limparForm = () => { setIdEdicao(null); setNomeCliente(''); setPhoneCliente('') }

  const filtrarLista = clientes.filter(c => c.name.toLowerCase().includes(busca.toLowerCase()))

  return (
    <div style={{ minHeight: '100%', background: '#f8fafc', paddingBottom: '80px', fontFamily: 'sans-serif' }}>
      
      <Modal isOpen={alertModal.isOpen} onClose={() => setAlertModal({...alertModal, isOpen: false})} type={alertModal.type} title={alertModal.title} message={alertModal.message} onConfirm={handleModalConfirm} />

      {/* CABEÇALHO */}
      <div style={{ background: 'white', padding: '15px 20px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
            <Link to="/" style={{ color: '#000' }}><ArrowLeft size={24} /></Link>
            <h2 style={{ margin: 0, fontSize: '20px' }}>Clientes</h2>
        </div>
        
        <div style={{display:'flex', gap:'10px'}}>
            {/* BOTÃO TUTORIAL */}
            <button 
                onClick={iniciarTutorial} 
                style={{ background: '#fffbeb', color: '#d97706', border: '1px solid #d97706', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                title="Ajuda"
            >
                <HelpCircle size={20} />
            </button>

            {/* BOTÃO ADICIONAR (COM ID PARA TUTORIAL) */}
            <button 
                id="cli-novo"
                onClick={() => { limparForm(); setModalAberto(true) }} 
                style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
                <Plus size={24} />
            </button>
        </div>
      </div>

      <div style={{ padding: '20px 20px 0 20px' }} className="page-inner">
        
        {/* BUSCA (COM ID) */}
        <div id="cli-busca" style={{ position: 'relative', marginBottom: '15px' }}>
            <Search size={20} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '12px' }} />
            <input 
                placeholder="Buscar cliente..." 
                value={busca}
                onChange={e => setBusca(e.target.value)}
                style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', boxSizing:'border-box' }} 
            />
        </div>

        {/* FILTROS (COM ID) */}
        <div id="cli-filtros" style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
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

        {/* LISTA (COM ID) */}
        {loading ? <div style={{textAlign:'center', color:'#666'}}>Carregando...</div> : (
            <div id="cli-lista" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filtrarLista.map((cliente, index) => (
                    <div 
                        key={cliente.id} 
                        id={index === 0 ? 'cli-detalhes' : ''} // Coloca ID só no primeiro para o tutorial apontar
                        onClick={() => setClienteSelecionada(cliente)}
                        style={{ background: 'white', borderRadius: '12px', padding: '15px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                    >
                        <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                            <div style={{width:'40px', height:'40px', background:'#f1f5f9', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', color:'#64748b'}}>
                                <User size={20}/>
                            </div>
                            <div>
                                <h3 style={{margin:0, fontSize:'16px', color:'#1e293b'}}>{cliente.name}</h3>
                                <span style={{fontSize:'12px', color:'#64748b'}}>{formatarTelefone(cliente.phone)}</span>
                                {(cliente.loyalty_visits > 0) && (
                                  <span style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 'bold' }}>★ {cliente.loyalty_visits} visitas</span>
                                )}
                            </div>
                        </div>

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

      {/* --- MODAL HISTÓRICO --- */}
      {clienteSelecionada && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={(e) => { if(e.target === e.currentTarget) setClienteSelecionada(null) }}>
            <div style={{ background: 'white', width: '100%', maxWidth: '600px', borderRadius: '20px 20px 0 0', padding: '25px', maxHeight: '80vh', overflowY: 'auto', animation: 'slideUp 0.3s ease-out' }}>
                
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
                    <div>
                        <h2 style={{margin:0}}>{clienteSelecionada.name}</h2>
                        <p style={{margin:0, color:'#666', fontSize:'14px'}}>Extrato ({filtroPeriodo === 'MES' ? 'Mês Atual' : 'Total'})</p>
                    </div>
                    <button onClick={() => setClienteSelecionada(null)} style={{background:'none', border:'none'}}><X/></button>
                </div>

                <div style={{background:'#f0fdf4', padding:'15px', borderRadius:'12px', textAlign:'center', marginBottom:'20px', border:'1px solid #bbf7d0'}}>
                    <span style={{color:'#166534', fontSize:'12px', fontWeight:'bold'}}>TOTAL GASTO</span>
                    <div style={{fontSize:'32px', fontWeight:'bold', color:'#15803d'}}>R$ {clienteSelecionada.totalGasto}</div>
                </div>

                <h4 style={{marginBottom:'10px', color:'#64748b'}}>Histórico:</h4>
                {clienteSelecionada.historico.length === 0 ? (
                    <p style={{textAlign:'center', color:'#999'}}>Nenhum serviço neste período.</p>
                ) : (
                    <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                        {clienteSelecionada.historico.map((item, idx) => (
                            <div key={idx} style={{display:'flex', justifyContent:'space-between', padding:'10px', borderBottom:'1px solid #f1f5f9'}}>
                                <div>
                                    <strong style={{display:'block', fontSize:'14px', color:'#333'}}>{item.services?.name}</strong>
                                    <span style={{fontSize:'12px', color:'#999'}}>
                                        {new Date(item.start_time).toLocaleDateString('pt-BR')}
                                    </span>
                                </div>
                                <span style={{fontWeight:'bold', color:'#16a34a'}}>R$ {item.agreed_price}</span>
                            </div>
                        ))}
                    </div>
                )}

                <div style={{display:'flex', gap:'10px', marginTop:'25px', borderTop:'1px solid #eee', paddingTop:'20px'}}>
                    <button onClick={() => { setClienteSelecionada(null); abrirEdicao(clienteSelecionada, { stopPropagation: ()=>{} }) }} style={{flex:1, padding:'12px', background:'white', border:'1px solid #2563eb', color:'#2563eb', borderRadius:'8px', fontWeight:'bold', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'5px'}}>
                        <Edit2 size={16}/> Editar
                    </button>
                    <button onClick={() => { confirmarExclusao(clienteSelecionada.id) }} style={{flex:1, padding:'12px', background:'#fee2e2', border:'none', color:'#dc2626', borderRadius:'8px', fontWeight:'bold', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'5px'}}>
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
                 <h3 style={{marginTop:0}}>{idEdicao ? 'Editar' : 'Nova'}</h3>
                 <form onSubmit={salvarCliente}>
                     <div style={{marginBottom:'15px'}}>
                         <label style={{display:'block', fontSize:'12px', fontWeight:'bold', marginBottom:'5px'}}>Nome</label>
                         <input required value={nomeCliente} onChange={e=>setNomeCliente(e.target.value)} style={inputStyle} placeholder="Ex: Maria Silva" />
                     </div>
                     <div style={{marginBottom:'20px'}}>
                         <label style={{display:'block', fontSize:'12px', fontWeight:'bold', marginBottom:'5px'}}>WhatsApp</label>
                         <input required value={phoneCliente} onChange={e => setPhoneCliente(formatarTelefone(e.target.value))} style={inputStyle} placeholder="(00) 00000-0000" maxLength={15}/>
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