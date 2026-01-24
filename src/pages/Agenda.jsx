// src/pages/Agenda.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { ChevronLeft, ChevronRight, Calendar, User, Plus, Scissors, DollarSign, CheckSquare, Square, MessageCircle } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Agenda() {
  const [dataAtual, setDataAtual] = useState(new Date())
  const [agendamentos, setAgendamentos] = useState([])
  const [loading, setLoading] = useState(true)

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

    // Trazemos o campo 'phone' da tabela clients agora
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

  async function toggleStatus(id, currentStatus) {
    const novoStatus = currentStatus === 'CONCLUIDO' ? 'AGENDADO' : 'CONCLUIDO'
    const { error } = await supabase
      .from('appointments')
      .update({ status: novoStatus })
      .eq('id', id)

    if (error) {
      alert('Erro ao atualizar status')
    } else {
      setAgendamentos(prev => prev.map(item => 
        item.id === id ? { ...item, status: novoStatus } : item
      ))
    }
  }

  const mudarDia = (dias) => {
    const novaData = new Date(dataAtual)
    novaData.setDate(novaData.getDate() + dias)
    setDataAtual(novaData)
  }

  return (
    <div style={{ paddingBottom: '100px' }}>
      
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
              <CardAgendamento key={item.id} agendamento={item} onToggle={() => toggleStatus(item.id, item.status)} />
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

function CardAgendamento({ agendamento, onToggle }) {
  const hora = new Date(agendamento.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const isMensalista = agendamento.clients?.type === 'MENSALISTA'
  const isConcluido = agendamento.status === 'CONCLUIDO'
  
  // Cores visuais
  const opacity = isConcluido ? 0.6 : 1 
  const iconCheck = isConcluido ? <CheckSquare size={34} color="#16a34a" fill="#dcfce7" /> : <Square size={34} color="#666" />
  const bordaLateral = isMensalista ? '#7e22ce' : '#16a34a'
  const tagBg = isMensalista ? '#f3e8ff' : '#dcfce7'
  const tagColor = isMensalista ? '#581c87' : '#14532d'

  // --- FUNÇÃO DO WHATSAPP ---
  const abrirWhatsapp = (e) => {
    e.stopPropagation() // Evita que clique no card inteiro se tiver outra ação
    
    const telefone = agendamento.clients?.phone
    const nome = agendamento.clients?.name
    const servico = agendamento.services?.name

    if (!telefone) return alert("Cliente sem telefone cadastrado!")

    // 1. Limpa o telefone (deixa só números)
    const cleanPhone = telefone.replace(/\D/g, '')
    
    // 2. Garante o código do país (Brasil = 55)
    // Se o número não começar com 55 e tiver 10 ou 11 digitos, adiciona.
    const finalPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`

    // 3. Monta a mensagem
    const mensagem = `Olá ${nome}, passando para confirmar seu horário hoje às ${hora}. Tudo certo?`
    
    // 4. Abre link
    const url = `https://wa.me/${finalPhone}?text=${encodeURIComponent(mensagem)}`
    window.open(url, '_blank')
  }

  return (
    <div style={{ 
      background: 'white', borderRadius: '8px', padding: '15px', 
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)', border: '1px solid #999',
      borderLeft: `8px solid ${bordaLateral}`, display: 'flex', alignItems: 'center',
      opacity: opacity, transition: 'all 0.3s ease', position: 'relative'
    }}>
      
      {/* 1. Checkbox de Conclusão */}
      <div onClick={onToggle} style={{ cursor: 'pointer', marginRight: '15px' }}>
        {iconCheck}
      </div>

      {/* 2. Hora */}
      <div style={{ paddingRight: '15px', borderRight: '2px solid #eee', marginRight: '15px', minWidth: '60px', textAlign: 'center' }}>
        <span style={{ fontSize: '22px', fontWeight: 'bold', color: '#000' }}>{hora}</span>
      </div>

      {/* 3. Informações */}
      <div style={{ flex: 1 }}>
        <h3 style={{ margin: '0 0 5px 0', fontSize: '18px', color: '#000', textDecoration: isConcluido ? 'line-through' : 'none' }}>
          {agendamento.clients?.name}
        </h3>
        <p style={{ margin: 0, color: '#333', fontSize: '16px' }}>{agendamento.services?.name}</p>
        
        <div style={{ marginTop: '10px', display: 'inline-block', background: tagBg, color: tagColor, padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px', border: `1px solid ${bordaLateral}` }}>
          {isMensalista ? 'PACOTE MENSAL' : `R$ ${agendamento.agreed_price}`}
        </div>
      </div>

      {/* 4. Botão WhatsApp (NOVO) */}
      <button 
        onClick={abrirWhatsapp}
        style={{
          background: '#25D366', // Verde oficial do Zap
          border: 'none',
          borderRadius: '50%',
          width: '45px',
          height: '45px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          marginLeft: '10px',
          boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
        }}
        title="Enviar mensagem no WhatsApp"
      >
        <MessageCircle size={24} color="white" fill="white" />
      </button>

    </div>
  )
}

const btnNavStyle = { background: '#f0f0f0', border: '1px solid #999', borderRadius: '8px', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '40px', minHeight: '40px' }