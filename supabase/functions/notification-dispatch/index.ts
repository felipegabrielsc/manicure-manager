import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import webpush from 'npm:web-push@3.6.7'
import { json } from '../_shared/cors.ts'
import { morningSaoPauloIso } from '../_shared/whatsapp/format.ts'
import { createWhatsAppProvider } from '../_shared/whatsapp/provider.ts'
import { allowSend, dispatchLogEntry, WHATSAPP_BURST_LIMIT } from '../../../src/application/dispatchPolicy.js'

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

function textoMensalidade(name: string, amount: number | null) {
  const valor = amount != null && Number(amount) > 0 ? ` no valor de R$ ${Number(amount).toFixed(2)}` : ''
  return `Oi ${name}! Sua mensalidade vence hoje${valor}. Pode pagar por PIX quando puder 💜`
}

function dueToday(dueDay: number, now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value || '0')
  const year = pick('year')
  const month = pick('month')
  const day = pick('day')
  const lastDay = new Date(year, month, 0).getDate()
  return dueDay >= lastDay ? day === lastDay : day === dueDay
}

async function enqueuePaymentReminders(admin: ReturnType<typeof createClient>, now: Date) {
  const { data: clientes } = await admin
    .from('clients')
    .select('id, user_id, name, phone, monthly_fee, monthly_due_day, type')
    .eq('type', 'MENSALISTA')
  const scheduledFor = morningSaoPauloIso(now)
  const minute = scheduledFor.slice(0, 10) + 'T08:00'
  for (const cli of clientes || []) {
    if (!cli.phone) continue
    if (!dueToday(Number(cli.monthly_due_day) || 10, now)) continue
    const text = textoMensalidade(cli.name || 'Cliente', cli.monthly_fee)
    await admin.from('notifications').upsert({
      user_id: cli.user_id,
      client_id: cli.id,
      channel: 'whatsapp',
      type: 'payment_reminder',
      scheduled_for: scheduledFor,
      status: 'pending',
      next_attempt_at: scheduledFor,
      payload: { title: 'Mensalidade', body: text, url: '/financeiro', text, phone: cli.phone },
      idempotency_key: `${cli.user_id}:${cli.id}:payment_reminder:whatsapp:${minute}`,
    }, { onConflict: 'idempotency_key', ignoreDuplicates: true })
  }
}

async function destinationPhone(admin: ReturnType<typeof createClient>, row: { payload?: { phone?: string }; client_id?: string; appointment_id?: number }) {
  if (row.payload?.phone) return row.payload.phone
  if (row.client_id) {
    const { data } = await admin.from('clients').select('phone').eq('id', row.client_id).maybeSingle()
    if (data?.phone) return data.phone
  }
  if (row.appointment_id) {
    const { data } = await admin.from('appointments').select('clients(phone)').eq('id', row.appointment_id).maybeSingle()
    const clients = data?.clients as { phone?: string } | { phone?: string }[] | null
    const phone = Array.isArray(clients) ? clients[0]?.phone : clients?.phone
    if (phone) return phone
  }
  return null
}

async function holdWhatsapp(admin: ReturnType<typeof createClient>, id: string, errorMessage: string) {
  const next = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  await admin.from('notifications').update({
    status: 'pending',
    error_message: errorMessage,
    next_attempt_at: next,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
}

async function logDispatch(admin: ReturnType<typeof createClient>, entry: ReturnType<typeof dispatchLogEntry>) {
  console.log(JSON.stringify({
    kind: 'notification',
    workspace: entry.user_id,
    type: entry.type,
    channel: entry.channel,
    status: entry.status,
    attempt: entry.attempt,
    phone_tail: entry.phone_tail,
  }))
  await admin.from('notification_attempts').insert(entry)
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
  await enqueuePaymentReminders(admin, now)
  const whatsapp = createWhatsAppProvider()
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
  const sentByWorkspace: Record<string, number> = {}

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
      if (!allowSend(sentByWorkspace, row.user_id, WHATSAPP_BURST_LIMIT)) {
        const next = new Date(Date.now() + 60 * 1000).toISOString()
        await admin.from('notifications').update({
          status: 'pending',
          error_message: 'rate_limit',
          next_attempt_at: next,
          updated_at: next,
        }).eq('id', row.id)
        await logDispatch(admin, dispatchLogEntry({
          workspaceId: row.user_id,
          notificationId: row.id,
          type: row.type,
          channel: row.channel,
          status: 'rate_limit',
          attempt: row.attempts || 0,
          phone: row.payload?.phone,
        }))
        held += 1
        continue
      }
      const { data: connection } = await admin
        .from('whatsapp_connections')
        .select('status, provider_session_id')
        .eq('user_id', row.user_id)
        .maybeSingle()
      if (!connection || connection.status !== 'connected' || !connection.provider_session_id) {
        await holdWhatsapp(admin, row.id, 'no_connection')
        await logDispatch(admin, dispatchLogEntry({
          workspaceId: row.user_id,
          notificationId: row.id,
          type: row.type,
          channel: row.channel,
          status: 'pending',
          attempt: row.attempts || 0,
          phone: row.payload?.phone,
        }))
        held += 1
        continue
      }
      const phone = await destinationPhone(admin, row)
      const text = row.payload?.text || row.payload?.body || ''
      sentByWorkspace[row.user_id] = (sentByWorkspace[row.user_id] || 0) + 1
      const result = await whatsapp.sendText({
        sessionId: connection.provider_session_id,
        phone: phone || '',
        text,
      })
      const logged = (status: string, attempt = row.attempts || 0) => logDispatch(admin, dispatchLogEntry({
        workspaceId: row.user_id,
        notificationId: row.id,
        type: row.type,
        channel: row.channel,
        status,
        attempt,
        phone,
      }))
      if (result.ok) {
        const sentAt = new Date().toISOString()
        await admin.from('notifications').update({
          status: 'sent',
          sent_at: sentAt,
          provider: 'wa_akg',
          provider_message_id: result.providerMessageId,
          error_message: null,
          updated_at: sentAt,
        }).eq('id', row.id)
        await logged('sent', row.attempts || 1)
        sent += 1
        continue
      }
      if (result.error === 'no_phone') {
        await admin.from('notifications').update({
          status: 'failed',
          error_message: 'no_phone',
          updated_at: new Date().toISOString(),
        }).eq('id', row.id)
        await logged('failed')
        failed += 1
        continue
      }
      if (!result.retry) {
        await holdWhatsapp(admin, row.id, result.error || 'no_connection')
        await logged('pending', row.attempts || 0)
        held += 1
        continue
      }
      const decision = retryAfterFailure((row.attempts || 0) + 1, new Date())
      await admin.from('notifications').update({
        status: decision.status,
        attempts: (row.attempts || 0) + 1,
        next_attempt_at: decision.nextAttemptAt,
        error_message: result.error || 'gateway_down',
        updated_at: new Date().toISOString(),
      }).eq('id', row.id)
      await logged(decision.status, (row.attempts || 0) + 1)
      if (decision.status === 'failed') failed += 1
      else held += 1
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
      await logDispatch(admin, dispatchLogEntry({
        workspaceId: row.user_id,
        notificationId: row.id,
        type: row.type,
        channel: row.channel,
        status: 'sent',
        attempt: row.attempts || 1,
      }))
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
    await logDispatch(admin, dispatchLogEntry({
      workspaceId: row.user_id,
      notificationId: row.id,
      type: row.type,
      channel: row.channel,
      status: decision.status,
      attempt: (row.attempts || 0) + 1,
    }))
    if (decision.status === 'failed') failed += 1
  }

  return json({ ok: true, sent, held, failed, seen: due?.length || 0 })
})
