import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, json } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const mpToken = Deno.env.get('MP_ACCESS_TOKEN')
    if (!mpToken) {
      return json({ ok: false, reason: 'MP_ACCESS_TOKEN não configurado nas secrets do Supabase.' }, 500)
    }

    const authHeader = req.headers.get('Authorization') || ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) {
      return json({ ok: false, reason: 'Faça login para assinar.' }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const planId = body.plan_id
    const origin = String(body.origin || '').replace(/\/$/, '')
    if (!planId || !origin) {
      return json({ ok: false, reason: 'plan_id e origin são obrigatórios.' }, 400)
    }

    const { data: plan, error: planErr } = await supabase
      .from('subscription_plans')
      .select('id, name, price, active')
      .eq('id', planId)
      .eq('active', true)
      .single()

    if (planErr || !plan) {
      return json({ ok: false, reason: 'Plano inválido.' }, 400)
    }

    const price = Number(plan.price)
    if (!Number.isFinite(price) || price <= 0) {
      return json({ ok: false, reason: 'Preço do plano inválido.' }, 400)
    }

    const notificationUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mp-webhook`

    const preference = {
      items: [{
        title: `Agenda Manicure — ${plan.name}`,
        quantity: 1,
        currency_id: 'BRL',
        unit_price: price,
      }],
      payer: { email: user.email },
      external_reference: `${user.id}|${plan.id}`,
      metadata: { user_id: user.id, plan_id: plan.id },
      notification_url: notificationUrl,
      back_urls: {
        success: `${origin}/planos?mp=success`,
        failure: `${origin}/planos?mp=failure`,
        pending: `${origin}/planos?mp=pending`,
      },
      auto_return: 'approved',
      statement_descriptor: 'AGENDA MANICURE',
    }

    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mpToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preference),
    })

    const mpJson = await mpRes.json()
    if (!mpRes.ok || !mpJson.init_point) {
      console.error('MP preference error', mpJson)
      return json({ ok: false, reason: mpJson.message || 'Não foi possível criar o pagamento.' }, 502)
    }

    return json({
      ok: true,
      init_point: mpJson.init_point,
      sandbox_init_point: mpJson.sandbox_init_point,
    })
  } catch (err) {
    console.error(err)
    return json({ ok: false, reason: 'Erro interno ao criar pagamento.' }, 500)
  }
})
