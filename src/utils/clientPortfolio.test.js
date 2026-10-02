import { describe, expect, it } from 'vitest'
import { summarizeClient } from './clientInsights.js'
import {
  aniversarioNoMes,
  avisoDoSegmento,
  carteiraDaCliente,
  segmentosDaCliente,
} from './clientPortfolio.js'

const now = new Date('2026-10-02T15:00:00.000Z')

const cliente = {
  id: 7,
  name: 'Maria',
  phone: '11988887777',
  created_at: '2026-09-20T15:00:00.000Z',
  birthday: '1992-10-08',
  loyalty_visits: 4,
}

const atendimentos = [
  { id: 1, client_id: 7, status: 'CONCLUIDO', start_time: '2026-08-01T15:00:00.000Z', agreed_price: 80, payment_method: 'PIX', services: { name: 'Gel', maintenance_days: 21 } },
  { id: 2, client_id: 7, status: 'CONCLUIDO', start_time: '2026-08-31T15:00:00.000Z', agreed_price: 90, payment_method: 'PIX', services: { name: 'Gel', maintenance_days: 21 } },
  { id: 3, client_id: 7, status: 'CONCLUIDO', start_time: '2026-09-02T15:00:00.000Z', agreed_price: 100, payment_method: 'PIX', services: { name: 'Gel', maintenance_days: 21 } },
  { id: 4, client_id: 7, status: 'FALTOU', start_time: '2026-09-10T15:00:00.000Z', agreed_price: 100, services: { name: 'Gel' } },
  { id: 5, client_id: 7, status: 'CANCELADO', start_time: '2026-09-12T15:00:00.000Z', agreed_price: 100, services: { name: 'Gel' } },
]

const compras = [
  { id: 9, client_id: 7, description: 'Esmalte', amount: 20, date: '2026-09-02', payment_method: 'DINHEIRO', category: 'venda', type: 'RECEITA' },
]

describe('carteira da cliente', () => {
  const carteira = carteiraDaCliente({ cliente, atendimentos, compras, now })

  it('repete faturado, ticket e atendimentos do summarizeClient', () => {
    const summary = summarizeClient({ historico: carteira.historico, loyaltyVisits: cliente.loyalty_visits, firstSeen: cliente.created_at })
    expect(carteira.faturado).toBe(summary.faturado)
    expect(carteira.ticket).toBe(summary.ticket)
    expect(carteira.atendimentos).toBe(summary.atendimentos)
    expect(carteira.faturado).toBe(290)
    expect(carteira.atendimentos).toBe(3)
  })

  it('conta a última visita, a frequência, faltas e cancelamentos', () => {
    expect(carteira.daysSince).toBe(30)
    expect(carteira.frequencyDays).toBe(16)
    expect(carteira.faltas).toBe(1)
    expect(carteira.cancelamentos).toBe(1)
    expect(carteira.maintenanceDays).toBe(21)
    expect(carteira.returnWindow).toBe(21)
  })

  it('marca inativa, sem retorno, aniversariante, falta e cancelamento', () => {
    const ids = segmentosDaCliente(carteira, { cliente, now, vipMin: 300, isTop: true })
    expect(ids).toEqual(['novas', 'inativas', 'vip', 'sem_retorno', 'aniversariantes', 'cancelaram', 'faltaram'])
  })

  it('não trata como inativa quem voltou dentro da janela e já tem horário', () => {
    const recente = carteiraDaCliente({
      cliente: { ...cliente, created_at: '2026-10-01T15:00:00.000Z', birthday: null },
      atendimentos: [
        { id: 1, client_id: 7, status: 'CONCLUIDO', start_time: '2026-09-20T15:00:00.000Z', agreed_price: 50, services: { name: 'Pé', maintenance_days: 30 } },
        { id: 2, client_id: 7, status: 'CONCLUIDO', start_time: '2026-09-27T15:00:00.000Z', agreed_price: 50, services: { name: 'Pé', maintenance_days: 30 } },
        { id: 3, client_id: 7, status: 'CONCLUIDO', start_time: '2026-10-01T15:00:00.000Z', agreed_price: 40, services: { name: 'Pé', maintenance_days: 30 } },
        { id: 4, client_id: 7, status: 'AGENDADO', start_time: '2026-10-20T15:00:00.000Z', agreed_price: 40, services: { name: 'Pé' } },
      ],
      now,
    })
    expect(segmentosDaCliente(recente, { cliente: { ...cliente, created_at: '2026-10-01T15:00:00.000Z', birthday: null }, now, vipMin: 500 })).toEqual([
      'novas',
      'frequentes',
    ])
  })

  it('reconhece aniversário só pelo mês', () => {
    expect(aniversarioNoMes('1992-10-08', now)).toBe(true)
    expect(aniversarioNoMes('1992-11-08', now)).toBe(false)
    expect(aniversarioNoMes(null, now)).toBe(false)
  })

  it('enfileira aniversário e inativa como pending, sem abrir WhatsApp', () => {
    const niver = avisoDoSegmento({ workspaceId: 'ws-1', cliente, segmentoId: 'aniversariantes', now })
    const inativa = avisoDoSegmento({ workspaceId: 'ws-1', cliente, segmentoId: 'inativas', now })
    expect(niver.type).toBe('birthday')
    expect(niver.status).toBe('pending')
    expect(niver.channel).toBe('whatsapp')
    expect(niver.payload.text).toContain('Feliz aniversário')
    expect(inativa.type).toBe('campaign')
    expect(inativa.status).toBe('pending')
    expect(inativa.idempotency_key).toBe(niver.idempotency_key.replace('aniversariantes', 'inativas').replace(':birthday:', ':campaign:'))
    expect(niver.idempotency_key).toContain('aniversariantes:7')
    expect(niver.payload.phone).toBe('11988887777')
  })
})
