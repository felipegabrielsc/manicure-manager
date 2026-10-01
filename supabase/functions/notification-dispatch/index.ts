import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import webpush from 'npm:web-push@3.6.7'
import { json } from '../_shared/cors.ts'

const RETRY_DELAYS_MS = [30_000, 2 * 60_000, 10 * 60_000]

function authorized(req: Request) {
  const secret = Deno.env.get('CRON_SECRET') || ''
  const header = req.headers.get('x-cron-secret') || ''
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (secret && (header === secret || bearer === secret)) return true
  if (service && bearer === service) return true
  return false
}

function retryAfterFailure(attemptsAfterThisTry, now: Date) {
  if (attemptsAfterThisTry >= 4) return { status: 'failed', nextAttemptAt: null }
  const delay = RETRY_DELAYS_MS[attemptsAfterThisTry - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]
  return { status: 'pending', nextAttemptAt: new Date(now.getTime() + delay).toISOString() }
}

async function sendPush(admin: ReturnType<typeof createClient>, userId: string, payload: { title?: string; body?: string; url?: string }) {
  const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', userId)
  if (!subs?.length) return { ok: false, reason: 'no_subscription' }
  let sent = 0
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: payload.title || 'Agenda', body: payload.body || '', url: payload.url || '/' }),
      )
      sent += 1
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        await admin.from('push_subscriptions').delete().eq('id', sub.id)
      } else {
        console.error('push fail', status, err)
      }
    }
  }
  return sent > 0 ? { ok: true } : { ok: false, reason: 'push_failed' }
}

async function markLegacy(admin: ReturnType<typeof createClient>, row: { appointment_id?: number; type: string }, nowIso: string) {
  if (!row.appointment_id) return
  if (row.type === 'appointment_created') {
    await admin.from('appointments').update({ push_pending_sent_at: nowIso }).eq('id', row.appointment_id).is('push_pending_sent_at', null)
  }
  if (row.type === 'appointment_reminder_24h' || row.type === 'appointment_reminder_2h') {
    await admin.from('appointments').update({ push_reminder_sent_at: nowIso }).eq('id', row.appointment_id).is('push_reminder_sent_at', null)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true })
  if (!authorized(req)) return json({ ok: false, reason: 'unauthorized' }, 401)

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:contato@agendamanicure.app'
  if (publicKey && privateKey) webpush.setVapidDetails(subject, publicKey, privateKey)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const now = new Date()
  const nowIso = now.toISOString()
  const { data: due, error } = await admin
    .from('notifications')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', nowIso)
    .lte('next_attempt_at', nowIso)
    .order('next_attempt_at')
    .limit(40)

  if (error) return json({ ok: false, reason: error.message }, 500)

  let sent = 0
  let held = 0
  let failed = 0

  for (const row of due || []) {
    const { data: claimed } = await admin
      .from('notifications')
      .update({ status: 'sending', updated_at: nowIso })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
    if (!claimed?.length) continue

    const payload = row.payload || {}

    if (row.channel === 'email' || row.channel === 'sms') {
      await admin.from('notifications').update({
        status: 'failed',
        error_message: 'unsupported_channel',
        updated_at: new Date().toISOString(),
      }).eq('id', row.id)
      failed += 1
      continue
    }

    if (row.channel === 'whatsapp') {
      const next = new Date(Date.now() + 10 * 60 * 1000).toISOString()
      await admin.from('notifications').update({
        status: 'pending',
        error_message: 'no_connection',
        next_attempt_at: next,
        updated_at: new Date().toISOString(),
      }).eq('id', row.id)
      held += 1
      continue
    }

    if (!publicKey || !privateKey) {
      const decision = retryAfterFailure((row.attempts || 0) + 1, new Date())
      await admin.from('notifications').update({
        status: decision.status,
        attempts: (row.attempts || 0) + 1,
        next_attempt_at: decision.nextAttemptAt,
        error_message: 'VAPID ausente',
        updated_at: new Date().toISOString(),
      }).eq('id', row.id)
      if (decision.status === 'failed') failed += 1
      continue
    }

    const result = await sendPush(admin, row.user_id, payload)
    if (result.ok) {
      const sentAt = new Date().toISOString()
      await admin.from('notifications').update({
        status: 'sent',
        sent_at: sentAt,
        provider: 'web_push',
        error_message: null,
        updated_at: sentAt,
      }).eq('id', row.id)
      await markLegacy(admin, row, sentAt)
      sent += 1
      continue
    }

    const decision = retryAfterFailure((row.attempts || 0) + 1, new Date())
    await admin.from('notifications').update({
      status: decision.status,
      attempts: (row.attempts || 0) + 1,
      next_attempt_at: decision.nextAttemptAt,
      error_message: result.reason || 'push_failed',
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)
    if (decision.status === 'failed') failed += 1
  }

  return json({ ok: true, sent, held, failed, seen: due?.length || 0 })
})
