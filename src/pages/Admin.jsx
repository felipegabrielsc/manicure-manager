// src/pages/Admin.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { Link } from 'react-router-dom'
import { Users, Copy, ShieldCheck, ArrowLeft, DollarSign, TrendingUp, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Admin() {
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [totalUsers, setTotalUsers] = useState(0)

  // Novas Métricas Financeiras
  const [receitaSetup, setReceitaSetup] = useState(0) // Os R$ 200 fixos
  const [rendaMensal, setRendaMensal] = useState(0)   // Os R$ 50 mensais

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
        
        // 2. Conta total de manicures cadastradas
        const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true })
        
        // 3. Aplica sua regra de negócio
        // Regra: R$ 200 por cabeça (uma vez) + R$ 50 por cabeça (todo mês)
        const totalManicures = count || 0
        setTotalUsers(totalManicures)
        
        setReceitaSetup(totalManicures * 200) 
        setRendaMensal(totalManicures * 50)
    }
    setLoading(false)
  }

  const copiarLinkConvite = () => {
    const link = `${window.location.origin}/cadastro-vip`
    navigator.clipboard.writeText(link)
    toast.success('Link de convite copiado!', { icon: '🎟️' })
  }

  if (loading) return <div style={{padding:'20px'}}>Verificando permissões...</div>

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
                        <span style={{fontSize:'12px', opacity:0.7, letterSpacing:'1px'}}>VISÃO GERAL DO NEGÓCIO</span>
                    </div>
                </div>
                <Link to="/" style={{color:'white', opacity:0.8}}><ArrowLeft/></Link>
            </div>
        </div>

        {/* GRID DE MÉTRICAS FINANCEIRAS */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:'20px', marginBottom:'30px'}}>
            
            {/* CARD 1: TOTAL DE CLIENTES */}
            <div style={{background:'white', padding:'25px', borderRadius:'16px', boxShadow:'0 2px 5px rgba(0,0,0,0.05)', display:'flex', alignItems:'center', gap:'20px'}}>
                <div style={{background:'#eff6ff', padding:'15px', borderRadius:'12px'}}>
                    <Users size={30} color="#2563eb"/>
                </div>
                <div>
                    <span style={{color:'#64748b', fontSize:'12px', fontWeight:'bold', textTransform:'uppercase'}}>Clientes Ativos</span>
                    <div style={{fontSize:'32px', fontWeight:'bold', color:'#0f172a', lineHeight:'1'}}>{totalUsers}</div>
                </div>
            </div>

            {/* CARD 2: CAIXA GERADO (SETUP) */}
            <div style={{background:'white', padding:'25px', borderRadius:'16px', boxShadow:'0 2px 5px rgba(0,0,0,0.05)', display:'flex', alignItems:'center', gap:'20px'}}>
                <div style={{background:'#f0fdf4', padding:'15px', borderRadius:'12px'}}>
                    <Wallet size={30} color="#16a34a"/>
                </div>
                <div>
                    <span style={{color:'#64748b', fontSize:'12px', fontWeight:'bold', textTransform:'uppercase'}}>Total Recebido (Setups)</span>
                    <div style={{fontSize:'32px', fontWeight:'bold', color:'#16a34a', lineHeight:'1'}}>
                        R$ {receitaSetup.toLocaleString('pt-BR')}
                    </div>
                    <span style={{fontSize:'12px', color:'#16a34a'}}>Acumulado (R$ 200/uni)</span>
                </div>
            </div>

            {/* CARD 3: RECORRÊNCIA MENSAL (MRR) */}
            <div style={{background:'white', padding:'25px', borderRadius:'16px', boxShadow:'0 2px 5px rgba(0,0,0,0.05)', display:'flex', alignItems:'center', gap:'20px'}}>
                <div style={{background:'#fdf2f8', padding:'15px', borderRadius:'12px'}}>
                    <TrendingUp size={30} color="#db2777"/>
                </div>
                <div>
                    <span style={{color:'#64748b', fontSize:'12px', fontWeight:'bold', textTransform:'uppercase'}}>Renda Mensal (MRR)</span>
                    <div style={{fontSize:'32px', fontWeight:'bold', color:'#db2777', lineHeight:'1'}}>
                        R$ {rendaMensal.toLocaleString('pt-BR')}
                    </div>
                    <span style={{fontSize:'12px', color:'#db2777'}}>Todo mês na conta (R$ 50/uni)</span>
                </div>
            </div>
        </div>

        {/* ÁREA DE AÇÃO: CONVIDAR */}
        <div style={{background:'white', padding:'30px', borderRadius:'16px', boxShadow:'0 4px 10px rgba(0,0,0,0.05)', textAlign:'center', maxWidth:'600px', margin:'0 auto'}}>
            <div style={{background:'#eff6ff', width:'70px', height:'70px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px'}}>
                <Users size={32} color="#2563eb"/>
            </div>
            
            <h3 style={{margin:'0 0 10px 0', fontSize:'22px', color:'#1e293b'}}>Adicionar Nova Manicure</h3>
            <p style={{color:'#64748b', marginBottom:'25px', lineHeight:'1.5'}}>
                Para colocar uma nova cliente no sistema e cobrar os <strong>R$ 200,00</strong> de setup, envie este link exclusivo para ela criar a conta.
            </p>
            
            <div style={{background:'#f8fafc', padding:'15px', borderRadius:'8px', fontSize:'14px', color:'#475569', wordBreak:'break-all', marginBottom:'25px', border:'1px solid #e2e8f0', fontFamily:'monospace'}}>
                {window.location.origin}/cadastro-vip
            </div>

            <button onClick={copiarLinkConvite} style={{width:'100%', padding:'18px', background:'#2563eb', color:'white', border:'none', borderRadius:'12px', fontWeight:'bold', fontSize:'16px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'10px', transition:'all 0.2s'}}>
                <Copy size={20}/> Copiar Link de Convite
            </button>
        </div>

    </div>
  )
}