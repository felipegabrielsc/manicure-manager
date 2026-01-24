// src/App.jsx
import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'

// Páginas
import Agenda from './pages/Agenda'
import NovoAgendamento from './pages/NovoAgendamento'
import Clientes from './pages/Clientes'
import Servicos from './pages/Servicos'
import Financeiro from './pages/Financeiro'
import Login from './pages/Login'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 1. Verifica se já existe sessão salva no navegador (Persistent Login)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    // 2. Ouve mudanças (Login ou Logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Enquanto verifica o token, mostra carregando simples
  if (loading) {
    return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Carregando...</div>
  }

  return (
    <BrowserRouter>
      <div style={{ minHeight: '100vh', background: '#eef2f6', fontFamily: 'sans-serif' }}>
        <Routes>
          {/* Se NÃO tem sessão, mostra Login */}
          {!session ? (
            <>
              <Route path="/login" element={<Login />} />
              <Route path="*" element={<Navigate to="/login" />} />
            </>
          ) : (
            /* Se TEM sessão, mostra o App Protegido */
            <>
              <Route path="/" element={<Agenda />} />
              <Route path="/novo" element={<NovoAgendamento />} />
              <Route path="/clientes" element={<Clientes />} />
              <Route path="/servicos" element={<Servicos />} />
              <Route path="/financeiro" element={<Financeiro />} />
              <Route path="*" element={<Navigate to="/" />} />
            </>
          )}
        </Routes>
      </div>
    </BrowserRouter>
  )
}