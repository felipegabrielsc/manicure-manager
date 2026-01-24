// src/pages/Agenda.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { ChevronLeft, ChevronRight, Calendar, User, Plus, Scissors, DollarSign, CheckSquare, Square, MessageCircle, Trash2, Clock, X, LogOut } from 'lucide-react'
import { Link } from 'react-router-dom'
import Modal from '../components/Modal' 

export default function Agenda() {
  const [dataAtual, setDataAtual] = useState(new Date())
  const [agendamentos, setAgendamentos] = useState([])
  const [loading, setLoading] = useState(true)

  // ESTADOS DO MODAL DE EDIÇÃO
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [agendamentoSelecionado, setAgendamentoSelecionado] = useState(null)
  const [novaDataHora, setNovaDataHora] = useState('')

  // ESTADOS DO MODAL GENÉRICO
  const [alertModal, setAlertModal] = useState({ isOpen: false, type: 'info', title: '', message: '' })
  const [acaoConfirmacao, setAcaoConfirmacao] = useState(null)

  const dataFormatada = new Intl.DateTimeFormat('pt-BR', { 
    weekday: 'long', day: '2-digit', month: 'long' 
  }).format(dataAtual)

  useEffect(() => {
    buscarAgendamentos()
  }, [dataAtual])

  async function buscarAgendamentos() {
    setLoading(true)
    const inicioDia = new Date(dataAtual)
    inicioDia.setHours(0, 0, 0, 0)
    const fimDia = new Date(dataAtual)
    fimDia.setHours(23, 59, 59, 999)

    const { data, error } = await supabase
      .from('appointments')
      .select(`*, clients (name, type, phone), services (name)`) 
      .gte('start_time', inicioDia.toISOString())
      .lte('start_time', fimDia.toISOString())
      .order('start_time', { ascending: true })

    if (error) console.error(error)
    else setAgendamentos(data || [])
    setLoading(false)
  }

  // --- FUNÇÃO DE SUPORTE (NOVO) ---
  const abrirSuporte = () => {
    // COLOQUE SEU NÚMERO AQUI (com DDD 55)
    const seuNumero = "5516996097901" 
    const msg = "Oi Felipe, preciso de ajuda com o App da Manicure."
    window.open(`https://wa.me/${seuNumero}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  // --- FUNÇÃO DE LOGOUT ---
  const handleLogout = async () => {
    setAcaoConfirmacao(() => async () => {
      await supabase.auth.signOut()
      window.location.reload() 
    })
    setAlertModal({
      isOpen: true, type: 'confirm', title: 'Sair do Sistema?',
      message: 'Você terá que fazer login novamente para acessar.'
    })
  }

  // --- AÇÕES DO USUÁRIO ---
  const abrirOpcoes = (agendamento) => {
    setAgendamentoSelecionado(agendamento)
    const dataLocal = new Date(agendamento.start_time)
    dataLocal.setMinutes(dataLocal.getMinutes() - dataLocal.getTimezoneOffset())
    setNovaDataHora(dataLocal.toISOString().slice(0, 16))
    setEditModalOpen(true)
  }

  const fecharOpcoes = () => {
    setEditModalOpen(false)
    setAgendamentoSelecionado(null)
  }

  const pedirConfirmacaoExclusao = () => {
    setAcaoConfirmacao(() => deletarAgendamento)
    setAlertModal({
      isOpen: true, type: 'confirm', title: 'Cancelar Agendamento?',
      message: 'Tem certeza? Se o serviço já foi pago, ele sairá do financeiro.'
    })
  }

  const deletarAgendamento = async () => {
    if (!agendamentoSelecionado) return
    const { error } = await supabase.from('appointments').delete().eq('id', agendamentoSelecionado.id)
    if (!error) {
      buscarAgendamentos()
      fecharOpcoes()
      setAlertModal({ isOpen: false })
    } else {
      alert('Erro ao deletar')
    }
  }

  const salvarNovaData = async () => {
    if (!agendamentoSelecionado || !novaDataHora) return
    const { error } = await supabase.from('appointments').update({ start_time: new Date(novaDataHora).toISOString() }).eq('id', agendamentoSelecionado.id)
    if (!error) {
      buscarAgendamentos()
      fecharOpcoes()
    } else {
      alert('Erro ao remarcar')
    }
  }

  async function toggleStatus(id, currentStatus) {
    const novoStatus = currentStatus === 'CONCLUIDO' ? 'AGENDADO' : 'CONCLUIDO'
    const { error } = await supabase.from('appointments').update({ status: novoStatus }).eq('id', id)
    if (!error) {
      setAgendamentos(prev => prev.map(item => item.id === id ? { ...item, status: novoStatus } : item))
    }
  }

  const mudarDia = (dias) => {
    const novaData = new Date(dataAtual); novaData.setDate(novaData.getDate() + dias); setDataAtual(novaData)
  }

  const handleModalConfirm = () => { if (acaoConfirmacao) acaoConfirmacao() }

  return (
    <div style={{ paddingBottom: '100px' }}>
      
      <Modal isOpen={alertModal.isOpen} onClose={() => setAlertModal({...alertModal, isOpen: false})} type={alertModal.type} title={alertModal.title} message={alertModal.message} onConfirm={handleModalConfirm} />

      {/* MODAL DE EDIÇÃO */}
      {editModalOpen && agendamentoSelecionado && (
        <div style={overlayStyle} onClick={(e) => { if(e.target === e.currentTarget) fecharOpcoes() }}>
          <div style={modalBoxStyle}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
              <h3 style={{margin:0, color:'#000'}}>Gerenciar Agendamento</h3>
              <button onClick={fecharOpcoes} style={{background:'none', border:'none', cursor:'pointer'}}><X size={24} /></button>
            </div>
            <div style={{marginBottom:'20px'}}>
              <p style={{margin:0, fontSize:'14px', color:'#666'}}>Cliente</p>
              <strong style={{fontSize:'18px', color:'#000'}}>{agendamentoSelecionado.clients?.name}</strong>
              <p style={{margin:'5px 0 0 0', fontSize:'14px', color:'#666'}}>{agendamentoSelecionado.services?.name}</p>
            </div>
            <div style={{background:'#eff6ff', padding:'15px', borderRadius:'8px', marginBottom:'15px'}}>
              <label style={{display:'flex', alignItems:'center', gap:'5px', fontWeight:'bold', color:'#1e40af', marginBottom:'10px'}}>
                <Clock size={18} /> Remarcar para:
              </label>
              <input type="datetime-local" value={novaDataHora} onChange={e => setNovaDataHora(e.target.value)} style={{...inputStyle, width:'100%'}} />
              <button onClick={salvarNovaData} style={{...btnFull, background:'#2563eb', marginTop:'10px'}}>Salvar Nova Data</button>
            </div>
            <button onClick={pedirConfirmacaoExclusao} style={{...btnFull, background:'#fff', border:'1px solid #dc2626', color:'#dc2626'}}>
              <Trash2 size={18} style={{marginRight:'8px'}} /> Cancelar/Excluir
            </button>
          </div>
        </div>
      )}

      {/* CABEÇALHO MOBILE (2 LINHAS) */}
      <div 
        className="header-safe-area" 
        style={{ 
          background: 'white', 
          padding: '10px 20px 15px 20px',
          position: 'sticky', 
          top: 0, 
          zIndex: 10, 
          boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
          display: 'flex',
          flexDirection: 'column', 
          gap: '10px' 
        }}
      >
        {/* LINHA 1 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '15px' }}>
            <Link to="/clientes" style={btnNavStyle}><User size={22} color="#000" /></Link>
            <Link to="/servicos" style={btnNavStyle}><Scissors size={22} color="#000" /></Link>
          </div>
          <Link to="/financeiro" style={{...btnNavStyle, borderColor: '#16a34a', color: '#16a34a', background: '#f0fdf4'}}>
            <DollarSign size={22} />
          </Link>
        </div>

        {/* LINHA 2 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
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
          <div style={{ textAlign: 'center', marginTop: '60px', padding: '20px' }}>
            <Calendar size={64} color="#999" style={{ marginBottom: '20px' }} />
            <h3 style={{ color: '#000' }}>Agenda Livre</h3>
            <Link to="/novo" style={{ display: 'inline-block', background: '#2563eb', color: 'white', padding: '15px 30px', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold' }}>Marcar Cliente</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {agendamentos.map(item => (
              <CardAgendamento key={item.id} agendamento={item} onToggle={() => toggleStatus(item.id, item.status)} onOpenOptions={() => abrirOpcoes(item)} />
            ))}
          </div>
        )}

        {/* --- RODAPÉ DE SUPORTE (NOVO) --- */}
        <div style={{textAlign: 'center', marginTop: '40px', marginBottom: '80px', color: '#999', fontSize: '12px'}}>
          <p style={{margin: '5px 0'}}>Desenvolvido por Felipe Gabriel Sgobi</p>
          <button 
            onClick={abrirSuporte}
            style={{background: 'none', border: 'none', color: '#2563eb', textDecoration: 'underline', cursor: 'pointer', fontSize: '12px', padding: '10px'}}
          >
            Precisa de ajuda? Clique aqui e Fale comigo.
          </button>
        </div>
      </div>

      {/* BOTÃO FLUTUANTE DE LOGOUT (ESQUERDA) */}
      <button 
        onClick={handleLogout}
        className="fab-safe-area"
        style={{ 
          position: 'fixed', left: '25px', bottom: 'unset', 
          width: '50px', height: '50px', borderRadius: '50%', 
          background: '#fee2e2', color: '#dc2626', border: '2px solid #dc2626',
          display: 'flex', alignItems: 'center', justifyContent: 'center', 
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 20, cursor: 'pointer' 
        }}
      >
        <LogOut size={24} />
      </button>

      {/* BOTÃO FLUTUANTE NOVO AGENDAMENTO (DIREITA) */}
      <Link to="/novo" className="fab-safe-area" style={{ 
        position: 'fixed', right: '25px', bottom: 'unset', 
        width: '64px', height: '64px', borderRadius: '50%', 
        background: '#2563eb', color: 'white', 
        display: 'flex', alignItems: 'center', justifyContent: 'center', 
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 20 
      }}>
        <Plus size={32} strokeWidth={3} />
      </Link>
    </div>
  )
}

function CardAgendamento({ agendamento, onToggle, onOpenOptions }) {
  const hora = new Date(agendamento.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const isMensalista = agendamento.clients?.type === 'MENSALISTA'
  const isConcluido = agendamento.status === 'CONCLUIDO'
  
  const opacity = isConcluido ? 0.6 : 1 
  const iconCheck = isConcluido ? <CheckSquare size={34} color="#16a34a" fill="#dcfce7" /> : <Square size={34} color="#666" />
  const bordaLateral = isMensalista ? '#7e22ce' : '#16a34a'
  const tagBg = isMensalista ? '#f3e8ff' : '#dcfce7'
  const tagColor = isMensalista ? '#581c87' : '#14532d'

  const abrirWhatsapp = (e) => {
    e.stopPropagation() 
    const telefone = agendamento.clients?.phone
    const nome = agendamento.clients?.name
    const servico = agendamento.services?.name

    if (!telefone) return alert("Cliente sem telefone cadastrado!")
    const cleanPhone = telefone.replace(/\D/g, '')
    const finalPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`
    const mensagem = `Olá ${nome}, passando para confirmar seu horário hoje às ${hora}. Tudo certo?`
    window.open(`https://wa.me/${finalPhone}?text=${encodeURIComponent(mensagem)}`, '_blank')
  }

  return (
    <div onClick={onOpenOptions} style={{ background: 'white', borderRadius: '8px', padding: '15px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', border: '1px solid #999', borderLeft: `8px solid ${bordaLateral}`, display: 'flex', alignItems: 'center', opacity: opacity, transition: 'all 0.3s ease', position: 'relative', cursor: 'pointer' }}>
      <div onClick={(e) => { e.stopPropagation(); onToggle(); }} style={{ cursor: 'pointer', marginRight: '15px', padding: '5px' }}>{iconCheck}</div>
      <div style={{ paddingRight: '15px', borderRight: '2px solid #eee', marginRight: '15px', minWidth: '60px', textAlign: 'center' }}><span style={{ fontSize: '22px', fontWeight: 'bold', color: '#000' }}>{hora}</span></div>
      <div style={{ flex: 1 }}>
        <h3 style={{ margin: '0 0 5px 0', fontSize: '18px', color: '#000', textDecoration: isConcluido ? 'line-through' : 'none' }}>{agendamento.clients?.name}</h3>
        <p style={{ margin: 0, color: '#333', fontSize: '16px' }}>{agendamento.services?.name}</p>
        <div style={{ marginTop: '10px', display: 'inline-block', background: tagBg, color: tagColor, padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px', border: `1px solid ${bordaLateral}` }}>{isMensalista ? 'PACOTE MENSAL' : `R$ ${agendamento.agreed_price}`}</div>
      </div>
      <button onClick={abrirWhatsapp} style={{ background: '#25D366', border: 'none', borderRadius: '50%', width: '45px', height: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginLeft: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}><MessageCircle size={24} color="white" fill="white" /></button>
    </div>
  )
}

const btnNavStyle = { background: '#f0f0f0', border: '1px solid #999', borderRadius: '8px', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '40px', minHeight: '40px' }
const inputStyle = { padding: '12px', borderRadius: '8px', border: '1px solid #999', fontSize: '16px', background: 'white' }
const btnFull = { width:'100%', padding:'15px', borderRadius:'8px', border:'none', color:'white', fontWeight:'bold', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }
const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }
const modalBoxStyle = { background: 'white', width: '100%', maxWidth: '600px', borderRadius: '20px 20px 0 0', padding: '25px', animation: 'slideUp 0.3s ease-out' }