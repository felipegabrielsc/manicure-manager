import { describe, expect, it } from 'vitest'
import { msgConfirmarHorario, msgPedidoPublico, nomeServico } from './bookingMessages'

describe('bookingMessages', () => {
  it('usa o nome do serviço no pedido público', () => {
    const msg = msgPedidoPublico({
      nome: 'Ana',
      negocio: 'Studio',
      start: new Date('2026-09-06T15:00:00'),
      servico: 'Pé e mão',
      preco: 'R$ 50.00',
      codigo: '1234',
    })
    expect(msg).toContain('Ana')
    expect(msg).toContain('Pé e mão')
    expect(msg).toContain('aguardando confirmação')
  })

  it('marca pedido público já confirmado', () => {
    const msg = msgPedidoPublico({
      nome: 'Ana',
      negocio: 'Studio',
      start: new Date('2026-09-06T15:00:00'),
      servico: 'Pé e mão',
      status: 'AGENDADO',
    })
    expect(msg).toContain('confirmado')
  })

  it('confirma com serviço e valor', () => {
    const msg = msgConfirmarHorario({
      start_time: '2026-09-06T15:00:00',
      agreed_price: 80,
      clients: { name: 'Bia' },
      services: { name: 'Esmaltação' },
    })
    expect(msg).toContain('confirmado')
    expect(msg).toContain('Esmaltação')
    expect(msg).toContain('80.00')
  })

  it('recupera serviço salvo no motivo', () => {
    expect(nomeServico({ cancellation_reason: 'Serviço: Francesinha' })).toBe('Francesinha')
  })
})
