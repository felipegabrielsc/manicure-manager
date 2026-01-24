// src/pages/Login.jsx
import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { Lock, Mail } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      alert('Erro: ' + error.message)
      setLoading(false)
    } else {
      // O App.jsx vai detectar a mudança de estado e redirecionar sozinho
      // Não precisa de navigate aqui
    }
  }

  return (
    <div style={{ 
      minHeight: '100vh', display: 'flex', flexDirection: 'column', 
      alignItems: 'center', justifyContent: 'center', background: '#eef2f6', padding: '20px' 
    }}>
      
      <div style={{ marginBottom: '30px', textAlign: 'center' }}>
        <div style={{ width: '80px', height: '80px', background: '#2563eb', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto', boxShadow: '0 10px 20px rgba(37, 99, 235, 0.3)' }}>
          <Lock size={40} color="white" />
        </div>
        <h1 style={{ color: '#000', margin: 0 }}>Agenda Manicure</h1>
        <p style={{ color: '#666' }}>Entre para gerenciar</p>
      </div>

      <form onSubmit={handleLogin} style={{ background: 'white', padding: '30px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        <div>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px', fontSize: '14px' }}>E-mail</label>
          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #ccc', borderRadius: '8px', padding: '12px' }}>
            <Mail size={20} color="#999" style={{ marginRight: '10px' }} />
            <input 
              type="email" 
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              style={{ border: 'none', width: '100%', fontSize: '16px', outline: 'none' }}
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px', fontSize: '14px' }}>Senha</label>
          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #ccc', borderRadius: '8px', padding: '12px' }}>
            <Lock size={20} color="#999" style={{ marginRight: '10px' }} />
            <input 
              type="password" 
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="******"
              style={{ border: 'none', width: '100%', fontSize: '16px', outline: 'none' }}
            />
          </div>
        </div>

        <button 
          type="submit" 
          disabled={loading}
          style={{ 
            background: '#2563eb', color: 'white', padding: '15px', borderRadius: '8px', 
            border: 'none', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', marginTop: '10px' 
          }}
        >
          {loading ? 'Entrando...' : 'Acessar Sistema'}
        </button>

      </form>
    </div>
  )
}