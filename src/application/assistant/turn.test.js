import { describe, expect, it } from 'vitest'
import { assistantEnabled, runAssistantTurn } from './turn.js'
import { allowSend, dispatchLogEntry, webhookSecretDistinct, WHATSAPP_BURST_LIMIT } from '../dispatchPolicy.js'

const now = new Date('2026-10-01T15:00:00.000Z')

const catalog = {
  phone: '11988887777',
  profile: { business_name: 'Studio Maria', address: 'Rua A, 10' },
  client: { id: 7, name: 'Ana', phone: '11988887777' },
  services: [{ id: 3, name: 'Unha em gel', duration_minutes: 60, default_price: 80 }],
  businessHours: [{ day_of_week: 5, open_time: '09:00', close_time: '18:00', is_closed: false }],
  appointments: [{
    id: 9,
    client_id: 7,
    status: 'AGENDADO',
    service_id: 3,
    start_time: '2026-10-02T17:00:00.000Z',
    services: { duration_minutes: 60 },
  }],
  blockedSlots: [],
}

describe('assistente', () => {
  it('fica desligado enquanto o perfil não autoriza', () => {
    expect(assistantEnabled(null)).toBe(false)
    expect(assistantEnabled({ ai_enabled: false })).toBe(false)
    expect(assistantEnabled({ ai_enabled: true })).toBe(true)
  })

  it('oferece horários livres e não grava na primeira frase', () => {
    const turn = runAssistantTurn({ text: 'Quero marcar unha sexta', catalog, now })
    expect(turn.action).toBeNull()
    expect(turn.handoff).toBe(false)
    expect(turn.say).toMatch(/09:00|10:00|15:00/)
    expect(turn.say).not.toMatch(/14:00/)
    expect(turn.nextState.offered.length).toBeGreaterThan(0)
    expect(turn.nextState.offered.some((slot) => slot.label === '14:00')).toBe(false)
  })

  it('grava só depois que a cliente escolhe um horário livre', () => {
    const first = runAssistantTurn({ text: 'Quero marcar unha sexta', catalog, now })
    const second = runAssistantTurn({
      text: 'quero o das 15',
      state: first.nextState,
      catalog,
      now,
    })
    expect(second.action).toEqual({
      type: 'create_appointment',
      serviceId: 3,
      startTime: '2026-10-02T18:00:00.000Z',
      clientName: 'Ana',
      phone: '11988887777',
    })
  })

  it('recusa horário ocupado pela regra da agenda', () => {
    const turn = runAssistantTurn({ text: 'quero marcar unha sexta as 14', catalog, now })
    expect(turn.action).toBeNull()
    expect(turn.say).toMatch(/ocupado/i)
  })

  it('pede a manicure quando a cliente chama uma pessoa', () => {
    const turn = runAssistantTurn({ text: 'quero falar com uma pessoa', catalog, now })
    expect(turn.handoff).toBe(true)
    expect(turn.action).toBeNull()
  })

  it('não cancela sem um sim', () => {
    const ask = runAssistantTurn({ text: 'cancela meu horário', catalog, now })
    expect(ask.action).toBeNull()
    expect(ask.nextState.pendingCancelId).toBe(9)
    const done = runAssistantTurn({ text: 'sim', state: ask.nextState, catalog, now })
    expect(done.action).toEqual({ type: 'cancel_appointment', appointmentId: 9 })
  })
})

describe('observabilidade', () => {
  it('registra o envio sem o telefone inteiro', () => {
    const entry = dispatchLogEntry({
      workspaceId: 'ws-1',
      notificationId: 'n-1',
      type: 'appointment_confirmed',
      channel: 'whatsapp',
      status: 'sent',
      attempt: 1,
      phone: '11988887777',
    })
    expect(entry.phone_tail).toBe('7777')
    expect(JSON.stringify(entry)).not.toContain('11988887777')
    expect(entry).not.toHaveProperty('text')
  })

  it('segura a rajada de um salão', () => {
    const sent = { 'ws-1': WHATSAPP_BURST_LIMIT }
    expect(allowSend(sent, 'ws-1')).toBe(false)
    expect(allowSend(sent, 'ws-2')).toBe(true)
  })

  it('não aceita o segredo do webhook igual ao cron ou ao Mercado Pago', () => {
    expect(webhookSecretDistinct('', { cronSecret: 'cron', mpToken: 'mp' })).toBe(false)
    expect(webhookSecretDistinct('cron', { cronSecret: 'cron', mpToken: 'mp' })).toBe(false)
    expect(webhookSecretDistinct('mp', { cronSecret: 'cron', mpToken: 'mp' })).toBe(false)
    expect(webhookSecretDistinct('webhook-sozinho', { cronSecret: 'cron', mpToken: 'mp' })).toBe(true)
  })
})
