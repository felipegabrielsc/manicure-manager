import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { Link } from 'react-router-dom'
import { ArrowLeft, MapPin, Users, Plus, Trash2, Building2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Equipe() {
  const [userId, setUserId] = useState(null)
  const [locations, setLocations] = useState([])
  const [staff, setStaff] = useState([])

  const [locNome, setLocNome] = useState('')
  const [locEndereco, setLocEndereco] = useState('')
  const [staffNome, setStaffNome] = useState('')
  const [staffPhone, setStaffPhone] = useState('')
  const [staffLocation, setStaffLocation] = useState('')

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const [{ data: locs }, { data: team }] = await Promise.all([
      supabase.from('locations').select('*').eq('user_id', user.id).order('name'),
      supabase.from('staff_members').select('*, locations(name)').eq('user_id', user.id).order('name'),
    ])
    setLocations(locs || [])
    setStaff(team || [])
  }

  async function addLocation(e) {
    e.preventDefault()
    if (!locNome) return toast.error('Informe o nome da unidade')
    const isFirst = locations.length === 0
    const { error } = await supabase.from('locations').insert({
      user_id: userId,
      name: locNome,
      address: locEndereco,
      is_default: isFirst,
    })
    if (error) toast.error('Erro. Execute a migration 002.')
    else { toast.success('Unidade adicionada!'); setLocNome(''); setLocEndereco(''); init() }
  }

  async function addStaff(e) {
    e.preventDefault()
    if (!staffNome) return toast.error('Informe o nome')
    const { error } = await supabase.from('staff_members').insert({
      user_id: userId,
      name: staffNome,
      phone: staffPhone.replace(/\D/g, ''),
      location_id: staffLocation || null,
    })
    if (error) toast.error('Erro ao adicionar profissional')
    else { toast.success('Profissional adicionada!'); setStaffNome(''); setStaffPhone(''); init() }
  }

  async function removerLocation(id) {
    if (!window.confirm('Excluir unidade?')) return
    await supabase.from('locations').delete().eq('id', id)
    init()
  }

  async function removerStaff(id) {
    if (!window.confirm('Excluir profissional?')) return
    await supabase.from('staff_members').delete().eq('id', id)
    init()
  }

  async function setDefault(id) {
    await supabase.from('locations').update({ is_default: false }).eq('user_id', userId)
    await supabase.from('locations').update({ is_default: true }).eq('id', id)
    init()
  }

  return (
    <div style={{ paddingBottom: '50px', minHeight: '100%', background: '#f8fafc' }}>
      <div style={{ background: 'white', padding: '15px 20px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '15px' }}>
        <Link to="/" style={{ color: '#000' }}><ArrowLeft size={28} /></Link>
        <h2 style={{ margin: 0, fontSize: '20px' }}>Equipe & Unidades</h2>
      </div>

      <div className="page-inner" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={card}>
          <h3 style={{ marginTop: 0, color: '#2563eb', display: 'flex', alignItems: 'center', gap: '8px' }}><Building2 size={20} /> Unidades</h3>
          <form onSubmit={addLocation} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
            <input placeholder="Nome (ex: Studio Centro)" value={locNome} onChange={e => setLocNome(e.target.value)} style={inp} />
            <input placeholder="Endereço" value={locEndereco} onChange={e => setLocEndereco(e.target.value)} style={inp} />
            <button type="submit" style={btn}><Plus size={16} /> Adicionar unidade</button>
          </form>
          {locations.map(l => (
            <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: '#f8fafc', borderRadius: '8px', marginBottom: '6px' }}>
              <div>
                <strong>{l.name}</strong> {l.is_default && <span style={{ fontSize: '10px', background: '#2563eb', color: 'white', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px' }}>PADRÃO</span>}
                {l.address && <span style={{ display: 'block', fontSize: '12px', color: '#64748b' }}><MapPin size={12} style={{ display: 'inline' }} /> {l.address}</span>}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {!l.is_default && <button onClick={() => setDefault(l.id)} style={btnMini}>Padrão</button>}
                <button onClick={() => removerLocation(l.id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>

        <div style={card}>
          <h3 style={{ marginTop: 0, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: '8px' }}><Users size={20} /> Profissionais</h3>
          <form onSubmit={addStaff} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
            <input placeholder="Nome da profissional" value={staffNome} onChange={e => setStaffNome(e.target.value)} style={inp} />
            <input placeholder="WhatsApp (opcional)" value={staffPhone} onChange={e => setStaffPhone(e.target.value)} style={inp} />
            {locations.length > 0 && (
              <select value={staffLocation} onChange={e => setStaffLocation(e.target.value)} style={inp}>
                <option value="">Sem unidade vinculada</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}
            <button type="submit" style={{ ...btn, background: '#7c3aed' }}><Plus size={16} /> Adicionar profissional</button>
          </form>
          {staff.length === 0 ? <p style={{ color: '#94a3b8' }}>Nenhuma profissional cadastrada.</p> : staff.map(s => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: '#f8fafc', borderRadius: '8px', marginBottom: '6px' }}>
              <div>
                <strong>{s.name}</strong>
                {s.locations?.name && <span style={{ display: 'block', fontSize: '12px', color: '#64748b' }}>{s.locations.name}</span>}
              </div>
              <button onClick={() => removerStaff(s.id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const card = { background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #ddd' }
const inp = { padding: '12px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '16px', width: '100%', boxSizing: 'border-box' }
const btn = { padding: '14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }
const btnMini = { padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', fontSize: '11px' }
