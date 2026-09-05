// src/pages/ResumoAgendamento.jsx
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Calendar, Clock, MapPin, CheckCircle, Share2 } from 'lucide-react'

export default function ResumoAgendamento() {
  const { id } = useParams()
  const [agendamento, setAgendamento] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAgendamento() {
      const { data, error } = await supabase
        .from('appointments')
        .select(`*, clients (name, phone), services (name, default_price, duration_minutes)`)
        .eq('id', id)
        .single()
      
      if (error) console.error(error)
      else setAgendamento(data)
      setLoading(false)
    }
    fetchAgendamento()
  }, [id])

  if (loading) return <div style={{padding:'40px', textAlign:'center'}}>Carregando seu convite...</div>
  if (!agendamento) return <div style={{padding:'40px', textAlign:'center'}}>Agendamento não encontrado.</div>

  const dataObj = new Date(agendamento.start_time)
  const dataLegivel = dataObj.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  const horaLegivel = dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  // Função para Gerar Link do Google Agenda
  const gerarLinkGoogleCalendar = () => {
    const inicio = dataObj.toISOString().replace(/-|:|\.\d\d\d/g, "") // Formato YYYYMMDDTHHMMSSZ
    const duracao = agendamento.services?.duration_minutes ?? 60
    const fimObj = new Date(dataObj.getTime() + duracao * 60 * 1000)
    const fim = fimObj.toISOString().replace(/-|:|\.\d\d\d/g, "")
    
    const titulo = encodeURIComponent(`Manicure: ${agendamento.services?.name}`)
    const detalhes = encodeURIComponent(`Agendamento com Agenda Manicure. Serviço: ${agendamento.services?.name}`)
    
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${titulo}&dates=${inicio}/${fim}&details=${detalhes}`
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'sans-serif' }}>
      
      <div style={{ background: 'white', width: '100%', maxWidth: '400px', borderRadius: '24px', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', overflow: 'hidden', position: 'relative' }}>
        
        {/* Topo Decorativo */}
        <div style={{ background: '#2563eb', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CheckCircle size={64} color="white" style={{ opacity: 0.8 }} />
        </div>

        <div style={{ padding: '0 30px 30px 30px', marginTop: '-40px' }}>
          {/* Card Principal */}
          <div style={{ background: 'white', borderRadius: '16px', padding: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', textAlign: 'center' }}>
            <small style={{ textTransform: 'uppercase', color: '#666', fontSize: '12px', letterSpacing: '1px', fontWeight: 'bold' }}>Agendamento Confirmado</small>
            <h2 style={{ margin: '10px 0', fontSize: '24px', color: '#1f2937' }}>{agendamento.clients?.name}</h2>
            <div style={{ background: '#eff6ff', color: '#2563eb', padding: '5px 15px', borderRadius: '20px', display: 'inline-block', fontWeight: 'bold', fontSize: '14px' }}>
              {agendamento.services?.name}
            </div>
          </div>

          {/* Detalhes */}
          <div style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <div style={{ background: '#f3f4f6', padding: '12px', borderRadius: '12px' }}><Calendar size={24} color="#4b5563"/></div>
              <div>
                <span style={{ display: 'block', fontSize: '12px', color: '#9ca3af' }}>DATA</span>
                <strong style={{ color: '#374151', textTransform: 'capitalize' }}>{dataLegivel}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <div style={{ background: '#f3f4f6', padding: '12px', borderRadius: '12px' }}><Clock size={24} color="#4b5563"/></div>
              <div>
                <span style={{ display: 'block', fontSize: '12px', color: '#9ca3af' }}>HORÁRIO</span>
                <strong style={{ color: '#374151' }}>{horaLegivel}</strong>
              </div>
            </div>

            {/* Valor (Opcional, se não for mensalista mostra) */}
            {agendamento.agreed_price > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '12px' }}><Share2 size={24} color="#16a34a"/></div>
                <div>
                  <span style={{ display: 'block', fontSize: '12px', color: '#9ca3af' }}>VALOR</span>
                  <strong style={{ color: '#16a34a' }}>R$ {agendamento.agreed_price.toFixed(2)}</strong>
                </div>
              </div>
            )}

          </div>

          {/* Botão Google Agenda */}
          <a 
            href={gerarLinkGoogleCalendar()} 
            target="_blank" 
            rel="noreferrer"
            style={{ 
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
              background: '#2563eb', color: 'white', textDecoration: 'none', 
              padding: '16px', borderRadius: '16px', fontWeight: 'bold', marginTop: '30px',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
            }}
          >
            <Calendar size={20} /> Adicionar à Agenda
          </a>
          
          <p style={{textAlign: 'center', fontSize: '12px', color: '#999', marginTop: '15px'}}>
            Tire um print desta tela para não esquecer!
          </p>

        </div>
      </div>
    </div>
  )
}