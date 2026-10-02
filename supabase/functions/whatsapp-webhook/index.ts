import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { json } from '../_shared/cors.ts'
import { mapGatewayStatus } from '../_shared/whatsapp/format.ts'
import { createWhatsAppProvider } from '../_shared/whatsapp/provider.ts'
import { assistantEnabled, runAssistantTurn } from '../../../src/application/assistant/turn.js'
import { webhookSecretDistinct } from '../../../src/application/dispatchPolicy.js'

async function authorized(secret: string, req: Request, raw: string) {
  const header = req.headers.get('x-webhook-secret') || ''
  if (header && header === secret) return true
  const signature = req.headers.get('x-webhook-signature') || ''
  if (!signature) return false
  const expected = signature.replace(/^sha256=/, '')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))
  const actual = [...new Uint8Array(signed)].map((b) => b.toString(16).padStart(2, '0')).join('')
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

function last11(phone: string) {
  return String(phone || '').replace(/\D/g, '').slice(-11)
}

async function deliverReply(admin: ReturnType<typeof createClient>, workspaceId: string, sessionId: string, phone: string, text: string, messageId: string) {
  const whatsapp = createWhatsAppProvider()
  const { data: connection } = await admin
    .from('whatsapp_connections')
    .select('status, provider_session_id')
    .eq('user_id', workspaceId)
    .maybeSingle()
  if (connection?.status === 'connected' && connection.provider_session_id) {
    const sent = await whatsapp.sendText({ sessionId: connection.provider_session_id || sessionId, phone, text })
    if (sent.ok) return
  }
  const nowIso = new Date().toISOString()
  await admin.from('notifications').upsert({
    user_id: workspaceId,
    channel: 'whatsapp',
    type: 'campaign',
    scheduled_for: nowIso,
    status: 'pending',
    next_attempt_at: nowIso,
    payload: { title: 'Resposta', body: text, url: '/', text, phone },
    idempotency_key: `${workspaceId}:assistant-reply:${messageId}`,
  }, { onConflict: 'idempotency_key', ignoreDuplicates: true })
}

async function assist(admin: ReturnType<typeof createClient>, workspaceId: string, sessionId: string, phone: string, body: string, messageId: string) {
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('ai_enabled, business_name, address')
    .eq('id', workspaceId)
    .maybeSingle()
  if (profileError || !assistantEnabled(profile)) return

  const since = new Date().toISOString()
  const until = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString()
  const [services, hours, appointments, blocked, clients, session] = await Promise.all([
    admin.from('services').select('id, name, duration_minutes, default_price').eq('user_id', workspaceId),
    admin.from('business_hours').select('day_of_week, open_time, close_time, break_start, break_end, is_closed').eq('user_id', workspaceId),
    admin.from('appointments').select('id, client_id, status, service_id, start_time, services(duration_minutes, name)').eq('user_id', workspaceId).gte('start_time', since).lte('start_time', until),
    admin.from('blocked_slots').select('id, start_time, end_time').eq('user_id', workspaceId).gte('start_time', since).lte('start_time', until),
    admin.from('clients').select('id, name, phone').eq('user_id', workspaceId),
    admin.from('assistant_sessions').select('state').eq('user_id', workspaceId).eq('phone', last11(phone)).maybeSingle(),
  ])
  const client = (clients.data || []).find((item) => last11(item.phone || '') === last11(phone)) || null
  const decision = runAssistantTurn({
    text: body,
    state: session.data?.state || {},
    now: new Date(),
    catalog: {
      phone,
      profile,
      client,
      services: services.data || [],
      businessHours: hours.data || [],
      appointments: appointments.data || [],
      blockedSlots: blocked.data || [],
    },
  })

  let say = decision.say
  let savedOk = !decision.action
  if (decision.action?.type === 'create_appointment') {
    const anon = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '')
    const { data, error } = await anon.rpc('marcar_horario_site', {
      p_salon: workspaceId,
      p_servico: String(decision.action.serviceId),
      p_quando: decision.action.startTime,
      p_nome: decision.action.clientName || 'Cliente',
      p_whatsapp: phone,
    })
    savedOk = data?.ok === true
    say = savedOk ? decision.say : (data?.reason || error?.message || 'Não consegui anotar esse horário.')
  } else if (decision.action?.type === 'cancel_appointment') {
    const { data } = await admin.rpc('assistente_cancelar', {
      p_salon: workspaceId,
      p_phone: phone,
      p_appointment_id: decision.action.appointmentId,
    })
    savedOk = data?.ok === true
    say = savedOk ? decision.say : (data?.reason || 'Não consegui cancelar. A manicure vai ver.')
  } else if (decision.action?.type === 'reschedule_appointment') {
    const { data } = await admin.rpc('assistente_remarcar', {
      p_salon: workspaceId,
      p_phone: phone,
      p_appointment_id: decision.action.appointmentId,
      p_quando: decision.action.startTime,
    })
    savedOk = data?.ok === true
    say = savedOk ? decision.say : (data?.reason || 'Não consegui remarcar. A manicure vai ver.')
  }

  await admin.from('assistant_sessions').upsert({
    user_id: workspaceId,
    phone: last11(phone),
    state: savedOk ? (decision.nextState || {}) : (session.data?.state || {}),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,phone' })

  if (decision.handoff) {
    const nowIso = new Date().toISOString()
    await admin.from('notifications').upsert({
      user_id: workspaceId,
      channel: 'push',
      type: 'campaign',
      scheduled_for: nowIso,
      status: 'pending',
      next_attempt_at: nowIso,
      payload: {
        title: 'Cliente chamou',
        body: 'Uma cliente pediu para falar com você no WhatsApp.',
        url: '/',
        text: 'Uma cliente pediu para falar com você no WhatsApp.',
      },
      idempotency_key: `${workspaceId}:assistant-handoff:${messageId}`,
    }, { onConflict: 'idempotency_key', ignoreDuplicates: true })
  }

  if (say) await deliverReply(admin, workspaceId, sessionId, phone, say, messageId)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true })
  const secret = Deno.env.get('WHATSAPP_WEBHOOK_SECRET') || ''
  const raw = await req.text()
  const secretOk = webhookSecretDistinct(secret, {
    cronSecret: Deno.env.get('CRON_SECRET') || '',
    mpToken: Deno.env.get('MP_ACCESS_TOKEN') || '',
  })
  if (!secretOk || !(await authorized(secret, req, raw))) return json({ ok: false, reason: 'unauthorized' }, 401)

  let payload: {
    event?: string
    sessionId?: string
    timestamp?: string
    data?: {
      sessionId?: string
      status?: string
      isGroup?: boolean
      from?: string
      content?: string
      caption?: string
      key?: { id?: string; remoteJid?: string }
    }
  }
  try {
    payload = JSON.parse(raw || '{}')
  } catch {
    return json({ ok: false, reason: 'invalid_json' }, 400)
  }
  const sessionId = String(payload.sessionId || payload.data?.sessionId || '')
  if (!sessionId) return json({ ok: true, ignored: true })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  const { data: connection } = await admin
    .from('whatsapp_connections')
    .select('id, user_id')
    .eq('provider_session_id', sessionId)
    .maybeSingle()
  if (!connection) return json({ ok: true, ignored: true })

  const event = String(payload.event || '')
  const data = payload.data || {}
  const nowIso = new Date().toISOString()

  if (event === 'connection.update') {
    const status = mapGatewayStatus(String(data.status || ''))
    const patch: Record<string, string> = { status, last_seen_at: nowIso, updated_at: nowIso }
    if (status === 'connected') patch.connected_at = nowIso
    await admin.from('whatsapp_connections').update(patch).eq('id', connection.id)
  }

  if (event === 'message.received' && !data.isGroup) {
    const remote = String(data.from || data.key?.remoteJid || '')
    const phone = remote.split('@')[0].replace(/\D/g, '') || null
    const body = String(data.content || data.caption || '').slice(0, 2000)
    const messageId = String(data.key?.id || '')
    if (messageId) {
      const { data: prior } = await admin.from('whatsapp_inbound').select('id').eq('provider_message_id', messageId).maybeSingle()
      if (prior) return json({ ok: true, duplicate: true })
    }
    await admin.from('whatsapp_inbound').insert({
      user_id: connection.user_id,
      provider_session_id: sessionId,
      remote_jid: remote || null,
      phone,
      body,
      provider_message_id: messageId || null,
      received_at: payload.timestamp || nowIso,
    })
    await admin.from('whatsapp_connections').update({ last_seen_at: nowIso, updated_at: nowIso }).eq('id', connection.id)
    if (phone && body) {
      try {
        await assist(admin, connection.user_id, sessionId, phone, body, messageId || `${phone}:${nowIso}`)
      } catch {
        console.log(JSON.stringify({ kind: 'assistant', workspace: connection.user_id, status: 'error' }))
      }
    }
  }

  return json({ ok: true })
})
