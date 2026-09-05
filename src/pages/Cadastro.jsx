import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Lock, Mail, Star, ArrowRight, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Cadastro() {
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [inviteOk, setInviteOk] = useState(false)
  const [inviteReason, setInviteReason] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = (searchParams.get('token') || '').trim()

  useEffect(() => {
    async function check() {
      if (!token) {
        setInviteOk(false)
        setInviteReason('Este cadastro só funciona com um convite do administrador.')
        setChecking(false)
        return
      }
      const { data, error } = await supabase.rpc('validar_convite', { p_token: token })
      if (error || !data?.ok) {
        setInviteOk(false)
        setInviteReason(data?.reason || 'Convite inválido. Peça um novo link ao administrador.')
        setChecking(false)
        return
      }
      if (data.email) setEmail(data.email)
      setInviteOk(true)
      setChecking(false)
    }
    check()
  }, [token])

  const handleCadastro = async (e) => {
    e.preventDefault()
    if (!inviteOk) return
    if (password.length < 6) {
      return toast.error('A senha precisa ter pelo menos 6 caracteres.', { icon: '🔐' })
    }

    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { invite_token: token } },
    })

    if (error) {
      toast.error(error.message === 'User already registered' ? 'Este e-mail já está cadastrado!' : 'Erro ao criar conta.')
      setLoading(false)
      return
    }

    if (data.user && data.session) {
      const { data: consumed } = await supabase.rpc('consumir_convite', { p_token: token })
      if (!consumed?.ok) {
        await supabase.auth.signOut()
        toast.error(consumed?.reason || 'Não foi possível usar este convite.')
        setLoading(false)
        return
      }

      await supabase.from('business_hours').insert([
        { user_id: data.user.id, day_of_week: 1, open_time: '09:00', close_time: '18:00' },
      ])

      toast.success('Cadastro realizado com sucesso!')
      navigate('/')
      window.location.reload()
      return
    }

    setLoading(false)
    toast.error('O sistema pediu confirmação de e-mail. Verifique o painel do Supabase.')
  }

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
        Verificando convite...
      </div>
    )
  }

  if (!inviteOk) {
    return (
      <div style={{ minHeight: '100vh', background: '#eef2f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'sans-serif' }}>
        <div style={{ background: 'white', padding: '30px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
          <h2 style={{ color: '#991b1b', marginTop: 0 }}>Convite necessário</h2>
          <p style={{ color: '#64748b', lineHeight: 1.5 }}>{inviteReason}</p>
          <Link to="/login" style={{ color: '#2563eb' }}>Ir para o login</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#eef2f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'sans-serif' }}>
      <div style={{ background: 'white', padding: '30px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
        <div style={{ background: '#eff6ff', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <Star size={30} color="#2563eb" />
        </div>
        <h2 style={{ color: '#1e3a8a', margin: '0 0 10px 0' }}>Criar conta com convite</h2>
        <p style={{ color: '#666', marginBottom: '30px' }}>Seu acesso de teste vale 14 dias. Depois, assine em Planos.</p>

        <form onSubmit={handleCadastro} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ position: 'relative' }}>
            <Mail size={20} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '12px' }} />
            <input required type="email" placeholder="Seu e-mail" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ position: 'relative' }}>
            <Lock size={20} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '12px' }} />
            <input required type="password" placeholder="Senha (mínimo 6 dígitos)" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
          </div>
          <button type="submit" disabled={loading} style={btnStyle}>
            {loading ? <><Loader2 className="spin" size={20} /> Processando...</> : <><ArrowRight size={20} /> Acessar sistema</>}
          </button>
        </form>
        <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  )
}

const inputStyle = { width: '100%', padding: '12px 12px 12px 40px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '16px', boxSizing: 'border-box' }
const btnStyle = { width: '100%', padding: '15px', borderRadius: '8px', border: 'none', background: '#2563eb', color: 'white', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }
