// src/pages/AgendamentoPublico.jsx
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Clock, User, Scissors, Phone, Send, CheckCircle, Lock, Calendar } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import {
  fetchPublicAgenda,
  generateAvailableSlots,
  validateBookingSlot,
  getServiceDuration,
} from '../utils/scheduling'
import { toDateInputValue } from '../utils/dates'

export default function AgendamentoPublico() {
  const { userId } = useParams()

  const [etapa, setEtapa] = useState(1)
  const [loading, setLoading] = useState(false)
  const [agendaAberta, setAgendaAberta] = useState(null)

  const [servicos, setServicos] = useState([])
  const [manicurePhone, setManicurePhone] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [codigoValidacao, setCodigoValidacao] = useState('')

  const [nome, setNome] = useState('')
  const [phone, setPhone] = useState('')
  const [servicoId, setServicoId] = useState('')
  const [data, setData] = useState('')
  const [horaSelecionada, setHoraSelecionada] = useState('')
  const [cupomCodigo, setCupomCodigo] = useState('')
  const [slotsDisponiveis, setSlotsDisponiveis] = useState([])
  const [carregandoSlots, setCarregandoSlots] = useState(false)
  const [esperaEnviada, setEsperaEnviada] = useState(false)

  useEffect(() => {
    async function init() {
      try {
        const agenda = await fetchPublicAgenda(supabase, userId, new Date())
        const perfil = agenda.profile

        if (!agenda.ok || perfil?.booking_active === false) {
          setAgendaAberta(false)
          return
        }

        setAgendaAberta(true)
        setManicurePhone(perfil?.whatsapp || '')
        setBusinessName(perfil?.business_name || 'Manicure')
        setServicos(agenda.services || [])
        setCodigoValidacao(Math.floor(1000 + Math.random() * 9000).toString())
      } catch (err) {
        console.error(err)
        setAgendaAberta(false)
      }
    }
    init()
  }, [userId])

  useEffect(() => {
    if (!data || !servicoId || !userId) {
      setSlotsDisponiveis([])
      setHoraSelecionada('')
      return
    }

    async function loadSlots() {
      setCarregandoSlots(true)
      const servico = servicos.find(s => s.id == servicoId)
      const durationMinutes = getServiceDuration(servico)
      const dateObj = new Date(`${data}T12:00:00`)

      const ctx = await fetchPublicAgenda(supabase, userId, dateObj)
      const slots = generateAvailableSlots({
        date: dateObj,
        durationMinutes,
        businessHours: ctx.businessHours,
        appointments: ctx.appointments,
        blockedSlots: ctx.blockedSlots,
      })

      setSlotsDisponiveis(slots)
      setHoraSelecionada('')
      setCarregandoSlots(false)
    }

    loadSlots()
  }, [data, servicoId, userId, servicos])

  const handlePhone = (e) => {
    let v = e.target.value.replace(/\D/g, '').slice(0, 11)
    if (v.length > 2) v = `(${v.slice(0, 2)}) ${v.slice(2)}`
    if (v.length > 9) v = `${v.slice(0, 10)}-${v.slice(10)}`
    setPhone(v)
  }

  async function avancarParaValidacao(e) {
    e.preventDefault()
    if (!nome || !phone || !servicoId || !data || !horaSelecionada) return toast.error('Preencha tudo e escolha um horário')
    if (phone.length < 14) return toast.error('WhatsApp inválido')

    setLoading(true)

    const ctx = await fetchPublicAgenda(supabase, userId, new Date(horaSelecionada))
    if (!ctx.ok || ctx.profile?.booking_active === false) {
      setLoading(false)
      setAgendaAberta(false)
      return toast.error('A agenda acabou de ser fechada pela profissional.')
    }

    const servico = servicos.find(s => s.id == servicoId)
    const startTime = new Date(horaSelecionada)
    const validation = validateBookingSlot({
      startTime,
      durationMinutes: getServiceDuration(servico),
      businessHours: ctx.businessHours,
      appointments: ctx.appointments,
      blockedSlots: ctx.blockedSlots,
    })

    if (!validation.valid) {
      setLoading(false)
      return toast.error(validation.reason)
    }

    if (cupomCodigo) {
      const { data: cupom } = await supabase.rpc('validar_cupom', { p_user_id: userId, p_code: cupomCodigo })
      if (!cupom?.valid) {
        setLoading(false)
        return toast.error(cupom?.reason || 'Cupom inválido')
      }
    }

    const { data: result, error } = await supabase.rpc('criar_agendamento_publico', {
      p_user_id: userId,
      p_service_id: servicoId,
      p_start_time: startTime.toISOString(),
      p_client_name: nome,
      p_phone: phone,
      p_coupon_code: cupomCodigo || null,
    })

    if (error || !result?.ok) {
      setLoading(false)
      return toast.error(result?.reason || 'Erro ao agendar. Confira se a migration 004 foi aplicada no Supabase.')
    }

    setLoading(false)
    setEtapa(2)
  }

  function abrirWhatsAppPedido() {
    const dataFinal = new Date(horaSelecionada)
    const wa = String(manicurePhone).replace(/\D/g, '')
    const horaLabel = dataFinal.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const msg = `Olá, sou *${nome}*! Solicitei um horário pelo site.\n📅 *${dataFinal.toLocaleDateString('pt-BR')} às ${horaLabel}*\nCódigo: *${codigoValidacao}*`
    if (wa) window.open(`https://wa.me/55${wa}?text=${encodeURIComponent(msg)}`, '_blank')
    setEtapa(3)
  }

  async function entrarEspera() {
    if (!nome || phone.length < 14) return toast.error('Preencha nome e WhatsApp')
    const { data: result, error } = await supabase.rpc('entrar_lista_espera', {
      p_user_id: userId,
      p_name: nome,
      p_phone: phone,
      p_service_id: servicoId || null,
      p_preferred_date: data || null,
      p_note: null,
    })
    if (error || !result?.ok) return toast.error(result?.reason || 'Não foi possível entrar na espera. Peça para a manicure rodar o SQL 009.')
    setEsperaEnviada(true)
    toast.success('Você entrou na lista de espera!')
  }

  const minDate = toDateInputValue()

  if (agendaAberta === null) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>Carregando agenda...</div>
  }

  if (agendaAberta === false) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'sans-serif' }}>
        <div style={{ background: 'white', padding: '40px', borderRadius: '16px', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', maxWidth: '400px' }}>
          <div style={{ background: '#fee2e2', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Lock size={40} color="#dc2626" />
          </div>
          <h2 style={{ color: '#991b1b', margin: '0 0 10px 0' }}>Agenda Fechada</h2>
          <p style={{ color: '#666', lineHeight: '1.5' }}>No momento não estamos recebendo novos agendamentos pelo site.</p>
        </div>
      </div>
    )
  }

  if (etapa === 3) {
    return (
      <div style={{ textAlign: 'center', padding: '50px 20px', fontFamily: 'sans-serif' }}>
        <CheckCircle size={80} color="#16a34a" style={{ margin: '0 auto' }} />
        <h1 style={{ color: '#16a34a' }}>Solicitação Enviada!</h1>
        <p>Aguarde a confirmação no WhatsApp.</p>
      </div>
    )
  }

  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh', padding: '20px', fontFamily: 'sans-serif' }}>
      <Toaster position="top-center" />
      <div style={{ maxWidth: '500px', margin: '0 auto', background: 'white', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        <div style={{ background: '#2563eb', padding: '20px', color: 'white', textAlign: 'center' }}>
          <h2 style={{ margin: 0 }}>Agendar com {businessName}</h2>
        </div>

        {etapa === 1 ? (
          <form onSubmit={avancarParaValidacao} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div><label style={lbl}><User size={16} /> Seu Nome</label><input required value={nome} onChange={e => setNome(e.target.value)} style={inp} placeholder="Nome Completo" /></div>
            <div><label style={lbl}><Phone size={16} /> Seu WhatsApp</label><input required value={phone} onChange={handlePhone} style={inp} placeholder="(00) 00000-0000" inputMode="numeric" /></div>
            <div><label style={lbl}><Scissors size={16} /> Serviço</label>
              <select required value={servicoId} onChange={e => setServicoId(e.target.value)} style={inp}>
                <option value="">Selecione...</option>
                {servicos.map(s => (
                  <option key={s.id} value={s.id}>{s.name} - R$ {s.default_price} ({getServiceDuration(s)} min)</option>
                ))}
              </select>
            </div>
            <div>
              <label style={lbl}><Calendar size={16} /> Data</label>
              <input required type="date" min={minDate} value={data} onChange={e => setData(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Cupom (opcional)</label>
              <input placeholder="Código promocional" value={cupomCodigo} onChange={e => setCupomCodigo(e.target.value.toUpperCase())} style={inp} />
            </div>
            {data && servicoId && (
              <div>
                <label style={lbl}><Clock size={16} /> Horários disponíveis</label>
                {carregandoSlots ? (
                  <p style={{ color: '#64748b', fontSize: '14px' }}>Carregando horários...</p>
                ) : slotsDisponiveis.length === 0 ? (
                  <div>
                    <p style={{ color: '#dc2626', fontSize: '14px' }}>Nenhum horário livre nesta data. No painel da manicure, em Configurações, esse dia precisa estar aberto com horário de expediente.</p>
                    {esperaEnviada ? (
                      <p style={{ color: '#16a34a', fontSize: '14px' }}>Você já está na lista de espera. A manicure avisa no WhatsApp.</p>
                    ) : (
                      <button type="button" onClick={entrarEspera} style={{ ...btn, background: '#0f172a', fontSize: '15px' }}>Entrar na lista de espera</button>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    {slotsDisponiveis.map(slot => (
                      <button
                        key={slot.value}
                        type="button"
                        onClick={() => setHoraSelecionada(slot.value)}
                        style={{
                          padding: '10px 6px', borderRadius: '8px', border: horaSelecionada === slot.value ? '2px solid #2563eb' : '1px solid #cbd5e1',
                          background: horaSelecionada === slot.value ? '#eff6ff' : 'white',
                          color: '#1e293b', fontWeight: horaSelecionada === slot.value ? 'bold' : 'normal', cursor: 'pointer', fontSize: '14px',
                        }}
                      >
                        {slot.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button type="submit" disabled={loading || !horaSelecionada} style={{ ...btn, opacity: loading || !horaSelecionada ? 0.6 : 1 }}>
              {loading ? 'Verificando...' : 'Continuar'}
            </button>
          </form>
        ) : (
          <div style={{ padding: '30px 20px', textAlign: 'center' }}>
            <h3 style={{ color: '#b45309' }}>Quase lá!</h3>
            <p style={{ color: '#666', marginBottom: '30px' }}>Envie o código abaixo para a manicure no WhatsApp.</p>
            <div style={{ background: '#fef3c7', padding: '15px', borderRadius: '8px', fontSize: '24px', fontWeight: 'bold', letterSpacing: '5px', color: '#d97706', marginBottom: '30px' }}>{codigoValidacao}</div>
            <button onClick={abrirWhatsAppPedido} style={{ ...btn, background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', margin: '0 auto' }}>
              <Send size={20} /> Avisar no WhatsApp
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const lbl = { display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', marginBottom: '5px', color: '#333' }
const inp = { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '16px', boxSizing: 'border-box' }
const btn = { width: '100%', padding: '15px', borderRadius: '8px', border: 'none', background: '#2563eb', color: 'white', fontWeight: 'bold', fontSize: '18px', cursor: 'pointer' }
