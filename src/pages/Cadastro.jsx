// src/pages/Cadastro.jsx
import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { Link, useNavigate } from 'react-router-dom'
import { User, Lock, Mail, Star } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Cadastro() {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()

  const handleCadastro = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    // Cria o usuário no Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      toast.error(error.message)
      setLoading(false)
    } else {
      // Cria o perfil inicial
      if (data.user) {
        await supabase.from('profiles').insert({ id: data.user.id, booking_active: true })
        await supabase.from('business_hours').insert([
            { user_id: data.user.id, day_of_week: 1, open_time: '09:00', close_time: '18:00' }, // Exemplo: Inicia com Segunda
            // O sistema cria o resto automático depois
        ])
      }
      
      toast.success('Conta criada! Faça login.')
      navigate('/login')
    }
  }

  return (
    <div style={{ height: '100vh', background: '#eef2f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'sans-serif' }}>
      <div style={{ background: 'white', padding: '30px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
        
        <div style={{ background: '#eff6ff', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <Star size={30} color="#2563eb" />
        </div>
        
        <h2 style={{ color: '#1e3a8a', margin: '0 0 10px 0' }}>Convite Aceito!</h2>
        <p style={{ color: '#666', marginBottom: '30px' }}>Crie sua conta exclusiva de Manicure.</p>

        <form onSubmit={handleCadastro} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ position: 'relative' }}>
            <Mail size={20} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '12px' }} />
            <input required type="email" placeholder="Seu E-mail" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
          </div>

          <div style={{ position: 'relative' }}>
            <Lock size={20} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '12px' }} />
            <input required type="password" placeholder="Crie uma Senha" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
          </div>

          <button type="submit" disabled={loading} style={btnStyle}>
            {loading ? 'Criando...' : 'Criar Minha Conta'}
          </button>
        </form>

        <div style={{ marginTop: '20px', fontSize: '14px' }}>
          <Link to="/login" style={{ color: '#2563eb', textDecoration: 'none' }}>Já tenho conta (Entrar)</Link>
        </div>
      </div>
    </div>
  )
}

const inputStyle = { width: '100%', padding: '12px 12px 12px 40px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '16px', boxSizing: 'border-box' }
const btnStyle = { width: '100%', padding: '15px', borderRadius: '8px', border: 'none', background: '#2563eb', color: 'white', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', marginTop: '10px' }