import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { Link, useSearchParams, useLocation } from 'react-router-dom'
import { ArrowLeft, CreditCard, Check, Crown, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSessionProfile } from '../context/SessionProfile'
import { isSubscriptionUsable } from '../utils/entitlements'
import UnlockAdminForm from '../components/UnlockAdminForm'

const DEFAULT_CHECKOUT = import.meta.env.VITE_MERCADOPAGO_CHECKOUT_URL

export default function Planos() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [payingId, setPayingId] = useState(null)
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const { profile, refreshProfile } = useSessionProfile()

  useEffect(() => { init() }, [])

  useEffect(() => {
    const mp = searchParams.get('mp')
    if (mp === 'success') {
      toast.success('Pagamento enviado. O plano confirma em instantes — atualize se ainda não mudou.')
      refreshProfile?.()
    } else if (mp === 'failure') {
      toast.error('Pagamento não concluído.')
    } else if (mp === 'pending') {
      toast('Pagamento pendente. Assim que o Mercado Pago confirmar, o plano ativa sozinho.')
    }
    if (location.state?.needFeature) {
      toast.error(`Seu plano não inclui ${location.state.needFeature}.`)
    } else if (location.state?.expired) {
      toast.error('Seu período acabou. Escolha um plano para continuar.')
    }
  }, [])

  async function init() {
    const { data: pl } = await supabase.from('subscription_plans').select('*').eq('active', true).order('sort_order')
    setPlans(pl || [])
    setLoading(false)
  }

  async function assinar(plan) {
    setPayingId(plan.id)
    const { data, error } = await supabase.functions.invoke('mp-create-preference', {
      body: { plan_id: plan.id, origin: window.location.origin },
    })
    setPayingId(null)

    if (!error && data?.ok && (data.init_point || data.sandbox_init_point)) {
      window.location.assign(data.init_point || data.sandbox_init_point)
      return
    }

    const url = plan.checkout_url || DEFAULT_CHECKOUT
    if (!url) {
      return toast.error(data?.reason || 'Pagamento não configurado. Deploy da função mp-create-preference ou um checkout_url no plano.')
    }
    toast('Abrindo link fixo. O plano só ativa sozinho com a função de webhook.')
    window.open(url, '_blank')
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Carregando...</div>

  const statusLabel = {
    trial: 'Período de teste',
    active: 'Ativo',
    expired: 'Expirado',
    cancelled: 'Cancelado',
  }

  const usable = isSubscriptionUsable(profile)

  return (
    <div style={{ paddingBottom: '50px', minHeight: '100%', background: 'linear-gradient(180deg, #eff6ff, #f8fafc)' }}>
      <div style={{ background: 'white', padding: '15px 20px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '15px' }}>
        <Link to="/" style={{ color: '#000' }}><ArrowLeft size={28} /></Link>
        <h2 style={{ margin: 0, fontSize: '20px' }}>Meu Plano</h2>
      </div>

      <div className="page-inner" style={{ padding: '20px' }}>
        {!usable && (
          <div style={{ background: '#fef3c7', color: '#92400e', padding: '14px 16px', borderRadius: '12px', marginBottom: '16px', fontSize: '14px' }}>
            O acesso às outras telas fica pausado até o pagamento confirmar. Estoque, fidelidade e equipe dependem do plano Pro.
          </div>
        )}

        <div style={{ background: 'white', padding: '20px', borderRadius: '16px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <Crown size={28} color="#2563eb" />
            <div>
              <strong style={{ fontSize: '18px' }}>{profile?.subscription_plans?.name || 'Sem plano'}</strong>
              <span style={{ display: 'block', fontSize: '13px', color: '#64748b' }}>
                Status: {statusLabel[profile?.subscription_status] || profile?.subscription_status || 'trial'}
              </span>
            </div>
          </div>
          {profile?.subscription_expires_at && (
            <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
              Assinatura até: {new Date(profile.subscription_expires_at).toLocaleDateString('pt-BR')}
            </p>
          )}
          {profile?.trial_ends_at && (profile?.subscription_status || 'trial') === 'trial' && (
            <p style={{ fontSize: '13px', color: '#64748b', margin: '6px 0 0' }}>
              Teste até: {new Date(profile.trial_ends_at).toLocaleDateString('pt-BR')}
            </p>
          )}
        </div>

        <h3 style={{ color: '#1e293b', marginBottom: '16px' }}>Planos disponíveis</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {plans.map(plan => {
            const isCurrent = profile?.plan_id === plan.id && usable
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
                  <button onClick={() => assinar(plan)} disabled={payingId === plan.id} style={{
                    width: '100%', padding: '14px', background: '#2563eb', color: 'white', border: 'none',
                    borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    opacity: payingId === plan.id ? 0.7 : 1,
                  }}>
                    <CreditCard size={18} /> {payingId === plan.id ? 'Abrindo Mercado Pago...' : 'Assinar via Mercado Pago'} <ExternalLink size={14} />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {plans.length === 0 && (
          <p style={{ textAlign: 'center', color: '#94a3b8' }}>Execute a migration 002 para carregar os planos.</p>
        )}

        {!profile?.is_admin && (
          <div style={{ marginTop: '28px', padding: '16px', background: 'white', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 8px' }}>Dona do sistema? Código de liberação de admin:</p>
            <UnlockAdminForm onUnlocked={() => refreshProfile?.()} />
          </div>
        )}
      </div>
    </div>
  )
}
