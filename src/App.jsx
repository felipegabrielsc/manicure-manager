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
import { checkPendingNotifications } from './utils/notifications'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [bloqueado, setBloqueado] = useState(false) // Estado do Banimento

  useEffect(() => {
    // Função para verificar se está banido
    const checkUserStatus = async (userId) => {
      if (!userId) return;
      const { data } = await supabase.from('profiles').select('is_blocked').eq('id', userId).single()
      if (data && data.is_blocked === true) {
        setBloqueado(true)
      } else {
        setBloqueado(false)
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) checkUserStatus(session.user.id)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) checkUserStatus(session.user.id)
      else setBloqueado(false)
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

  if (loading) {
    return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Carregando...</div>
  }

  // SE ESTIVER BLOQUEADO, RENDERIZA SÓ A TELA DE BLOQUEIO
  if (session && bloqueado) {
    return <Bloqueado />
  }

  return (
    <BrowserRouter>
      <Toaster position="top-center" toastOptions={{ duration: 3000 }} />
      
      <div style={{ minHeight: '100vh', background: '#eef2f6' }}>
        <Routes>
          {/* ROTAS PÚBLICAS */}
          <Route path="/resumo/:id" element={<ResumoAgendamento />} />
          <Route path="/agendar/:userId" element={<AgendamentoPublico />} />
          <Route path="/perfil/:userId" element={<PerfilPublico />} />
          <Route path="/cadastro-vip" element={<Cadastro />} />
          <Route path="/redefinir-senha" element={<RedefinirSenha />} />

          {!session ? (
            /* USUÁRIO NÃO LOGADO */
            <>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/esqueci-senha" element={<EsqueciSenha />} />
              <Route path="*" element={<Navigate to="/" />} />
            </>
          ) : (
            /* USUÁRIO LOGADO E LIBERADO (Pois já passou pelo if do bloqueio lá em cima) */
            <>
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

              {/* ROTA DO ADMIN */}
              <Route path="/admin" element={<Admin />} />
              
              <Route path="*" element={<Navigate to="/" />} />
            </>
          )}
        </Routes>
      </div>
    </BrowserRouter>
  )
}