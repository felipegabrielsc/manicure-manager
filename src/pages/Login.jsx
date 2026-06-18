// src/pages/Login.jsx
import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { Link } from 'react-router-dom'
import { Lock, Mail, LogIn } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Login() {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      toast.error('Erro: ' + error.message)
      setLoading(false)
    } else {
      // Redireciona via App.jsx automaticamente
    }
  }

  return (
    <div style={{ height: '100vh', background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'sans-serif' }}>
      <div style={{ background: 'white', padding: '40px 30px', borderRadius: '24px', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
        
        <div style={{ background: '#2563eb', width: '60px', height: '60px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', transform: 'rotate(-10deg)' }}>
          <LogIn size={30} color="white" />
        </div>

        <h1 style={{ color: '#1e3a8a', margin: '0 0 10px 0', fontSize: '24px' }}>Agenda Manicure</h1>
        <p style={{ color: '#64748b', marginBottom: '30px' }}>Bem-vinda de volta!</p>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ position: 'relative' }}>
            <Mail size={20} color="#9ca3af" style={{ position: 'absolute', left: '15px', top: '15px' }} />
            <input required type="email" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
          </div>

          <div style={{ position: 'relative' }}>
            <Lock size={20} color="#9ca3af" style={{ position: 'absolute', left: '15px', top: '15px' }} />
            <input required type="password" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
          </div>

          <button type="submit" disabled={loading} style={btnStyle}>
            {loading ? 'Entrando...' : 'Entrar no Sistema'}
          </button>
        </form>

        <Link to="/esqueci-senha" style={{ display: 'block', marginTop: '16px', fontSize: '13px', color: '#2563eb', textDecoration: 'none' }}>
          Esqueci minha senha
        </Link>
        
        <p style={{marginTop:'20px', fontSize:'12px', color:'#999'}}>
            Não tem conta? Peça o link de convite para o administrador.
        </p>
      </div>
    </div>
  )
}

const inputStyle = { width: '100%', padding: '15px 15px 15px 45px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '16px', background: '#f8fafc', boxSizing: 'border-box', outline: 'none' }
const btnStyle = { width: '100%', padding: '15px', borderRadius: '12px', border: 'none', background: '#2563eb', color: 'white', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', marginTop: '10px', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)' }