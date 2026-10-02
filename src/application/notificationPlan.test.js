import { describe, expect, it } from 'vitest'
import {
  idempotencyKey,
  minuteInSaoPaulo,
  planAppointmentNotifications,
  retryAfterFailure,
} from './notificationPlan.js'

const now = new Date('2026-10-01T15:00:00.000Z')
const start = new Date('2026-10-10T17:00:00.000Z')

const appointment = {
  id: 42,
  user_id: 'ws-1',
  client_id: 'cli-1',
  start_time: start.toISOString(),
  status: 'AGENDADO',
  clients: { name: 'Maria' },
}

describe('notificationPlan', () => {
  it('arredonda o horário em America/Sao_Paulo', () => {
    expect(minuteInSaoPaulo(start)).toBe('2026-10-10T14:00')
  })

  it('confirmação e dois lembretes, uma vez por canal', () => {
    const rows = planAppointmentNotifications({ appointment, reminderHours: 24, now })
    const types = rows.map((row) => `${row.type}:${row.channel}`)
    expect(types).toEqual([
      'appointment_confirmed:push',
      'appointment_confirmed:whatsapp',
      'appointment_reminder_24h:push',
      'appointment_reminder_24h:whatsapp',
      'appointment_reminder_2h:push',
      'appointment_reminder_2h:whatsapp',
    ])
    const dayBefore = rows.find((row) => row.type === 'appointment_reminder_24h' && row.channel === 'push')
    const twoHours = rows.find((row) => row.type === 'appointment_reminder_2h' && row.channel === 'push')
    expect(minuteInSaoPaulo(dayBefore.scheduled_for)).toBe('2026-10-09T14:00')
    expect(minuteInSaoPaulo(twoHours.scheduled_for)).toBe('2026-10-10T12:00')
    expect(dayBefore.idempotency_key).toBe(idempotencyKey({
      workspaceId: 'ws-1',
      appointmentId: 42,
      type: 'appointment_reminder_24h',
      channel: 'push',
      scheduledFor: dayBefore.scheduled_for,
    }))
  })

  it('a mesma chave sai duas vezes igual', () => {
    const first = planAppointmentNotifications({ appointment, now })
    const second = planAppointmentNotifications({ appointment, now })
    expect(first.map((row) => row.idempotency_key)).toEqual(second.map((row) => row.idempotency_key))
  })

  it('cancelar não deixa lembrete na lista', () => {
    const rows = planAppointmentNotifications({
      appointment: { ...appointment, status: 'CANCELADO' },
      now,
    })
    expect(rows.every((row) => row.type === 'appointment_cancelled')).toBe(true)
  })

  it('lembrete desligado nasce cancelado e sai da lista ativa', () => {
    const rows = planAppointmentNotifications({ appointment, remindersEnabled: false, now })
    const reminders = rows.filter((row) => row.type.startsWith('appointment_reminder'))
    const confirmed = rows.filter((row) => row.type === 'appointment_confirmed')
    expect(reminders.every((row) => row.status === 'cancelled')).toBe(true)
    expect(confirmed.every((row) => row.status === 'pending')).toBe(true)
    const keep = rows.filter((row) => row.status !== 'cancelled').map((row) => row.idempotency_key)
    expect(keep.some((key) => key.includes('appointment_reminder'))).toBe(false)
  })

  it('lembrete no passado fica para agora', () => {
    const soon = new Date(now.getTime() + 30 * 60 * 1000)
    const rows = planAppointmentNotifications({
      appointment: { ...appointment, start_time: soon.toISOString() },
      reminderHours: 24,
      now,
    })
    const reminder = rows.find((row) => row.type === 'appointment_reminder_24h')
    expect(minuteInSaoPaulo(reminder.scheduled_for)).toBe(minuteInSaoPaulo(now))
  })

  it('retry para em failed na quarta falha', () => {
    expect(retryAfterFailure(1, now).delayMs).toBe(30_000)
    expect(retryAfterFailure(2, now).delayMs).toBe(120_000)
    expect(retryAfterFailure(3, now).delayMs).toBe(600_000)
    expect(retryAfterFailure(4, now).status).toBe('failed')
  })
})
