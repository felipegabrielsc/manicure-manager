import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Lock, KeyRound } from 'lucide-react'
import toast from 'react-hot-toast'

export default function RedefinirSenha() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (password.length < 6) return toast.error('A senha precisa ter pelo menos 6 caracteres.')
    if (password !== confirm) return toast.error('As senhas não coincidem.')

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      toast.error('Erro: ' + error.message)
    } else {
      toast.success('Senha atualizada!')
      navigate('/')
    }
  }

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
        Validando link...
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#eef2f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'sans-serif' }}>
      <div style={{ background: 'white', padding: '40px 30px', borderRadius: '24px', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
        <div style={{ background: '#2563eb', width: '60px', height: '60px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <KeyRound size={30} color="white" />
        </div>

        <h1 style={{ color: '#1e3a8a', margin: '0 0 10px 0', fontSize: '24px' }}>Nova senha</h1>
        <p style={{ color: '#64748b', marginBottom: '24px', fontSize: '14px' }}>Digite sua nova senha abaixo.</p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px', textAlign: 'left' }}>
          <div style={{ position: 'relative' }}>
            <Lock size={20} color="#9ca3af" style={{ position: 'absolute', left: '15px', top: '15px' }} />
            <input required type="password" placeholder="Nova senha" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ position: 'relative' }}>
            <Lock size={20} color="#9ca3af" style={{ position: 'absolute', left: '15px', top: '15px' }} />
            <input required type="password" placeholder="Confirmar senha" value={confirm} onChange={e => setConfirm(e.target.value)} style={inputStyle} />
          </div>
          <button type="submit" disabled={loading} style={btnStyle}>
            {loading ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </form>
      </div>
    </div>
  )
}

const inputStyle = { width: '100%', padding: '15px 15px 15px 45px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '16px', background: '#f8fafc', boxSizing: 'border-box', outline: 'none' }
const btnStyle = { width: '100%', padding: '15px', borderRadius: '12px', border: 'none', background: '#2563eb', color: 'white', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', marginTop: '10px' }
