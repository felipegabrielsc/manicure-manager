// src/pages/Configuracoes.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { ArrowLeft, Copy, Save, Clock, Globe, User, Lock, Unlock, Loader2, HelpCircle, Bell, Ban, Trash2, ExternalLink, Smartphone } from 'lucide-react'
import { subscribeToPush, unsubscribePush, requestNotificationPermission } from '../utils/notifications'
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
  const [bio, setBio] = useState('')
  const [endereco, setEndereco] = useState('')
  const [instagram, setInstagram] = useState('')
  const [perfilPublicoAtivo, setPerfilPublicoAtivo] = useState(true)
  const [lembretesAtivos, setLembretesAtivos] = useState(true)
  const [horasLembrete, setHorasLembrete] = useState(24)
  const [pushAtivo, setPushAtivo] = useState(false)
  const [agendamentoAtivo, setAgendamentoAtivo] = useState(null)
  const [horarios, setHorarios] = useState([])
  const [bloqueios, setBloqueios] = useState([])
  const [bloqueioData, setBloqueioData] = useState('')
  const [bloqueioInicio, setBloqueioInicio] = useState('')
  const [bloqueioFim, setBloqueioFim] = useState('')
  const [bloqueioMotivo, setBloqueioMotivo] = useState('')
  
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
        setBio(perfil.bio || '')
        setEndereco(perfil.address || '')
        setInstagram(perfil.instagram || '')
        setPerfilPublicoAtivo(perfil.public_profile_active !== false)
        setLembretesAtivos(perfil.reminders_enabled !== false)
        setHorasLembrete(perfil.reminder_hours_before ?? 24)
        setPushAtivo(perfil.push_enabled === true)
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

    const { data: slots } = await supabase
      .from('blocked_slots')
      .select('*')
      .eq('user_id', user.id)
      .gte('start_time', new Date().toISOString())
      .order('start_time')

    setBloqueios(slots || [])
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
        id: user.id,
        business_name: nomeNegocio,
        whatsapp: meuWhatsapp.replace(/\D/g, ''),
        bio,
        address: endereco,
        instagram: instagram.replace('@', ''),
        public_profile_active: perfilPublicoAtivo,
        reminders_enabled: lembretesAtivos,
        reminder_hours_before: parseInt(horasLembrete, 10) || 24,
        booking_active: agendamentoAtivo,
    })
    const dadosHorarios = horarios.map(({ day_of_week, open_time, close_time, is_closed, user_id }) => ({
      day_of_week, open_time, close_time, is_closed, user_id,
    }))
    const { error: errHorario } = await supabase.from('business_hours').upsert(dadosHorarios, { onConflict: 'user_id, day_of_week' })
    if (errPerfil || errHorario) toast.error('Erro ao salvar')
    else toast.success('Dados atualizados!')
  }

  async function togglePush() {
    if (!userId) return
    if (pushAtivo) {
      await unsubscribePush(userId)
      setPushAtivo(false)
      toast('Notificações desativadas')
    } else {
      const ok = await subscribeToPush(userId)
      if (ok) {
        setPushAtivo(true)
        toast.success('Notificações ativadas!')
      } else {
        const perm = await requestNotificationPermission()
        if (perm === 'denied') toast.error('Permissão negada nas configurações do navegador')
        else toast.error('Não foi possível ativar. Instale o app (PWA) e tente novamente.')
      }
    }
  }

  const copiarLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/agendar/${userId}`)
    toast.success('Link de agendamento copiado!')
  }

  const copiarLinkPerfil = () => {
    navigator.clipboard.writeText(`${window.location.origin}/perfil/${userId}`)
    toast.success('Link do perfil copiado!')
  }

  async function adicionarBloqueio() {
    if (!bloqueioData || !bloqueioInicio || !bloqueioFim) return toast.error('Preencha data e horários.')
    const start = new Date(`${bloqueioData}T${bloqueioInicio}:00`)
    const end = new Date(`${bloqueioData}T${bloqueioFim}:00`)
    if (end <= start) return toast.error('Horário final deve ser depois do inicial.')

    const { error } = await supabase.from('blocked_slots').insert({
      user_id: userId,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      reason: bloqueioMotivo || null,
    })

    if (error) {
      toast.error('Erro ao bloquear. Execute a migration SQL se ainda não fez.')
    } else {
      toast.success('Horário bloqueado!')
      setBloqueioData('')
      setBloqueioInicio('')
      setBloqueioFim('')
      setBloqueioMotivo('')
      carregarDados()
    }
  }

  async function removerBloqueio(id) {
    const { error } = await supabase.from('blocked_slots').delete().eq('id', id)
    if (error) toast.error('Erro ao remover bloqueio')
    else {
      toast.success('Bloqueio removido')
      setBloqueios(prev => prev.filter(b => b.id !== id))
    }
  }

  if (loading) return <div style={{padding:'20px'}}>Carregando...</div>

  return (
    <div style={{ paddingBottom: '100px', background: '#f8fafc', minHeight: '100%', overflowX: 'hidden' }}>
      
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
        .input-time { padding: 5px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }

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

      <div className="page-inner" style={{ padding: '20px' }}>
        
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
                <div>
                    <label style={{fontSize:'12px', fontWeight:'bold'}}>Sobre o negócio (bio)</label>
                    <textarea placeholder="Ex: Especialista em alongamento..." value={bio} onChange={e => setBio(e.target.value)} rows={3} style={{...inputStyle, resize:'vertical'}} />
                </div>
                <div>
                    <label style={{fontSize:'12px', fontWeight:'bold'}}>Endereço</label>
                    <input placeholder="Rua, bairro, cidade" value={endereco} onChange={e => setEndereco(e.target.value)} style={inputStyle} />
                </div>
                <div>
                    <label style={{fontSize:'12px', fontWeight:'bold'}}>Instagram</label>
                    <input placeholder="@seuinstagram" value={instagram} onChange={e => setInstagram(e.target.value)} style={inputStyle} />
                </div>
            </div>
        </div>

        {/* PERFIL PÚBLICO */}
        <div id="card-perfil-publico" style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #ddd', marginBottom: '20px' }}>
            <h3 style={{ marginTop: 0, color: '#7c3aed', display:'flex', alignItems:'center', gap:'10px' }}><Globe size={20}/> Página Pública</h3>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                <input readOnly value={`${window.location.origin}/perfil/${userId}`} style={{ flex: 1, background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '10px', borderRadius: '8px', color: '#666', minWidth: 0, fontSize:'12px' }} />
                <button onClick={copiarLinkPerfil} style={{ background: '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', padding: '0 15px', cursor: 'pointer' }}><Copy size={20} /></button>
                <a href={`/perfil/${userId}`} target="_blank" rel="noreferrer" style={{ background: '#f3e8ff', color: '#7c3aed', border: 'none', borderRadius: '8px', padding: '0 12px', display:'flex', alignItems:'center' }}><ExternalLink size={18}/></a>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
                <input type="checkbox" checked={perfilPublicoAtivo} onChange={e => setPerfilPublicoAtivo(e.target.checked)} />
                Perfil público visível
            </label>
        </div>

        {/* LEMBRETES */}
        <div id="card-lembretes" style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #ddd', marginBottom: '20px' }}>
            <h3 style={{ marginTop: 0, color: '#d97706', display:'flex', alignItems:'center', gap:'10px' }}><Bell size={20}/> Lembretes</h3>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', marginBottom: '12px', cursor: 'pointer' }}>
                <input type="checkbox" checked={lembretesAtivos} onChange={e => setLembretesAtivos(e.target.checked)} />
                Ativar lembretes na agenda
            </label>
            <div>
                <label style={{fontSize:'12px', fontWeight:'bold'}}>Avisar quantas horas antes?</label>
                <select value={horasLembrete} onChange={e => setHorasLembrete(e.target.value)} style={inputStyle}>
                    <option value="12">12 horas</option>
                    <option value="24">24 horas</option>
                    <option value="48">48 horas</option>
                </select>
            </div>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '10px 0 0' }}>Na agenda, você verá clientes que precisam de lembrete e poderá enviar via WhatsApp.</p>
        </div>

        {/* PUSH NOTIFICATIONS */}
        <div id="card-push" style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #ddd', marginBottom: '20px' }}>
            <h3 style={{ marginTop: 0, color: '#2563eb', display:'flex', alignItems:'center', gap:'10px' }}><Smartphone size={20}/> Notificações Push</h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 12px' }}>Receba alertas de novas solicitações e lembretes mesmo com o app em segundo plano.</p>
            <button onClick={togglePush} style={{
              width: '100%', padding: '14px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer',
              background: pushAtivo ? '#fee2e2' : '#2563eb', color: pushAtivo ? '#dc2626' : 'white',
            }}>
              {pushAtivo ? 'Desativar notificações' : 'Ativar notificações push'}
            </button>
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

        {/* BLOQUEIOS PONTUAIS */}
        <div id="card-bloqueios" style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #ddd', marginBottom: '20px' }}>
            <h3 style={{ marginTop: 0, color: '#dc2626', display:'flex', alignItems:'center', gap:'10px' }}><Ban size={20}/> Bloquear Horários</h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginTop: 0 }}>Bloqueie almoço, folga ou compromissos sem fechar a agenda inteira.</p>
            <div style={{ display: 'grid', gap: '10px', marginBottom: '12px' }}>
                <input type="date" value={bloqueioData} onChange={e => setBloqueioData(e.target.value)} style={inputStyle} />
                <div style={{ display: 'flex', gap: '10px' }}>
                    <input type="time" value={bloqueioInicio} onChange={e => setBloqueioInicio(e.target.value)} style={inputStyle} />
                    <input type="time" value={bloqueioFim} onChange={e => setBloqueioFim(e.target.value)} style={inputStyle} />
                </div>
                <input placeholder="Motivo (opcional)" value={bloqueioMotivo} onChange={e => setBloqueioMotivo(e.target.value)} style={inputStyle} />
                <button type="button" onClick={adicionarBloqueio} style={{ padding: '12px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>+ Adicionar bloqueio</button>
            </div>
            {bloqueios.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {bloqueios.map(b => (
                        <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: '#fef2f2', borderRadius: '8px', fontSize: '13px' }}>
                            <span>
                                {new Date(b.start_time).toLocaleDateString('pt-BR')} · {new Date(b.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} - {new Date(b.end_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                {b.reason && ` · ${b.reason}`}
                            </span>
                            <button onClick={() => removerBloqueio(b.id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}><Trash2 size={16}/></button>
                        </div>
                    ))}
                </div>
            )}
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