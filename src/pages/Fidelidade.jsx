import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { Link } from 'react-router-dom'
import { ArrowLeft, Gift, Ticket, Star, Trash2, Plus } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Fidelidade() {
  const [userId, setUserId] = useState(null)
  const [settings, setSettings] = useState({ visits_required: 10, reward_description: '1 serviço grátis', active: true })
  const [cupons, setCupons] = useState([])
  const [clientesTop, setClientesTop] = useState([])

  const [codigo, setCodigo] = useState('')
  const [tipoDesconto, setTipoDesconto] = useState('percent')
  const [valorDesconto, setValorDesconto] = useState('')
  const [maxUsos, setMaxUsos] = useState('')

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const { data: ls } = await supabase.from('loyalty_settings').select('*').eq('user_id', user.id).maybeSingle()
    if (ls) setSettings(ls)

    const { data: c } = await supabase.from('coupons').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    setCupons(c || [])

    const { data: cl } = await supabase.from('clients').select('id, name, loyalty_visits, loyalty_rewards_redeemed').eq('user_id', user.id).order('loyalty_visits', { ascending: false }).limit(10)
    setClientesTop(cl || [])
  }

  async function salvarPrograma() {
    const { error } = await supabase.from('loyalty_settings').upsert({
      user_id: userId,
      visits_required: parseInt(settings.visits_required, 10) || 10,
      reward_description: settings.reward_description,
      active: settings.active,
      updated_at: new Date().toISOString(),
    })
    if (error) toast.error('Erro ao salvar. Execute a migration 002.')
    else toast.success('Programa de fidelidade salvo!')
  }

  async function criarCupom(e) {
    e.preventDefault()
    if (!codigo || !valorDesconto) return toast.error('Preencha código e valor')

    const { error } = await supabase.from('coupons').insert({
      user_id: userId,
      code: codigo.toUpperCase(),
      discount_type: tipoDesconto,
      discount_value: parseFloat(valorDesconto.replace(',', '.')),
      max_uses: maxUsos ? parseInt(maxUsos, 10) : null,
    })

    if (error) toast.error(error.message.includes('unique') ? 'Código já existe' : 'Erro ao criar cupom')
    else {
      toast.success('Cupom criado!')
      setCodigo(''); setValorDesconto(''); setMaxUsos('')
      init()
    }
  }

  async function toggleCupom(id, ativo) {
    await supabase.from('coupons').update({ active: !ativo }).eq('id', id)
    setCupons(prev => prev.map(c => c.id === id ? { ...c, active: !ativo } : c))
  }

  async function excluirCupom(id) {
    if (!window.confirm('Excluir cupom?')) return
    await supabase.from('coupons').delete().eq('id', id)
    toast.success('Cupom removido')
    init()
  }

  async function resgatarPremio(clientId, clientName) {
    const { data: client } = await supabase.from('clients').select('loyalty_visits, loyalty_rewards_redeemed').eq('id', clientId).single()
    if (!client || client.loyalty_visits < settings.visits_required) return toast.error('Visitas insuficientes')

    await supabase.from('clients').update({
      loyalty_visits: client.loyalty_visits - settings.visits_required,
      loyalty_rewards_redeemed: (client.loyalty_rewards_redeemed || 0) + 1,
    }).eq('id', clientId)

    toast.success(`Prêmio resgatado para ${clientName}!`)
    init()
  }

  return (
    <div style={{ paddingBottom: '50px', minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ background: 'white', padding: '15px 20px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '15px' }}>
        <Link to="/" style={{ color: '#000' }}><ArrowLeft size={28} /></Link>
        <h2 style={{ margin: 0, fontSize: '20px' }}>Fidelidade & Cupons</h2>
      </div>

      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={card}>
          <h3 style={{ marginTop: 0, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: '8px' }}><Gift size={20} /> Programa de Fidelidade</h3>
          <label style={lbl}>Visitas para ganhar prêmio</label>
          <input type="number" value={settings.visits_required} onChange={e => setSettings({ ...settings, visits_required: e.target.value })} style={inp} />
          <label style={lbl}>Descrição do prêmio</label>
          <input value={settings.reward_description} onChange={e => setSettings({ ...settings, reward_description: e.target.value })} style={inp} />
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '12px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={settings.active} onChange={e => setSettings({ ...settings, active: e.target.checked })} /> Programa ativo
          </label>
          <button onClick={salvarPrograma} style={btn}>Salvar programa</button>
        </div>

        <div style={card}>
          <h3 style={{ marginTop: 0, color: '#2563eb', display: 'flex', alignItems: 'center', gap: '8px' }}><Ticket size={20} /> Novo cupom</h3>
          <form onSubmit={criarCupom} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input placeholder="Código (ex: VERAO10)" value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} style={inp} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <select value={tipoDesconto} onChange={e => setTipoDesconto(e.target.value)} style={inp}>
                <option value="percent">% desconto</option>
                <option value="fixed">R$ fixo</option>
              </select>
              <input placeholder={tipoDesconto === 'percent' ? '10' : '15.00'} value={valorDesconto} onChange={e => setValorDesconto(e.target.value)} style={inp} inputMode="decimal" />
            </div>
            <input placeholder="Máx. usos (opcional)" value={maxUsos} onChange={e => setMaxUsos(e.target.value)} style={inp} type="number" />
            <button type="submit" style={btn}><Plus size={16} style={{ verticalAlign: 'middle' }} /> Criar cupom</button>
          </form>
        </div>

        {cupons.length > 0 && (
          <div style={card}>
            <h3 style={{ marginTop: 0 }}>Cupons ({cupons.length})</h3>
            {cupons.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #eee' }}>
                <div>
                  <strong style={{ color: c.active ? '#1e293b' : '#94a3b8' }}>{c.code}</strong>
                  <span style={{ display: 'block', fontSize: '12px', color: '#64748b' }}>
                    {c.discount_type === 'percent' ? `${c.discount_value}%` : `R$ ${c.discount_value}`} · {c.uses_count || 0}{c.max_uses ? `/${c.max_uses}` : ''} usos
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => toggleCupom(c.id, c.active)} style={{ ...btnMini, background: c.active ? '#dcfce7' : '#f1f5f9' }}>{c.active ? 'ON' : 'OFF'}</button>
                  <button onClick={() => excluirCupom(c.id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={card}>
          <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><Star size={20} color="#f59e0b" /> Ranking fidelidade</h3>
          {clientesTop.length === 0 ? <p style={{ color: '#94a3b8' }}>Nenhuma cliente ainda.</p> : clientesTop.map(c => {
            const progresso = Math.min(100, ((c.loyalty_visits || 0) / settings.visits_required) * 100)
            const podeResgatar = (c.loyalty_visits || 0) >= settings.visits_required
            return (
              <div key={c.id} style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}>
                  <span>{c.name}</span>
                  <span>{c.loyalty_visits || 0}/{settings.visits_required} {c.loyalty_rewards_redeemed ? `· ${c.loyalty_rewards_redeemed} resgatados` : ''}</span>
                </div>
                <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progresso}%`, background: podeResgatar ? '#16a34a' : '#2563eb' }} />
                </div>
                {podeResgatar && settings.active && (
                  <button onClick={() => resgatarPremio(c.id, c.name)} style={{ ...btnMini, marginTop: '6px', background: '#dcfce7', color: '#166534', fontWeight: 'bold' }}>Resgatar prêmio</button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const card = { background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #ddd' }
const inp = { padding: '12px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '16px', width: '100%', boxSizing: 'border-box', marginBottom: '8px' }
const lbl = { fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }
const btn = { padding: '14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', width: '100%' }
const btnMini = { padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', cursor: 'pointer', fontSize: '12px' }
