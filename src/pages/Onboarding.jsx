import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useSessionProfile } from '../context/SessionProfile'

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export default function Onboarding() {
  const navigate = useNavigate()
  const { refreshProfile } = useSessionProfile()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [abre, setAbre] = useState('09:00')
  const [fecha, setFecha] = useState('18:00')
  const [servico, setServico] = useState('Pé e mão')
  const [preco, setPreco] = useState('50')

  async function concluir() {
    if (!nome.trim()) return toast.error('Informe o nome do salão')
    if (whatsapp.replace(/\D/g, '').length < 10) return toast.error('Informe o WhatsApp')
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('profiles').update({
      business_name: nome.trim(),
      whatsapp: whatsapp.replace(/\D/g, ''),
      booking_active: true,
      onboarding_done: true,
    }).eq('id', user.id)

    const rows = []
    for (let d = 0; d < 7; d++) {
      const fechado = d === 0
      rows.push({
        user_id: user.id,
        day_of_week: d,
        open_time: abre,
        close_time: fecha,
        is_closed: fechado,
      })
    }
    await supabase.from('business_hours').delete().eq('user_id', user.id)
    await supabase.from('business_hours').insert(rows)

    const { count } = await supabase.from('services').select('*', { count: 'exact', head: true }).eq('user_id', user.id)
    if (!count) {
      await supabase.from('services').insert({
        user_id: user.id,
        name: servico.trim() || 'Pé e mão',
        default_price: parseFloat(String(preco).replace(',', '.')) || 50,
        duration_minutes: 60,
      })
    }

    await refreshProfile()
    setSaving(false)
    toast.success('Pronto! Sua agenda já pode ser usada.')
    navigate('/')
  }

  const passos = [
    {
      title: 'Nome do salão',
      body: (
        <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Studio da Maria" style={inp} />
      ),
    },
    {
      title: 'Seu WhatsApp',
      body: (
        <input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="(00) 00000-0000" style={inp} />
      ),
    },
    {
      title: 'Horário de atendimento',
      body: (
        <div>
          <p style={{ color: '#64748b', fontSize: '13px' }}>Segunda a sábado. Domingo fica fechado — você muda depois em Configurações.</p>
          <label style={lbl}>Abre</label>
          <input type="time" value={abre} onChange={e => setAbre(e.target.value)} style={inp} />
          <label style={lbl}>Fecha</label>
          <input type="time" value={fecha} onChange={e => setFecha(e.target.value)} style={inp} />
          <p style={{ fontSize: '12px', color: '#94a3b8' }}>{DIAS.filter((_, i) => i !== 0).join(', ')}</p>
        </div>
      ),
    },
    {
      title: 'Primeiro serviço',
      body: (
        <div>
          <input value={servico} onChange={e => setServico(e.target.value)} placeholder="Nome" style={inp} />
          <label style={lbl}>Preço (R$)</label>
          <input value={preco} onChange={e => setPreco(e.target.value)} inputMode="decimal" style={inp} />
        </div>
      ),
    },
  ]

  const atual = passos[step]

  return (
    <div style={{ minHeight: '100vh', background: '#eef2f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: 'white', padding: '28px', borderRadius: '16px', width: '100%', maxWidth: '420px', boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}>
        <p style={{ margin: 0, fontSize: '12px', color: '#2563eb', fontWeight: 'bold' }}>PASSO {step + 1} DE {passos.length}</p>
        <h2 style={{ marginTop: '8px' }}>{atual.title}</h2>
        {atual.body}
        <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
          {step > 0 && (
            <button type="button" onClick={() => setStep(s => s - 1)} style={{ ...btn, background: 'white', color: '#2563eb', border: '1px solid #2563eb' }}>Voltar</button>
          )}
          {step < passos.length - 1 ? (
            <button type="button" onClick={() => setStep(s => s + 1)} style={btn}>Continuar</button>
          ) : (
            <button type="button" disabled={saving} onClick={concluir} style={btn}>{saving ? 'Salvando...' : 'Começar a usar'}</button>
          )}
        </div>
      </div>
    </div>
  )
}

const inp = { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', boxSizing: 'border-box', marginTop: '8px' }
const lbl = { display: 'block', fontSize: '12px', fontWeight: 'bold', marginTop: '12px' }
const btn = { flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: '#2563eb', color: 'white', fontWeight: 'bold', cursor: 'pointer' }
