import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { Link } from 'react-router-dom'
import { ArrowLeft, Package, Plus, Trash2, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Estoque() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [nome, setNome] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [minimo, setMinimo] = useState('1')
  const [unidade, setUnidade] = useState('un')

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setLoading(true)
    const { data } = await supabase.from('inventory_items').select('*').order('name')
    setItems(data || [])
    setLoading(false)
  }

  async function adicionar(e) {
    e.preventDefault()
    if (!nome || quantidade === '') return toast.error('Preencha nome e quantidade')

    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('inventory_items').insert({
      user_id: user.id,
      name: nome,
      quantity: parseFloat(quantidade.replace(',', '.')),
      min_quantity: parseFloat(minimo.replace(',', '.')) || 1,
      unit: unidade,
    })

    if (error) toast.error('Erro ao salvar. Execute a migration 002.')
    else {
      toast.success('Item adicionado!')
      setNome(''); setQuantidade(''); setMinimo('1')
      carregar()
    }
  }

  async function ajustar(id, delta) {
    const item = items.find(i => i.id === id)
    if (!item) return
    const novaQtd = Math.max(0, Number(item.quantity) + delta)
    await supabase.from('inventory_items').update({ quantity: novaQtd }).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, quantity: novaQtd } : i))
  }

  async function excluir(id) {
    if (!window.confirm('Excluir item?')) return
    await supabase.from('inventory_items').delete().eq('id', id)
    toast.success('Removido')
    carregar()
  }

  const alertas = items.filter(i => Number(i.quantity) <= Number(i.min_quantity))

  return (
    <div style={{ paddingBottom: '50px', minHeight: '100%', background: '#f8fafc' }}>
      <div style={{ background: 'white', padding: '15px 20px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '15px' }}>
        <Link to="/" style={{ color: '#000' }}><ArrowLeft size={28} /></Link>
        <h2 style={{ margin: 0, fontSize: '20px' }}>Estoque</h2>
      </div>

      <div className="page-inner" style={{ padding: '20px' }}>
        {alertas.length > 0 && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626', fontWeight: 'bold', marginBottom: '8px' }}>
              <AlertTriangle size={18} /> {alertas.length} item(ns) com estoque baixo
            </div>
            {alertas.map(a => (
              <div key={a.id} style={{ fontSize: '13px', color: '#991b1b' }}>{a.name}: {a.quantity} {a.unit} (mín. {a.min_quantity})</div>
            ))}
          </div>
        )}

        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #ddd', marginBottom: '20px' }}>
          <h3 style={{ marginTop: 0, color: '#2563eb', display: 'flex', alignItems: 'center', gap: '8px' }}><Plus size={18} /> Novo item</h3>
          <form onSubmit={adicionar} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input placeholder="Nome (ex: Acetona)" value={nome} onChange={e => setNome(e.target.value)} style={inp} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <input placeholder="Quantidade" value={quantidade} onChange={e => setQuantidade(e.target.value)} style={inp} inputMode="decimal" />
              <select value={unidade} onChange={e => setUnidade(e.target.value)} style={inp}>
                <option value="un">un</option>
                <option value="ml">ml</option>
                <option value="g">g</option>
                <option value="pct">pct</option>
              </select>
            </div>
            <input placeholder="Alerta quando abaixo de..." value={minimo} onChange={e => setMinimo(e.target.value)} style={inp} inputMode="decimal" />
            <button type="submit" style={btn}>Adicionar</button>
          </form>
        </div>

        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Package size={18} /> Itens ({items.length})</h3>
        {loading ? <p>Carregando...</p> : items.length === 0 ? (
          <p style={{ color: '#94a3b8', textAlign: 'center' }}>Nenhum item cadastrado.</p>
        ) : (
          items.map(item => {
            const baixo = Number(item.quantity) <= Number(item.min_quantity)
            return (
              <div key={item.id} style={{ background: 'white', padding: '14px', borderRadius: '10px', marginBottom: '8px', border: `1px solid ${baixo ? '#fca5a5' : '#e5e7eb'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{item.name}</strong>
                  <span style={{ display: 'block', fontSize: '13px', color: baixo ? '#dc2626' : '#64748b' }}>
                    {item.quantity} {item.unit} {baixo && '· ESTOQUE BAIXO'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button onClick={() => ajustar(item.id, -1)} style={btnMini}>-</button>
                  <button onClick={() => ajustar(item.id, 1)} style={btnMini}>+</button>
                  <button onClick={() => excluir(item.id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}><Trash2 size={18} /></button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

const inp = { padding: '12px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '16px', width: '100%', boxSizing: 'border-box' }
const btn = { padding: '14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }
const btnMini = { width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', fontWeight: 'bold' }
