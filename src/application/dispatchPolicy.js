export const WHATSAPP_BURST_LIMIT = 10

export function phoneTail(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return null
  return digits.slice(-4)
}

export function dispatchLogEntry({ workspaceId, notificationId, type, channel, status, attempt, phone }) {
  return {
    user_id: workspaceId,
    notification_id: notificationId || null,
    type: type || null,
    channel: channel || null,
    status: status || null,
    attempt: Number(attempt) || 0,
    phone_tail: phoneTail(phone),
  }
}

export function allowSend(sentByWorkspace, workspaceId, limit = WHATSAPP_BURST_LIMIT) {
  return (sentByWorkspace?.[workspaceId] || 0) < limit
}

export function webhookSecretDistinct(secret, { cronSecret = '', mpToken = '' } = {}) {
  if (!secret) return false
  if (cronSecret && secret === cronSecret) return false
  if (mpToken && secret === mpToken) return false
  return true
}
