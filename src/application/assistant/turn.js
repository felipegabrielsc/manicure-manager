import { validateBookingSlot } from '../../utils/scheduling.js'

const WEEKDAYS = [
  ['domingo', 0],
  ['segunda', 1],
  ['terca', 2],
  ['quarta', 3],
  ['quinta', 4],
  ['sexta', 5],
  ['sabado', 6],
]

export function assistantEnabled(profile) {
  return profile?.ai_enabled === true
}

function fold(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

function spParts(value) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value instanceof Date ? value : new Date(value))
  const pick = (type) => parts.find((part) => part.type === type)?.value || '00'
  const hour = pick('hour') === '24' ? '00' : pick('hour')
  return {
    year: Number(pick('year')),
    month: Number(pick('month')),
    day: Number(pick('day')),
    hour: Number(hour),
    minute: Number(pick('minute')),
  }
}

function wallClock(value) {
  const parts = spParts(value)
  return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0)
}

function instantFromSp(year, month, day, minutesFromMidnight) {
  const hour = Math.floor(minutesFromMidnight / 60)
  const minute = minutesFromMidnight % 60
  return new Date(Date.UTC(year, month - 1, day, hour + 3, minute, 0))
}

function labelFromMinutes(total) {
  const hour = Math.floor(total / 60)
  const minute = total % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function dayLabel(parts) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 15))
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  }).format(date)
}

export function nextSpDate(now, weekday) {
  const parts = spParts(now)
  const base = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  let delta = (weekday - base.getUTCDay() + 7) % 7
  if (delta === 0 && parts.hour >= 17) delta = 7
  const target = new Date(base.getTime() + delta * 86400000)
  return { year: target.getUTCFullYear(), month: target.getUTCMonth() + 1, day: target.getUTCDate() }
}

function parseMinutes(text) {
  const folded = fold(text)
  const clock = folded.match(/(?:^|\s)(\d{1,2})\s*(?::|h)\s*(\d{2})?(?:\s|$)/)
  if (clock) {
    const hour = Number(clock[1])
    const minute = Number(clock[2] || 0)
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return hour * 60 + minute
  }
  const bare = folded.match(/(?:as|das|o das)\s*(\d{1,2})(?:\s|$)/)
  if (bare) {
    const hour = Number(bare[1])
    if (hour >= 7 && hour <= 21) return hour * 60
  }
  return null
}

function weekdayIn(text) {
  const folded = fold(text)
  if (folded.includes('hoje')) return 'hoje'
  if (folded.includes('amanha')) return 'amanha'
  return WEEKDAYS.find(([name]) => folded.includes(name))?.[1] ?? null
}

function tomorrow(now) {
  const parts = spParts(new Date(now.getTime() + 24 * 60 * 60 * 1000))
  return { year: parts.year, month: parts.month, day: parts.day }
}

function today(now) {
  const parts = spParts(now)
  return { year: parts.year, month: parts.month, day: parts.day }
}

function matchServices(catalog, text) {
  const folded = fold(text)
  return (catalog.services || []).filter((service) => {
    const name = fold(service.name)
    if (!name) return false
    if (folded.includes(name)) return true
    const token = name.split(' ')[0]
    return token.length >= 4 && folded.includes(token)
  })
}

function shiftedAppointments(catalog, excludeAppointmentId) {
  return (catalog.appointments || [])
    .filter((app) => app.id !== excludeAppointmentId)
    .map((app) => ({
      ...app,
      start_time: wallClock(app.start_time),
    }))
}

function shiftedBlocked(catalog) {
  return (catalog.blockedSlots || []).map((slot) => ({
    ...slot,
    start_time: wallClock(slot.start_time),
    end_time: wallClock(slot.end_time),
  }))
}

function assess(instant, catalog, { service, excludeAppointmentId, now }) {
  const duration = service?.duration_minutes || 60
  return validateBookingSlot({
    startTime: wallClock(instant),
    durationMinutes: duration,
    businessHours: catalog.businessHours || [],
    appointments: shiftedAppointments(catalog, excludeAppointmentId),
    blockedSlots: shiftedBlocked(catalog),
    servicesMap: Object.fromEntries((catalog.services || []).map((item) => [item.id, item])),
    excludeAppointmentId,
    now: wallClock(now),
  })
}

function freeSlots(day, catalog, { service, now, excludeAppointmentId }) {
  const window = (catalog.businessHours || []).find((hour) => Number(hour.day_of_week) === new Date(day.year, day.month - 1, day.day).getDay())
  if (!window || window.is_closed) return []
  const open = minutesOf(window.open_time, 9 * 60)
  const close = minutesOf(window.close_time, 18 * 60)
  const duration = service?.duration_minutes || 60
  const free = []
  for (let minute = open; minute + duration <= close; minute += 30) {
    const instant = instantFromSp(day.year, day.month, day.day, minute)
    const check = assess(instant, catalog, { service, excludeAppointmentId, now })
    if (!check.valid) continue
    free.push({ label: labelFromMinutes(minute), iso: instant.toISOString(), minute })
  }
  return sample(free, 4)
}

function minutesOf(value, fallback) {
  if (!value) return fallback
  const [hour, minute] = String(value).slice(0, 5).split(':').map(Number)
  if (!Number.isFinite(hour)) return fallback
  return hour * 60 + (minute || 0)
}

function sample(slots, count) {
  if (slots.length <= count) return slots
  const step = (slots.length - 1) / (count - 1)
  return Array.from({ length: count }, (_, index) => slots[Math.round(index * step)])
}

function slotFromChoice(text, state) {
  const offered = state?.offered || []
  const folded = fold(text).trim()
  const index = folded.match(/^(\d)$/)
  if (index) {
    const chosen = offered[Number(index[1]) - 1]
    if (chosen) return chosen
  }
  const minutes = parseMinutes(text)
  if (minutes == null) return null
  const label = labelFromMinutes(minutes)
  return offered.find((slot) => slot.label === label) || { label, minute: minutes, iso: null }
}

function wantsPerson(text) {
  const folded = fold(text)
  return ['pessoa', 'atendente', 'humano', 'falar com voce', 'falar com a manicure'].some((hint) => folded.includes(hint))
}

function classify(text, state) {
  const folded = fold(text).trim()
  if (!folded) return { intent: 'handoff', confidence: 0.2 }
  if (wantsPerson(folded)) return { intent: 'handoff', confidence: 1 }
  if (['sim', 'confirmo', 'pode cancelar'].includes(folded) && state?.pendingCancelId) {
    return { intent: 'confirm_cancel', confidence: 0.95 }
  }
  if (['nao', 'não'].includes(folded) && (state?.pendingCancelId || state?.mode)) {
    return { intent: 'decline', confidence: 0.9 }
  }
  if (state?.offered?.length && (parseMinutes(text) != null || /^\d$/.test(folded))) {
    return { intent: state.mode === 'reschedule' ? 'pick_reschedule' : 'pick_slot', confidence: 0.9 }
  }
  if (/cancel|desmarc|nao vou|não vou/.test(folded)) return { intent: 'cancel_appointment', confidence: 0.9 }
  if (/remarc|mudar horario|trocar horario|outro horario/.test(folded)) return { intent: 'reschedule_appointment', confidence: 0.9 }
  if (/meu horario|tenho horario|ja marquei|meu agendamento/.test(folded)) return { intent: 'get_client', confidence: 0.9 }
  if (/servico|preco|quanto custa|o que voce faz|cardapio/.test(folded)) return { intent: 'get_services', confidence: 0.85 }
  if (/endereco|onde fica|funcionamento|que horas abre|horario de/.test(folded)) return { intent: 'get_business_info', confidence: 0.85 }
  if (/marcar|agendar|horario|quero/.test(folded)) return { intent: 'get_available_slots', confidence: 0.9 }
  if (/^(oi|ola|bom dia|boa tarde|boa noite)\b/.test(folded)) return { intent: 'help', confidence: 0.8 }
  return { intent: 'handoff', confidence: 0.3 }
}

function upcoming(catalog) {
  const now = catalog.now || new Date()
  return (catalog.appointments || []).filter((app) => (
    (app.status === 'AGENDADO' || app.status === 'PENDENTE')
    && new Date(app.start_time).getTime() >= now.getTime()
    && (!catalog.client?.id || app.client_id == catalog.client.id)
  ))
}

function formatWhen(iso) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function baseState(state) {
  return {
    mode: null,
    offered: [],
    day: null,
    serviceId: null,
    serviceName: null,
    pendingCancelId: null,
    pendingRescheduleId: null,
    ...(state || {}),
  }
}

function reply(say, nextState, action = null, handoff = false) {
  return { say, nextState, action, handoff }
}

function resolveDay(text, state, now) {
  const hint = weekdayIn(text)
  if (hint === 'hoje') return today(now)
  if (hint === 'amanha') return tomorrow(now)
  if (typeof hint === 'number') return nextSpDate(now, hint)
  return state?.day || null
}

function resolveService(text, state, catalog) {
  const found = matchServices(catalog, text)
  if (found.length === 1) return found[0]
  if (found.length > 1) return found
  const current = (catalog.services || []).find((service) => service.id == state?.serviceId)
  return current || null
}

function offerSlots(day, service, catalog, now, mode, extra = {}) {
  const weekday = new Date(day.year, day.month - 1, day.day).getDay()
  const window = (catalog.businessHours || []).find((hour) => Number(hour.day_of_week) === weekday)
  if (!window || window.is_closed) {
    return reply(
      'Este dia está fechado na agenda.',
      baseState({ ...extra, mode, day, serviceId: service.id, serviceName: service.name, offered: [] }),
    )
  }
  const offered = freeSlots(day, catalog, {
    service,
    now,
    excludeAppointmentId: extra.pendingRescheduleId || null,
  })
  if (!offered.length) {
    return reply(
      `${dayLabel(day)} não tem horário livre para ${service.name}.`,
      baseState({ ...extra, mode, day, serviceId: service.id, serviceName: service.name, offered: [] }),
    )
  }
  const lines = offered.map((slot, index) => `${index + 1}. ${slot.label}`).join('\n')
  return reply(
    `Tenho estes horários ${dayLabel(day)} para ${service.name}:\n${lines}\nQual você prefere?`,
    baseState({
      ...extra,
      mode,
      day,
      serviceId: service.id,
      serviceName: service.name,
      offered,
    }),
  )
}

function chosenInstant(choice, day) {
  if (choice.iso) return choice.iso
  if (!day || choice.minute == null) return null
  return instantFromSp(day.year, day.month, day.day, choice.minute).toISOString()
}

export function runAssistantTurn({ text, state = {}, catalog = {}, now = new Date() }) {
  const current = baseState(state)
  const context = { ...catalog, now }
  const decision = classify(text, current)
  if (decision.confidence < 0.55 || decision.intent === 'handoff') {
    return reply(
      'Vou pedir para a manicure te responder por aqui.',
      { ...current, handoff: true },
      null,
      true,
    )
  }

  if (decision.intent === 'decline') {
    return reply('Tudo bem, não alterei nada.', baseState({}))
  }

  if (decision.intent === 'confirm_cancel') {
    return reply(
      'Cancelei o horário.',
      baseState({}),
      { type: 'cancel_appointment', appointmentId: current.pendingCancelId },
    )
  }

  if (decision.intent === 'help') {
    return reply('Oi! Posso ver serviços, horários livres e anotar um pedido. Se preferir uma pessoa, é só dizer.', current)
  }

  if (decision.intent === 'get_business_info') {
    const name = catalog.profile?.business_name || 'o salão'
    const address = catalog.profile?.address ? ` Endereço: ${catalog.profile.address}.` : ''
    return reply(`${name}.${address} O horário livre eu consulto na agenda, é só me dizer o dia.`, current)
  }

  if (decision.intent === 'get_services') {
    const list = (catalog.services || []).map((service) => service.name).filter(Boolean)
    if (!list.length) return reply('Ainda não há serviços publicados.', current)
    return reply(`Serviços: ${list.join(', ')}. Quer que eu veja um horário?`, current)
  }

  if (decision.intent === 'get_client') {
    const items = upcoming(context)
    if (!items.length) return reply('Não achei horário futuro neste WhatsApp.', current)
    const lines = items.slice(0, 3).map((item) => formatWhen(item.start_time)).join('; ')
    return reply(`Seu horário: ${lines}.`, current)
  }

  if (decision.intent === 'cancel_appointment') {
    const items = upcoming(context)
    if (!items.length) return reply('Não achei horário futuro para cancelar.', current)
    if (items.length > 1) {
      const lines = items.slice(0, 3).map((item) => formatWhen(item.start_time)).join('; ')
      return reply(`Você tem mais de um horário (${lines}). Me diz qual, ou pede para a manicure.`, { ...current, handoff: true }, null, true)
    }
    return reply(
      `Confirma cancelar ${formatWhen(items[0].start_time)}? Responda sim.`,
      { ...current, pendingCancelId: items[0].id, offered: [] },
    )
  }

  if (decision.intent === 'pick_slot' || decision.intent === 'pick_reschedule') {
    const choice = slotFromChoice(text, current)
    const iso = choice ? chosenInstant(choice, current.day) : null
    if (!iso || !current.serviceId) {
      return reply('Não entendi o horário. Escolha um dos números que eu mandei.', current)
    }
    const service = (catalog.services || []).find((item) => item.id == current.serviceId)
    const check = assess(iso, context, {
      service,
      now,
      excludeAppointmentId: decision.intent === 'pick_reschedule' ? current.pendingRescheduleId : null,
    })
    if (!check.valid) return reply(check.reason, current)
    if (decision.intent === 'pick_reschedule') {
      return reply(
        `Remarquei para ${choice.label}.`,
        baseState({}),
        { type: 'reschedule_appointment', appointmentId: current.pendingRescheduleId, startTime: iso },
      )
    }
    return reply(
      `Anotei ${choice.label} para ${current.serviceName || service?.name || 'o serviço'}.`,
      baseState({}),
      {
        type: 'create_appointment',
        serviceId: current.serviceId,
        startTime: iso,
        clientName: catalog.client?.name || 'Cliente',
        phone: catalog.phone || catalog.client?.phone || null,
      },
    )
  }

  if (decision.intent === 'reschedule_appointment' || decision.intent === 'get_available_slots') {
    const items = upcoming(context)
    const reschedule = decision.intent === 'reschedule_appointment'
    if (reschedule && items.length !== 1) {
      if (!items.length) return reply('Não achei horário futuro para remarcar.', current)
      return reply('Você tem mais de um horário. Vou pedir para a manicure remarcar.', { ...current, handoff: true }, null, true)
    }
    const servicePick = resolveService(text, current, catalog)
    if (Array.isArray(servicePick)) {
      return reply(`Qual serviço? ${servicePick.map((item) => item.name).join(', ')}.`, current)
    }
    const service = servicePick || (reschedule
      ? (catalog.services || []).find((item) => item.id == items[0].service_id) || { id: items[0].service_id, name: 'Serviço', duration_minutes: 60 }
      : null)
    if (!service) return reply(`Qual serviço? ${(catalog.services || []).map((item) => item.name).join(', ')}.`, current)
    const day = resolveDay(text, current, now)
    if (!day) return reply('Qual dia você prefere?', { ...current, serviceId: service.id, serviceName: service.name })
    const explicit = parseMinutes(text)
    if (explicit != null) {
      const iso = instantFromSp(day.year, day.month, day.day, explicit).toISOString()
      const check = assess(iso, context, {
        service,
        now,
        excludeAppointmentId: reschedule ? items[0].id : null,
      })
      if (!check.valid) return reply(check.reason, { ...current, day, serviceId: service.id, serviceName: service.name, mode: reschedule ? 'reschedule' : 'book' })
      if (reschedule) {
        return reply(
          `Remarquei para ${labelFromMinutes(explicit)}.`,
          baseState({}),
          { type: 'reschedule_appointment', appointmentId: items[0].id, startTime: iso },
        )
      }
      return reply(
        `Anotei ${labelFromMinutes(explicit)} para ${service.name}.`,
        baseState({}),
        {
          type: 'create_appointment',
          serviceId: service.id,
          startTime: iso,
          clientName: catalog.client?.name || 'Cliente',
          phone: catalog.phone || catalog.client?.phone || null,
        },
      )
    }
    return offerSlots(day, service, context, now, reschedule ? 'reschedule' : 'book', {
      pendingRescheduleId: reschedule ? items[0].id : null,
    })
  }

  return reply('Vou pedir para a manicure te responder por aqui.', current, null, true)
}
