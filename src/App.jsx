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
import AgendamentoPublico from './pages/AgendamentoPublico' // <--- IMPORTANTE: Importar a página

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Carregando...</div>
  }

  return (
    <BrowserRouter>
      <Toaster position="top-center" toastOptions={{ duration: 3000 }} />
      
      <div style={{ minHeight: '100vh', background: '#eef2f6' }}>
        <Routes>
          {/* --- ROTAS PÚBLICAS (Funcionam para qualquer pessoa) --- */}
          <Route path="/resumo/:id" element={<ResumoAgendamento />} />
          
          {/* AQUI ESTAVA FALTANDO: A rota do link público */}
          <Route path="/agendar/:userId" element={<AgendamentoPublico />} />

          {!session ? (
            /* --- USUÁRIO NÃO LOGADO --- */
            <>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              {/* Qualquer outra rota desconhecida manda pra Landing Page */}
              <Route path="*" element={<Navigate to="/" />} />
            </>
          ) : (
            /* --- USUÁRIO LOGADO (Área Privada da Manicure) --- */
            <>
              <Route path="/" element={<Agenda />} />
              <Route path="/novo" element={<NovoAgendamento />} />
              <Route path="/clientes" element={<Clientes />} />
              <Route path="/servicos" element={<Servicos />} />
              <Route path="/financeiro" element={<Financeiro />} />
              <Route path="/configuracoes" element={<Configuracoes />} />
              
              {/* Qualquer outra rota desconhecida dentro do app volta pra Agenda */}
              <Route path="*" element={<Navigate to="/" />} />
            </>
          )}
        </Routes>
      </div>
    </BrowserRouter>
  )
}