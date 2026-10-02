import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import toast from 'react-hot-toast'

const ROTULO = {
  connected: 'WhatsApp conectado',
  connecting: 'WhatsApp conectando',
  disconnected: 'WhatsApp desconectado',
  attention: 'WhatsApp precisa de atenção',
}

function rotuloStatus(status) {
  return ROTULO[status] || ROTULO.disconnected
}

async function pedir(action, extra = {}) {
  const { data, error } = await supabase.functions.invoke('whatsapp-connect', {
    body: { action, ...extra },
  })
  return { data, error }
}

async function lerConexao(userId) {
  return supabase
    .from('whatsapp_connections')
    .select('status, phone_number')
    .eq('user_id', userId)
    .maybeSingle()
}

export default function WhatsAppStatus({ userId, canOpenSettings = false, manage = false }) {
  const [status, setStatus] = useState('disconnected')
  const [phone, setPhone] = useState('')
  const [qrImage, setQrImage] = useState('')
  const [busy, setBusy] = useState(false)
  const [configured, setConfigured] = useState(true)
  const [hidden, setHidden] = useState(false)
  const [testeTel, setTesteTel] = useState('')
  const [testeTexto, setTesteTexto] = useState('Oi! Este é um teste da agenda.')

  function aplicar(data, error, action) {
    if (error || data?.ok === false) {
      const reason = data?.reason || error?.message || 'Não foi possível falar com o gateway'
      if (data?.reason === 'not_configured') setConfigured(false)
      if (action !== 'status') {
        toast.error(reason === 'not_configured' ? 'O gateway ainda não está configurado no servidor.' : reason)
      }
      if (data?.status) setStatus(data.status)
      return data
    }
    setConfigured(data?.configured !== false)
    if (data?.status) setStatus(data.status)
    if (data?.phone) setPhone(data.phone)
    if (data?.qrImage?.startsWith('data:image')) setQrImage(data.qrImage)
    else if (data?.status === 'connected') setQrImage('')
    return data
  }

  async function executar(action, extra) {
    setBusy(true)
    const { data, error } = await pedir(action, extra)
    setBusy(false)
    return aplicar(data, error, action)
  }

  useEffect(() => {
    if (!userId) return undefined
    let cancel = false
    const run = async () => {
      if (manage) {
        const { data, error } = await pedir('status')
        if (!cancel) aplicar(data, error, 'status')
      } else {
        const { data, error } = await lerConexao(userId)
        if (cancel) return
        if (error) {
          setHidden(true)
          return
        }
        setHidden(false)
        if (data?.status) setStatus(data.status)
        if (data?.phone_number) setPhone(data.phone_number)
      }
    }
    run()
    return () => { cancel = true }
  }, [userId, manage])

  useEffect(() => {
    if (!manage || status !== 'connecting') return undefined
    const timer = setInterval(async () => {
      const { data, error } = await pedir('status')
      aplicar(data, error, 'status')
    }, 4000)
    return () => clearInterval(timer)
  }, [manage, status])

  if (!manage && hidden) return null

  if (!manage) {
    return (
      <div style={{ fontSize: '12px', color: status === 'connected' ? '#166534' : '#92400e', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
        <span>{rotuloStatus(status)}{phone ? ` · ${phone}` : ''}</span>
        {canOpenSettings && <Link to="/configuracoes" style={{ color: '#2563eb' }}>Configurar</Link>}
      </div>
    )
  }

  return (
    <div id="card-whatsapp" style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #ddd', marginBottom: '20px' }}>
      <h3 style={{ marginTop: 0, color: '#16a34a' }}>WhatsApp do salão</h3>
      <p style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 'bold', color: status === 'connected' ? '#166534' : '#92400e' }}>
        {rotuloStatus(status)}{phone ? ` · ${phone}` : ''}
      </p>
      {!configured && (
        <p style={{ fontSize: '13px', color: '#92400e', background: '#fffbeb', padding: '10px', borderRadius: '8px' }}>
          O envio automático fica desligado até o gateway estar configurado no servidor. A agenda continua normal.
        </p>
      )}
      {qrImage && status !== 'connected' && (
        <img alt="QR Code para conectar o WhatsApp" src={qrImage} style={{ width: '220px', height: '220px', display: 'block', margin: '8px auto' }} />
      )}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" disabled={busy} onClick={() => executar('connect')} style={btn}>Conectar</button>
        <button type="button" disabled={busy} onClick={() => executar('reconnect')} style={btn}>Reconectar</button>
        <button type="button" disabled={busy} onClick={() => { setQrImage(''); executar('disconnect') }} style={{ ...btn, background: '#fee2e2', color: '#991b1b' }}>Desconectar</button>
      </div>
      <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Enviar um teste pela fila</label>
        <input value={testeTel} onChange={(e) => setTesteTel(e.target.value)} placeholder="(00) 00000-0000" style={inp} />
        <input value={testeTexto} onChange={(e) => setTesteTexto(e.target.value)} style={inp} />
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            const data = await executar('test', { phone: testeTel, text: testeTexto })
            if (data?.ok) toast.success('Teste entrou na fila. O worker envia.')
          }}
          style={btn}
        >
          Enfileirar teste
        </button>
      </div>
    </div>
  )
}

const btn = { background: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 12px', fontWeight: 'bold', cursor: 'pointer' }
const inp = { padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }
