function formatExportDate(value) {
  if (!value) return ''
  const raw = String(value)
  const isoDay = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoDay) return `${isoDay[3]}/${isoDay[2]}/${isoDay[1]}`
  return new Date(value).toLocaleDateString('pt-BR')
}

export function exportToCsv(movimentacoes, mesFormatado, totais) {
  const header = ['Data', 'Descrição', 'Tipo', 'Origem', 'Pagamento', 'Valor (R$)']
  const rows = movimentacoes.map(m => [
    formatExportDate(m.date),
    `"${(m.description || '').replace(/"/g, '""')}"`,
    m.type === 'RECEITA' ? 'Receita' : 'Despesa',
    m.origem === 'AGENDA' ? 'Agenda' : (m.category === 'produto' ? 'Produto' : 'Manual'),
    m.payment_method || '',
    Number(m.amount).toFixed(2).replace('.', ','),
  ])

  const summary = [
    [],
    ['Resumo do mês', mesFormatado],
    ['Entradas', totais.entradas.toFixed(2).replace('.', ',')],
    ['Saídas', totais.saidas.toFixed(2).replace('.', ',')],
    ['Lucro', totais.lucro.toFixed(2).replace('.', ',')],
  ]

  const csv = [header, ...rows, ...summary].map(r => r.join(';')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `financeiro-${mesFormatado.replace(/\s/g, '-').toLowerCase()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function exportToPrint(movimentacoes, mesFormatado, totais) {
  const rows = movimentacoes.map(m => `
    <tr>
      <td>${formatExportDate(m.date)}</td>
      <td>${m.description}</td>
      <td>${m.type === 'RECEITA' ? 'Receita' : 'Despesa'}${m.payment_method ? ` (${m.payment_method})` : ''}</td>
      <td style="text-align:right;color:${m.type === 'RECEITA' ? '#16a34a' : '#dc2626'}">
        ${m.type === 'DESPESA' ? '-' : '+'} R$ ${Number(m.amount).toFixed(2)}
      </td>
    </tr>
  `).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório ${mesFormatado}</title>
    <style>
      body{font-family:sans-serif;padding:24px;color:#1e293b}
      h1{font-size:20px;margin-bottom:4px}
      table{width:100%;border-collapse:collapse;margin-top:20px;font-size:13px}
      th,td{border:1px solid #e2e8f0;padding:8px;text-align:left}
      th{background:#f8fafc}
      .summary{margin-top:24px;display:flex;gap:24px}
      .summary div{padding:12px 16px;border-radius:8px;background:#f8fafc}
    </style></head><body>
    <h1>Relatório Financeiro</h1>
    <p>${mesFormatado}</p>
    <div class="summary">
      <div><strong>Entradas:</strong> R$ ${totais.entradas.toFixed(2)}</div>
      <div><strong>Saídas:</strong> R$ ${totais.saidas.toFixed(2)}</div>
      <div><strong>Lucro:</strong> R$ ${totais.lucro.toFixed(2)}</div>
    </div>
    <table><thead><tr><th>Data</th><th>Descrição</th><th>Tipo</th><th>Valor</th></tr></thead><tbody>${rows}</tbody></table>
    <script>window.onload=()=>window.print()</script>
    </body></html>`

  const w = window.open('', '_blank')
  w.document.write(html)
  w.document.close()
}

export function exportClientsCsv(clientes) {
  const header = ['Nome', 'WhatsApp', 'Tipo', 'Mensalidade', 'Vence dia', 'Visitas fidelidade']
  const rows = (clientes || []).map(c => [
    `"${String(c.name || '').replace(/"/g, '""')}"`,
    c.phone || '',
    c.type || 'AVULSO',
    c.monthly_fee != null ? Number(c.monthly_fee).toFixed(2).replace('.', ',') : '',
    c.monthly_due_day || '',
    c.loyalty_visits || 0,
  ])
  const csv = [header, ...rows].map(r => r.join(';')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function calcularDesconto(preco, discountType, discountValue) {
  if (discountType === 'percent') {
    return Math.min(preco, preco * (discountValue / 100))
  }
  return Math.min(preco, discountValue)
}
