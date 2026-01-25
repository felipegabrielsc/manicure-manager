// src/pages/Configuracoes.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { ArrowLeft, Copy, Save, Clock, Globe, User, Lock, Unlock, Loader2, HelpCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'

// 1. IMPORTAÇÃO DO TUTORIAL
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

export default function Configuracoes() {
  const [userId, setUserId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [savingLock, setSavingLock] = useState(false)
  
  // Dados do Perfil
  const [nomeNegocio, setNomeNegocio] = useState('')
  const [meuWhatsapp, setMeuWhatsapp] = useState('')
  const [agendamentoAtivo, setAgendamentoAtivo] = useState(true) 

  const [horarios, setHorarios] = useState([])
  const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

  useEffect(() => { carregarDados() }, [])

  // --- 2. CONFIGURAÇÃO DO TUTORIAL ---
  const iniciarTutorial = () => {
    const driverObj = driver({
      showProgress: true, nextBtnText: 'Próximo', prevBtnText: 'Anterior', doneBtnText: 'Entendi!',
      steps: [
        { 
            element: '#card-perfil', 
            popover: { title: 'Seus Dados', description: 'Aqui você define o nome do seu negócio e o WhatsApp onde receberá as confirmações de agendamento.' } 
        },
        { 
            element: '#card-link', 
            popover: { title: 'Link & Bloqueio', description: 'Copie este link para enviar às clientes. Use o botão "Bloquear" se for sair de férias ou a agenda estiver cheia.' } 
        },
        { 
            element: '#card-horarios', 
            popover: { title: 'Horários de Atendimento', description: 'Defina a hora que abre e fecha. Desmarque a caixinha lateral para dizer que NÃO atende naquele dia (folga).' } 
        },
        { 
            element: '#btn-salvar-geral', 
            popover: { title: 'Salvar Tudo', description: 'Sempre que mudar seus dados ou horários, clique aqui para gravar.' } 
        }
      ]
    });
    driverObj.drive();
  }

  async function carregarDados() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    // 1. Carregar Perfil
    const { data: perfil } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    
    if (perfil) {
        setNomeNegocio(perfil.business_name || '')
        setMeuWhatsapp(perfil.whatsapp || '')
        setAgendamentoAtivo(perfil.booking_active === false ? false : true)
    } else {
        await supabase.from('profiles').insert({ id: user.id, booking_active: true })
    }

    // 2. Carregar Horários
    const { data: existingHours } = await supabase.from('business_hours').select('*').eq('user_id', user.id).order('day_of_week')
    
    let hoursMap = []
    for (let i = 0; i < 7; i++) {
        const found = existingHours?.find(h => h.day_of_week === i)
        if (found) hoursMap.push(found)
        else hoursMap.push({ day_of_week: i, open_time: '09:00', close_time: '18:00', is_closed: i === 0, user_id: user.id })
    }
    setHorarios(hoursMap)
    setLoading(false)
  }

  const toggleBloqueio = async () => {
      if (!userId) return;
      const novoEstado = !agendamentoAtivo; 
      setAgendamentoAtivo(novoEstado); 
      setSavingLock(true);

      const { error } = await supabase.from('profiles').update({ booking_active: novoEstado }).eq('id', userId)
      setSavingLock(false);

      if (error) {
          setAgendamentoAtivo(!novoEstado); 
          toast.error("Erro ao salvar bloqueio.");
      } else {
          if(novoEstado === false) toast('Agenda Bloqueada!', { icon: '🔒' });
          else toast.success('Agenda Liberada!');
      }
  }

  const updateHorario = (index, field, value) => {
    const newHorarios = [...horarios]
    newHorarios[index][field] = value
    setHorarios(newHorarios)
  }

  const handlePhoneChange = (e) => {
    let v = e.target.value.replace(/\D/g, '').slice(0, 11)
    if (v.length > 2) v = `(${v.slice(0,2)}) ${v.slice(2)}`
    if (v.length > 9) v = `${v.slice(0,10)}-${v.slice(10)}`
    setMeuWhatsapp(v)
  }

  async function salvarDadosGerais() {
    const user = (await supabase.auth.getUser()).data.user

    const { error: errPerfil } = await supabase.from('profiles').upsert({
        id: user.id,
        business_name: nomeNegocio,
        whatsapp: meuWhatsapp.replace(/\D/g, ''),
        booking_active: agendamentoAtivo 
    })

    const dadosHorarios = horarios.map(({ id, ...rest }) => rest)
    const { error: errHorario } = await supabase.from('business_hours').upsert(dadosHorarios, { onConflict: 'user_id, day_of_week' })

    if (errPerfil || errHorario) toast.error('Erro ao salvar dados')
    else toast.success('Dados atualizados!')
  }

  const copiarLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/agendar/${userId}`)
    toast.success('Link copiado!')
  }

  if (loading) return <div style={{padding:'20px'}}>Carregando...</div>

  return (
    <div style={{ paddingBottom: '100px', background: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ background: 'white', padding: '15px 20px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '15px' }}>
        <Link to="/" style={{ color: '#000' }}><ArrowLeft size={28} /></Link>
        <h2 style={{ margin: 0, fontSize: '20px', color: '#000' }}>Configurações</h2>
      </div>

      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
        
        {/* CARD PERFIL */}
        <div id="card-perfil" style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #ddd', marginBottom: '20px' }}>
            <h3 style={{ marginTop: 0, color: '#2563eb', display:'flex', alignItems:'center', gap:'10px' }}><User size={20}/> Seus Dados</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div>
                    <label style={{fontSize:'12px', fontWeight:'bold'}}>Nome do Negócio</label>
                    <input placeholder="Ex: Carla Manicure" value={nomeNegocio} onChange={e => setNomeNegocio(e.target.value)} style={inputStyle} />
                </div>
                <div>
                    <label style={{fontSize:'12px', fontWeight:'bold'}}>Seu WhatsApp</label>
                    <input placeholder="(00) 00000-0000" value={meuWhatsapp} onChange={handlePhoneChange} style={inputStyle} />
                </div>
            </div>
        </div>

        {/* CARD LINK & TRAVA */}
        <div id="card-link" style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #ddd', marginBottom: '20px' }}>
            <h3 style={{ marginTop: 0, color: '#2563eb', display:'flex', alignItems:'center', gap:'10px' }}><Globe size={20}/> Agendamento Online</h3>
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <input readOnly value={`${window.location.origin}/agendar/${userId}`} style={{ flex: 1, background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '10px', borderRadius: '8px', color: '#666' }} />
                <button onClick={copiarLink} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '0 15px', cursor: 'pointer' }}><Copy size={20} /></button>
            </div>

            {/* BOTÃO DE BLOQUEIO AUTOMÁTICO */}
            <div style={{ background: agendamentoAtivo ? '#dcfce7' : '#fee2e2', padding: '15px', borderRadius: '8px', border: `1px solid ${agendamentoAtivo ? '#86efac' : '#fca5a5'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <strong style={{ color: agendamentoAtivo ? '#166534' : '#991b1b', display: 'block' }}>
                        {agendamentoAtivo ? 'Agenda Aberta' : 'Agenda Bloqueada'}
                    </strong>
                    <span style={{ fontSize: '12px', color: agendamentoAtivo ? '#166534' : '#991b1b' }}>
                        {agendamentoAtivo ? 'Clientes podem agendar.' : 'Ninguém consegue marcar.'}
                    </span>
                </div>
                
                <button 
                    onClick={toggleBloqueio}
                    disabled={savingLock}
                    style={{
                        background: agendamentoAtivo ? 'white' : '#ef4444',
                        color: agendamentoAtivo ? '#166534' : 'white',
                        border: agendamentoAtivo ? '1px solid #166534' : 'none',
                        padding: '8px 15px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px', opacity: savingLock ? 0.7 : 1
                    }}
                >
                    {savingLock ? <Loader2 size={14} className="spin" /> : (agendamentoAtivo ? <><Unlock size={14}/> Bloquear</> : <><Lock size={14}/> Liberar</>)}
                </button>
            </div>
        </div>

        {/* CARD HORÁRIOS */}
        <div id="card-horarios" style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #ddd' }}>
            <h3 style={{ marginTop: 0, color: '#16a34a', display:'flex', alignItems:'center', gap:'10px' }}><Clock size={20}/> Horários</h3>
            {horarios.map((h, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #eee' }}>
                    <span style={{width:'80px', fontWeight:'bold'}}>{diasSemana[h.day_of_week]}</span>
                    {h.is_closed ? <span style={{color:'red', fontSize:'12px'}}>FECHADO</span> : (
                        <div style={{display:'flex', gap:'5px'}}>
                            <input type="time" value={h.open_time} onChange={e => updateHorario(i, 'open_time', e.target.value)} style={inputTimeStyle} />
                            -
                            <input type="time" value={h.close_time} onChange={e => updateHorario(i, 'close_time', e.target.value)} style={inputTimeStyle} />
                        </div>
                    )}
                    <input type="checkbox" checked={!h.is_closed} onChange={e => updateHorario(i, 'is_closed', !e.target.checked)} />
                </div>
            ))}
            <button id="btn-salvar-geral" onClick={salvarDadosGerais} style={{ width: '100%', marginTop: '20px', padding: '15px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'10px' }}>
                <Save size={20}/> Salvar Dados & Horários
            </button>
        </div>

        {/* BOTÃO FLUTUANTE TUTORIAL */}
        <button id="btn-tutorial" onClick={iniciarTutorial} style={{ position: 'fixed', right: '20px', bottom: '20px', width: '50px', height: '50px', borderRadius: '50%', background: 'white', color: '#d97706', border: '2px solid #d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 20, cursor: 'pointer' }}>
            <HelpCircle size={24} />
        </button>

        <style>{`
          .spin { animation: spin 1s linear infinite; }
          @keyframes spin { 100% { transform: rotate(360deg); } }
        `}</style>

      </div>
    </div>
  )
}

const inputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc', marginTop: '5px', boxSizing:'border-box' }
const inputTimeStyle = { border: '1px solid #ccc', borderRadius: '4px', padding: '2px', color: '#333' }