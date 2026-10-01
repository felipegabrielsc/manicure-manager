export const RETRY_DELAYS_MS = [30_000, 2 * 60_000, 10 * 60_000]

const CHANNELS = ['push', 'whatsapp']

export function minuteInSaoPaulo(value) {
  const date = value instanceof Date ? value : new Date(value)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const pick = (type) => parts.find((part) => part.type === type)?.value || '00'
  const hour = pick('hour') === '24' ? '00' : pick('hour')
  return `${pick('year')}-${pick('month')}-${pick('day')}T${hour}:${pick('minute')}`
}

export function idempotencyKey({ workspaceId, appointmentId, clientId, type, channel, scheduledFor }) {
  const subject = appointmentId ?? clientId ?? 'none'
  return `${workspaceId}:${subject}:${type}:${channel}:${minuteInSaoPaulo(scheduledFor)}`
}

export function retryAfterFailure(attemptsAfterThisTry, now = new Date()) {
  if (attemptsAfterThisTry >= 4) {
    return { status: 'failed', nextAttemptAt: null }
  }
  const delay = RETRY_DELAYS_MS[attemptsAfterThisTry - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]
  return {
    status: 'pending',
    delayMs: delay,
    nextAttemptAt: new Date(now.getTime() + delay).toISOString(),
  }
}

function horaSp(value) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value instanceof Date ? value : new Date(value))
}

function dueOrNow(when, now) {
  return when.getTime() < now.getTime() ? new Date(now) : when
}

function row({ appointment, type, when, title, body, status = 'pending' }) {
  return CHANNELS.map((channel) => ({
    user_id: appointment.user_id,
    appointment_id: appointment.id,
    client_id: appointment.client_id || null,
    channel,
    type,
    scheduled_for: when.toISOString(),
    status,
    next_attempt_at: when.toISOString(),
    payload: { title, body, url: '/', text: `${title}\n${body}` },
    idempotency_key: idempotencyKey({
      workspaceId: appointment.user_id,
      appointmentId: appointment.id,
      type,
      channel,
      scheduledFor: when,
    }),
  }))
}

export function planAppointmentNotifications({
  appointment,
  reminderHours = 24,
  remindersEnabled = true,
  now = new Date(),
  rescheduled = false,
}) {
  const start = new Date(appointment.start_time)
  const nome = appointment.clients?.name || 'Cliente'
  const hora = horaSp(start)
  const reminderStatus = remindersEnabled ? 'pending' : 'cancelled'

  if (appointment.status === 'CANCELADO' || appointment.status === 'FALTOU') {
    return row({
      appointment,
      type: 'appointment_cancelled',
      when: now,
      title: 'Horário cancelado',
      body: `${nome} às ${hora}.`,
    })
  }

  if (appointment.status === 'CONCLUIDO') {
    return row({
      appointment,
      type: 'appointment_completed',
      when: now,
      title: 'Atendimento concluído',
      body: `${nome} às ${hora}.`,
    })
  }

  if (appointment.status === 'PENDENTE') {
    return row({
      appointment,
      type: 'appointment_created',
      when: now,
      title: 'Nova solicitação',
      body: `${nome} pediu um horário.`,
    })
  }

  const hours = Number(reminderHours) || 24
  const immediate = rescheduled
    ? row({
      appointment,
      type: 'appointment_rescheduled',
      when: now,
      title: 'Horário remarcado',
      body: `${nome} às ${hora}.`,
    })
    : row({
      appointment,
      type: 'appointment_confirmed',
      when: now,
      title: 'Horário confirmado',
      body: `${nome} às ${hora}.`,
    })

  const far = dueOrNow(new Date(start.getTime() - hours * 60 * 60 * 1000), now)
  const near = dueOrNow(new Date(start.getTime() - 2 * 60 * 60 * 1000), now)

  return [
    ...immediate,
    ...row({
      appointment,
      type: 'appointment_reminder_24h',
      when: far,
      title: 'Lembrete de horário',
      body: `${nome} às ${hora}.`,
      status: reminderStatus,
    }),
    ...row({
      appointment,
      type: 'appointment_reminder_2h',
      when: near,
      title: 'Lembrete de horário',
      body: `${nome} às ${hora}.`,
      status: reminderStatus,
    }),
  ]
}
