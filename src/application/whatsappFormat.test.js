import { describe, expect, it } from 'vitest'
import { mapGatewayStatus, morningSaoPauloIso, phoneToJid } from './whatsappFormat.js'

describe('whatsappFormat', () => {
  it('monta o jid com DDI 55', () => {
    expect(phoneToJid('(11) 98888-7777')).toBe('5511988887777@s.whatsapp.net')
    expect(phoneToJid('5511988887777')).toBe('5511988887777@s.whatsapp.net')
    expect(phoneToJid('123')).toBeNull()
  })

  it('traduz o status do gateway', () => {
    expect(mapGatewayStatus('Connected')).toBe('connected')
    expect(mapGatewayStatus('SCAN_QR')).toBe('connecting')
    expect(mapGatewayStatus('LOGGED_OUT')).toBe('disconnected')
    expect(mapGatewayStatus('weird')).toBe('attention')
  })

  it('8h em São Paulo é 11h UTC', () => {
    expect(morningSaoPauloIso(new Date('2026-10-10T15:00:00.000Z'))).toBe('2026-10-10T11:00:00.000Z')
  })
})
