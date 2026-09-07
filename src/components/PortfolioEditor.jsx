import { useEffect, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { supabase } from '../supabaseClient'
import toast from 'react-hot-toast'

const MAX = 8
const MAX_BYTES = 2.5 * 1024 * 1024

export default function PortfolioEditor({ userId }) {
  const [fotos, setFotos] = useState([])
  const [subindo, setSubindo] = useState(false)

  useEffect(() => {
    if (!userId) return
    carregar()
  }, [userId])

  async function carregar() {
    const { data } = await supabase
      .from('portfolio_photos')
      .select('id, public_url, kind, storage_path')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    setFotos(data || [])
  }

  async function enviar(e, kind) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !userId) return
    if (fotos.length >= MAX) return toast.error(`No máximo ${MAX} fotos`)
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return toast.error('Use JPG, PNG ou WEBP')
    if (file.size > MAX_BYTES) return toast.error('A foto precisa ter até 2,5 MB')

    setSubindo(true)
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${userId}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage.from('portfolio').upload(path, file, { contentType: file.type, upsert: false })
    if (upErr) {
      setSubindo(false)
      return toast.error(upErr.message.includes('Bucket') ? 'Rode o SQL 027 no Supabase (galeria).' : upErr.message)
    }
    const { data: pub } = supabase.storage.from('portfolio').getPublicUrl(path)
    const { error: dbErr } = await supabase.from('portfolio_photos').insert({
      user_id: userId,
      public_url: pub.publicUrl,
      storage_path: path,
      kind,
    })
    setSubindo(false)
    if (dbErr) return toast.error(dbErr.message.includes('portfolio_photos') ? 'Rode o SQL 027 no Supabase.' : dbErr.message)
    toast.success('Foto adicionada')
    carregar()
  }

  async function remover(foto) {
    await supabase.storage.from('portfolio').remove([foto.storage_path])
    const { error } = await supabase.from('portfolio_photos').delete().eq('id', foto.id)
    if (error) return toast.error('Não deu para apagar')
    setFotos(prev => prev.filter(f => f.id !== foto.id))
  }

  return (
    <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #ddd', marginBottom: '20px' }}>
      <h3 style={{ marginTop: 0, color: '#db2777' }}>Fotos do perfil</h3>
      <p style={{ color: '#64748b', fontSize: '13px', marginTop: 0 }}>
        Opcional. Unhas que você fez ou o salão. Aparecem na página pública. Até {MAX} fotos.
      </p>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <label className="ui-btn ui-btn-primary" style={{ fontSize: '13px', padding: '8px 12px', cursor: subindo ? 'wait' : 'pointer' }}>
          <ImagePlus size={16} /> Unha
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={subindo} onChange={e => enviar(e, 'unha')} />
        </label>
        <label className="ui-btn ui-btn-ghost" style={{ fontSize: '13px', padding: '8px 12px', cursor: subindo ? 'wait' : 'pointer' }}>
          <ImagePlus size={16} /> Salão
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={subindo} onChange={e => enviar(e, 'salao')} />
        </label>
      </div>
      {fotos.length === 0 ? (
        <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>Nenhuma foto ainda.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {fotos.map(f => (
            <div key={f.id} style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', aspectRatio: '1' }}>
              <img src={f.public_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <span style={{ position: 'absolute', left: 6, bottom: 6, background: 'rgba(15,23,42,0.7)', color: 'white', fontSize: 10, padding: '2px 6px', borderRadius: 6 }}>
                {f.kind === 'salao' ? 'Salão' : 'Unha'}
              </span>
              <button type="button" onClick={() => remover(f)} style={{ position: 'absolute', top: 6, right: 6, background: '#fff', border: 'none', borderRadius: 8, width: 28, height: 28, cursor: 'pointer' }}>
                <Trash2 size={14} color="#dc2626" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
