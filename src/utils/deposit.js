export function computeDeposit(price, mode, value) {
  const total = Math.max(0, Number(price) || 0)
  const raw = Number(value) || 0
  if (mode === 'fixed') return Math.min(total, Math.max(0, raw))
  if (mode === 'percent') return Math.min(total, Math.max(0, total * (raw / 100)))
  return 0
}

export function remainingDue(appointment) {
  const total = Math.max(0, Number(appointment?.agreed_price) || 0)
  const deposit = Math.max(0, Number(appointment?.deposit_amount) || 0)
  const paid = appointment?.deposit_status === 'paid' || appointment?.deposit_status === 'applied'
  return Math.max(0, total - (paid ? deposit : 0))
}

export function pixCopyText({ pixKey, amount, businessName }) {
  const valor = Number(amount) || 0
  const nome = businessName || 'o salão'
  if (!pixKey) {
    return `Sinal de R$ ${valor.toFixed(2)} para ${nome}. Peça a chave PIX no WhatsApp.`
  }
  return `PIX ${pixKey}\nSinal: R$ ${valor.toFixed(2)}\n${nome}`
}
