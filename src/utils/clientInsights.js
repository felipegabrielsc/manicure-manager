import { money } from './dates'

export function formatLongPt(value) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: '2-digit' })
}

export function summarizeClient({ historico = [], aReceber = 0, loyaltyVisits = 0, visitsRequired = 10, rewardDescription = '1 serviço grátis', firstSeen }) {
  const servicos = historico.filter(h => h.tipo === 'servico')
  const faturado = historico.reduce((acc, h) => acc + (Number(h.amount) || 0), 0)
  const atendimentos = servicos.length
  const ticket = atendimentos ? faturado / atendimentos : 0

  const porServico = {}
  for (const s of servicos) {
    const nome = s.titulo || 'Serviço'
    if (!porServico[nome]) porServico[nome] = { nome, qtd: 0 }
    porServico[nome].qtd += 1
  }
  const favorito = Object.values(porServico).sort((a, b) => b.qtd - a.qtd)[0] || null

  const required = Math.max(1, Number(visitsRequired) || 10)
  const visits = Number(loyaltyVisits) || 0
  const ciclo = visits % required
  const faltam = ciclo === 0 && visits > 0 ? 0 : required - ciclo
  const podeResgatar = visits >= required

  return {
    atendimentos,
    faturado,
    ticket,
    aReceber: Number(aReceber) || 0,
    favorito,
    firstSeen,
    loyalty: {
      visits,
      required,
      ciclo: podeResgatar ? required : ciclo,
      faltam: podeResgatar ? 0 : faltam,
      podeResgatar,
      rewardDescription,
    },
  }
}

export function moneyBr(value) {
  return `R$ ${money(value)}`
}
