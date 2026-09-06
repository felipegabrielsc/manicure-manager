import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import toast from 'react-hot-toast'

export default function UnlockAdminForm({ onUnlocked }) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function submit(e) {
    e.preventDefault()
    if (!code.trim()) return toast.error('Informe o código')
    setLoading(true)
    const { data, error } = await supabase.rpc('ativar_admin_com_codigo', { p_code: code.trim() })
    setLoading(false)
    if (error || !data?.ok) {
      return toast.error(data?.reason || 'Não foi possível liberar. Rode o SQL 010 no Supabase.')
    }
    toast.success('Conta de administrador liberada.')
    if (onUnlocked) await onUnlocked()
    navigate('/admin', { replace: true })
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <input
        type="password"
        autoComplete="off"
        value={code}
        onChange={e => setCode(e.target.value)}
        placeholder="Código de liberação"
        style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', boxSizing: 'border-box' }}
      />
      <button
        type="submit"
        disabled={loading}
        style={{ padding: '12px', borderRadius: '8px', border: 'none', background: '#0f172a', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
      >
        {loading ? 'Verificando...' : 'Liberar acesso de admin'}
      </button>
    </form>
  )
}
