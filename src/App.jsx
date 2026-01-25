// src/App.jsx
import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'

import Agenda from './pages/Agenda'
import NovoAgendamento from './pages/NovoAgendamento'
import Clientes from './pages/Clientes'
import Servicos from './pages/Servicos'
import Financeiro from './pages/Financeiro'
import Login from './pages/Login'
import Landing from './pages/Landing'
import ResumoAgendamento from './pages/ResumoAgendamento'
import { Toaster } from 'react-hot-toast'

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
          <Route path="/resumo/:id" element={<ResumoAgendamento />} />
          {!session ? (
            /* USUÁRIO NÃO LOGADO: Vê Landing Page ou pode ir pro Login */
            <>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="*" element={<Navigate to="/" />} />
            </>
          ) : (
            /* USUÁRIO LOGADO: Vê o App */
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