import { useEffect, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { supabase } from '../supabaseClient'
import toast from 'react-hot-toast'

const MAX = 8
const MAX_BYTES = 2.5 * 1024 * 1024

export async function uploadPublicFile(userId, file) {
  if (!file || !userId) throw new Error('Arquivo inválido')
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error('Use JPG, PNG ou WEBP')
  if (file.size > MAX_BYTES) throw new Error('A foto precisa ter até 2,5 MB')
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${userId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('portfolio').upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw new Error(error.message.includes('Bucket') ? 'Rode o SQL 027 no Supabase (galeria).' : error.message)
  const { data: pub } = supabase.storage.from('portfolio').getPublicUrl(path)
  return { path, url: pub.publicUrl }
}

export default function PortfolioEditor({ userId, coverUrl, logoUrl, onBrandChange }) {
  const [fotos, setFotos] = useState([])
  const [subindo, setSubindo] = useState(false)

  useEffect(() => {
    if (!userId) return
    carregar()
  }, [userId])

  async function carregar() {
    const { data } = await supabase
      .from('portfolio_photos')
      .select('id, public_url, extra_url, kind, storage_path')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    setFotos(data || [])
  }

  async function enviarSimples(e, kind) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (fotos.length >= MAX) return toast.error(`No máximo ${MAX} itens`)
    setSubindo(true)
    try {
      const up = await uploadPublicFile(userId, file)
      const { error } = await supabase.from('portfolio_photos').insert({
        user_id: userId,
        public_url: up.url,
        storage_path: up.path,
        kind,
      })
      if (error) throw error
      toast.success('Foto adicionada')
      carregar()
    } catch (err) {
      toast.error(err.message?.includes('portfolio_photos') ? 'Rode o SQL 027/028 no Supabase.' : (err.message || 'Falha no upload'))
    }
    setSubindo(false)
  }

  async function enviarAntesDepois(e) {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (files.length < 2) return toast.error('Escolha 2 fotos: antes e depois')
    if (fotos.length >= MAX) return toast.error(`No máximo ${MAX} itens`)
    setSubindo(true)
    try {
      const antes = await uploadPublicFile(userId, files[0])
      const depois = await uploadPublicFile(userId, files[1])
      const { error } = await supabase.from('portfolio_photos').insert({
        user_id: userId,
        public_url: depois.url,
        extra_url: antes.url,
        storage_path: depois.path,
        kind: 'antes_depois',
      })
      if (error) throw error
      toast.success('Antes e depois salvos')
      carregar()
    } catch (err) {
      toast.error(err.message || 'Falha no upload')
    }
    setSubindo(false)
  }

  async function enviarMarca(e, campo) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setSubindo(true)
    try {
      const up = await uploadPublicFile(userId, file)
      onBrandChange?.(campo, up.url)
      toast.success(campo === 'logo_url' ? 'Logo atualizada' : 'Capa atualizada')
    } catch (err) {
      toast.error(err.message || 'Falha no upload')
    }
    setSubindo(false)
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
        Capa e logo no topo. Unhas, salão ou antes/depois na galeria. Até {MAX} itens. Salve os dados no final da página.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        <label className="ui-btn ui-btn-ghost" style={{ fontSize: 13, padding: '8px 10px', cursor: 'pointer' }}>
          Capa
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={subindo} onChange={e => enviarMarca(e, 'cover_url')} />
        </label>
        <label className="ui-btn ui-btn-ghost" style={{ fontSize: 13, padding: '8px 10px', cursor: 'pointer' }}>
          Logo
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={subindo} onChange={e => enviarMarca(e, 'logo_url')} />
        </label>
      </div>
      {(coverUrl || logoUrl) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
          {coverUrl && <img src={coverUrl} alt="" style={{ height: 48, width: 80, objectFit: 'cover', borderRadius: 8 }} />}
          {logoUrl && <img src={logoUrl} alt="" style={{ height: 48, width: 48, objectFit: 'cover', borderRadius: '50%' }} />}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <label className="ui-btn ui-btn-primary" style={{ fontSize: '13px', padding: '8px 12px', cursor: subindo ? 'wait' : 'pointer' }}>
          <ImagePlus size={16} /> Unha
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={subindo} onChange={e => enviarSimples(e, 'unha')} />
        </label>
        <label className="ui-btn ui-btn-ghost" style={{ fontSize: '13px', padding: '8px 12px', cursor: subindo ? 'wait' : 'pointer' }}>
          <ImagePlus size={16} /> Salão
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={subindo} onChange={e => enviarSimples(e, 'salao')} />
        </label>
        <label className="ui-btn ui-btn-ghost" style={{ fontSize: '13px', padding: '8px 12px', cursor: subindo ? 'wait' : 'pointer' }}>
          <ImagePlus size={16} /> Antes e depois
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden multiple disabled={subindo} onChange={enviarAntesDepois} />
        </label>
      </div>
      {fotos.length === 0 ? (
        <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>Nenhuma foto ainda.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
          {fotos.map(f => (
            <div key={f.id} style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden' }}>
              {f.kind === 'antes_depois' && f.extra_url ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', aspectRatio: '2 / 1' }}>
                  <img src={f.extra_url} alt="Antes" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <img src={f.public_url} alt="Depois" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ) : (
                <div style={{ aspectRatio: '1' }}>
                  <img src={f.public_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
              <span style={{ position: 'absolute', left: 6, bottom: 6, background: 'rgba(15,23,42,0.7)', color: 'white', fontSize: 10, padding: '2px 6px', borderRadius: 6 }}>
                {f.kind === 'salao' ? 'Salão' : f.kind === 'antes_depois' ? 'Antes/depois' : 'Unha'}
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
