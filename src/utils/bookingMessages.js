import { money } from './dates'

export function nomeServico(apt) {
  if (apt?.services?.name) return apt.services.name
  const extra = String(apt?.cancellation_reason || '')
  if (extra.startsWith('Serviço:')) return extra.replace(/^Serviço:\s*/, '')
  return 'Serviço'
}

export function motivoVisivel(reason) {
  const t = String(reason || '').trim()
  if (!t || t.startsWith('Serviço:')) return ''
  return t
}

export function valorServico(apt) {
  const n = Number(apt?.agreed_price)
  return Number.isFinite(n) && n > 0 ? `R$ ${money(n)}` : null
}

function quando(start) {
  const d = start instanceof Date ? start : new Date(start)
  const data = d.toLocaleDateString('pt-BR')
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return { data, hora }
}

export function msgPedidoPublico({ nome, negocio, start, servico, preco, codigo, status }) {
  const { data, hora } = quando(start)
  const linhas = [
    `Olá, sou *${nome}*!`,
    `Solicitei um horário pelo site${negocio ? ` de *${negocio}*` : ''}.`,
    `📅 *${data} às ${hora}*`,
    servico ? `💅 *${servico}*` : null,
    preco ? `💰 ${preco}` : null,
    'Status: *' + (status === 'AGENDADO' ? 'confirmado' : 'aguardando confirmação') + '*.',
    codigo ? `Código: *${codigo}*` : null,
  ]
  return linhas.filter(Boolean).join('\n')
}

export function msgConfirmarHorario(apt) {
  const { data, hora } = quando(apt.start_time)
  const servico = nomeServico(apt)
  const valor = valorServico(apt)
  return [
    `Olá ${apt.clients?.name}!`,
    `Seu horário está *confirmado*.`,
    `📅 ${data} às ${hora}`,
    `💅 ${servico}`,
    valor ? `💰 ${valor}` : null,
    'Te espero!',
  ].filter(Boolean).join('\n')
}

export function msgRecusarHorario(apt, motivo) {
  const { hora } = quando(apt.start_time)
  return `Olá ${apt.clients?.name}, não consegui confirmar o horário das ${hora}${motivo ? `: ${motivo}` : ''}. Podemos remarcar?`
}

export function msgLembrete(apt, link) {
  const { data, hora } = quando(apt.start_time)
  return [
    `Olá ${apt.clients?.name}! Lembrete do seu horário: ${data} às ${hora}.`,
    `Serviço: ${nomeServico(apt)}`,
    valorServico(apt) ? `Valor: ${valorServico(apt)}` : null,
    link ? `Detalhes: ${link}` : null,
  ].filter(Boolean).join('\n')
}

export function msgZapAgenda(apt, link) {
  const { hora } = quando(apt.start_time)
  const servico = nomeServico(apt)
  const pendente = apt.status === 'PENDENTE'
  if (pendente) {
    return `Olá ${apt.clients?.name}, vi sua solicitação para *${hora}* (${servico}). Podemos confirmar?\n\n${link}`
  }
  return `Olá ${apt.clients?.name}, confirmando seu horário hoje às *${hora}* · ${servico}.\n\nCartão: ${link}`
}

export function msgRecibo(apt) {
  const { data, hora } = quando(apt.start_time)
  const metodo = apt.payment_method
  const pagamento = metodo === 'MENSALIDADE' ? 'Pagamento: mensalidade'
    : metodo === 'PACOTE' ? 'Pagamento: pacote'
    : metodo ? `Pagamento: ${metodo}` : null
  return [
    `Recibo · ${apt.clients?.name}`,
    `📅 ${data} às ${hora}`,
    `💅 ${nomeServico(apt)}`,
    valorServico(apt) && metodo !== 'PACOTE' ? `💰 ${valorServico(apt)}` : null,
    pagamento,
    'Obrigada!',
  ].filter(Boolean).join('\n')
}

export function msgPedidoRecebido(apt) {
  const { data, hora } = quando(apt.start_time)
  const nome = apt?.clients?.name || 'Cliente'
  return `Oi ${nome}! Recebi seu pedido para ${data} às ${hora} (${nomeServico(apt)}). Já te confirmo por aqui.`
}

export function msgRemarcado(apt) {
  const { data, hora } = quando(apt.start_time)
  const nome = apt?.clients?.name || 'Cliente'
  return `Oi ${nome}! Seu horário foi remarcado para ${data} às ${hora} (${nomeServico(apt)}).`
}

export function msgPosAtendimento(apt) {
  const nome = apt?.clients?.name || 'Cliente'
  return `Oi ${nome}! Obrigada pelo atendimento de ${nomeServico(apt)}. Se puder, me conta como ficou 💜`
}

export function msgRetornoLembrete(nome, dias = 15) {
  return `Oi ${nome}! Passando para lembrar do retorno das unhas daqui a uns ${dias} dias. Quando quiser, é só marcar pelo link ou me chamar aqui 💜`
}

export function msgCobrancaMensalidade({ name, amount }) {
  const valor = amount != null && Number(amount) > 0 ? ` no valor de R$ ${money(amount)}` : ''
  return `Oi ${name}! Sua mensalidade vence hoje${valor}. Pode pagar por PIX quando puder 💜`
}

export function msgCancelamento(apt, status, motivo) {
  const nome = apt?.clients?.name || 'Cliente'
  const fato = status === 'FALTOU' ? 'marcado como falta' : 'cancelado'
  const extra = motivo && String(motivo).trim() ? `: ${String(motivo).trim()}` : ''
  return `Oi ${nome}, seu horário foi ${fato}${extra}.`
}

export function msgRetornoMarcado(apt, start) {
  const d = start instanceof Date ? start : new Date(start)
  const data = d.toLocaleDateString('pt-BR')
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `Oi ${apt?.clients?.name}! Já deixei seu retorno: ${data} às ${hora}.`
}

export function msgEsperaDisponivel(item, link) {
  const servico = item?.services?.name ? ` para ${item.services.name}` : ''
  const convite = link ? `Pode marcar aqui: ${link}` : 'Pode me chamar aqui para marcar.'
  return `Oi ${item?.name}! Abriu um horário na agenda${servico}. ${convite}`
}
