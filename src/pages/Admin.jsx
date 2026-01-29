// src/pages/Admin.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { Link } from 'react-router-dom'
import { Users, Copy, ShieldCheck, ArrowLeft, DollarSign, TrendingUp, Wallet, Lock, Unlock, UserX, Mail } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Admin() {
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  
  // Métricas
  const [totalUsers, setTotalUsers] = useState(0)
  const [receitaSetup, setReceitaSetup] = useState(0)
  const [rendaMensal, setRendaMensal] = useState(0)
  
  // Lista de Usuários para Gestão
  const [manicures, setManicures] = useState([])

  useEffect(() => {
    checkAdmin()
  }, [])

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // 1. Verifica se é Admin
    const { data: perfil } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    
    if (perfil?.is_admin) {
        setIsAdmin(true)
        
        // 2. Busca TODAS as manicures (select * já pega o email agora)
        const { data: lista } = await supabase
            .from('profiles')
            .select('*')
            .eq('is_admin', false) 
            .order('created_at', { ascending: false }) 
            
        if (lista) {
            setManicures(lista)
            
            // Atualiza métricas
            const total = lista.length
            setTotalUsers(total)
            setReceitaSetup(total * 200)
            setRendaMensal(total * 50)
        }
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

  const copiarLinkConvite = () => {
    const link = `${window.location.origin}/cadastro-vip`
    navigator.clipboard.writeText(link)
    toast.success('Link de convite copiado!', { icon: '🎟️' })
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
    <div style={{ minHeight: '100vh', background: '#f1f5f9', padding: '20px', fontFamily: 'sans-serif' }}>
        
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
                <div><span style={{color:'#64748b', fontSize:'12px', fontWeight:'bold'}}>TOTAL SETUP</span><div style={{fontSize:'32px', fontWeight:'bold', color:'#16a34a'}}>R$ {receitaSetup}</div></div>
            </div>
            <div style={{background:'white', padding:'25px', borderRadius:'16px', boxShadow:'0 2px 5px rgba(0,0,0,0.05)', display:'flex', alignItems:'center', gap:'20px'}}>
                <div style={{background:'#fdf2f8', padding:'15px', borderRadius:'12px'}}><TrendingUp size={30} color="#db2777"/></div>
                <div><span style={{color:'#64748b', fontSize:'12px', fontWeight:'bold'}}>RENDA MENSAL</span><div style={{fontSize:'32px', fontWeight:'bold', color:'#db2777'}}>R$ {rendaMensal}</div></div>
            </div>
        </div>

        {/* ÁREA DE CONVITE */}
        <div style={{background:'white', padding:'20px', borderRadius:'16px', marginBottom:'30px', border:'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'15px'}}>
            <div>
                <h3 style={{margin:0, color:'#1e293b'}}>Link de Cadastro VIP</h3>
                <p style={{margin:0, fontSize:'14px', color:'#64748b'}}>Use este link para cadastrar novas manicures.</p>
            </div>
            <button onClick={copiarLinkConvite} style={{padding:'10px 20px', background:'#2563eb', color:'white', border:'none', borderRadius:'8px', fontWeight:'bold', cursor:'pointer', display:'flex', alignItems:'center', gap:'8px'}}>
                <Copy size={18}/> Copiar Link
            </button>
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
                        </div>
                    </div>

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
            ))}
        </div>

    </div>
  )
}