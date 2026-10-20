export const WHATSAPP_BURST_LIMIT = 10
export const STUCK_SENDING_MS = 5 * 60 * 1000
export const MAX_SEND_ATTEMPTS = 4

export function isStuckSending(row, now = new Date(), windowMs = STUCK_SENDING_MS) {
  if (!row || row.status !== 'sending') return false
  const stamp = row.updated_at || row.created_at
  if (!stamp) return true
  return now.getTime() - new Date(stamp).getTime() >= windowMs
}

export function recoverStuckRows(rows, now = new Date(), windowMs = STUCK_SENDING_MS) {
  return (rows || []).map((row) => {
    if (!isStuckSending(row, now, windowMs)) return row
    return { ...row, status: 'pending', error_message: 'recovered_stuck_sending' }
  })
}

/** Um id só pode ser reivindicado por um worker. */
export function tryClaim(store, id) {
  const row = store.find((item) => item.id === id)
  if (!row || row.status !== 'pending') return false
  row.status = 'sending'
  row.updated_at = new Date().toISOString()
  return true
}

/**
 * Resposta do provedor: sent | retry | failed.
 * Sucesso sem id do provedor conta como enviado (não reenvia).
 * Timeout / 5xx / gateway_down: retry. 4xx permanente: failed.
 */
export function classifySendResult(result) {
  if (!result) return { outcome: 'retry', retry: true, reason: 'empty_result' }
  if (result.ok) return { outcome: 'sent', retry: false, reason: result.providerMessageId ? 'acked' : 'ok_ambiguous' }
  if (result.error === 'no_phone' || result.error === 'not_configured' || result.error === 'gateway_unauthorized') {
    return { outcome: 'failed', retry: false, reason: result.error }
  }
  if (result.retry === true || result.error === 'gateway_down' || result.status === 0) {
    return { outcome: 'retry', retry: true, reason: result.error || 'transient' }
  }
  if (result.status === 409) return { outcome: 'sent', retry: false, reason: 'duplicate' }
  return { outcome: result.retry ? 'retry' : 'failed', retry: !!result.retry, reason: result.error || 'unknown' }
}

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
