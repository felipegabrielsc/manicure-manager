const ACTIVE_STATUSES = ['AGENDADO', 'PENDENTE', 'CONCLUIDO']

export function getServiceDuration(service) {
  return service?.duration_minutes ?? 60
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

export function overlaps(startA, endA, startB, endB) {
  return startA < endB && endA > startB
}

export function parseTimeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

export function minutesToTimeStr(totalMinutes) {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function getDayBounds(date) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

export function getWeekStart(date) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}

export function getWeekDays(date) {
  const start = getWeekStart(date)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

function getBusinessWindowForDate(businessHours, date) {
  const dayOfWeek = date.getDay()
  const config = businessHours?.find(h => Number(h.day_of_week) === dayOfWeek)
  if (!config || config.is_closed) return null
  const breakStart = config.break_start ? parseTimeToMinutes(String(config.break_start).slice(0, 5)) : null
  const breakEnd = config.break_end ? parseTimeToMinutes(String(config.break_end).slice(0, 5)) : null
  return {
    openMinutes: parseTimeToMinutes(config.open_time?.slice(0, 5) || '09:00'),
    closeMinutes: parseTimeToMinutes(config.close_time?.slice(0, 5) || '18:00'),
    breakStartMinutes: breakStart != null && breakEnd != null && breakEnd > breakStart ? breakStart : null,
    breakEndMinutes: breakStart != null && breakEnd != null && breakEnd > breakStart ? breakEnd : null,
  }
}

function buildInterval(date, minutesFromMidnight, durationMinutes) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  start.setMinutes(minutesFromMidnight)
  return { start, end: addMinutes(start, durationMinutes) }
}

export function staffSlotsConflict(existingStaffId, bookingStaffId) {
  if (!bookingStaffId || !existingStaffId) return true
  return existingStaffId === bookingStaffId
}

export function getBusyIntervals(appointments, blockedSlots, servicesMap = {}, excludeAppointmentId = null) {
  const intervals = []

  for (const apt of appointments || []) {
    if (excludeAppointmentId && apt.id === excludeAppointmentId) continue
    if (!ACTIVE_STATUSES.includes(apt.status)) continue
    const start = new Date(apt.start_time)
    const duration = apt.services?.duration_minutes
      ?? servicesMap[apt.service_id]?.duration_minutes
      ?? 60
    intervals.push({
      start,
      end: addMinutes(start, duration),
      type: 'appointment',
      staffId: apt.staff_id || null,
    })
  }

  for (const slot of blockedSlots || []) {
    intervals.push({
      start: new Date(slot.start_time),
      end: new Date(slot.end_time),
      type: 'blocked',
      staffId: null,
    })
  }

  return intervals
}

function intervalBlocksSlot(interval, bookingStaffId) {
  if (interval.type === 'blocked') return true
  return staffSlotsConflict(interval.staffId, bookingStaffId)
}

export function validateBookingSlot({
  startTime,
  durationMinutes,
  businessHours,
  appointments = [],
  blockedSlots = [],
  servicesMap = {},
  excludeAppointmentId = null,
  staffId = null,
}) {
  const start = new Date(startTime)
  if (Number.isNaN(start.getTime())) {
    return { valid: false, reason: 'Data/hora inválida.' }
  }

  if (start < new Date()) {
    return { valid: false, reason: 'Não é possível agendar no passado.' }
  }

  const end = addMinutes(start, durationMinutes)
  const window = getBusinessWindowForDate(businessHours, start)

  if (!window) {
    return { valid: false, reason: 'Este dia está fechado na agenda.' }
  }

  const startMinutes = start.getHours() * 60 + start.getMinutes()
  const endMinutes = end.getHours() * 60 + end.getMinutes()

  if (startMinutes < window.openMinutes) {
    return { valid: false, reason: 'Horário antes do expediente.' }
  }

  if (endMinutes > window.closeMinutes) {
    return { valid: false, reason: 'Horário ultrapassa o expediente.' }
  }

  if (
    window.breakStartMinutes != null
    && startMinutes < window.breakEndMinutes
    && endMinutes > window.breakStartMinutes
  ) {
    return { valid: false, reason: 'Horário de almoço.' }
  }

  const busy = getBusyIntervals(appointments, blockedSlots, servicesMap, excludeAppointmentId)

  for (const interval of busy) {
    if (!intervalBlocksSlot(interval, staffId)) continue
    if (overlaps(start, end, interval.start, interval.end)) {
      return { valid: false, reason: 'Horário indisponível ou já ocupado.' }
    }
  }

  return { valid: true }
}

export function generateAvailableSlots({
  date,
  durationMinutes,
  businessHours,
  appointments = [],
  blockedSlots = [],
  servicesMap = {},
  slotStepMinutes = 30,
  staffId = null,
}) {
  const window = getBusinessWindowForDate(businessHours, date)
  if (!window) return []

  const busy = getBusyIntervals(appointments, blockedSlots, servicesMap)
  const slots = []
  const now = new Date()

  for (let min = window.openMinutes; min + durationMinutes <= window.closeMinutes; min += slotStepMinutes) {
    const { start, end } = buildInterval(date, min, durationMinutes)
    if (start < now) continue

    const overlapsBreak = window.breakStartMinutes != null
      && min < window.breakEndMinutes
      && min + durationMinutes > window.breakStartMinutes
    if (overlapsBreak) continue

    const conflict = busy.some(b => intervalBlocksSlot(b, staffId) && overlaps(start, end, b.start, b.end))
    slots.push({
      start,
      label: minutesToTimeStr(min),
      value: conflict ? `busy-${min}` : start.toISOString(),
      kind: conflict ? 'busy' : 'free',
      disabled: conflict,
    })
  }

  return slots
}

export async function fetchPublicAgenda(supabase, userId, date) {
  const d = date instanceof Date ? date : new Date(date)
  const p_day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const { data, error } = await supabase.rpc('get_agenda_publica', {
    p_user_id: userId,
    p_day,
  })

  if (error || !data?.ok) {
    return {
      error,
      ok: false,
      reason: data?.reason || error?.message,
      profile: null,
      businessHours: [],
      appointments: [],
      blockedSlots: [],
      services: [],
    }
  }

  const appointments = (data.busy || []).map((b, i) => {
    const start = new Date(b.start)
    const end = new Date(b.end)
    const durationMinutes = Number.isFinite(end - start)
      ? Math.max(1, Math.round((end - start) / 60000))
      : 60
    return {
      id: `busy-${i}`,
      start_time: b.start,
      status: 'AGENDADO',
      services: { duration_minutes: durationMinutes },
    }
  })

  const blockedSlots = (data.blocked || []).map((b, i) => ({
    id: `blk-${i}`,
    start_time: b.start,
    end_time: b.end,
  }))

  return {
    ok: true,
    error: null,
    profile: data.profile,
    businessHours: data.business_hours || [],
    appointments,
    blockedSlots,
    services: data.services || [],
  }
}

export async function fetchSchedulingContext(supabase, userId, date, excludeAppointmentId = null) {
  const { start, end } = getDayBounds(date)

  const [hoursRes, blockedRes, appointmentsRes] = await Promise.all([
    supabase.from('business_hours').select('*').eq('user_id', userId).order('day_of_week'),
    supabase.from('blocked_slots').select('*').eq('user_id', userId).gte('start_time', start.toISOString()).lte('start_time', end.toISOString()),
    supabase.from('appointments').select('*, services(duration_minutes)').eq('user_id', userId).gte('start_time', start.toISOString()).lte('start_time', end.toISOString()),
  ])

  return {
    businessHours: hoursRes.data || [],
    blockedSlots: blockedRes.data || [],
    appointments: appointmentsRes.data || [],
    excludeAppointmentId,
  }
}

export async function fetchWeekAppointments(supabase, weekStartDate) {
  const start = getWeekStart(weekStartDate)
  const end = new Date(start)
  end.setDate(start.getDate() + 7)
  end.setHours(23, 59, 59, 999)

  const { data } = await supabase
    .from('appointments')
    .select('id, start_time, status, staff_id, clients(name), services(name), staff_members(name)')
    .gte('start_time', start.toISOString())
    .lt('start_time', end.toISOString())
    .order('start_time')

  return data || []
}
