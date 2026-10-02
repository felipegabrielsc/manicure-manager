import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { json } from '../_shared/cors.ts'
import { mapGatewayStatus } from '../_shared/whatsapp/format.ts'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true })
  const secret = Deno.env.get('WHATSAPP_WEBHOOK_SECRET') || ''
  const raw = await req.text()
  if (!secret || !(await authorized(secret, req, raw))) return json({ ok: false, reason: 'unauthorized' }, 401)

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
    await admin.from('whatsapp_inbound').insert({
      user_id: connection.user_id,
      provider_session_id: sessionId,
      remote_jid: remote || null,
      phone,
      body,
      provider_message_id: data.key?.id || null,
      received_at: payload.timestamp || nowIso,
    })
    await admin.from('whatsapp_connections').update({ last_seen_at: nowIso, updated_at: nowIso }).eq('id', connection.id)
  }

  return json({ ok: true })
})
