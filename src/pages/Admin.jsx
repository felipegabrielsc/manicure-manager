// src/pages/Admin.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { Link } from 'react-router-dom'
import { Users, Copy, ShieldCheck, ArrowLeft, DollarSign, TrendingUp, Wallet, Lock, Unlock, UserX, Mail, Crown } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSessionProfile } from '../context/SessionProfile'
import { isSiteOwnerId } from '../utils/siteOwner'

export default function Admin() {
  const { profile } = useSessionProfile()
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  
  // Métricas
  const [totalUsers, setTotalUsers] = useState(0)
  const [receitaSetup, setReceitaSetup] = useState(0)
  const [rendaMensal, setRendaMensal] = useState(0)
  
  // Lista de Usuários para Gestão
  const [manicures, setManicures] = useState([])
  const [plans, setPlans] = useState([])
  const [invites, setInvites] = useState([])
  const [gerando, setGerando] = useState(false)
  const [ativas, setAtivas] = useState(0)
  const [trialsSemana, setTrialsSemana] = useState([])
  const [sumidas, setSumidas] = useState([])

  useEffect(() => {
    checkAdmin()
  }, [profile?.is_admin])

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setIsAdmin(false)
      setLoading(false)
      return
    }

    const { data: perfil } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
    const admin = !!(perfil?.is_admin || profile?.is_admin || isSiteOwnerId(user.id))

    if (admin) {
        setIsAdmin(true)
        
        // 2. Busca TODAS as manicures (select * já pega o email agora)
        const { data: lista } = await supabase
            .from('profiles')
            .select('*, subscription_plans(name, price)')
            .eq('is_admin', false) 
            .order('created_at', { ascending: false })

        const { data: planos } = await supabase.from('subscription_plans').select('*').order('sort_order')
        setPlans(planos || [])

        const { data: convites } = await supabase.from('invites').select('*').order('created_at', { ascending: false }).limit(20)
        setInvites(convites || [])
            
        if (lista) {
            setManicures(lista)
            
            const total = lista.length
            setTotalUsers(total)
            const receitaReal = lista.reduce((acc, m) => acc + (m.subscription_plans?.price || 0), 0)
            setReceitaSetup(total * 200)
            setRendaMensal(receitaReal || total * 50)

            const agora = Date.now()
            const seteDias = 7 * 24 * 60 * 60 * 1000
            setAtivas(lista.filter(m => m.subscription_status === 'active' && !m.is_blocked).length)
            setTrialsSemana(lista.filter(m => {
              const status = m.subscription_status || 'trial'
              if (status !== 'trial' || !m.trial_ends_at) return false
              const fim = new Date(m.trial_ends_at).getTime()
              return fim >= agora && fim - agora <= seteDias
            }))
            setSumidas(lista.filter(m => {
              if (m.is_admin) return false
              const visto = m.last_seen_at ? new Date(m.last_seen_at).getTime() : new Date(m.created_at || 0).getTime()
              return visto && agora - visto > seteDias
            }))
        }
    } else {
        setIsAdmin(false)
    }
    setLoading(false)
  }

  const toggleBloqueio = async (id, statusAtual) => {
      const novoStatus = !statusAtual
      
      const { error } = await supabase.from('profiles').update({ is_blocked: novoStatus }).eq('id', id)
      
      if (error) {
          toast.error("Erro ao atualizar status")
      } else {
          setManicures(prev => prev.map(m => m.id === id ? { ...m, is_blocked: novoStatus } : m))
          
          if (novoStatus) toast('Conta Bloqueada!', { icon: '🚫' })
          else toast.success('Conta Liberada!')
      }
  }

  const gerarConvite = async () => {
    setGerando(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setGerando(false)
      return toast.error('Faça login')
    }

    const bytes = new Uint8Array(24)
    crypto.getRandomValues(bytes)
    const token = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
    const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

    const { error } = await supabase.from('invites').insert({
      token,
      created_by: user.id,
      expires_at: expires,
    })
    setGerando(false)
    if (error) {
      return toast.error(error.message.includes('invites') || error.code === '42P01' || error.code === 'PGRST205'
        ? 'Rode o SQL 015 no Supabase (tabela invites).'
        : (error.message || 'Não foi possível gerar o convite.'))
    }
    const link = `${window.location.origin}/cadastro-vip?token=${token}`
    await navigator.clipboard.writeText(link)
    toast.success('Convite gerado e copiado. Vale 14 dias, uso único.')
    checkAdmin()
  }

  const copiarConvite = async (token) => {
    const link = `${window.location.origin}/cadastro-vip?token=${token}`
    await navigator.clipboard.writeText(link)
    toast.success('Link copiado')
  }

  const atribuirPlano = async (userId, planId, status) => {
    const expires = status === 'active'
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : null

    const { error } = await supabase.from('profiles').update({
      plan_id: planId || null,
      subscription_status: status,
      subscription_expires_at: expires,
    }).eq('id', userId)

    if (error) toast.error('Erro ao atualizar plano')
    else {
      toast.success('Plano atualizado!')
      checkAdmin()
    }
  }

  if (loading) return <div style={{padding:'20px'}}>Carregando sistema...</div>

  if (!isAdmin) return (
    <div style={{padding:'50px', textAlign:'center'}}>
        <h1 style={{color:'#dc2626'}}>Acesso Negado</h1>
        <p>Você não é um administrador.</p>
        <Link to="/">Voltar para Agenda</Link>
    </div>
  )

  return (
    <div style={{ minHeight: '100%', background: '#f1f5f9', padding: '20px', fontFamily: 'sans-serif' }}>
        
        {/* CABEÇALHO */}
        <div style={{ background: '#1e293b', padding: '20px', borderRadius: '16px', color: 'white', marginBottom: '30px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                    <ShieldCheck size={32} color="#4ade80"/>
                    <div>
                        <h2 style={{margin:0}}>Painel do Chefe</h2>
                        <span style={{fontSize:'12px', opacity:0.7, letterSpacing:'1px'}}>VISÃO GERAL</span>
                    </div>
                </div>
                <Link to="/" style={{color:'white', opacity:0.8}}><ArrowLeft/></Link>
            </div>
        </div>

        {/* MÉTRICAS */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:'20px', marginBottom:'30px'}}>
            <div style={{background:'white', padding:'25px', borderRadius:'16px', boxShadow:'0 2px 5px rgba(0,0,0,0.05)', display:'flex', alignItems:'center', gap:'20px'}}>
                <div style={{background:'#eff6ff', padding:'15px', borderRadius:'12px'}}><Users size={30} color="#2563eb"/></div>
                <div><span style={{color:'#64748b', fontSize:'12px', fontWeight:'bold'}}>CLIENTES</span><div style={{fontSize:'32px', fontWeight:'bold', color:'#0f172a'}}>{totalUsers}</div></div>
            </div>
            <div style={{background:'white', padding:'25px', borderRadius:'16px', boxShadow:'0 2px 5px rgba(0,0,0,0.05)', display:'flex', alignItems:'center', gap:'20px'}}>
                <div style={{background:'#f0fdf4', padding:'15px', borderRadius:'12px'}}><Wallet size={30} color="#16a34a"/></div>
                <div><span style={{color:'#64748b', fontSize:'12px', fontWeight:'bold'}}>ASSINATURAS ATIVAS</span><div style={{fontSize:'32px', fontWeight:'bold', color:'#16a34a'}}>{ativas}</div></div>
            </div>
            <div style={{background:'white', padding:'25px', borderRadius:'16px', boxShadow:'0 2px 5px rgba(0,0,0,0.05)', display:'flex', alignItems:'center', gap:'20px'}}>
                <div style={{background:'#fdf2f8', padding:'15px', borderRadius:'12px'}}><TrendingUp size={30} color="#db2777"/></div>
                <div><span style={{color:'#64748b', fontSize:'12px', fontWeight:'bold'}}>RENDA MENSAL</span><div style={{fontSize:'32px', fontWeight:'bold', color:'#db2777'}}>R$ {rendaMensal}</div></div>
            </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: 'white', padding: '16px', borderRadius: '12px', border: '1px solid #fde68a' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '14px' }}>Trials que vencem em 7 dias</h3>
            {trialsSemana.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '13px' }}>Nenhuma esta semana.</p> : trialsSemana.map(m => (
              <div key={m.id} style={{ fontSize: '13px', padding: '4px 0' }}>{m.business_name || m.email || m.id.slice(0, 8)} · {new Date(m.trial_ends_at).toLocaleDateString('pt-BR')}</div>
            ))}
          </div>
          <div style={{ background: 'white', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '14px' }}>Sem abrir o app há 7 dias</h3>
            {sumidas.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '13px' }}>Ninguém sumiu.</p> : sumidas.slice(0, 12).map(m => (
              <div key={m.id} style={{ fontSize: '13px', padding: '4px 0' }}>{m.business_name || m.email || 'Sem nome'}</div>
            ))}
          </div>
        </div>

        {/* ÁREA DE CONVITE */}
        <div style={{background:'white', padding:'20px', borderRadius:'16px', marginBottom:'30px', border:'1px solid #e2e8f0'}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'15px', marginBottom:'12px'}}>
            <div>
                <h3 style={{margin:0, color:'#1e293b'}}>Convites de cadastro</h3>
                <p style={{margin:0, fontSize:'14px', color:'#64748b'}}>Cada link é de uso único. Sem token, ninguém cria conta.</p>
            </div>
            <button onClick={gerarConvite} disabled={gerando} style={{padding:'10px 20px', background:'#2563eb', color:'white', border:'none', borderRadius:'8px', fontWeight:'bold', cursor:'pointer', display:'flex', alignItems:'center', gap:'8px'}}>
                <Copy size={18}/> {gerando ? 'Gerando...' : 'Gerar e copiar convite'}
            </button>
            </div>
            {invites.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>Nenhum convite ainda.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {invites.map(inv => (
                  <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', fontSize: '12px', color: '#475569', background: '#f8fafc', padding: '8px 10px', borderRadius: '8px' }}>
                    <span>
                      {inv.used_at ? 'Usado' : 'Aberto'} · vale até {new Date(inv.expires_at).toLocaleDateString('pt-BR')}
                    </span>
                    {!inv.used_at && (
                      <button type="button" onClick={() => copiarConvite(inv.token)} style={{ border: 'none', background: '#e2e8f0', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontWeight: 'bold' }}>
                        Copiar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
        </div>

        {/* LISTA DE GESTÃO DE BLOQUEIO */}
        <h3 style={{color:'#475569', marginBottom:'15px', display:'flex', alignItems:'center', gap:'10px'}}><UserX size={20}/> Gestão de Acesso</h3>
        
        <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
            {manicures.length === 0 ? <p style={{color:'#999'}}>Nenhuma manicure cadastrada ainda.</p> : manicures.map(m => (
                <div key={m.id} style={{
                    background: m.is_blocked ? '#fef2f2' : 'white', 
                    padding:'15px', borderRadius:'12px', 
                    border: m.is_blocked ? '1px solid #fca5a5' : '1px solid #e2e8f0',
                    display:'flex', justifyContent:'space-between', alignItems:'center'
                }}>
                    
                    {/* Infos da Manicure */}
                    <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                        <div style={{
                            width:'40px', height:'40px', borderRadius:'50%', 
                            background: m.is_blocked ? '#fee2e2' : '#f1f5f9', 
                            display:'flex', alignItems:'center', justifyContent:'center',
                            color: m.is_blocked ? '#dc2626' : '#64748b'
                        }}>
                            {m.is_blocked ? <Lock size={20}/> : <Users size={20}/>}
                        </div>
                        <div>
                            {/* Nome */}
                            <strong style={{display:'block', color: m.is_blocked ? '#991b1b' : '#1e293b'}}>
                                {m.business_name || 'Sem nome cadastrado'}
                            </strong>
                            
                            {/* E-mail (NOVIDADE) */}
                            <div style={{display:'flex', alignItems:'center', gap:'5px', fontSize:'12px', color:'#64748b', marginTop:'2px'}}>
                                <Mail size={12}/> {m.email || 'E-mail não sincronizado'}
                            </div>

                            {/* WhatsApp */}
                            <span style={{fontSize:'12px', color: m.is_blocked ? '#b91c1c' : '#94a3b8', display:'block', marginTop:'2px'}}>
                                {m.whatsapp ? m.whatsapp : 'Sem WhatsApp'}
                            </span>

                            {m.is_blocked && <span style={{fontSize:'10px', background:'#ef4444', color:'white', padding:'2px 6px', borderRadius:'4px', marginTop:'5px', display:'inline-block'}}>BLOQUEADA</span>}
                            {m.subscription_plans?.name && (
                              <span style={{fontSize:'10px', background:'#dbeafe', color:'#2563eb', padding:'2px 6px', borderRadius:'4px', marginTop:'5px', display:'inline-block', marginLeft:'4px'}}>
                                <Crown size={10} style={{display:'inline'}}/> {m.subscription_plans.name}
                              </span>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                    <select
                      value={m.plan_id || ''}
                      onChange={e => atribuirPlano(m.id, e.target.value || null, e.target.value ? 'active' : 'trial')}
                      style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '11px', maxWidth: '120px' }}
                    >
                      <option value="">Sem plano</option>
                      {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {/* Botão de Ação */}
                    <button 
                        onClick={() => toggleBloqueio(m.id, m.is_blocked)}
                        style={{
                            padding:'8px 15px', borderRadius:'8px', cursor:'pointer', fontWeight:'bold', fontSize:'12px', display:'flex', alignItems:'center', gap:'5px', border:'none',
                            background: m.is_blocked ? '#dcfce7' : '#fee2e2',
                            color: m.is_blocked ? '#166534' : '#991b1b'
                        }}
                    >
                        {m.is_blocked ? <><Unlock size={14}/> LIBERAR</> : <><Lock size={14}/> BLOQUEAR</>}
                    </button>
                    </div>

                </div>
            ))}
        </div>

    </div>
  )
}