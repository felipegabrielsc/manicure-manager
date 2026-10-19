export function phoneToJid(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.length < 10) return null
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`
  return `${withCountry}@s.whatsapp.net`
}

export function mapGatewayStatus(raw) {
  const value = String(raw || '').trim().toLowerCase()
  if (value === 'connected') return 'connected'
  if (value === 'connecting' || value === 'scan_qr') return 'connecting'
  if (!value || value === 'disconnected' || value === 'logged_out' || value === 'stopped') return 'disconnected'
  return 'attention'
}

export function morningSaoPauloIso(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const pick = (type) => parts.find((part) => part.type === type)?.value || '00'
  return `${pick('year')}-${pick('month')}-${pick('day')}T11:00:00.000Z`
}
