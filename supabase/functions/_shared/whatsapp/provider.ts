import { mapGatewayStatus, phoneToJid } from './format.ts'

export type GatewayStatus = 'disconnected' | 'connecting' | 'connected' | 'attention'

type RequestResult = { ok: boolean; status: number; body: Record<string, unknown> | null; error: string | null }

function notImplemented() {
  return { ok: false, error: 'not_implemented', retry: false }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

export function createWhatsAppProvider() {
  const base = (Deno.env.get('WA_AKG_URL') || '').replace(/\/$/, '')
  const apiKey = Deno.env.get('WA_AKG_API_KEY') || ''
  const configured = Boolean(base && apiKey)

  async function request(path: string, init: RequestInit = {}): Promise<RequestResult> {
    if (!configured) return { ok: false, status: 0, body: null, error: 'not_configured' }
    try {
      const response = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
          ...(init.headers || {}),
        },
      })
      const body = asRecord(await response.json().catch(() => null))
      return { ok: response.ok, status: response.status, body, error: response.ok ? null : 'gateway_error' }
    } catch {
      return { ok: false, status: 0, body: null, error: 'gateway_down' }
    }
  }

  function textStatus(value: unknown) {
    return typeof value === 'string' ? value : ''
  }

  function readStatus(body: Record<string, unknown> | null) {
    const data = asRecord(body?.data)
    return mapGatewayStatus(textStatus(data?.status) || textStatus(body?.status))
  }

  return {
    configured,
    async connect({ sessionId, name, webhookUrl, webhookSecret }: {
      sessionId: string
      name: string
      webhookUrl?: string
      webhookSecret?: string
    }) {
      if (!configured) return { ok: false, error: 'not_configured', status: 'disconnected' as GatewayStatus }
      await request('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({ name, sessionId }),
      })
      await request(`/api/sessions/${encodeURIComponent(sessionId)}/start`, { method: 'POST' })
      if (webhookUrl && webhookSecret) {
        await request('/api/webhooks', {
          method: 'POST',
          body: JSON.stringify({
            name: 'Agenda',
            url: webhookUrl,
            secret: webhookSecret,
            sessionId,
            events: ['message.received', 'connection.update'],
          }),
        })
      }
      const qr = await request(`/api/sessions/${encodeURIComponent(sessionId)}/qr`)
      const data = asRecord(qr.body?.data)
      let status = readStatus(qr.body)
      if (qr.status === 400) status = 'connected'
      else if (qr.ok) status = 'connecting'
      return {
        ok: qr.ok || qr.status === 400,
        error: qr.ok || qr.status === 400 ? null : qr.error,
        status,
        qr: typeof data?.qr === 'string' ? data.qr : null,
        qrImage: typeof data?.base64 === 'string' ? data.base64 : null,
      }
    },
    async disconnect(sessionId: string) {
      if (!configured) return { ok: false, error: 'not_configured' }
      const result = await request(`/api/sessions/${encodeURIComponent(sessionId)}/logout`, { method: 'POST' })
      return { ok: result.ok || result.status === 404, error: result.error }
    },
    async getStatus(sessionId: string) {
      if (!configured) return { ok: false, error: 'not_configured', status: 'disconnected' as GatewayStatus }
      const result = await request(`/api/sessions/${encodeURIComponent(sessionId)}`)
      if (!result.ok) {
        return { ok: false, error: result.error, status: result.error === 'gateway_down' ? 'attention' as GatewayStatus : 'disconnected' as GatewayStatus }
      }
      const data = asRecord(result.body?.data) || result.body
      const me = asRecord(data?.me)
      const rawPhone = String(me?.id || me?.phone || '')
      const phone = rawPhone ? rawPhone.split('@')[0].replace(/\D/g, '') : null
      const displayName = String(me?.name || me?.notify || data?.name || '') || null
      let status = readStatus(result.body)
      let qrImage: string | null = null
      if (status === 'connecting' || status === 'disconnected') {
        const qr = await request(`/api/sessions/${encodeURIComponent(sessionId)}/qr`)
        const qrData = asRecord(qr.body?.data)
        if (typeof qrData?.base64 === 'string') qrImage = qrData.base64
        if (qr.status === 400) status = 'connected'
        else if (qr.ok) status = 'connecting'
      }
      return { ok: true, status, phone, displayName, qrImage }
    },
    async sendText({ sessionId, phone, text }: { sessionId: string; phone: string; text: string }) {
      const jid = phoneToJid(phone)
      if (!jid) return { ok: false, error: 'no_phone', retry: false, providerMessageId: null }
      if (!configured) return { ok: false, error: 'not_configured', retry: false, providerMessageId: null }
      const result = await request(
        `/api/messages/${encodeURIComponent(sessionId)}/${encodeURIComponent(jid)}/send`,
        { method: 'POST', body: JSON.stringify({ message: { text } }) },
      )
      if (result.error === 'not_configured') return { ok: false, error: 'not_configured', retry: false, providerMessageId: null }
      if (result.error === 'gateway_down') return { ok: false, error: 'gateway_down', retry: true, providerMessageId: null }
      const data = asRecord(result.body?.data)
      const key = asRecord(data?.key)
      const providerMessageId = typeof key?.id === 'string' ? key.id : null
      const rejected = result.body?.status === false
      if (!result.ok || rejected) {
        const retry = result.status === 0 || result.status === 404 || result.status >= 500
        const error = result.status === 401 ? 'gateway_unauthorized' : 'gateway_error'
        return { ok: false, error, retry: result.status === 401 ? false : retry, providerMessageId: null }
      }
      return { ok: true, providerMessageId, error: null, retry: false }
    },
    sendImage: async () => notImplemented(),
    sendDocument: async () => notImplemented(),
    sendTemplate: async () => notImplemented(),
  }
}
