// src/pages/Agenda.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { ChevronLeft, ChevronRight, Calendar, User, Plus, Scissors, DollarSign, CheckSquare, Square, MessageCircle, Trash2, Clock, X, LogOut, CreditCard, HelpCircle, AlertTriangle, Settings, CheckCircle, Ban } from 'lucide-react'
import { Link } from 'react-router-dom'
import Modal from '../components/Modal' 
import toast from 'react-hot-toast'
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

export default function Agenda() {
  const [dataAtual, setDataAtual] = useState(new Date())
  const [agendamentos, setAgendamentos] = useState([])
  const [loading, setLoading] = useState(true)

  // Estados dos Modais
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [agendamentoSelecionado, setAgendamentoSelecionado] = useState(null)
  const [novaDataHora, setNovaDataHora] = useState('')
  const [pagamentoModalOpen, setPagamentoModalOpen] = useState(false)
  const [idParaConcluir, setIdParaConcluir] = useState(null)
  
  const [alertModal, setAlertModal] = useState({ isOpen: false, type: 'info', title: '', message: '' })
  const [acaoConfirmacao, setAcaoConfirmacao] = useState(null)

  const dataFormatada = new Intl.DateTimeFormat('pt-BR', { 
    weekday: 'long', day: '2-digit', month: 'long' 
  }).format(dataAtual)

  useEffect(() => { buscarAgendamentos() }, [dataAtual])

  const iniciarTutorialGeral = () => {
    const driverObj = driver({
      showProgress: true, nextBtnText: 'Próximo', prevBtnText: 'Anterior', doneBtnText: 'Entendi!',
      steps: [
        { element: '#menu-gestao', popover: { title: 'Gestão', description: 'Cadastre Clientes e Serviços aqui.' } },
        { element: '#menu-financeiro', popover: { title: 'Financeiro & Config', description: 'Acesse seu financeiro e configure seus horários/link na engrenagem.' } },
        { element: '#nav-datas', popover: { title: 'Navegação', description: 'Mude os dias para ver a agenda futura ou passada.' } },
        { element: '#btn-novo', popover: { title: 'Agendar Manualmente', description: 'Clique no + para marcar um horário você mesma.' } }
      ]
    });
    driverObj.drive();
  }

  const iniciarTutorialCard = (agendamento) => {
    const driverObj = driver({
        showProgress: true, nextBtnText: 'Próximo', prevBtnText: 'Voltar', doneBtnText: 'Entendi!',
        steps: [
            { element: `#check-${agendamento.id}`, popover: { title: 'Concluir Serviço', description: 'Clique neste quadrado quando terminar a unha para lançar no financeiro.' } },
            { element: `#zap-${agendamento.id}`, popover: { title: 'Lembrete Automático', description: 'Clique para enviar uma mensagem no WhatsApp confirmando o horário.' } },
            { element: `#card-content-${agendamento.id}`, popover: { title: 'Gerenciar', description: 'Clique no nome da cliente para Remarcar, Excluir ou marcar que ela FALTOU.' } }
        ]
    });
    driverObj.drive();
  }

  async function buscarAgendamentos() {
    setLoading(true)
    const inicioDia = new Date(dataAtual); inicioDia.setHours(0, 0, 0, 0)
    const fimDia = new Date(dataAtual); fimDia.setHours(23, 59, 59, 999)
    const { data } = await supabase.from('appointments').select(`*, clients (name, type, phone), services (name)`).gte('start_time', inicioDia.toISOString()).lte('start_time', fimDia.toISOString()).order('start_time', { ascending: true })
    if (data) setAgendamentos(data)
    setLoading(false)
  }

  const handleToggleClick = (agendamento) => {
    if (agendamento.status === 'CONCLUIDO') {
        toggleStatus(agendamento.id, 'CONCLUIDO', null)
    } else {
        setIdParaConcluir(agendamento.id)
        setPagamentoModalOpen(true)
    }
  }

  const confirmarPagamento = async (metodo) => {
    await toggleStatus(idParaConcluir, 'AGENDADO', metodo)
    setPagamentoModalOpen(false)
    setIdParaConcluir(null)
  }

  async function toggleStatus(id, currentStatus, metodoPagamento) {
    const novoStatus = currentStatus === 'CONCLUIDO' ? 'AGENDADO' : 'CONCLUIDO'
    const updateData = { status: novoStatus, payment_method: novoStatus === 'CONCLUIDO' ? metodoPagamento : null }
    const { error } = await supabase.from('appointments').update(updateData).eq('id', id)
    if (!error) {
      setAgendamentos(prev => prev.map(item => item.id === id ? { ...item, status: novoStatus, payment_method: updateData.payment_method } : item))
      if (novoStatus === 'CONCLUIDO') toast.success(`Recebido em ${metodoPagamento}!`, { icon: '💰' })
      else toast('Serviço reaberto', { icon: '↩️' })
    }
  }

  const abrirOpcoes = (agendamento) => {
    // SE FOR PENDENTE, NÃO ABRE AS OPÇÕES NORMAIS
    if(agendamento.status === 'PENDENTE') return; 

    setAgendamentoSelecionado(agendamento)
    const d = new Date(agendamento.start_time); d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    setNovaDataHora(d.toISOString().slice(0, 16)); setEditModalOpen(true)
  }
  
  const fecharOpcoes = () => { setEditModalOpen(false); setAgendamentoSelecionado(null) }
  
  const deletarAgendamento = async () => {
    if (!agendamentoSelecionado) return
    const { error } = await supabase.from('appointments').delete().eq('id', agendamentoSelecionado.id)
    if (!error) { buscarAgendamentos(); fecharOpcoes(); setAlertModal({ isOpen: false }); toast.success('Excluído') }
    else { toast.error('Erro ao excluir') }
  }
  
  const salvarNovaData = async () => {
    if (!agendamentoSelecionado || !novaDataHora) return
    const { error } = await supabase.from('appointments').update({ start_time: new Date(novaDataHora).toISOString() }).eq('id', agendamentoSelecionado.id)
    if (!error) { buscarAgendamentos(); fecharOpcoes(); toast.success('Remarcado!') }
    else { toast.error('Erro ao remarcar') }
  }

  const marcarFalta = async () => {
    if (!agendamentoSelecionado) return
    const { error } = await supabase.from('appointments').update({ status: 'FALTOU' }).eq('id', agendamentoSelecionado.id)
    if(!error) { 
        toast('Falta registrada!', { icon: '🚫' }); 
        buscarAgendamentos(); 
        fecharOpcoes(); 
        setAlertModal({ isOpen: false }); 
    } else {
        toast.error('Erro ao marcar falta');
    }
  }

  const handleLogout = async () => {
    setAcaoConfirmacao(() => async () => { await supabase.auth.signOut(); window.location.reload() })
    setAlertModal({ isOpen: true, type: 'confirm', title: 'Sair?', message: 'Você terá que fazer login novamente.' })
  }
  const mudarDia = (d) => { const n = new Date(dataAtual); n.setDate(n.getDate() + d); setDataAtual(n) }
  const handleModalConfirm = () => { if (acaoConfirmacao) acaoConfirmacao() }
  const abrirSuporte = () => { window.open(`https://wa.me/5516996097901?text=${encodeURIComponent("Oi, preciso de ajuda!")}`, '_blank') }

  return (
    <div style={{ paddingBottom: '100px' }}>
      <Modal isOpen={alertModal.isOpen} onClose={() => setAlertModal({...alertModal, isOpen: false})} type={alertModal.type} title={alertModal.title} message={alertModal.message} onConfirm={handleModalConfirm} />

      {/* MODAL DE PAGAMENTO */}
      {pagamentoModalOpen && (
        <div style={overlayStyle}>
            <div style={modalBoxStyle}>
                <h3 style={{textAlign:'center', marginTop:0}}>Pagamento</h3>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginTop:'20px'}}>
                    <button onClick={() => confirmarPagamento('PIX')} style={btnPagamento}>💠 PIX</button>
                    <button onClick={() => confirmarPagamento('DINHEIRO')} style={btnPagamento}>💵 Dinheiro</button>
                    <button onClick={() => confirmarPagamento('CARTAO')} style={btnPagamento}>💳 Cartão</button>
                    <button onClick={() => confirmarPagamento('MENSALIDADE')} style={{...btnPagamento, background:'#fee2e2', color:'#dc2626'}}>Mensalidade</button>
                </div>
                <button onClick={() => setPagamentoModalOpen(false)} style={{width:'100%', padding:'15px', marginTop:'15px', background:'white', border:'1px solid #ccc', borderRadius:'8px'}}>Cancelar</button>
            </div>
        </div>
      )}

      {/* MODAL DE GERENCIAMENTO (Editar/Faltou/Excluir) */}
      {editModalOpen && agendamentoSelecionado && (
        <div style={overlayStyle} onClick={(e) => { if(e.target === e.currentTarget) fecharOpcoes() }}>
          <div style={modalBoxStyle}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'20px'}}>
              <h3>Gerenciar</h3>
              <button onClick={fecharOpcoes} style={{background:'none', border:'none'}}><X size={24}/></button>
            </div>
            <p><strong>{agendamentoSelecionado.clients?.name}</strong></p>
            
            <div style={{background:'#eff6ff', padding:'15px', borderRadius:'8px', margin:'15px 0'}}>
              <label style={{fontWeight:'bold', color:'#1e40af', display:'flex', gap:'5px', marginBottom:'5px'}}><Clock size={18}/> Remarcar:</label>
              <input type="datetime-local" value={novaDataHora} onChange={e => setNovaDataHora(e.target.value)} style={{width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid #ccc'}} />
              <button onClick={salvarNovaData} style={{...btnFull, background:'#2563eb', marginTop:'10px'}}>Salvar Data</button>
            </div>
            
            <div style={{ display:'flex', gap:'10px', marginTop:'15px' }}>
                <button onClick={() => { setAcaoConfirmacao(() => marcarFalta); setAlertModal({isOpen:true, type:'confirm', title:'Registrar Falta?', message:'Isso conta negativamente para a cliente.'}) }} style={{ flex: 1, padding:'12px', borderRadius:'8px', border:'none', background:'#fef2f2', color:'#b91c1c', fontWeight:'bold', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'5px' }}>
                    <AlertTriangle size={18}/> Faltou
                </button>
                <button onClick={() => { setAcaoConfirmacao(() => deletarAgendamento); setAlertModal({isOpen:true, type:'confirm', title:'Excluir?', message:'Tem certeza?'}) }} style={{ flex: 1, padding:'12px', borderRadius:'8px', border:'1px solid #dc2626', background:'white', color:'#dc2626', fontWeight:'bold', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'5px' }}>
                    <Trash2 size={18}/> Excluir
                </button>
            </div>
          </div>
        </div>
      )}

      {/* CABEÇALHO */}
      <div className="header-safe-area" style={{ background: 'white', padding: '10px 20px 15px 20px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div id="menu-gestao" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Link to="/clientes" style={btnNavStyle} title="Clientes"><User size={22} color="#000" /></Link>
            <Link to="/servicos" style={btnNavStyle} title="Serviços"><Scissors size={22} color="#000" /></Link>
          </div>
          <div id="menu-financeiro" style={{ display: 'flex', gap: '10px' }}>
            <Link id="menu-config" to="/configuracoes" style={{...btnNavStyle, borderColor: '#64748b', color: '#64748b', background: '#f8fafc'}} title="Configurações"><Settings size={22} /></Link>
            <Link to="/financeiro" style={{...btnNavStyle, borderColor: '#16a34a', color: '#16a34a', background: '#f0fdf4'}} title="Financeiro"><DollarSign size={22} /></Link>
          </div>
        </div>
        <div id="nav-datas" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
          <button onClick={() => mudarDia(-1)} style={{...btnNavStyle, width: '40px', height: '40px'}}><ChevronLeft size={24} color="#000" /></button>
          <div style={{ textAlign: 'center', minWidth: '160px' }}>
            <span style={{ display: 'block', fontSize: '11px', color: '#666', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>VISUALIZANDO</span>
            <h2 style={{ margin: 0, fontSize: '18px', color: '#000', textTransform: 'capitalize', lineHeight: '1.2' }}>{dataFormatada}</h2>
          </div>
          <button onClick={() => mudarDia(1)} style={{...btnNavStyle, width: '40px', height: '40px'}}><ChevronRight size={24} color="#000" /></button>
        </div>
      </div>

      {/* LISTA */}
      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
        {loading ? <p style={{textAlign:'center', marginTop:'40px'}}>Carregando...</p> : 
         agendamentos.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: '60px' }}>
            <Calendar size={64} color="#999" />
            <h3>Agenda Livre</h3>
            <Link id="btn-novo" to="/novo" style={{ background: '#2563eb', color: 'white', padding: '15px 30px', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold' }}>Marcar Cliente</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {agendamentos.map(item => (
              <CardAgendamento 
                key={item.id} 
                agendamento={item} 
                onToggle={() => handleToggleClick(item)} 
                onOpenOptions={() => abrirOpcoes(item)}
                onTutorial={() => iniciarTutorialCard(item)} 
              />
            ))}
          </div>
        )}

        <div style={{textAlign: 'center', marginTop: '40px', marginBottom: '80px', color: '#999', fontSize: '14px'}}>
          <p style={{margin: '5px 0'}}>Os botões de interrogção mostram informações importantes</p>
          <button onClick={abrirSuporte} style={{background: 'none', border: 'none', color: '#2563eb', textDecoration: 'underline', cursor: 'pointer', fontSize: '14px', padding: '10px'}}>Precisa de suporte técnico? Clique aqui.</button>
        </div>
      </div>

      {/* BOTOES FIXOS */}
      <button id="btn-tutorial" onClick={iniciarTutorialGeral} style={{ position: 'fixed', right: '32px', bottom: 'calc(25px + env(safe-area-inset-bottom) + 80px)', width: '50px', height: '50px', borderRadius: '50%', background: 'white', color: '#d97706', border: '2px solid #d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 20, cursor: 'pointer' }}>
        <HelpCircle size={24} />
      </button>
      <button id='btn-logout' onClick={handleLogout} className="fab-safe-area" style={{ position: 'fixed', left: '25px', bottom: 'unset', width: '50px', height: '50px', borderRadius: '50%', background: '#fee2e2', color: '#dc2626', border: '2px solid #dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 20 }}>
        <LogOut size={24} />
      </button>
      <Link id="btn-novo" to="/novo" className="fab-safe-area" style={{ position: 'fixed', right: '25px', bottom: 'unset', width: '64px', height: '64px', borderRadius: '50%', background: '#2563eb', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 20 }}>
        <Plus size={32} strokeWidth={3} />
      </Link>
    </div>
  )
}

function CardAgendamento({ agendamento, onToggle, onOpenOptions, onTutorial }) {
  const hora = new Date(agendamento.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const isMensalista = agendamento.clients?.type === 'MENSALISTA'
  const isConcluido = agendamento.status === 'CONCLUIDO'
  const isPendente = agendamento.status === 'PENDENTE'
  const isFaltou = agendamento.status === 'FALTOU'

  const aprovarAgendamento = async (e) => {
      e.stopPropagation()
      const { error } = await supabase.from('appointments').update({ status: 'AGENDADO' }).eq('id', agendamento.id)
      if(!error) {
          toast.success('Horário Confirmado!', { icon: '✅' })
          window.location.reload()
      }
  }

  const recusarAgendamento = async (e) => {
      e.stopPropagation()
      if(!window.confirm("Deseja recusar esta solicitação?")) return;
      const { error } = await supabase.from('appointments').delete().eq('id', agendamento.id)
      if(!error) {
          toast('Solicitação recusada', { icon: '🗑️' })
          window.location.reload()
      }
  }
  
  const abrirWhatsapp = (e) => {
    e.stopPropagation() 
    const tel = agendamento.clients?.phone?.replace(/\D/g, '')
    if (!tel) return toast.error("Sem telefone!") 
    const textoBase = isPendente 
        ? `Olá ${agendamento.clients?.name}, vi sua solicitação de horário para às ${hora}. Podemos confirmar?`
        : `Olá ${agendamento.clients?.name}, confirmando seu horário hoje às ${hora}.`
    window.open(`https://wa.me/${tel.startsWith('55')?tel:`55${tel}`}?text=${encodeURIComponent(textoBase)}`, '_blank')
  }

  // --- LAYOUT ESPECIAL PARA PENDENTES (RESTRITO) ---
  if (isPendente) {
      return (
        <div style={{ background: '#fffbeb', borderRadius: '8px', padding: '15px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', border: '1px solid #fcd34d', borderLeft: '8px solid #f59e0b', marginBottom: '10px' }}>
           <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'10px'}}>
               <div>
                   <span style={{background:'#f59e0b', color:'white', fontSize:'10px', fontWeight:'bold', padding:'2px 6px', borderRadius:'4px'}}>NOVA SOLICITAÇÃO</span>
                   <h3 style={{margin:'5px 0 0 0', color:'#b45309'}}>{agendamento.clients?.name}</h3>
                   <span style={{fontSize:'20px', fontWeight:'bold', color:'#000'}}>{hora}</span>
                   <p style={{margin:0, fontSize:'14px', color:'#666'}}>{agendamento.services?.name}</p>
               </div>
               <button onClick={abrirWhatsapp} style={{background:'#25D366', border:'none', borderRadius:'50%', width:'40px', height:'40px', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer'}}>
                   <MessageCircle size={20} color="white" fill="white"/>
               </button>
           </div>
           
           {/* ZONA DE DECISÃO */}
           <div style={{display:'flex', gap:'10px', marginTop:'10px'}}>
               <button onClick={aprovarAgendamento} style={{flex:1, background:'#16a34a', color:'white', border:'none', padding:'10px', borderRadius:'6px', fontWeight:'bold', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'5px'}}>
                   <CheckCircle size={18}/> Aceitar
               </button>
               <button onClick={recusarAgendamento} style={{flex:1, background:'white', color:'#dc2626', border:'1px solid #dc2626', padding:'10px', borderRadius:'6px', fontWeight:'bold', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'5px'}}>
                   <Ban size={18}/> Recusar
               </button>
           </div>
        </div>
      )
  }

  // --- LAYOUT PADRÃO (AGENDADO / CONCLUÍDO / FALTOU) ---
  let borderLeftColor = '#16a34a' 
  if (isMensalista) borderLeftColor = '#7e22ce'
  else if (isFaltou) borderLeftColor = '#ef4444'

  return (
    <div style={{ background: 'white', borderRadius: '8px', padding: '15px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', border: '1px solid #999', borderLeft: `8px solid ${borderLeftColor}`, display: 'flex', alignItems: 'center', opacity: isConcluido ? 0.6 : 1, position: 'relative' }}>
      
      {/* CHECKBOX */}
      <div id={`check-${agendamento.id}`} onClick={(e) => { e.stopPropagation(); onToggle(); }} style={{ marginRight: '15px', padding: '5px', cursor: 'pointer' }}>
        {isConcluido ? <CheckSquare size={34} color="#16a34a" fill="#dcfce7" /> : <Square size={34} color="#666" />}
      </div>

      <div style={{ paddingRight: '15px', borderRight: '2px solid #eee', marginRight: '15px', minWidth: '60px', textAlign: 'center' }}>
        <span style={{ fontSize: '22px', fontWeight: 'bold' }}>{hora}</span>
      </div>
      
      {/* CONTEÚDO */}
      <div id={`card-content-${agendamento.id}`} onClick={onOpenOptions} style={{ flex: 1, cursor: 'pointer' }}>
        <h3 style={{ margin: '0 0 5px 0', fontSize: '18px', textDecoration: isConcluido ? 'line-through' : 'none' }}>
            {agendamento.clients?.name}
            {isFaltou && <span style={{fontSize:'10px', background:'#ef4444', color:'white', padding:'2px 6px', borderRadius:'4px', marginLeft:'5px', verticalAlign:'middle'}}>FALTOU</span>}
        </h3>
        <p style={{ margin: 0, color: '#333' }}>{agendamento.services?.name}</p>
        <div style={{ marginTop: '10px', display: 'flex', gap:'5px', alignItems:'center' }}>
            <span style={{background: isMensalista ? '#f3e8ff' : '#dcfce7', color: isMensalista ? '#581c87' : '#14532d', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px'}}>
                {isMensalista ? 'MENSAL' : `R$ ${agendamento.agreed_price}`}
            </span>
            {isConcluido && agendamento.payment_method && (
                <span style={{fontSize:'12px', color:'#666', border:'1px solid #ccc', padding:'3px 6px', borderRadius:'4px'}}>{agendamento.payment_method}</span>
            )}
        </div>
      </div>
      
      {/* BOTÕES LATERAIS */}
      <div style={{display:'flex', gap:'5px'}}>
        <button onClick={(e) => { e.stopPropagation(); onTutorial(); }} style={{ background: '#fef3c7', border: '1px solid #d97706', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <HelpCircle size={20} color="#d97706" />
        </button>
        <button id={`zap-${agendamento.id}`} onClick={abrirWhatsapp} style={{ background: '#25D366', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><MessageCircle size={20} color="white" fill="white" /></button>
      </div>
    </div>
  )
}

const btnNavStyle = { background: '#f0f0f0', border: '1px solid #999', borderRadius: '8px', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '40px', minHeight: '40px' }
const btnFull = { width:'100%', padding:'15px', borderRadius:'8px', border:'none', color:'white', fontWeight:'bold', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }
const btnPagamento = { padding:'15px', borderRadius:'8px', border:'1px solid #2563eb', background:'#eff6ff', color:'#2563eb', fontWeight:'bold', cursor:'pointer' }
const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }
const modalBoxStyle = { background: 'white', width: '100%', maxWidth: '600px', borderRadius: '20px 20px 0 0', padding: '25px', animation: 'slideUp 0.3s ease-out' }