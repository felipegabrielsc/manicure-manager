// src/pages/AgendamentoPublico.jsx
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Calendar, Clock, User, Scissors, Phone, Send, CheckCircle, Lock } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'

export default function AgendamentoPublico() {
  const { userId } = useParams()
  
  const [etapa, setEtapa] = useState(1) 
  const [loading, setLoading] = useState(false)
  
  // ESTADO INICIAL: NULL (Significa "Não sei ainda", então não mostra nada)
  const [agendaAberta, setAgendaAberta] = useState(null) 

  // Dados do Sistema
  const [servicos, setServicos] = useState([])
  const [manicurePhone, setManicurePhone] = useState('')
  const [codigoValidacao, setCodigoValidacao] = useState('')

  // Form
  const [nome, setNome] = useState('')
  const [phone, setPhone] = useState('')
  const [servicoId, setServicoId] = useState('')
  const [data, setData] = useState('')
  const [hora, setHora] = useState('')

  useEffect(() => {
    async function init() {
        try {
            // 1. VERIFICAÇÃO DE SEGURANÇA (TRAVA)
            const { data: perfil, error } = await supabase
                .from('profiles')
                .select('whatsapp, booking_active')
                .eq('id', userId)
                .single()
            
            // Se der erro ou booking_active for explicitamente false, BLOQUEIA
            if (error || (perfil && perfil.booking_active === false)) {
                setAgendaAberta(false)
                return // Para tudo aqui.
            }

            // Se chegou aqui, está aberto
            setAgendaAberta(true)
            setManicurePhone(perfil?.whatsapp || '')

            // 2. CARREGA SERVIÇOS
            const { data: s } = await supabase.from('services').select('*').eq('user_id', userId)
            setServicos(s || [])
            setCodigoValidacao(Math.floor(1000 + Math.random() * 9000).toString())

        } catch (err) {
            console.error(err)
            setAgendaAberta(false) // Na dúvida, bloqueia
        }
    }
    init()
  }, [userId])

  const handlePhone = (e) => {
    let v = e.target.value.replace(/\D/g,'').slice(0,11)
    if(v.length>2) v = `(${v.slice(0,2)}) ${v.slice(2)}`
    if(v.length>9) v = `${v.slice(0,10)}-${v.slice(10)}`
    setPhone(v)
  }

  // --- ETAPA 1: VALIDAR REGRAS ---
  async function avancarParaValidacao(e) {
    e.preventDefault()
    if (!nome || !phone || !servicoId || !data || !hora) return toast.error('Preencha tudo')
    if (phone.length < 14) return toast.error('WhatsApp inválido')

    setLoading(true)
    
    // --- BLINDAGEM EXTRA: CHECA A TRAVA DE NOVO ---
    // Vai que a manicure bloqueou enquanto a cliente preenchia o form?
    const { data: perfilCheck } = await supabase.from('profiles').select('booking_active').eq('id', userId).single()
    if (perfilCheck && perfilCheck.booking_active === false) {
        setLoading(false)
        setAgendaAberta(false) // Derruba a cliente para a tela de bloqueio
        return toast.error("A agenda acabou de ser fechada pela profissional.")
    }

    // VERIFICAR DISPONIBILIDADE (SPAM/LISTA NEGRA)
    try {
        const { data: check, error: rpcError } = await supabase.rpc('verificar_disponibilidade', { telefone_cliente: phone })
        
        if (rpcError) { console.error(rpcError); throw new Error('Erro conexão'); }

        if (check && !check.pode_agendar) {
            setLoading(false)
            return toast.error(check.motivo === 'BANIDO' ? 'Contate a manicure.' : 'Você já tem um agendamento pendente.')
        }

        setLoading(false)
        setEtapa(2)
    } catch (err) {
        setLoading(false)
        toast.error('Erro ao verificar.')
    }
  }

  // --- ETAPA 2: FINALIZAR ---
  async function finalizarAgendamento() {
    setLoading(true)
    const dataFinal = new Date(`${data}T${hora}:00`)
    const preco = servicos.find(s => s.id == servicoId)?.default_price

    let clienteId = null
    const phoneClean = phone.replace(/\D/g, '')
    const { data: cliExistente } = await supabase.from('clients').select('id').eq('user_id', userId).ilike('phone', `%${phoneClean}%`).maybeSingle()
    if (cliExistente) clienteId = cliExistente.id
    else {
        const { data: novo } = await supabase.from('clients').insert({ name: nome, phone: phone, type: 'AVULSO', user_id: userId }).select().single()
        clienteId = novo?.id
    }

    const { error } = await supabase.from('appointments').insert({
        client_id: clienteId,
        service_id: servicoId,
        start_time: dataFinal.toISOString(),
        agreed_price: preco,
        status: 'PENDENTE',
        user_id: userId
    })

    if (error) { toast.error('Erro'); setLoading(false); }
    else {
        const msg = `Olá, sou *${nome}*! Solicitei um horário pelo site.\n📅 *${new Date(dataFinal).toLocaleDateString('pt-BR')} às ${hora}*\nCódigo: *${codigoValidacao}*`
        const link = `https://wa.me/55${manicurePhone}?text=${encodeURIComponent(msg)}`
        window.open(link, '_blank')
        setEtapa(3)
    }
  }

  // 1. TELA DE CARREGAMENTO (Enquanto decide se abre ou fecha)
  if (agendaAberta === null) return (
      <div style={{minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', color:'#666'}}>
          Carregando agenda...
      </div>
  )

  // 2. TELA DE BLOQUEIO
  if (agendaAberta === false) return (
    <div style={{ minHeight:'100vh', background:'#f8fafc', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', fontFamily:'sans-serif' }}>
        <div style={{ background:'white', padding:'40px', borderRadius:'16px', textAlign:'center', boxShadow:'0 4px 20px rgba(0,0,0,0.05)', maxWidth:'400px' }}>
            <div style={{background:'#fee2e2', width:'80px', height:'80px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px'}}>
                <Lock size={40} color="#dc2626"/>
            </div>
            <h2 style={{color:'#991b1b', margin:'0 0 10px 0'}}>Agenda Fechada</h2>
            <p style={{color:'#666', lineHeight:'1.5'}}>
                No momento não estamos recebendo novos agendamentos pelo site. Por favor, entre em contato diretamente pelo WhatsApp.
            </p>
        </div>
    </div>
  )

  // 3. TELA DE SUCESSO
  if (etapa === 3) return (
    <div style={{ textAlign: 'center', padding: '50px 20px', fontFamily: 'sans-serif' }}>
        <CheckCircle size={80} color="#16a34a" style={{margin:'0 auto'}}/>
        <h1 style={{color:'#16a34a'}}>Solicitação Enviada!</h1>
        <p>Aguarde a confirmação no WhatsApp.</p>
    </div>
  )

  // 4. FORMULÁRIO (Só aparece se agendaAberta === true)
  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh', padding: '20px', fontFamily: 'sans-serif' }}>
      <Toaster position="top-center" />
      <div style={{ maxWidth: '500px', margin: '0 auto', background: 'white', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        <div style={{ background: '#2563eb', padding: '20px', color: 'white', textAlign: 'center' }}>
            <h2 style={{ margin: 0 }}>Agendar Horário</h2>
        </div>

        {etapa === 1 ? (
            <form onSubmit={avancarParaValidacao} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div><label style={lbl}><User size={16}/> Seu Nome</label><input required value={nome} onChange={e => setNome(e.target.value)} style={inp} placeholder="Nome Completo"/></div>
                <div><label style={lbl}><Phone size={16}/> Seu WhatsApp</label><input required value={phone} onChange={handlePhone} style={inp} placeholder="(00) 00000-0000" inputMode="numeric"/></div>
                <div><label style={lbl}><Scissors size={16}/> Serviço</label>
                    <select required value={servicoId} onChange={e => setServicoId(e.target.value)} style={inp}>
                        <option value="">Selecione...</option>
                        {servicos.map(s => <option key={s.id} value={s.id}>{s.name} - R$ {s.default_price}</option>)}
                    </select>
                </div>
                <div><label style={lbl}><Clock size={16}/> Data e Hora</label>
                    <div style={{display:'flex', gap:'10px'}}>
                        <input required type="date" value={data} onChange={e => setData(e.target.value)} style={inp} />
                        <input required type="time" value={hora} onChange={e => setHora(e.target.value)} style={inp} />
                    </div>
                </div>
                <button type="submit" disabled={loading} style={btn}>{loading ? 'Verificando...' : 'Continuar'}</button>
            </form>
        ) : (
            <div style={{ padding: '30px 20px', textAlign: 'center' }}>
                <h3 style={{ color: '#b45309' }}>Quase lá!</h3>
                <p style={{ color: '#666', marginBottom: '30px' }}>Para confirmar que este número é seu, envie o código abaixo para a manicure.</p>
                <div style={{ background: '#fef3c7', padding: '15px', borderRadius: '8px', fontSize: '24px', fontWeight: 'bold', letterSpacing: '5px', color: '#d97706', marginBottom: '30px' }}>{codigoValidacao}</div>
                <button onClick={finalizarAgendamento} style={{ ...btn, background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                    <Send size={20}/> Confirmar no WhatsApp
                </button>
            </div>
        )}
      </div>
    </div>
  )
}

const lbl = { display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', marginBottom: '5px', color: '#333' }
const inp = { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '16px', boxSizing:'border-box' }
const btn = { width: '100%', padding: '15px', borderRadius: '8px', border: 'none', background: '#2563eb', color: 'white', fontWeight: 'bold', fontSize: '18px', cursor: 'pointer' }