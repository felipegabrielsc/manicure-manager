import { incrementLoyaltyVisit } from '../utils/loyalty'
import {
  fetchSchedulingContext,
  getServiceDuration,
  validateBookingSlot,
} from '../utils/scheduling'
import { openWhatsApp } from '../utils/whatsapp'
import {
  msgCancelamento,
  msgConfirmarHorario,
  msgEsperaDisponivel,
  msgLembrete,
  msgRecusarHorario,
  msgRetornoLembrete,
  msgRetornoMarcado,
} from '../utils/bookingMessages'
import { toDateInputValue } from '../utils/dates'
import { syncAppointmentNotifications } from './notificationService.js'

async function syncQuiet(supabase, appointment, options) {
  try {
    await syncAppointmentNotifications(supabase, appointment, options)
  } catch {
    // A fila depende da migration 030. A agenda continua sem ela.
  }
}

export function validarRemarcacao(input) {
  return validateBookingSlot(input)
}

export async function criarAgendamento(supabase, {
  workspaceId,
  clientId,
  serviceId,
  startTime,
  durationMinutes,
  staffId,
  locationId,
  agreedPrice,
  couponId,
  discountApplied,
  clientName,
}) {
  const ctx = await fetchSchedulingContext(supabase, workspaceId, startTime)
  const validation = validarRemarcacao({
    startTime,
    durationMinutes,
    businessHours: ctx.businessHours,
    appointments: ctx.appointments,
    blockedSlots: ctx.blockedSlots,
    staffId: staffId || null,
  })
  if (!validation.valid) return { ok: false, error: validation.reason }

  let { data: rpcCheck, error: rpcErr } = await supabase.rpc('validar_horario_agendamento', {
    p_user_id: workspaceId,
    p_start_time: startTime.toISOString(),
    p_duration_minutes: durationMinutes,
    p_staff_id: staffId || null,
  })
  if (rpcErr) {
    const retry = await supabase.rpc('validar_horario_agendamento', {
      p_user_id: workspaceId,
      p_start_time: startTime.toISOString(),
      p_duration_minutes: durationMinutes,
    })
    rpcCheck = retry.data
    rpcErr = retry.error
  }
  if (!rpcErr && rpcCheck?.valid === false) {
    return { ok: false, error: rpcCheck.reason || 'Horário indisponível.' }
  }

  const { data, error } = await supabase.from('appointments').insert({
    client_id: clientId,
    service_id: serviceId,
    start_time: startTime.toISOString(),
    agreed_price: agreedPrice,
    status: 'AGENDADO',
    user_id: workspaceId,
    staff_id: staffId || null,
    location_id: locationId || null,
    coupon_id: couponId || null,
    discount_applied: discountApplied || 0,
  }).select('id').maybeSingle()

  if (error) return { ok: false, error: error.message }

  if (couponId) {
    const { data: cup } = await supabase.from('coupons').select('uses_count').eq('id', couponId).single()
    await supabase.from('coupons').update({ uses_count: (cup?.uses_count || 0) + 1 }).eq('id', couponId)
  }

  if (data?.id) {
    await syncQuiet(supabase, {
      id: data.id,
      user_id: workspaceId,
      client_id: clientId,
      start_time: startTime.toISOString(),
      status: 'AGENDADO',
      clients: { name: clientName || 'Cliente' },
    })
  }
  return { ok: true, id: data?.id }
}

export async function confirmarPedido(supabase, agendamento) {
  const { error } = await supabase.from('appointments').update({ status: 'AGENDADO' }).eq('id', agendamento.id)
  if (error) return { ok: false, error: error.message }
  const message = msgConfirmarHorario(agendamento)
  await syncQuiet(supabase, { ...agendamento, status: 'AGENDADO' })
  const opened = openWhatsApp(agendamento.clients?.phone, message)
  return { ok: true, opened, message }
}

export async function recusarPedido(supabase, agendamento, motivo) {
  const { error } = await supabase.from('appointments').update({
    status: 'CANCELADO',
    cancellation_reason: motivo || 'Recusado',
  }).eq('id', agendamento.id)
  if (error) return { ok: false, error: error.message }
  const message = msgRecusarHorario(agendamento, motivo)
  await syncQuiet(supabase, { ...agendamento, status: 'CANCELADO' })
  const opened = openWhatsApp(agendamento.clients?.phone, message)
  return { ok: true, opened, message }
}

export async function concluirAtendimento(supabase, { agendamento, metodo }) {
  if (metodo === 'PACOTE') {
    if (!agendamento?.client_id) return { ok: false, error: 'Cliente não encontrada' }
    const { data: cli } = await supabase.from('clients').select('package_size, package_used').eq('id', agendamento.client_id).single()
    const size = Number(cli?.package_size) || 0
    const used = Number(cli?.package_used) || 0
    if (size < 1 || used >= size) {
      return { ok: false, error: 'Essa cliente não tem visita no pacote. Cadastre 4 ou 6 no perfil dela.' }
    }
    const { error: pkgErr } = await supabase.from('clients').update({ package_used: used + 1 }).eq('id', agendamento.client_id)
    if (pkgErr) {
      return { ok: false, error: pkgErr.message.includes('package_') ? 'Rode o SQL 028 no Supabase (pacote).' : pkgErr.message }
    }
  }

  const { error } = await supabase.from('appointments').update({
    status: 'CONCLUIDO',
    payment_method: metodo,
  }).eq('id', agendamento.id)
  if (error) return { ok: false, error: error.message }

  await incrementLoyaltyVisit(supabase, agendamento.client_id)
  await syncQuiet(supabase, { ...agendamento, status: 'CONCLUIDO' })

  if (metodo === 'MENSALIDADE' && agendamento.client_id) {
    const { data: cli } = await supabase.from('clients').select('monthly_due_day, monthly_due_offset').eq('id', agendamento.client_id).single()
    await supabase.from('clients').update({ type: 'MENSALISTA' }).eq('id', agendamento.client_id)
    const extra = {}
    if (cli?.monthly_due_day == null) extra.monthly_due_day = 10
    if (cli?.monthly_due_offset == null) extra.monthly_due_offset = 1
    if (Object.keys(extra).length) {
      await supabase.from('clients').update(extra).eq('id', agendamento.client_id)
    }
    return { ok: true, avisoMensalidade: true }
  }

  return { ok: true }
}

export async function reabrirAtendimento(supabase, agendamento) {
  const { error } = await supabase.from('appointments').update({
    status: 'AGENDADO',
    payment_method: null,
  }).eq('id', agendamento.id)
  if (error) return { ok: false, error: error.message }
  await syncQuiet(supabase, { ...agendamento, status: 'AGENDADO' })
  return { ok: true }
}

export async function remarcar(supabase, { agendamento, workspaceId, startTime, staffId }) {
  const durationMinutes = getServiceDuration(agendamento.services)
  const ctx = await fetchSchedulingContext(supabase, workspaceId, startTime, agendamento.id)
  const validation = validarRemarcacao({
    startTime,
    durationMinutes,
    businessHours: ctx.businessHours,
    appointments: ctx.appointments,
    blockedSlots: ctx.blockedSlots,
    excludeAppointmentId: agendamento.id,
    staffId: staffId || null,
  })
  if (!validation.valid) return { ok: false, error: validation.reason }

  const { error } = await supabase.from('appointments').update({
    start_time: startTime.toISOString(),
    staff_id: staffId || null,
  }).eq('id', agendamento.id)
  if (error) return { ok: false, error: error.message || 'Erro ao remarcar' }

  await syncQuiet(supabase, {
    ...agendamento,
    start_time: startTime.toISOString(),
    status: agendamento.status || 'AGENDADO',
  }, { rescheduled: true })
  return { ok: true }
}

export async function marcarAusencia(supabase, { agendamento, status, motivo }) {
  const { error } = await supabase.from('appointments').update({
    status,
    cancellation_reason: motivo?.trim() || null,
  }).eq('id', agendamento.id)
  if (error) return { ok: false, error: error.message || 'Não foi possível atualizar' }
  const message = msgCancelamento(agendamento, status, motivo)
  await syncQuiet(supabase, { ...agendamento, status })
  const opened = agendamento.clients?.phone ? openWhatsApp(agendamento.clients.phone, message) : false
  return { ok: true, opened, message }
}

export async function excluirAgendamento(supabase, id) {
  const { error } = await supabase.from('appointments').delete().eq('id', id)
  return { ok: !error, error: error ? 'Erro ao excluir' : null }
}

export async function marcarRetorno(supabase, { agendamento, workspaceId, dias }) {
  const start = new Date(agendamento.start_time)
  start.setDate(start.getDate() + dias)
  const { data, error } = await supabase.from('appointments').insert({
    client_id: agendamento.client_id,
    service_id: agendamento.service_id,
    start_time: start.toISOString(),
    agreed_price: agendamento.agreed_price,
    status: 'AGENDADO',
    user_id: workspaceId,
    staff_id: agendamento.staff_id || null,
  }).select('id').maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (data?.id) {
    await syncQuiet(supabase, {
      id: data.id,
      user_id: workspaceId,
      client_id: agendamento.client_id,
      start_time: start.toISOString(),
      status: 'AGENDADO',
      clients: agendamento.clients,
    })
  }
  const message = msgRetornoMarcado(agendamento, start)
  const opened = agendamento.clients?.phone ? openWhatsApp(agendamento.clients.phone, message) : false
  return { ok: true, opened, message, start }
}

export async function registrarLembreteRetorno(supabase, { agendamento, workspaceId, dias = 15 }) {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  const { error } = await supabase.from('followup_reminders').insert({
    user_id: workspaceId,
    client_id: agendamento.client_id,
    phone: agendamento.clients?.phone || null,
    client_name: agendamento.clients?.name || null,
    remind_on: toDateInputValue(d),
  })
  if (error) {
    return { ok: false, error: error.message.includes('followup') ? 'Rode o SQL 028 no Supabase (retorno).' : error.message }
  }
  return { ok: true }
}

export async function avisarEspera(supabase, { item, workspaceId, origin }) {
  const link = `${origin}/agendar/${workspaceId}`
  const message = msgEsperaDisponivel(item, link)
  const opened = openWhatsApp(item.phone, message)
  if (!opened) return { ok: false, error: 'Sem WhatsApp nesta espera' }
  const { error } = await supabase.from('waitlist').update({
    status: 'AVISADA',
    notified_at: new Date().toISOString(),
  }).eq('id', item.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true, message }
}

export async function enviarLembrete(supabase, agendamento, origin) {
  const tel = agendamento.clients?.phone
  if (!tel) return { ok: false, error: 'Cliente sem telefone' }
  const link = `${origin}/resumo/${agendamento.id}`
  const message = msgLembrete(agendamento, link)
  if (!openWhatsApp(tel, message)) return { ok: false, error: 'Cliente sem telefone' }
  const { error } = await supabase.from('appointments').update({
    reminder_sent_at: new Date().toISOString(),
  }).eq('id', agendamento.id)
  return { ok: !error, error: error?.message, message }
}

export async function marcarRetornoEnviado(supabase, item) {
  const opened = openWhatsApp(item.phone, msgRetornoLembrete(item.client_name || ''))
  if (!opened) return { ok: false, error: 'Sem WhatsApp neste lembrete' }
  const { error } = await supabase.from('followup_reminders').update({
    sent_at: new Date().toISOString(),
  }).eq('id', item.id)
  return { ok: !error, error: error?.message }
}
