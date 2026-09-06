import { describe, expect, it } from 'vitest'
import {
  overlaps,
  addMinutes,
  parseTimeToMinutes,
  minutesToTimeStr,
  staffSlotsConflict,
  getBusyIntervals,
  validateBookingSlot,
  generateAvailableSlots,
} from './scheduling.js'

const hours = [
  { day_of_week: 1, open_time: '09:00', close_time: '18:00', is_closed: false },
]

function mondayAt(h, m = 0) {
  const local = new Date(2099, 5, 1)
  const delta = (1 - local.getDay() + 7) % 7
  local.setDate(local.getDate() + delta)
  local.setHours(h, m, 0, 0)
  return local
}

describe('scheduling', () => {
  it('detecta overlap', () => {
    const a = mondayAt(10)
    const b = addMinutes(a, 60)
    expect(overlaps(a, b, mondayAt(10, 30), mondayAt(11, 30))).toBe(true)
    expect(overlaps(a, b, mondayAt(11), mondayAt(12))).toBe(false)
  })

  it('converte horário', () => {
    expect(parseTimeToMinutes('09:30')).toBe(570)
    expect(minutesToTimeStr(570)).toBe('09:30')
  })

  it('duas profissionais diferentes não conflitam', () => {
    expect(staffSlotsConflict('a', 'b')).toBe(false)
    expect(staffSlotsConflict('a', 'a')).toBe(true)
    expect(staffSlotsConflict(null, 'a')).toBe(true)
  })

  it('gera slots livres na segunda', () => {
    const date = mondayAt(0)
    date.setHours(0, 0, 0, 0)
    const slots = generateAvailableSlots({
      date,
      durationMinutes: 60,
      businessHours: [{ ...hours[0], day_of_week: date.getDay() }],
      appointments: [],
      blockedSlots: [],
    })
    expect(slots.length).toBeGreaterThan(0)
    expect(slots[0].label).toBe('09:00')
    expect(slots.filter(s => s.kind === 'busy').length).toBe(0)
  })

  it('marca slot ocupado e pula almoço', () => {
    const date = mondayAt(0)
    date.setHours(0, 0, 0, 0)
    const start = new Date(date)
    start.setHours(10, 0, 0, 0)
    const slots = generateAvailableSlots({
      date,
      durationMinutes: 60,
      businessHours: [{
        day_of_week: date.getDay(),
        open_time: '09:00',
        close_time: '18:00',
        is_closed: false,
        break_start: '12:00',
        break_end: '13:00',
      }],
      appointments: [{
        id: '1',
        start_time: start.toISOString(),
        status: 'AGENDADO',
        services: { duration_minutes: 60 },
      }],
      blockedSlots: [],
    })
    expect(slots.find(s => s.label === '10:00')?.kind).toBe('busy')
    expect(slots.find(s => s.label === '12:00')?.kind).toBe('break')
    expect(slots.find(s => s.label === '09:00')?.kind).toBe('free')
  })

  it('bloqueia slot da mesma profissional', () => {
    const start = mondayAt(10)
    const dayHours = [{ day_of_week: start.getDay(), open_time: '09:00', close_time: '18:00', is_closed: false }]
    const appointments = [{
      id: '1',
      start_time: start.toISOString(),
      status: 'AGENDADO',
      staff_id: 'staff-1',
      services: { duration_minutes: 60 },
    }]
    const okOther = validateBookingSlot({
      startTime: mondayAt(10),
      durationMinutes: 60,
      businessHours: dayHours,
      appointments,
      staffId: 'staff-2',
    })
    const blockedSame = validateBookingSlot({
      startTime: mondayAt(10),
      durationMinutes: 60,
      businessHours: dayHours,
      appointments,
      staffId: 'staff-1',
    })
    expect(okOther.valid).toBe(true)
    expect(blockedSame.valid).toBe(false)
  })

  it('intervalo ocupado inclui duração', () => {
    const busy = getBusyIntervals([{
      id: '1',
      start_time: mondayAt(9).toISOString(),
      status: 'AGENDADO',
      services: { duration_minutes: 90 },
    }], [])
    expect(busy[0].end.getTime() - busy[0].start.getTime()).toBe(90 * 60 * 1000)
  })
})
