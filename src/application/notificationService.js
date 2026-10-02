import { msgEsperaDisponivel } from '../utils/bookingMessages.js'
import { idempotencyKey, planAppointmentNotifications } from './notificationPlan.js'

async function cancelStale(supabase, appointmentId, keepKeys) {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, idempotency_key')
    .eq('appointment_id', appointmentId)
    .eq('status', 'pending')
  if (error || !data?.length) return { ok: !error, error: error?.message }

  const stale = data.filter((row) => !keepKeys.includes(row.idempotency_key)).map((row) => row.id)
  if (!stale.length) return { ok: true }
  const update = await supabase
    .from('notifications')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .in('id', stale)
  return { ok: !update.error, error: update.error?.message }
}

export async function enqueue(supabase, row) {
  const { error } = await supabase
    .from('notifications')
    .upsert(row, { onConflict: 'idempotency_key', ignoreDuplicates: true })
  return { ok: !error, error: error?.message }
}

export async function cancelPending(supabase, { appointmentId, types } = {}) {
  let query = supabase
    .from('notifications')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('appointment_id', appointmentId)
    .eq('status', 'pending')
  if (types?.length) query = query.in('type', types)
  const { error } = await query
  return { ok: !error, error: error?.message }
}

export async function syncAppointmentNotifications(supabase, appointment, options = {}) {
  let reminderHours = options.reminderHours
  let remindersEnabled = options.remindersEnabled
  let maintenanceDays = options.maintenanceDays
  if (maintenanceDays == null && appointment.service_id) {
    const { data: servico } = await supabase
      .from('services')
      .select('maintenance_days')
      .eq('id', appointment.service_id)
      .maybeSingle()
    maintenanceDays = servico?.maintenance_days ?? null
  }
  if (reminderHours == null || remindersEnabled == null) {
    const { data: perfil } = await supabase
      .from('profiles')
      .select('reminder_hours_before, reminders_enabled')
      .eq('id', appointment.user_id)
      .maybeSingle()
    if (reminderHours == null) reminderHours = perfil?.reminder_hours_before ?? 24
    if (remindersEnabled == null) remindersEnabled = perfil?.reminders_enabled !== false
  }

  const rows = planAppointmentNotifications({
    appointment,
    reminderHours,
    remindersEnabled,
    now: options.now,
    rescheduled: options.rescheduled,
    maintenanceDays,
  })
  const keepKeys = rows.filter((row) => row.status !== 'cancelled').map((row) => row.idempotency_key)
  await cancelStale(supabase, appointment.id, keepKeys)
  const { error } = await supabase
    .from('notifications')
    .upsert(rows, { onConflict: 'idempotency_key', ignoreDuplicates: true })
  return { ok: !error, error: error?.message, rows }
}

export async function marcarEnvioManual(supabase, { appointmentId, clientId, types }) {
  let query = supabase
    .from('notifications')
    .update({
      status: 'sent',
      provider: 'manual',
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('channel', 'whatsapp')
    .eq('status', 'pending')
  if (appointmentId) query = query.eq('appointment_id', appointmentId)
  if (clientId) query = query.eq('client_id', clientId)
  if (types?.length) query = query.in('type', types)
  const { error } = await query
  return { ok: !error, error: error?.message }
}

export async function enqueueWaitlistAvailable(supabase, { workspaceId, serviceId, item, origin, now = new Date() }) {
  let alvo = item
  if (!alvo && serviceId) {
    const { data } = await supabase
      .from('waitlist')
      .select('id, name, phone, service_id, services(name)')
      .eq('user_id', workspaceId)
      .eq('status', 'ABERTA')
      .eq('service_id', serviceId)
      .order('created_at')
      .limit(1)
      .maybeSingle()
    alvo = data
  }
  if (!alvo?.phone) return { ok: true, skipped: true }

  const link = origin ? `${origin}/agendar/${workspaceId}` : ''
  const text = msgEsperaDisponivel(alvo, link)
  const queued = await enqueue(supabase, {
    user_id: workspaceId,
    appointment_id: null,
    client_id: null,
    channel: 'whatsapp',
    type: 'waitlist_available',
    scheduled_for: now.toISOString(),
    status: 'pending',
    next_attempt_at: now.toISOString(),
    payload: { title: 'Horário livre', body: text, url: '/', text, phone: alvo.phone },
    idempotency_key: idempotencyKey({
      workspaceId,
      subject: `wl-${alvo.id}`,
      type: 'waitlist_available',
      channel: 'whatsapp',
      scheduledFor: now,
    }),
  })
  if (!queued.ok) return queued
  await supabase.from('waitlist').update({
    status: 'AVISADA',
    notified_at: now.toISOString(),
  }).eq('id', alvo.id).eq('status', 'ABERTA')
  return { ok: true, message: text }
}
