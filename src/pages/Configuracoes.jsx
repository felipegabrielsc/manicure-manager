// src/pages/Configuracoes.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { ArrowLeft, Copy, Save, Clock, Globe, User, Lock, Unlock, Loader2, HelpCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

export default function Configuracoes() {
  const [userId, setUserId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [savingLock, setSavingLock] = useState(false)
  
  const [nomeNegocio, setNomeNegocio] = useState('')
  const [meuWhatsapp, setMeuWhatsapp] = useState('')
  const [agendamentoAtivo, setAgendamentoAtivo] = useState(null) 
  const [horarios, setHorarios] = useState([])
  
  const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

  useEffect(() => { carregarDados() }, [])

  const iniciarTutorial = () => {
    const driverObj = driver({
      showProgress: true, nextBtnText: 'Próximo', prevBtnText: 'Anterior', doneBtnText: 'Entendi!',
      steps: [
        { element: '#card-perfil', popover: { title: 'Seus Dados', description: 'Defina o nome do negócio e o WhatsApp.' } },
        { element: '#card-link', popover: { title: 'Link & Bloqueio', description: 'Copie seu link ou feche a agenda.' } },
        { element: '#card-horarios', popover: { title: 'Horários', description: 'Configure sua disponibilidade.' } },
        { element: '#btn-salvar-geral', popover: { title: 'Salvar', description: 'Clique aqui para gravar as alterações.' } }
      ]
    });
    driverObj.drive();
  }

  async function carregarDados() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const { data: perfil } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (perfil) {
        setNomeNegocio(perfil.business_name || '')
        setMeuWhatsapp(perfil.whatsapp || '')
        setAgendamentoAtivo(perfil.booking_active === false ? false : true)
    } else {
        await supabase.from('profiles').insert({ id: user.id, booking_active: true })
        setAgendamentoAtivo(true)
    }

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
          toast.error("Erro ao salvar.");
      } else {
          toast(novoEstado ? 'Agenda Liberada!' : 'Agenda Bloqueada!', { icon: novoEstado ? '🔓' : '🔒' });
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
        id: user.id, business_name: nomeNegocio, whatsapp: meuWhatsapp.replace(/\D/g, ''), booking_active: agendamentoAtivo 
    })
    const dadosHorarios = horarios.map(({ id, ...rest }) => rest)
    const { error: errHorario } = await supabase.from('business_hours').upsert(dadosHorarios, { onConflict: 'user_id, day_of_week' })
    if (errPerfil || errHorario) toast.error('Erro ao salvar')
    else toast.success('Dados atualizados!')
  }

  const copiarLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/agendar/${userId}`)
    toast.success('Link copiado!')
  }

  if (loading) return <div style={{padding:'20px'}}>Carregando...</div>

  return (
    <div style={{ paddingBottom: '100px', background: '#f8fafc', minHeight: '100vh', overflowX: 'hidden' }}>
      
      {/* CSS RESPONSIVO BLINDADO */}
      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        
        /* Layout Padrão (Desktop/Tablet) */
        .schedule-row {
            display: flex; align-items: center; justify-content: space-between;
            padding: 12px 0; border-bottom: 1px solid #eee;
        }
        .day-label { width: 90px; font-weight: bold; font-size: 14px; }
        .schedule-inputs { display: flex; gap: 5px; align-items: center; }
        .mobile-check-wrapper { display: none; }
        .desktop-check { display: block; }
        .input-time { padding: 5px; border: 1px solid #ccc; borderRadius: 4px; font-size: 14px; }

        /* MODO CELULAR (Ativa em telas menores que 480px - Cobre quase todos os celulares) */
        @media (max-width: 480px) {
            .schedule-row {
                flex-direction: column; /* Empilha tudo */
                align-items: stretch;   /* Estica para ocupar a largura */
                gap: 8px;
                padding: 15px 0;
            }
            .day-label {
                width: 100%;
                display: flex;
                justify-content: space-between; /* Dia na esquerda, Checkbox na direita */
                align-items: center;
                font-size: 16px; /* Fonte maior pra ler melhor */
                margin-bottom: 5px;
            }
            .schedule-inputs {
                width: 100%;
                display: grid;
                grid-template-columns: 1fr auto 1fr; /* Input - Tracinho - Input */
            }
            .input-time {
                width: 100%;
                text-align: center;
                padding: 10px; /* Mais fácil de tocar com o dedo */
                background: #f8fafc;
            }
            .desktop-check { display: none; }
            .mobile-check-wrapper { display: block; }
        }
      `}</style>

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

        {/* CARD LINK */}
        <div id="card-link" style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #ddd', marginBottom: '20px' }}>
            <h3 style={{ marginTop: 0, color: '#2563eb', display:'flex', alignItems:'center', gap:'10px' }}><Globe size={20}/> Agendamento</h3>
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <input readOnly value={`${window.location.origin}/agendar/${userId}`} style={{ flex: 1, background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '10px', borderRadius: '8px', color: '#666', minWidth: 0 }} />
                <button onClick={copiarLink} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '0 15px', cursor: 'pointer' }}><Copy size={20} /></button>
            </div>

            <div style={{ background: agendamentoAtivo ? '#dcfce7' : '#fee2e2', padding: '15px', borderRadius: '8px', border: `1px solid ${agendamentoAtivo ? '#86efac' : '#fca5a5'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <strong style={{ color: agendamentoAtivo ? '#166534' : '#991b1b', display: 'block' }}>{agendamentoAtivo ? 'Agenda Aberta' : 'Bloqueada'}</strong>
                    <span style={{ fontSize: '11px', color: agendamentoAtivo ? '#166534' : '#991b1b' }}>{agendamentoAtivo ? 'Clientes podem agendar.' : 'Ninguém agenda.'}</span>
                </div>
                <button onClick={toggleBloqueio} disabled={savingLock} style={{ background: agendamentoAtivo ? 'white' : '#ef4444', color: agendamentoAtivo ? '#166534' : 'white', border: agendamentoAtivo ? '1px solid #166534' : 'none', padding: '8px 12px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px', opacity: savingLock ? 0.7 : 1 }}>
                    {savingLock ? <Loader2 size={14} className="spin" /> : (agendamentoAtivo ? <><Unlock size={14}/> Bloquear</> : <><Lock size={14}/> Liberar</>)}
                </button>
            </div>
        </div>

        {/* CARD HORÁRIOS RESPONSIVO */}
        <div id="card-horarios" style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #ddd' }}>
            <h3 style={{ marginTop: 0, color: '#16a34a', display:'flex', alignItems:'center', gap:'10px' }}><Clock size={20}/> Horários</h3>
            
            {horarios.map((h, i) => (
                <div key={i} className="schedule-row">
                    {/* Celular: Nome na esquerda, Checkbox na direita (na linha de cima) */}
                    <div className="day-label">
                        <span style={{ color: h.is_closed ? '#94a3b8' : '#334155' }}>{diasSemana[h.day_of_week]}</span>
                        <div className="mobile-check-wrapper">
                            <input type="checkbox" checked={!h.is_closed} onChange={e => updateHorario(i, 'is_closed', !e.target.checked)} style={{transform: 'scale(1.3)'}} />
                        </div>
                    </div>

                    {h.is_closed ? (
                        <span style={{flex:1, textAlign:'left', fontSize:'12px', color:'#ef4444', fontWeight:'bold', paddingLeft:'5px'}}>FECHADO</span>
                    ) : (
                        <div className="schedule-inputs">
                            <input type="time" value={h.open_time} onChange={e => updateHorario(i, 'open_time', e.target.value)} className="input-time" />
                            <span style={{color:'#666'}}>-</span>
                            <input type="time" value={h.close_time} onChange={e => updateHorario(i, 'close_time', e.target.value)} className="input-time" />
                        </div>
                    )}

                    {/* Desktop: Checkbox fica na direita, na mesma linha */}
                    <input className="desktop-check" type="checkbox" checked={!h.is_closed} onChange={e => updateHorario(i, 'is_closed', !e.target.checked)} style={{transform: 'scale(1.2)', cursor:'pointer'}} />
                </div>
            ))}

            <button id="btn-salvar-geral" onClick={salvarDadosGerais} style={{ width: '100%', marginTop: '20px', padding: '15px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'10px' }}>
                <Save size={20}/> Salvar Dados & Horários
            </button>
        </div>

        <button id="btn-tutorial" onClick={iniciarTutorial} style={{ position: 'fixed', right: '20px', bottom: '20px', width: '50px', height: '50px', borderRadius: '50%', background: 'white', color: '#d97706', border: '2px solid #d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 20, cursor: 'pointer' }}>
            <HelpCircle size={24} />
        </button>

      </div>
    </div>
  )
}

const inputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc', marginTop: '5px', boxSizing:'border-box' }