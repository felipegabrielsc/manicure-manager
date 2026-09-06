export function trendPct(atual, anterior) {
  const a = Number(atual) || 0
  const b = Number(anterior) || 0
  if (b === 0) return a === 0 ? 0 : 100
  return Math.round(((a - b) / Math.abs(b)) * 100)
}

export function dailyCompare(atualItens, anteriorItens, year, month) {
  const days = new Date(year, month + 1, 0).getDate()
  const rows = Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    atual: 0,
    anterior: 0,
    qtdAtual: 0,
    qtdAnterior: 0,
  }))

  for (const item of atualItens || []) {
    const d = new Date(item.date)
    if (d.getFullYear() !== year || d.getMonth() !== month) continue
    const i = d.getDate() - 1
    if (i < 0 || i >= days) continue
    rows[i].atual += Number(item.amount) || 0
    rows[i].qtdAtual += 1
  }

  const prev = new Date(year, month - 1, 1)
  const prevDays = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate()
  for (const item of anteriorItens || []) {
    const d = new Date(item.date)
    if (d.getFullYear() !== prev.getFullYear() || d.getMonth() !== prev.getMonth()) continue
    const i = d.getDate() - 1
    if (i < 0 || i >= days) continue
    if (i >= prevDays) continue
    rows[i].anterior += Number(item.amount) || 0
    rows[i].qtdAnterior += 1
  }

  return rows
}

export function sliceUntilDay(rows, day) {
  const n = Math.max(1, Math.min(day, rows.length))
  return rows.slice(0, n).reduce(
    (acc, r) => ({
      faturamento: acc.faturamento + r.atual,
      faturamentoAnt: acc.faturamentoAnt + r.anterior,
      atendimentos: acc.atendimentos + r.qtdAtual,
      atendimentosAnt: acc.atendimentosAnt + r.qtdAnterior,
    }),
    { faturamento: 0, faturamentoAnt: 0, atendimentos: 0, atendimentosAnt: 0 },
  )
}

export function classifyNewVsReturning(monthClientIds, priorClientIds) {
  const ids = [...new Set((monthClientIds || []).filter(Boolean))]
  let novas = 0
  let recorrentes = 0
  for (const id of ids) {
    if (priorClientIds?.has(id)) recorrentes += 1
    else novas += 1
  }
  return { total: ids.length, novas, recorrentes }
}

export function topClientsByVisits(appointments, limit = 5) {
  const map = {}
  for (const a of appointments || []) {
    const id = a.client_id
    if (!id) continue
    if (!map[id]) map[id] = { id, name: a.clients?.name || 'Cliente', visitas: 0 }
    map[id].visitas += 1
  }
  return Object.values(map).sort((a, b) => b.visitas - a.visitas).slice(0, limit)
}

export function paymentMix(receitas) {
  const map = {}
  for (const r of receitas || []) {
    const k = r.payment_method || 'OUTRO'
    if (!map[k]) map[k] = { metodo: k, qtd: 0, total: 0 }
    map[k].qtd += 1
    map[k].total += Number(r.amount) || 0
  }
  const list = Object.values(map).sort((a, b) => b.total - a.total)
  const soma = list.reduce((acc, x) => acc + x.total, 0)
  return list.map(x => ({ ...x, pct: soma ? Math.round((x.total / soma) * 100) : 0 }))
}

export function labelPagamentoCurto(metodo) {
  if (metodo === 'PIX') return 'PIX'
  if (metodo === 'DINHEIRO') return 'Dinheiro'
  if (metodo === 'CARTAO') return 'Cartão'
  if (metodo === 'MENSALIDADE') return 'Mensalidade'
  if (metodo === 'OUTRO') return 'Outro'
  return metodo || 'Outro'
}
