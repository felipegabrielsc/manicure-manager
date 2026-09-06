// src/App.jsx
import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { Toaster } from 'react-hot-toast'

// Páginas
import Agenda from './pages/Agenda'
import NovoAgendamento from './pages/NovoAgendamento'
import Clientes from './pages/Clientes'
import Servicos from './pages/Servicos'
import Financeiro from './pages/Financeiro'
import Login from './pages/Login'
import Landing from './pages/Landing'
import ResumoAgendamento from './pages/ResumoAgendamento'
import Configuracoes from './pages/Configuracoes'
import AgendamentoPublico from './pages/AgendamentoPublico'
import Bloqueado from './pages/Bloqueado' 
import Admin from './pages/Admin'
import Cadastro from './pages/Cadastro'
import EsqueciSenha from './pages/EsqueciSenha'
import RedefinirSenha from './pages/RedefinirSenha'
import PerfilPublico from './pages/PerfilPublico'
import Estoque from './pages/Estoque'
import Fidelidade from './pages/Fidelidade'
import Equipe from './pages/Equipe'
import Planos from './pages/Planos'
import Onboarding from './pages/Onboarding'
import AppLayout from './components/AppLayout'
import { SessionProfileContext } from './context/SessionProfile'
import { checkPendingNotifications } from './utils/notifications'

const PROFILE_SELECT = 'is_blocked, is_admin, plan_id, subscription_status, subscription_expires_at, trial_ends_at, salon_owner_id, onboarding_done, last_seen_at, business_name, subscription_plans(name, price, features)'
const PROFILE_SELECT_FALLBACK = 'is_blocked, is_admin, plan_id, subscription_status, subscription_expires_at, trial_ends_at, subscription_plans(name, price, features)'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [bloqueado, setBloqueado] = useState(false)
  const [profileChecked, setProfileChecked] = useState(false)

  async function loadProfile(userId) {
    if (!userId) {
      setProfile(null)
      setBloqueado(false)
      setProfileChecked(true)
      return
    }
    let { data, error } = await supabase.from('profiles').select(PROFILE_SELECT).eq('id', userId).single()
    if (error) {
      const retry = await supabase.from('profiles').select(PROFILE_SELECT_FALLBACK).eq('id', userId).single()
      data = retry.data
    }

    let assembled = data || null
    if (assembled?.salon_owner_id) {
      const { data: owner } = await supabase.from('profiles').select(PROFILE_SELECT).eq('id', assembled.salon_owner_id).single()
      const { data: sm } = await supabase.from('staff_members').select('id').eq('auth_user_id', userId).maybeSingle()
      assembled = {
        ...(owner || {}),
        id: userId,
        is_admin: false,
        is_staff: true,
        salon_owner_id: assembled.salon_owner_id,
        workspace_id: assembled.salon_owner_id,
        staff_member_id: sm?.id || null,
        onboarding_done: true,
        is_blocked: assembled.is_blocked === true || owner?.is_blocked === true,
      }
    } else if (assembled) {
      assembled = {
        ...assembled,
        is_staff: false,
        workspace_id: userId,
      }
    }

    setProfile(assembled)
    setBloqueado(assembled?.is_blocked === true)
    setProfileChecked(true)
    supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', userId).then(() => {})
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      if (session) await loadProfile(session.user.id)
      else setProfileChecked(true)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        setProfileChecked(false)
        loadProfile(session.user.id)
      } else {
        setProfile(null)
        setBloqueado(false)
        setProfileChecked(true)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user?.id) return
    checkPendingNotifications(session.user.id)
    const interval = setInterval(() => checkPendingNotifications(session.user.id), 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [session])

  if (loading || (session && !profileChecked)) {
    return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Carregando...</div>
  }

  const refreshProfile = () => session?.user?.id && loadProfile(session.user.id)

  return (
    <SessionProfileContext.Provider value={{ profile, refreshProfile }}>
    <BrowserRouter>
      <Toaster position="top-center" toastOptions={{ duration: 3000 }} />

      {session && bloqueado ? (
        <Bloqueado />
      ) : (
        <Routes>
          <Route path="/resumo/:id" element={<ResumoAgendamento />} />
          <Route path="/agendar/:userId" element={<AgendamentoPublico />} />
          <Route path="/perfil/:userId" element={<PerfilPublico />} />
          <Route path="/cadastro-vip" element={<Cadastro />} />
          <Route path="/redefinir-senha" element={<RedefinirSenha />} />

          {!session ? (
            <>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/esqueci-senha" element={<EsqueciSenha />} />
              <Route path="*" element={<Navigate to="/" />} />
            </>
          ) : (
            <>
              <Route path="/onboarding" element={<Onboarding />} />
              <Route element={<AppLayout />}>
              <Route path="/" element={<Agenda />} />
              <Route path="/novo" element={<NovoAgendamento />} />
              <Route path="/clientes" element={<Clientes />} />
              <Route path="/servicos" element={<Servicos />} />
              <Route path="/financeiro" element={<Financeiro />} />
              <Route path="/configuracoes" element={<Configuracoes />} />
              <Route path="/estoque" element={<Estoque />} />
              <Route path="/fidelidade" element={<Fidelidade />} />
              <Route path="/equipe" element={<Equipe />} />
              <Route path="/planos" element={<Planos />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="*" element={<Navigate to="/" />} />
              </Route>
            </>
          )}
        </Routes>
      )}
    </BrowserRouter>
    </SessionProfileContext.Provider>
  )
}