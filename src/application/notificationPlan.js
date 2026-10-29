import {
  msgCancelamento,
  msgConfirmarHorario,
  msgLembrete,
  msgPedidoRecebido,
  msgPosAtendimento,
  msgRemarcado,
  msgRetornoLembrete,
} from '../utils/bookingMessages.js'

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

export function idempotencyKey({ workspaceId, appointmentId, clientId, subject, type, channel, scheduledFor }) {
  const who = subject ?? appointmentId ?? clientId ?? 'none'
  return `${workspaceId}:${who}:${type}:${channel}:${minuteInSaoPaulo(scheduledFor)}`
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

function scheduleReminder(when, now, remindersEnabled) {
  const stillAhead = when.getTime() >= now.getTime()
  return { when, status: remindersEnabled && stillAhead ? 'pending' : 'cancelled' }
}

function row({ appointment, type, when, title, body, whatsappText, status = 'pending', channels = CHANNELS }) {
  const phone = appointment.clients?.phone || null
  return channels.map((channel) => ({
    user_id: appointment.user_id,
    appointment_id: appointment.id,
    client_id: appointment.client_id || null,
    channel,
    type,
    scheduled_for: when.toISOString(),
    status,
    next_attempt_at: when.toISOString(),
    payload: {
      title,
      body,
      url: '/',
      text: channel === 'whatsapp' ? (whatsappText || `${title}\n${body}`) : `${title}\n${body}`,
      phone,
    },
    idempotency_key: idempotencyKey({
      workspaceId: appointment.user_id,
      appointmentId: appointment.id,
      type,
      channel,
      scheduledFor: when,
    }),
  }))
}

export function clienteAceitaMensagens(appointment) {
  if (!appointment) return true
  if (appointment.bot_messages_enabled === false) return false
  if (appointment.clients?.bot_messages_enabled === false) return false
  return true
}

export function planAppointmentNotifications({
  appointment,
  reminderHours = 24,
  remindersEnabled = true,
  maintenanceDays = null,
  now = new Date(),
  rescheduled = false,
}) {
  if (!clienteAceitaMensagens(appointment)) return []
  const start = new Date(appointment.start_time)
  const nome = appointment.clients?.name || 'Cliente'
  const hora = horaSp(start)
  const lembrete = msgLembrete(appointment)

  if (appointment.status === 'CANCELADO' || appointment.status === 'FALTOU') {
    return row({
      appointment,
      type: 'appointment_cancelled',
      when: now,
      title: 'Horário cancelado',
      body: `${nome} às ${hora}.`,
      whatsappText: msgCancelamento(appointment, appointment.status, appointment.cancellation_reason),
    })
  }

  if (appointment.status === 'CONCLUIDO') {
    const done = row({
      appointment,
      type: 'appointment_completed',
      when: now,
      title: 'Atendimento concluído',
      body: `${nome} às ${hora}.`,
      whatsappText: msgPosAtendimento(appointment),
    })
    const days = Number(maintenanceDays)
    if (![15, 21, 30].includes(days)) return done
    const when = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
    return [
      ...done,
      ...row({
        appointment,
        type: 'client_return_reminder',
        when,
        title: 'Retorno',
        body: `${nome} em ${days} dias.`,
        whatsappText: msgRetornoLembrete(nome, days),
        channels: ['whatsapp'],
      }),
    ]
  }

  if (appointment.status === 'PENDENTE') {
    return row({
      appointment,
      type: 'appointment_created',
      when: now,
      title: 'Nova solicitação',
      body: `${nome} pediu um horário.`,
      whatsappText: msgPedidoRecebido(appointment),
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
      whatsappText: msgRemarcado(appointment),
    })
    : row({
      appointment,
      type: 'appointment_confirmed',
      when: now,
      title: 'Horário confirmado',
      body: `${nome} às ${hora}.`,
      whatsappText: msgConfirmarHorario(appointment),
    })

  const far = scheduleReminder(new Date(start.getTime() - hours * 60 * 60 * 1000), now, remindersEnabled)
  const near = scheduleReminder(new Date(start.getTime() - 2 * 60 * 60 * 1000), now, remindersEnabled)

  return [
    ...immediate,
    ...row({
      appointment,
      type: 'appointment_reminder_24h',
      when: far.when,
      title: 'Lembrete de horário',
      body: `${nome} às ${hora}.`,
      whatsappText: lembrete,
      status: far.status,
    }),
    ...row({
      appointment,
      type: 'appointment_reminder_2h',
      when: near.when,
      title: 'Lembrete de horário',
      body: `${nome} às ${hora}.`,
      whatsappText: lembrete,
      status: near.status,
    }),
  ]
}
