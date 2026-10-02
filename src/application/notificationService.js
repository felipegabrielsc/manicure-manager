import { planAppointmentNotifications } from './notificationPlan.js'

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
  })
  const keepKeys = rows.filter((row) => row.status !== 'cancelled').map((row) => row.idempotency_key)
  await cancelStale(supabase, appointment.id, keepKeys)
  const { error } = await supabase
    .from('notifications')
    .upsert(rows, { onConflict: 'idempotency_key', ignoreDuplicates: true })
  return { ok: !error, error: error?.message, rows }
}
