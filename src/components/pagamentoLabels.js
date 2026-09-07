export function labelPagamento(metodo) {
  if (metodo === 'PIX') return 'PIX'
  if (metodo === 'DINHEIRO') return 'Dinheiro'
  if (metodo === 'CARTAO') return 'Cartão'
  if (metodo === 'MENSALIDADE') return 'Mensalidade'
  if (metodo === 'PACOTE') return 'Pacote'
  return metodo
}
