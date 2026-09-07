import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Lock, KeyRound } from 'lucide-react'
import toast from 'react-hot-toast'

export default function RedefinirSenha() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [linkErro, setLinkErro] = useState('')

  useEffect(() => {
    let cancelled = false
    let unsub = () => {}
    let timer

    async function validarLink() {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const query = new URLSearchParams(window.location.search)
      const code = query.get('code')
      const erroHash = hash.get('error_description') || hash.get('error') || query.get('error_description') || query.get('error')

      if (erroHash) {
        if (!cancelled) setLinkErro(decodeURIComponent(erroHash.replace(/\+/g, ' ')))
        return
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (cancelled) return
        if (error) {
          setLinkErro(error.message)
          return
        }
        setReady(true)
        window.history.replaceState({}, document.title, '/redefinir-senha')
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (session) {
        setReady(true)
        return
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sessionNow) => {
        if (event === 'PASSWORD_RECOVERY' || sessionNow) setReady(true)
      })
      unsub = () => subscription.unsubscribe()

      timer = setTimeout(() => {
        if (!cancelled) {
          setLinkErro('Este link expirou ou não é válido. Peça um novo em Esqueci a senha. No Supabase → Authentication → URL Configuration, Site URL deve ser o site publicado (Vercel), não localhost.')
        }
      }, 8000)
    }

    validarLink()
    return () => {
      cancelled = true
      unsub()
      if (timer) clearTimeout(timer)
    }
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

  if (linkErro) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div className="ui-card" style={{ padding: '28px', maxWidth: '420px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '22px', color: '#1e3a8a' }}>Link inválido</h1>
          <p style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.5 }}>{linkErro}</p>
          <Link to="/esqueci-senha" style={{ color: '#2563eb', fontWeight: 'bold' }}>Pedir um novo link</Link>
        </div>
      </div>
    )
  }

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
        Validando link...
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#eef2f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
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
