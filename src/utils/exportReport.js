export function exportToCsv(movimentacoes, mesFormatado, totais) {
  const header = ['Data', 'Descrição', 'Tipo', 'Origem', 'Valor (R$)']
  const rows = movimentacoes.map(m => [
    new Date(m.date).toLocaleDateString('pt-BR'),
    `"${(m.description || '').replace(/"/g, '""')}"`,
    m.type === 'RECEITA' ? 'Receita' : 'Despesa',
    m.origem === 'AGENDA' ? 'Agenda' : 'Manual',
    m.amount.toFixed(2).replace('.', ','),
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
      <td>${new Date(m.date).toLocaleDateString('pt-BR')}</td>
      <td>${m.description}</td>
      <td>${m.type === 'RECEITA' ? 'Receita' : 'Despesa'}</td>
      <td style="text-align:right;color:${m.type === 'RECEITA' ? '#16a34a' : '#dc2626'}">
        ${m.type === 'DESPESA' ? '-' : '+'} R$ ${m.amount.toFixed(2)}
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

export function calcularDesconto(preco, discountType, discountValue) {
  if (discountType === 'percent') {
    return Math.min(preco, preco * (discountValue / 100))
  }
  return Math.min(preco, discountValue)
}
