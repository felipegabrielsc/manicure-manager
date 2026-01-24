// src/pages/Agenda.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { ChevronLeft, ChevronRight, Calendar, User, Plus, Scissors, DollarSign, CheckSquare, Square, MessageCircle, Trash2, Clock, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import Modal from '../components/Modal' // Reutilizando nosso modal genérico para alertas

export default function Agenda() {
  const [dataAtual, setDataAtual] = useState(new Date())
  const [agendamentos, setAgendamentos] = useState([])
  const [loading, setLoading] = useState(true)

  // ESTADOS DO MODAL DE EDIÇÃO
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [agendamentoSelecionado, setAgendamentoSelecionado] = useState(null)
  const [novaDataHora, setNovaDataHora] = useState('')

  // ESTADOS DO MODAL GENÉRICO (Confirmação)
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

  // --- AÇÕES DO USUÁRIO ---

  const abrirOpcoes = (agendamento) => {
    setAgendamentoSelecionado(agendamento)
    // Prepara a data atual do agendamento para o input (formatando para datetime-local)
    const dataLocal = new Date(agendamento.start_time)
    dataLocal.setMinutes(dataLocal.getMinutes() - dataLocal.getTimezoneOffset())
    setNovaDataHora(dataLocal.toISOString().slice(0, 16))
    
    setEditModalOpen(true)
  }

  const fecharOpcoes = () => {
    setEditModalOpen(false)
    setAgendamentoSelecionado(null)
  }

  // 1. CONFIRMAR EXCLUSÃO
  const pedirConfirmacaoExclusao = () => {
    setAcaoConfirmacao(() => deletarAgendamento) // Guarda a função
    setAlertModal({
      isOpen: true,
      type: 'confirm',
      title: 'Cancelar Agendamento?',
      message: 'Tem certeza? Se o serviço já foi pago, ele sairá do financeiro.'
    })
  }

  const deletarAgendamento = async () => {
    if (!agendamentoSelecionado) return
    const { error } = await supabase.from('appointments').delete().eq('id', agendamentoSelecionado.id)
    
    if (!error) {
      buscarAgendamentos()
      fecharOpcoes()
      setAlertModal({ isOpen: false }) // Fecha o alerta
    } else {
      alert('Erro ao deletar')
    }
  }

  // 2. SALVAR NOVA DATA
  const salvarNovaData = async () => {
    if (!agendamentoSelecionado || !novaDataHora) return

    const { error } = await supabase
      .from('appointments')
      .update({ start_time: new Date(novaDataHora).toISOString() })
      .eq('id', agendamentoSelecionado.id)

    if (!error) {
      buscarAgendamentos()
      fecharOpcoes()
      // Se mudou para outro dia, talvez suma da tela atual, então avisamos
      const novaDateObj = new Date(novaDataHora)
      if (novaDateObj.getDate() !== dataAtual.getDate()) {
        alert(`Agendamento movido para dia ${novaDateObj.toLocaleDateString()}`)
      }
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
    const novaData = new Date(dataAtual)
    novaData.setDate(novaData.getDate() + dias)
    setDataAtual(novaData)
  }

  // Handler para o Modal Genérico
  const handleModalConfirm = () => {
    if (acaoConfirmacao) acaoConfirmacao()
  }

  return (
    <div style={{ paddingBottom: '100px' }}>
      
      {/* MODAL GENÉRICO (Alertas e Confirmações) */}
      <Modal 
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({...alertModal, isOpen: false})}
        type={alertModal.type}
        title={alertModal.title}
        message={alertModal.message}
        onConfirm={handleModalConfirm}
      />

      {/* MODAL DE EDIÇÃO (ESPECÍFICO DESSA TELA) */}
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

            {/* REMARCAR */}
            <div style={{background:'#eff6ff', padding:'15px', borderRadius:'8px', marginBottom:'15px'}}>
              <label style={{display:'flex', alignItems:'center', gap:'5px', fontWeight:'bold', color:'#1e40af', marginBottom:'10px'}}>
                <Clock size={18} /> Remarcar para:
              </label>
              <div style={{display:'flex', gap:'10px'}}>
                <input 
                  type="datetime-local" 
                  value={novaDataHora} 
                  onChange={e => setNovaDataHora(e.target.value)}
                  style={{...inputStyle, flex:1}}
                />
              </div>
              <button onClick={salvarNovaData} style={{...btnFull, background:'#2563eb', marginTop:'10px'}}>
                Salvar Nova Data
              </button>
            </div>

            {/* EXCLUIR */}
            <button onClick={pedirConfirmacaoExclusao} style={{...btnFull, background:'#fff', border:'1px solid #dc2626', color:'#dc2626'}}>
              <Trash2 size={18} style={{marginRight:'8px'}} /> Cancelar/Excluir
            </button>
          </div>
        </div>
      )}

      {/* CABEÇALHO */}
      <div style={{ background: 'white', padding: '15px 20px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Link to="/clientes" style={btnNavStyle}><User size={24} color="#000" /></Link>
          <Link to="/servicos" style={btnNavStyle}><Scissors size={24} color="#000" /></Link>
        </div>
        <div style={{ textAlign: 'center' }}>
          <span style={{ display: 'block', fontSize: '12px', color: '#444', fontWeight: 'bold', textTransform: 'uppercase' }}>Visualizando</span>
          <h2 style={{ margin: 0, fontSize: '16px', color: '#000', textTransform: 'capitalize' }}>{dataFormatada}</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Link to="/financeiro" style={{...btnNavStyle, borderColor: '#16a34a', color: '#16a34a'}}><DollarSign size={24} /></Link>
          <div style={{width: '1px', height: '25px', background: '#ccc', margin: '0 2px'}}></div>
          <button onClick={() => mudarDia(-1)} style={btnNavStyle}><ChevronLeft size={24} color="#000" /></button>
          <button onClick={() => mudarDia(1)} style={btnNavStyle}><ChevronRight size={24} color="#000" /></button>
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
              <CardAgendamento 
                key={item.id} 
                agendamento={item} 
                onToggle={() => toggleStatus(item.id, item.status)}
                onOpenOptions={() => abrirOpcoes(item)} 
              />
            ))}
          </div>
        )}
      </div>

      <Link to="/novo" style={{ position: 'fixed', bottom: '25px', right: '25px', width: '64px', height: '64px', borderRadius: '50%', background: '#2563eb', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 20 }}>
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
    <div 
      onClick={onOpenOptions} // CLIQUE NO CARD ABRE OPÇÕES
      style={{ 
        background: 'white', borderRadius: '8px', padding: '15px', 
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)', border: '1px solid #999',
        borderLeft: `8px solid ${bordaLateral}`, display: 'flex', alignItems: 'center',
        opacity: opacity, transition: 'all 0.3s ease', position: 'relative', cursor: 'pointer'
      }}
    >
      
      {/* Checkbox (PRECISA DE STOP PROPAGATION PARA NÃO ABRIR O MODAL) */}
      <div 
        onClick={(e) => { e.stopPropagation(); onToggle(); }} 
        style={{ cursor: 'pointer', marginRight: '15px', padding: '5px' }}
      >
        {iconCheck}
      </div>

      <div style={{ paddingRight: '15px', borderRight: '2px solid #eee', marginRight: '15px', minWidth: '60px', textAlign: 'center' }}>
        <span style={{ fontSize: '22px', fontWeight: 'bold', color: '#000' }}>{hora}</span>
      </div>

      <div style={{ flex: 1 }}>
        <h3 style={{ margin: '0 0 5px 0', fontSize: '18px', color: '#000', textDecoration: isConcluido ? 'line-through' : 'none' }}>
          {agendamento.clients?.name}
        </h3>
        <p style={{ margin: 0, color: '#333', fontSize: '16px' }}>{agendamento.services?.name}</p>
        
        <div style={{ marginTop: '10px', display: 'inline-block', background: tagBg, color: tagColor, padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px', border: `1px solid ${bordaLateral}` }}>
          {isMensalista ? 'PACOTE MENSAL' : `R$ ${agendamento.agreed_price}`}
        </div>
      </div>

      {/* Botão WhatsApp */}
      <button 
        onClick={abrirWhatsapp}
        style={{
          background: '#25D366', border: 'none', borderRadius: '50%',
          width: '45px', height: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', marginLeft: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
        }}
      >
        <MessageCircle size={24} color="white" fill="white" />
      </button>

    </div>
  )
}

const btnNavStyle = { background: '#f0f0f0', border: '1px solid #999', borderRadius: '8px', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '40px', minHeight: '40px' }
const inputStyle = { padding: '12px', borderRadius: '8px', border: '1px solid #999', fontSize: '16px', background: 'white' }
const btnFull = { width:'100%', padding:'15px', borderRadius:'8px', border:'none', color:'white', fontWeight:'bold', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }

// Estilos do Modal de Edição (Overlay)
const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }
const modalBoxStyle = { background: 'white', width: '100%', maxWidth: '600px', borderRadius: '20px 20px 0 0', padding: '25px', animation: 'slideUp 0.3s ease-out' }