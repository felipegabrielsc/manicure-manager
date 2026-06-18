import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Scissors, MapPin, Instagram, Calendar, MessageCircle, Clock } from 'lucide-react'

export default function PerfilPublico() {
  const { userId } = useParams()
  const [loading, setLoading] = useState(true)
  const [perfil, setPerfil] = useState(null)
  const [servicos, setServicos] = useState([])

  useEffect(() => {
    async function load() {
      const { data: p } = await supabase
        .from('profiles')
        .select('business_name, whatsapp, bio, address, instagram, booking_active, public_profile_active')
        .eq('id', userId)
        .single()

      if (!p || p.public_profile_active === false) {
        setPerfil(null)
        setLoading(false)
        return
      }

      setPerfil(p)

      const { data: s } = await supabase
        .from('services')
        .select('name, default_price, duration_minutes')
        .eq('user_id', userId)
        .order('name')

      setServicos(s || [])
      setLoading(false)
    }
    load()
  }, [userId])

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>Carregando...</div>
  }

  if (!perfil) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center', color: '#666' }}>
        Perfil não encontrado ou indisponível.
      </div>
    )
  }

  const nome = perfil.business_name || 'Manicure'
  const whatsapp = perfil.whatsapp?.replace(/\D/g, '')

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #eff6ff 0%, #f8fafc 40%)', fontFamily: 'sans-serif', paddingBottom: '40px' }}>
      <div style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)', padding: '40px 20px 60px', textAlign: 'center', color: 'white' }}>
        <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Scissors size={36} />
        </div>
        <h1 style={{ margin: '0 0 8px', fontSize: '28px' }}>{nome}</h1>
        {perfil.bio && <p style={{ margin: 0, opacity: 0.9, fontSize: '15px', maxWidth: '400px', marginInline: 'auto' }}>{perfil.bio}</p>}
      </div>

      <div style={{ maxWidth: '480px', margin: '-30px auto 0', padding: '0 20px' }}>
        {(perfil.address || perfil.instagram) && (
          <div style={{ background: 'white', borderRadius: '16px', padding: '16px', marginBottom: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
            {perfil.address && (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: perfil.instagram ? '12px' : 0 }}>
                <MapPin size={18} color="#64748b" style={{ marginTop: '2px', flexShrink: 0 }} />
                <span style={{ color: '#475569', fontSize: '14px' }}>{perfil.address}</span>
              </div>
            )}
            {perfil.instagram && (
              <a href={`https://instagram.com/${perfil.instagram.replace('@', '')}`} target="_blank" rel="noreferrer" style={{ display: 'flex', gap: '10px', alignItems: 'center', color: '#7c3aed', textDecoration: 'none', fontSize: '14px' }}>
                <Instagram size={18} /> @{perfil.instagram.replace('@', '')}
              </a>
            )}
          </div>
        )}

        <div style={{ background: 'white', borderRadius: '16px', padding: '20px', marginBottom: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: '18px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Scissors size={20} color="#2563eb" /> Serviços
          </h2>
          {servicos.length === 0 ? (
            <p style={{ color: '#94a3b8', margin: 0 }}>Em breve novos serviços.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {servicos.map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '10px' }}>
                  <div>
                    <strong style={{ color: '#1e293b' }}>{s.name}</strong>
                    <span style={{ display: 'block', fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                      <Clock size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> {s.duration_minutes ?? 60} min
                    </span>
                  </div>
                  <span style={{ color: '#16a34a', fontWeight: 'bold' }}>R$ {Number(s.default_price).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {perfil.booking_active !== false && (
            <Link
              to={`/agendar/${userId}`}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: '#2563eb', color: 'white', padding: '16px', borderRadius: '14px', textDecoration: 'none', fontWeight: 'bold', fontSize: '16px', boxShadow: '0 4px 15px rgba(37,99,235,0.3)' }}
            >
              <Calendar size={20} /> Agendar horário
            </Link>
          )}
          {whatsapp && (
            <a
              href={`https://wa.me/55${whatsapp}?text=${encodeURIComponent(`Olá ${nome}! Vi seu perfil e gostaria de mais informações.`)}`}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: '#25D366', color: 'white', padding: '16px', borderRadius: '14px', textDecoration: 'none', fontWeight: 'bold', fontSize: '16px' }}
            >
              <MessageCircle size={20} /> Falar no WhatsApp
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
