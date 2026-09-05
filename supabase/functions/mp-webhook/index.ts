import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { json } from '../_shared/cors.ts'

function parseExternalRef(ref: string | null | undefined) {
  if (!ref) return { userId: null as string | null, planId: null as string | null }
  const [userId, planId] = String(ref).split('|')
  return { userId: userId || null, planId: planId || null }
}

async function fetchPayment(mpToken: string, paymentId: string) {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${mpToken}` },
  })
  if (!res.ok) return null
  return await res.json()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return json({ ok: true })
  }

  try {
    const mpToken = Deno.env.get('MP_ACCESS_TOKEN')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    if (!mpToken || !serviceKey) {
      return json({ ok: false, reason: 'Secrets ausentes.' }, 500)
    }

    const url = new URL(req.url)
    let paymentId = url.searchParams.get('data.id') || url.searchParams.get('id')

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      paymentId = body?.data?.id || body?.id || paymentId
      const topic = body?.type || body?.topic || url.searchParams.get('topic') || url.searchParams.get('type')
      if (topic && !String(topic).includes('payment')) {
        return json({ ok: true, ignored: topic })
      }
    }

    if (!paymentId) {
      return json({ ok: true, ignored: 'sem payment id' })
    }

    const payment = await fetchPayment(mpToken, String(paymentId))
    if (!payment) {
      return json({ ok: false, reason: 'Pagamento não encontrado no Mercado Pago.' }, 404)
    }

    const admin = createClient(supabaseUrl, serviceKey)
    const { error: insertErr } = await admin.from('billing_events').insert({
      mp_payment_id: String(payment.id),
      status: payment.status,
      payload: payment,
    })

    if (insertErr && insertErr.code !== '23505') {
      console.error(insertErr)
      return json({ ok: false, reason: 'Falha ao registrar evento.' }, 500)
    }
    if (insertErr?.code === '23505') {
      return json({ ok: true, duplicate: true })
    }

    if (payment.status !== 'approved') {
      await admin.from('billing_events').update({ status: payment.status }).eq('mp_payment_id', String(payment.id))
      return json({ ok: true, status: payment.status })
    }

    const meta = payment.metadata || {}
    const fromRef = parseExternalRef(payment.external_reference)
    const userId = meta.user_id || meta.userId || fromRef.userId
    const planId = meta.plan_id || meta.planId || fromRef.planId

    if (!userId) {
      return json({ ok: false, reason: 'Pagamento sem user_id.' }, 400)
    }

    const expires = new Date()
    expires.setDate(expires.getDate() + 31)

    const { error: updErr } = await admin.from('profiles').update({
      plan_id: planId || null,
      subscription_status: 'active',
      subscription_expires_at: expires.toISOString(),
      is_blocked: false,
      mp_last_payment_id: String(payment.id),
    }).eq('id', userId)

    if (updErr) {
      console.error(updErr)
      return json({ ok: false, reason: 'Falha ao ativar plano.' }, 500)
    }

    await admin.from('billing_events').update({
      user_id: userId,
      plan_id: planId || null,
      status: 'approved',
    }).eq('mp_payment_id', String(payment.id))

    return json({ ok: true, activated: userId })
  } catch (err) {
    console.error(err)
    return json({ ok: false, reason: 'Erro no webhook.' }, 500)
  }
})
