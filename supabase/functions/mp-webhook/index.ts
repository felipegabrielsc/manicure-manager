import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { json } from '../_shared/cors.ts'
import {
  billingAction,
  computeExpiryIso,
  planPeriodDays,
  resolvePayer,
} from '../_shared/mpBilling.js'

async function fetchPayment(mpToken: string, paymentId: string) {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${mpToken}` },
  })
  if (res.status === 404) return { missing: true as const, payment: null, retry: false }
  if (!res.ok) return { missing: false, payment: null, retry: true }
  return { missing: false, payment: await res.json(), retry: false }
}

function logSafe(message: string, extra: Record<string, unknown> = {}) {
  console.error(JSON.stringify({ message, ...extra }))
}

async function upsertEvent(admin: ReturnType<typeof createClient>, payment: Record<string, unknown>) {
  const pid = String(payment.id)
  const { data: existing } = await admin
    .from('billing_events')
    .select('id, effect, effect_applied_at, notification_count, user_id, plan_id')
    .eq('mp_payment_id', pid)
    .maybeSingle()

  const payload = {
    id: payment.id,
    status: payment.status,
    status_detail: payment.status_detail,
    external_reference: payment.external_reference,
    metadata: payment.metadata,
    date_approved: payment.date_approved,
    transaction_amount: payment.transaction_amount,
  }

  if (!existing) {
    const { data, error } = await admin.from('billing_events').insert({
      mp_payment_id: pid,
      status: payment.status,
      payload,
      notification_count: 1,
      last_seen_at: new Date().toISOString(),
      effect: 'none',
    }).select('id, effect, effect_applied_at, notification_count, user_id, plan_id').single()

    if (error?.code === '23505') {
      const { data: again } = await admin
        .from('billing_events')
        .select('id, effect, effect_applied_at, notification_count, user_id, plan_id')
        .eq('mp_payment_id', pid)
        .maybeSingle()
      return again
    }
    if (error) throw error
    return data
  }

  const { data, error } = await admin.from('billing_events').update({
    status: payment.status,
    payload,
    notification_count: (existing.notification_count || 1) + 1,
    last_seen_at: new Date().toISOString(),
  }).eq('mp_payment_id', pid).select('id, effect, effect_applied_at, notification_count, user_id, plan_id').single()

  if (error) throw error
  return data
}

async function claimActivation(
  admin: ReturnType<typeof createClient>,
  paymentId: string,
  extra: Record<string, unknown>,
) {
  const { data, error } = await admin.from('billing_events').update({
    effect: 'activated',
    effect_applied_at: new Date().toISOString(),
    ...extra,
  }).eq('mp_payment_id', paymentId).is('effect_applied_at', null).select('id')

  if (error) {
    if (/effect/i.test(error.message)) {
      throw new Error('Rode o SQL 029 no Supabase (idempotência MP).')
    }
    throw error
  }
  return Array.isArray(data) && data.length > 0
}

async function claimRefund(admin: ReturnType<typeof createClient>, paymentId: string, status: string) {
  const { data, error } = await admin.from('billing_events').update({
    effect: 'refunded',
    status,
  }).eq('mp_payment_id', paymentId).eq('effect', 'activated').select('id')

  if (error) throw error
  return Array.isArray(data) && data.length > 0
}

async function releaseActivation(admin: ReturnType<typeof createClient>, paymentId: string) {
  await admin.from('billing_events').update({
    effect: 'none',
    effect_applied_at: null,
  }).eq('mp_payment_id', paymentId)
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

    const fetched = await fetchPayment(mpToken, String(paymentId))
    if (fetched.retry) {
      logSafe('mp_api_retry', { paymentId: String(paymentId) })
      return json({ ok: false, reason: 'API Mercado Pago indisponível.' }, 503)
    }
    if (fetched.missing || !fetched.payment) {
      return json({ ok: true, ignored: 'pagamento inexistente' })
    }

    const payment = fetched.payment
    const admin = createClient(supabaseUrl, serviceKey)
    const row = await upsertEvent(admin, payment)
    const action = billingAction(payment.status)
    const payer = resolvePayer(payment)

    if (action === 'wait' || action === 'reject') {
      return json({ ok: true, status: payment.status, effect: row?.effect || 'none' })
    }

    if (action === 'activate') {
      if (row?.effect === 'activated') {
        return json({ ok: true, duplicate: true, effect: 'activated' })
      }
      if (row?.effect === 'refunded') {
        return json({ ok: true, duplicate: true, effect: 'refunded' })
      }
      if (!payer.userId) {
        return json({ ok: true, ignored: 'sem user_id' })
      }

      const claimed = await claimActivation(admin, String(payment.id), {
        user_id: payer.userId,
        plan_id: payer.planId || null,
        status: 'approved',
      })
      if (!claimed) {
        return json({ ok: true, duplicate: true, effect: 'activated' })
      }

      try {
        const { data: plan } = payer.planId
          ? await admin.from('subscription_plans').select('interval_type').eq('id', payer.planId).maybeSingle()
          : { data: null }
        const days = planPeriodDays(plan?.interval_type)
        const { data: prof } = await admin
          .from('profiles')
          .select('subscription_status, subscription_expires_at, plan_id')
          .eq('id', payer.userId)
          .maybeSingle()

        const stackFrom = prof?.subscription_status === 'active' ? prof.subscription_expires_at : null
        const expires = computeExpiryIso(new Date(), stackFrom, days)

        const { error: updErr } = await admin.from('profiles').update({
          plan_id: payer.planId || prof?.plan_id || null,
          subscription_status: 'active',
          subscription_expires_at: expires,
          is_blocked: false,
          mp_last_payment_id: String(payment.id),
        }).eq('id', payer.userId)

        if (updErr) throw updErr
        return json({ ok: true, activated: payer.userId, duplicate: false })
      } catch (err) {
        await releaseActivation(admin, String(payment.id))
        throw err
      }
    }

    if (action === 'refund') {
      if (row?.effect === 'refunded') {
        return json({ ok: true, duplicate: true, effect: 'refunded' })
      }
      if (row?.effect !== 'activated') {
        return json({ ok: true, effect: 'ignored', status: payment.status })
      }

      const claimed = await claimRefund(admin, String(payment.id), String(payment.status))
      if (!claimed) {
        return json({ ok: true, duplicate: true, effect: 'refunded' })
      }

      try {
        const userId = payer.userId || row.user_id
        if (userId) {
          await admin.from('profiles').update({
            subscription_status: 'cancelled',
          }).eq('id', userId).eq('mp_last_payment_id', String(payment.id))
        }
        return json({ ok: true, effect: 'refunded' })
      } catch (err) {
        await admin.from('billing_events').update({
          effect: 'activated',
        }).eq('mp_payment_id', String(payment.id)).eq('effect', 'refunded')
        throw err
      }
    }

    return json({ ok: true, status: payment.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro no webhook.'
    logSafe('mp_webhook_error', { reason: message })
    return json({ ok: false, reason: message }, 500)
  }
})
