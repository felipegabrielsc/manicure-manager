import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import webpush from 'npm:web-push@3.6.7'
import { json } from '../_shared/cors.ts'

function authorized(req: Request) {
  const secret = Deno.env.get('CRON_SECRET') || ''
  const header = req.headers.get('x-cron-secret') || ''
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (secret && (header === secret || bearer === secret)) return true
  if (service && bearer === service) return true
  return false
}

async function sendToUser(admin: ReturnType<typeof createClient>, userId: string, payload: { title: string; body: string; url?: string }) {
  const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', userId)
  if (!subs?.length) return 0
  let sent = 0
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
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
  return sent
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true })
  if (!authorized(req)) return json({ ok: false, reason: 'unauthorized' }, 401)

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:contato@agendamanicure.app'
  if (!publicKey || !privateKey) {
    return json({ ok: false, reason: 'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY ausentes.' }, 500)
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const now = new Date()
  let pendingSent = 0
  let reminderSent = 0

  const { data: pendentes } = await admin
    .from('appointments')
    .select('id, user_id, start_time, clients(name)')
    .eq('status', 'PENDENTE')
    .is('push_pending_sent_at', null)

  for (const apt of pendentes || []) {
    const { data: perfil } = await admin.from('profiles').select('push_enabled').eq('id', apt.user_id).single()
    if (!perfil?.push_enabled) continue
    const nome = apt.clients?.name || 'Uma cliente'
    await sendToUser(admin, apt.user_id, {
      title: 'Nova solicitação',
      body: `${nome} pediu um horário.`,
      url: '/',
    })
    await admin.from('appointments').update({ push_pending_sent_at: now.toISOString() }).eq('id', apt.id)
    pendingSent += 1
  }

  const horizon = new Date(now.getTime() + 48 * 60 * 60 * 1000)
  const { data: agendados } = await admin
    .from('appointments')
    .select('id, user_id, start_time, clients(name)')
    .eq('status', 'AGENDADO')
    .is('push_reminder_sent_at', null)
    .gte('start_time', now.toISOString())
    .lte('start_time', horizon.toISOString())

  const profileCache = new Map<string, { push_enabled: boolean; reminders_enabled: boolean; reminder_hours_before: number }>()

  for (const apt of agendados || []) {
    if (!profileCache.has(apt.user_id)) {
      const { data: perfil } = await admin
        .from('profiles')
        .select('push_enabled, reminders_enabled, reminder_hours_before')
        .eq('id', apt.user_id)
        .single()
      profileCache.set(apt.user_id, {
        push_enabled: perfil?.push_enabled === true,
        reminders_enabled: perfil?.reminders_enabled !== false,
        reminder_hours_before: perfil?.reminder_hours_before ?? 24,
      })
    }
    const perfil = profileCache.get(apt.user_id)
    if (!perfil?.push_enabled || !perfil.reminders_enabled) continue

    const start = new Date(apt.start_time).getTime()
    const hours = perfil.reminder_hours_before
    const windowStart = start - hours * 60 * 60 * 1000
    if (now.getTime() < windowStart) continue

    const hora = new Date(apt.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const nome = apt.clients?.name || 'Cliente'
    await sendToUser(admin, apt.user_id, {
      title: 'Lembrete de horário',
      body: `${nome} às ${hora}.`,
      url: '/',
    })
    await admin.from('appointments').update({ push_reminder_sent_at: now.toISOString() }).eq('id', apt.id)
    reminderSent += 1
  }

  let monthlySent = 0
  const tzNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const todayDay = tzNow.getDate()
  const todayIso = `${tzNow.getFullYear()}-${String(tzNow.getMonth() + 1).padStart(2, '0')}-${String(tzNow.getDate()).padStart(2, '0')}`
  const lastDay = new Date(tzNow.getFullYear(), tzNow.getMonth() + 1, 0).getDate()

  const { data: mensalistas } = await admin
    .from('clients')
    .select('id, user_id, name, monthly_due_day, monthly_due_push_on, type')
    .eq('type', 'MENSALISTA')

  const billedOwners = new Map<string, number>()
  for (const cli of mensalistas || []) {
    const due = Number(cli.monthly_due_day) || 10
    const dueToday = due >= lastDay ? todayDay === lastDay : todayDay === due
    if (!dueToday) continue
    if (cli.monthly_due_push_on === todayIso) continue
    const { data: perfil } = await admin.from('profiles').select('push_enabled').eq('id', cli.user_id).single()
    if (!perfil?.push_enabled) continue
    billedOwners.set(cli.user_id, (billedOwners.get(cli.user_id) || 0) + 1)
    await admin.from('clients').update({ monthly_due_push_on: todayIso }).eq('id', cli.id)
  }
  for (const [ownerId, qtd] of billedOwners) {
    await sendToUser(admin, ownerId, {
      title: 'Mensalidades hoje',
      body: qtd === 1 ? 'Tem 1 mensalidade vencendo hoje.' : `Tem ${qtd} mensalidades vencendo hoje.`,
      url: '/financeiro',
    })
    monthlySent += 1
  }

  return json({ ok: true, pendingSent, reminderSent, monthlySent })
})
