import { describe, expect, it } from 'vitest'
import { validarRemarcacao } from './appointmentService.js'

function mondayAt(h, m = 0) {
  const local = new Date(2099, 5, 1)
  const delta = (1 - local.getDay() + 7) % 7
  local.setDate(local.getDate() + delta)
  local.setHours(h, m, 0, 0)
  return local
}

describe('appointmentService', () => {
  it('recusa remarcar em cima de outro horário da mesma profissional', () => {
    const start = mondayAt(10)
    const result = validarRemarcacao({
      startTime: start,
      durationMinutes: 60,
      businessHours: [{ day_of_week: start.getDay(), open_time: '09:00', close_time: '18:00', is_closed: false }],
      appointments: [{
        id: '1',
        start_time: start.toISOString(),
        status: 'AGENDADO',
        staff_id: 'staff-1',
        services: { duration_minutes: 60 },
      }],
      staffId: 'staff-1',
    })
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('Horário indisponível ou já ocupado.')
  })
})
