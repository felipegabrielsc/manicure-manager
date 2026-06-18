import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { Link } from 'react-router-dom'
import { ArrowLeft, CreditCard, Check, Crown, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'

const DEFAULT_CHECKOUT = import.meta.env.VITE_MERCADOPAGO_CHECKOUT_URL

export default function Planos() {
  const [plans, setPlans] = useState([])
  const [perfil, setPerfil] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: p }, { data: pl }] = await Promise.all([
      supabase.from('profiles').select('*, subscription_plans(name, price)').eq('id', user.id).single(),
      supabase.from('subscription_plans').select('*').eq('active', true).order('sort_order'),
    ])

    setPerfil(p)
    setPlans(pl || [])
    setLoading(false)
  }

  function assinar(plan) {
    const url = plan.checkout_url || DEFAULT_CHECKOUT
    if (!url) {
      return toast.error('Link de pagamento não configurado. Defina checkout_url no plano ou VITE_MERCADOPAGO_CHECKOUT_URL no .env')
    }
    window.open(url, '_blank')
    toast.success('Redirecionando para pagamento...')
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Carregando...</div>

  const statusLabel = {
    trial: 'Período de teste',
    active: 'Ativo',
    expired: 'Expirado',
    cancelled: 'Cancelado',
  }

  return (
    <div style={{ paddingBottom: '50px', minHeight: '100vh', background: 'linear-gradient(180deg, #eff6ff, #f8fafc)' }}>
      <div style={{ background: 'white', padding: '15px 20px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '15px' }}>
        <Link to="/" style={{ color: '#000' }}><ArrowLeft size={28} /></Link>
        <h2 style={{ margin: 0, fontSize: '20px' }}>Meu Plano</h2>
      </div>

      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ background: 'white', padding: '20px', borderRadius: '16px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <Crown size={28} color="#2563eb" />
            <div>
              <strong style={{ fontSize: '18px' }}>{perfil?.subscription_plans?.name || 'Sem plano'}</strong>
              <span style={{ display: 'block', fontSize: '13px', color: '#64748b' }}>
                Status: {statusLabel[perfil?.subscription_status] || perfil?.subscription_status || 'trial'}
              </span>
            </div>
          </div>
          {perfil?.subscription_expires_at && (
            <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
              Válido até: {new Date(perfil.subscription_expires_at).toLocaleDateString('pt-BR')}
            </p>
          )}
        </div>

        <h3 style={{ color: '#1e293b', marginBottom: '16px' }}>Planos disponíveis</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {plans.map(plan => {
            const isCurrent = perfil?.plan_id === plan.id
            const features = Array.isArray(plan.features) ? plan.features : []
            return (
              <div key={plan.id} style={{
                background: 'white', padding: '24px', borderRadius: '16px',
                border: isCurrent ? '2px solid #2563eb' : '1px solid #e2e8f0',
                boxShadow: isCurrent ? '0 4px 20px rgba(37,99,235,0.15)' : 'none',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <h4 style={{ margin: '0 0 4px', fontSize: '20px' }}>{plan.name}</h4>
                    <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>{plan.description}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong style={{ fontSize: '28px', color: '#2563eb' }}>R$ {Number(plan.price).toFixed(0)}</strong>
                    <span style={{ display: 'block', fontSize: '12px', color: '#94a3b8' }}>/mês</span>
                  </div>
                </div>
                <ul style={{ margin: '0 0 16px', padding: '0 0 0 20px', fontSize: '14px', color: '#475569' }}>
                  {features.map((f, i) => (
                    <li key={i} style={{ marginBottom: '4px' }}><Check size={14} style={{ display: 'inline', verticalAlign: 'middle', color: '#16a34a' }} /> {f}</li>
                  ))}
                </ul>
                {isCurrent ? (
                  <div style={{ padding: '12px', background: '#eff6ff', borderRadius: '8px', textAlign: 'center', color: '#2563eb', fontWeight: 'bold' }}>Plano atual</div>
                ) : (
                  <button onClick={() => assinar(plan)} style={{
                    width: '100%', padding: '14px', background: '#2563eb', color: 'white', border: 'none',
                    borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  }}>
                    <CreditCard size={18} /> Assinar via Mercado Pago <ExternalLink size={14} />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {plans.length === 0 && (
          <p style={{ textAlign: 'center', color: '#94a3b8' }}>Execute a migration 002 para carregar os planos.</p>
        )}
      </div>
    </div>
  )
}
