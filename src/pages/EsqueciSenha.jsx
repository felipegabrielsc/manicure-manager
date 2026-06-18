import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Mail, ArrowLeft, Send } from 'lucide-react'
import toast from 'react-hot-toast'

export default function EsqueciSenha() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })

    setLoading(false)
    if (error) {
      toast.error('Erro: ' + error.message)
    } else {
      setSent(true)
      toast.success('E-mail enviado! Verifique sua caixa de entrada.')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'sans-serif' }}>
      <div style={{ background: 'white', padding: '40px 30px', borderRadius: '24px', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px' }}>
        <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#64748b', textDecoration: 'none', fontSize: '14px', marginBottom: '20px' }}>
          <ArrowLeft size={16} /> Voltar ao login
        </Link>

        <h1 style={{ color: '#1e3a8a', margin: '0 0 10px 0', fontSize: '24px' }}>Recuperar senha</h1>
        <p style={{ color: '#64748b', marginBottom: '24px', fontSize: '14px' }}>
          {sent
            ? 'Se o e-mail existir no sistema, você receberá um link para criar uma nova senha.'
            : 'Informe seu e-mail cadastrado para receber o link de recuperação.'}
        </p>

        {!sent && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ position: 'relative' }}>
              <Mail size={20} color="#9ca3af" style={{ position: 'absolute', left: '15px', top: '15px' }} />
              <input
                required
                type="email"
                placeholder="Seu e-mail"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={inputStyle}
              />
            </div>
            <button type="submit" disabled={loading} style={btnStyle}>
              <Send size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
              {loading ? 'Enviando...' : 'Enviar link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

const inputStyle = { width: '100%', padding: '15px 15px 15px 45px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '16px', background: '#f8fafc', boxSizing: 'border-box', outline: 'none' }
const btnStyle = { width: '100%', padding: '15px', borderRadius: '12px', border: 'none', background: '#2563eb', color: 'white', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)' }
