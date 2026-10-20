export function occupancyRate({ bookedMinutes, openMinutes }) {
  const open = Number(openMinutes) || 0
  if (open <= 0) return 0
  return Math.min(100, Math.round(((Number(bookedMinutes) || 0) / open) * 100))
}

export function absenceRate({ faltou, total }) {
  const n = Number(total) || 0
  if (n <= 0) return 0
  return Math.round(((Number(faltou) || 0) / n) * 100)
}

export function retentionRate({ returningClients, totalClients }) {
  const n = Number(totalClients) || 0
  if (n <= 0) return 0
  return Math.round(((Number(returningClients) || 0) / n) * 100)
}

export function revenueByService(appointments) {
  const map = {}
  for (const a of appointments || []) {
    if (a.status !== 'CONCLUIDO') continue
    if (a.payment_method === 'MENSALIDADE' || a.payment_method === 'PACOTE') continue
    const name = a.services?.name || 'Serviço'
    if (!map[name]) map[name] = { name, amount: 0, count: 0 }
    map[name].amount += Number(a.agreed_price) || 0
    map[name].count += 1
  }
  return Object.values(map).sort((a, b) => b.amount - a.amount)
}

export function buildSalonReport(appointments) {
  const lista = appointments || []
  const validos = lista.filter((a) => a.status !== 'CANCELADO')
  const concluidos = lista.filter((a) => a.status === 'CONCLUIDO')
  const faltou = lista.filter((a) => a.status === 'FALTOU').length
  const bookedMinutes = validos.reduce((sum, a) => sum + (Number(a.services?.duration_minutes) || 60), 0)
  const clients = new Map()
  for (const a of concluidos) {
    if (!a.client_id) continue
    clients.set(a.client_id, (clients.get(a.client_id) || 0) + 1)
  }
  const totalClients = clients.size
  const returningClients = [...clients.values()].filter((n) => n > 1).length
  return {
    ocupacao: occupancyRate({ bookedMinutes, openMinutes: 8 * 60 * 22 }),
    faltas: absenceRate({ faltou, total: validos.length }),
    retorno: retentionRate({ returningClients, totalClients }),
    servicos: revenueByService(lista).slice(0, 5),
    atendimentos: concluidos.length,
    ausencias: faltou,
  }
}

export function resumoDoDia({ appointments, now = new Date() }) {
  const lista = appointments || []
  const ativos = lista.filter((a) => a.status !== 'CANCELADO' && a.status !== 'FALTOU')
  const caixa = ativos
    .filter((a) => a.status === 'CONCLUIDO')
    .reduce((sum, a) => sum + (Number(a.agreed_price) || 0), 0)
  const proximos = ativos
    .filter((a) => a.status !== 'CONCLUIDO' && new Date(a.start_time).getTime() >= now.getTime())
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))
  return {
    caixa,
    total: ativos.length,
    proximos: proximos.length,
    proximo: proximos[0] || null,
  }
}
