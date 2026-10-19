import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { json } from '../_shared/cors.ts'
import { createWhatsAppProvider } from '../_shared/whatsapp/provider.ts'

function sessionIdFor(workspaceId: string) {
  return `mm-${workspaceId.replace(/-/g, '').slice(0, 24)}`
}

Deno.serve(async (req) => {
  // OPTIONS precisa responder 200. O JWT de quem está logado é conferido abaixo, no POST.
  if (req.method === 'OPTIONS') return json({ ok: true })
  if (req.method !== 'POST') return json({ ok: false, reason: 'method' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const authHeader = req.headers.get('Authorization') || ''
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: authData } = await userClient.auth.getUser()
  const user = authData.user
  if (!user) return json({ ok: false, reason: 'unauthorized' }, 401)

  const admin = createClient(supabaseUrl, serviceKey)
  const { data: profile } = await admin.from('profiles').select('salon_owner_id, business_name').eq('id', user.id).maybeSingle()
  const workspaceId = profile?.salon_owner_id || user.id
  const isStaff = Boolean(profile?.salon_owner_id)
  const body = await req.json().catch(() => ({}))
  const action = String(body.action || 'status')
  if (isStaff && action !== 'status') return json({ ok: false, reason: 'forbidden' }, 403)

  const provider = createWhatsAppProvider()
  const { data: current } = await admin
    .from('whatsapp_connections')
    .select('*')
    .eq('user_id', workspaceId)
    .maybeSingle()
  const sessionId = current?.provider_session_id || sessionIdFor(workspaceId)

  if (!provider.configured) {
    return json({ ok: action === 'status', reason: action === 'status' ? null : 'not_configured', configured: false, status: current?.status || 'disconnected' })
  }

  if (action === 'disconnect') {
    await provider.disconnect(sessionId)
    await admin.from('whatsapp_connections').upsert({
      user_id: workspaceId,
      provider: 'wa_akg',
      provider_session_id: sessionId,
      status: 'disconnected',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    return json({ ok: true, status: 'disconnected', configured: true })
  }

  if (action === 'test') {
    const phone = String(body.phone || '').replace(/\D/g, '')
    const text = String(body.text || '').trim()
    if (phone.length < 10 || !text) return json({ ok: false, reason: 'Informe telefone e texto' }, 400)
    const now = new Date().toISOString()
    const { error } = await admin.from('notifications').insert({
      user_id: workspaceId,
      channel: 'whatsapp',
      type: 'campaign',
      scheduled_for: now,
      status: 'pending',
      next_attempt_at: now,
      payload: { title: 'Teste', body: text, url: '/', text, phone },
      idempotency_key: `${workspaceId}:test:${crypto.randomUUID()}`,
    })
    if (error) return json({ ok: false, reason: error.message }, 500)
    return json({ ok: true, queued: true, status: current?.status || 'disconnected', configured: true })
  }

  if (action === 'connect' || action === 'reconnect') {
    const connected = await provider.connect({
      sessionId,
      name: profile?.business_name || 'Salao',
      webhookUrl: `${supabaseUrl}/functions/v1/whatsapp-webhook`,
      webhookSecret: Deno.env.get('WHATSAPP_WEBHOOK_SECRET') || '',
    })
    const nowIso = new Date().toISOString()
    await admin.from('whatsapp_connections').upsert({
      user_id: workspaceId,
      provider: 'wa_akg',
      provider_session_id: sessionId,
      display_name: profile?.business_name || null,
      status: connected.status || 'connecting',
      connected_at: connected.status === 'connected' ? nowIso : current?.connected_at || null,
      last_seen_at: nowIso,
      updated_at: nowIso,
    }, { onConflict: 'user_id' })
    return json({
      ok: connected.ok,
      status: connected.status,
      qrImage: connected.qrImage,
      configured: true,
      reason: connected.ok ? null : connected.error,
    })
  }

  const live = current?.provider_session_id ? await provider.getStatus(sessionId) : null
  const status = live?.status || current?.status || 'disconnected'
  if (live?.ok) {
    const nowIso = new Date().toISOString()
    await admin.from('whatsapp_connections').upsert({
      user_id: workspaceId,
      provider: 'wa_akg',
      provider_session_id: sessionId,
      phone_number: live.phone || current?.phone_number || null,
      display_name: live.displayName || current?.display_name || null,
      status,
      connected_at: status === 'connected' ? (current?.connected_at || nowIso) : current?.connected_at || null,
      last_seen_at: nowIso,
      updated_at: nowIso,
    }, { onConflict: 'user_id' })
  }
  return json({
    ok: true,
    status,
    phone: live?.phone || current?.phone_number || null,
    qrImage: live?.qrImage || null,
    configured: true,
  })
})
