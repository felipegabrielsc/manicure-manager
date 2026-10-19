import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import toast from 'react-hot-toast'

export default function UnlockAdminForm({ onUnlocked, canCreate = false }) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function gerarConvite() {
    setLoading(true)
    const { data, error } = await supabase.rpc('criar_convite_admin')
    setLoading(false)
    if (error || !data?.ok) {
      return toast.error(data?.reason || error?.message || 'Não foi possível gerar o convite. Rode o SQL 030.')
    }
    try {
      await navigator.clipboard.writeText(data.token)
      toast.success('Convite copiado. Vale 2 dias, uso único. Não compartilhe no grupo.')
    } catch {
      toast.success(`Convite: ${data.token}`)
    }
  }

  async function submit(e) {
    e.preventDefault()
    const token = code.trim()
    if (!token) return toast.error('Informe o convite')
    setLoading(true)
    const { data, error } = await supabase.rpc('ativar_admin_com_convite', { p_token: token })
    setLoading(false)
    if (error || !data?.ok) {
      return toast.error(data?.reason || 'Convite inválido. Rode o SQL 030 no Supabase.')
    }
    toast.success('Acesso de administrador liberado.')
    if (onUnlocked) await onUnlocked()
    navigate('/admin', { replace: true })
  }

  if (canCreate) {
    return (
      <button
        type="button"
        onClick={gerarConvite}
        disabled={loading}
        style={{ padding: '12px', borderRadius: '8px', border: 'none', background: '#0f172a', color: 'white', fontWeight: 'bold', cursor: 'pointer', width: '100%' }}
      >
        {loading ? 'Gerando...' : 'Gerar convite de admin (uso único)'}
      </button>
    )
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <input
        type="password"
        autoComplete="off"
        value={code}
        onChange={e => setCode(e.target.value)}
        placeholder="Cole o convite de admin"
        style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', boxSizing: 'border-box' }}
      />
      <button
        type="submit"
        disabled={loading}
        style={{ padding: '12px', borderRadius: '8px', border: 'none', background: '#0f172a', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
      >
        {loading ? 'Verificando...' : 'Ativar com convite'}
      </button>
    </form>
  )
}
