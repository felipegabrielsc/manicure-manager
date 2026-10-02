import { idempotencyKey } from '../application/notificationPlan.js'
import { summarizeClient } from './clientInsights.js'

export const DEFAULT_RETURN_DAYS = 30
export const DEFAULT_VIP_MIN = 300
export const NEW_CLIENT_DAYS = 30
export const FREQUENT_MIN_VISITS = 3

export const SEGMENTOS = [
  {
    id: 'novas',
    label: 'Novas',
    tipo: 'campaign',
    texto: (nome) => `Oi ${nome}! Que bom ter você por aqui. Quando quiser marcar de novo, é só me chamar.`,
  },
  {
    id: 'frequentes',
    label: 'Frequentes',
    tipo: 'campaign',
    texto: (nome) => `Oi ${nome}! Obrigada por voltar sempre. Quer que eu separe o próximo horário?`,
  },
  {
    id: 'inativas',
    label: 'Inativas',
    tipo: 'campaign',
    texto: (nome) => `Oi ${nome}! Faz um tempo desde a última visita. Quer marcar um horário?`,
  },
  {
    id: 'vip',
    label: 'VIP',
    tipo: 'campaign',
    texto: (nome) => `Oi ${nome}! Separei um cuidado especial para você. Quer que eu reserve um horário?`,
  },
  {
    id: 'sem_retorno',
    label: 'Sem retorno',
    tipo: 'campaign',
    texto: (nome) => `Oi ${nome}! Já chegou a hora do retorno das unhas. Quer marcar?`,
  },
  {
    id: 'aniversariantes',
    label: 'Aniversariantes',
    tipo: 'birthday',
    texto: (nome) => `Oi ${nome}! Feliz aniversário. Um carinho daqui do salão.`,
  },
  {
    id: 'cancelaram',
    label: 'Cancelaram',
    tipo: 'campaign',
    texto: (nome) => `Oi ${nome}! Vi que um horário foi cancelado. Se quiser remarcar, estou por aqui.`,
  },
  {
    id: 'faltaram',
    label: 'Não compareceram',
    tipo: 'campaign',
    texto: (nome) => `Oi ${nome}! Sentimos sua falta no último horário. Quer marcar de novo?`,
  },
]

function partesDia(value) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value instanceof Date ? value : new Date(value))
  const pick = (type) => parts.find((part) => part.type === type)?.value
  return { year: pick('year'), month: pick('month'), day: pick('day') }
}

export function daysSinceDate(from, now) {
  if (!from || !now) return null
  const inicio = partesDia(from)
  const fim = partesDia(now)
  if (!inicio.year || !fim.year) return null
  const a = Date.UTC(Number(inicio.year), Number(inicio.month) - 1, Number(inicio.day))
  const b = Date.UTC(Number(fim.year), Number(fim.month) - 1, Number(fim.day))
  return Math.round((b - a) / 86400000)
}

export function aniversarioNoMes(birthday, now) {
  if (!birthday || !now) return false
  const mes = String(birthday).slice(5, 7)
  if (!/^\d{2}$/.test(mes)) return false
  return mes === partesDia(now).month
}

function historicoDe(concluidos, compras) {
  const servicos = (concluidos || []).map((app) => ({
    id: `apt-${app.id}`,
    tipo: 'servico',
    titulo: app.services?.name || 'Serviço',
    date: app.start_time,
    amount: Number(app.agreed_price) || 0,
    payment_method: app.payment_method,
    category: 'servico',
  }))
  const extras = (compras || []).map((t) => ({
    id: `tx-${t.id}`,
    tipo: 'compra',
    titulo: t.description || (t.category === 'mensalidade' ? 'Mensalidade' : 'Compra'),
    date: t.date,
    amount: Number(t.amount) || 0,
    payment_method: t.payment_method,
    category: t.category,
  }))
  return [...servicos, ...extras].sort((a, b) => String(b.date).localeCompare(String(a.date)))
}

export function carteiraDaCliente({ cliente, atendimentos = [], compras = [], now = new Date() }) {
  const doCliente = (atendimentos || []).filter((app) => app.client_id == cliente?.id)
  const concluidos = doCliente
    .filter((app) => app.status === 'CONCLUIDO')
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))
  const comprasCliente = (compras || []).filter((t) => t.client_id == cliente?.id)
  const historico = historicoDe(concluidos, comprasCliente)
  const summary = summarizeClient({
    historico,
    loyaltyVisits: cliente?.loyalty_visits,
    firstSeen: cliente?.created_at,
  })
  const last = concluidos[concluidos.length - 1] || null
  const maintenanceDays = Number(last?.services?.maintenance_days) || null
  const returnWindow = maintenanceDays || DEFAULT_RETURN_DAYS
  let frequencyDays = null
  if (concluidos.length >= 2) {
    const span = daysSinceDate(concluidos[0].start_time, concluidos[concluidos.length - 1].start_time)
    frequencyDays = Math.max(0, Math.round((span || 0) / (concluidos.length - 1)))
  }
  const hasFuture = doCliente.some((app) => (
    (app.status === 'AGENDADO' || app.status === 'PENDENTE')
    && new Date(app.start_time).getTime() >= now.getTime()
  ))
  return {
    atendimentos: summary.atendimentos,
    faturado: summary.faturado,
    ticket: summary.ticket,
    historico,
    lastVisit: last?.start_time || null,
    daysSince: last ? daysSinceDate(last.start_time, now) : null,
    frequencyDays,
    returnWindow,
    maintenanceDays,
    hasFuture,
    faltas: doCliente.filter((app) => app.status === 'FALTOU').length,
    cancelamentos: doCliente.filter((app) => app.status === 'CANCELADO').length,
  }
}

export function segmentosDaCliente(carteira, { cliente, now = new Date(), vipMin = DEFAULT_VIP_MIN, isTop = false } = {}) {
  const ids = []
  const diasCadastro = daysSinceDate(cliente?.created_at, now)
  if (diasCadastro != null && diasCadastro >= 0 && diasCadastro <= NEW_CLIENT_DAYS) ids.push('novas')
  if (
    carteira.atendimentos >= FREQUENT_MIN_VISITS
    && carteira.daysSince != null
    && carteira.daysSince <= carteira.returnWindow
  ) ids.push('frequentes')
  if (carteira.atendimentos > 0 && carteira.daysSince != null && carteira.daysSince > carteira.returnWindow) {
    ids.push('inativas')
  }
  const minimo = Number(vipMin)
  if (carteira.faturado >= (Number.isFinite(minimo) ? minimo : DEFAULT_VIP_MIN) || (isTop && carteira.faturado > 0)) {
    ids.push('vip')
  }
  if (
    carteira.maintenanceDays
    && carteira.daysSince != null
    && carteira.daysSince >= carteira.maintenanceDays
    && !carteira.hasFuture
  ) ids.push('sem_retorno')
  if (aniversarioNoMes(cliente?.birthday, now)) ids.push('aniversariantes')
  if (carteira.cancelamentos > 0) ids.push('cancelaram')
  if (carteira.faltas > 0) ids.push('faltaram')
  return ids
}

export function avisoDoSegmento({ workspaceId, cliente, segmentoId, now = new Date() }) {
  const segmento = SEGMENTOS.find((item) => item.id === segmentoId)
  if (!segmento) return null
  const text = segmento.texto(cliente?.name || 'Cliente')
  return {
    user_id: workspaceId,
    appointment_id: null,
    client_id: cliente.id,
    channel: 'whatsapp',
    type: segmento.tipo,
    scheduled_for: now.toISOString(),
    status: 'pending',
    next_attempt_at: now.toISOString(),
    payload: {
      title: segmento.label,
      body: text,
      url: '/',
      text,
      phone: cliente.phone || null,
    },
    idempotency_key: idempotencyKey({
      workspaceId,
      subject: `${segmentoId}:${cliente.id}`,
      type: segmento.tipo,
      channel: 'whatsapp',
      scheduledFor: now,
    }),
  }
}

export function textoFrequencia(carteira) {
  if (!carteira?.atendimentos) return 'Sem visita'
  if (carteira.atendimentos === 1 || carteira.frequencyDays == null) return '1 visita'
  return `a cada ${carteira.frequencyDays} dias`
}

export function textoUltimaVisita(carteira) {
  if (carteira?.daysSince == null) return 'Sem visita'
  if (carteira.daysSince <= 0) return 'Última visita hoje'
  if (carteira.daysSince === 1) return 'Última visita ontem'
  return `Última visita há ${carteira.daysSince} dias`
}
