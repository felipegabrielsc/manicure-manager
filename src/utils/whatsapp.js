export function digitsPhone(phone) {
  return String(phone || '').replace(/\D/g, '')
}

export function waMeUrl(phone, message) {
  const digits = digitsPhone(phone)
  if (!digits) return null
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`
  const q = message ? `?text=${encodeURIComponent(message)}` : ''
  return `https://wa.me/${withCountry}${q}`
}

export function openWhatsApp(phone, message) {
  const url = waMeUrl(phone, message)
  if (!url) return false
  window.open(url, '_blank')
  return true
}
