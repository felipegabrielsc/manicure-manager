import { describe, expect, it } from 'vitest'
import {
  cobrancasMensalidade,
  idsMensalidadePaga,
  mensalidadeJaLancada,
  saoPauloParts,
} from './mensalidade.js'

const ana = {
  id: 7,
  name: 'Ana',
  type: 'MENSALISTA',
  phone: '16999990000',
  monthly_fee: 150,
  monthly_due_day: 10,
  monthly_due_offset: 1,
}

describe('mensalidade', () => {
  it('lê o dia em America/Sao_Paulo', () => {
    expect(saoPauloParts('2026-04-01T02:30:00.000Z')).toEqual({ year: 2026, month: 2, day: 31 })
  })

  it('não soma visita paga no PIX na cobrança do mês', () => {
    const view = new Date(2026, 3, 1)
    const rows = cobrancasMensalidade({
      viewDate: view,
      clients: [ana],
      appointments: [
        {
          id: 1,
          payment_method: 'PIX',
          agreed_price: 80,
          start_time: '2026-03-10T15:00:00.000Z',
          clients: ana,
        },
        {
          id: 2,
          payment_method: 'MENSALIDADE',
          agreed_price: 70,
          start_time: '2026-03-20T15:00:00.000Z',
          clients: ana,
        },
      ],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].servicosFeitos).toBe(1)
    expect(rows[0].valorServicos).toBe(70)
    expect(rows[0].valorCobrar).toBe(150)
  })

  it('sem valor fixo cobra só as visitas marcadas como mensalidade', () => {
    const semValor = { ...ana, monthly_fee: null }
    const rows = cobrancasMensalidade({
      viewDate: new Date(2026, 3, 1),
      clients: [semValor],
      appointments: [
        {
          id: 2,
          payment_method: 'MENSALIDADE',
          agreed_price: 70.1,
          start_time: '2026-03-20T15:00:00.000Z',
          clients: semValor,
        },
        {
          id: 3,
          payment_method: 'MENSALIDADE',
          agreed_price: 29.9,
          start_time: '2026-03-21T15:00:00.000Z',
          clients: semValor,
        },
      ],
    })
    expect(rows[0].valorCobrar).toBe(100)
  })

  it('compra de produto não quita a mensalidade', () => {
    const transactions = [
      { client_id: 7, type: 'RECEITA', category: 'produto', description: 'Esmalte', date: '2026-04-02' },
      { client_id: 7, type: 'RECEITA', category: 'mensalidade', description: 'Mensalidade Ana', date: '2026-04-10' },
    ]
    expect(idsMensalidadePaga(transactions)).toEqual([7])
    expect(mensalidadeJaLancada(transactions, 7, '2026-04-11')).toBe(true)
    expect(mensalidadeJaLancada([transactions[0]], 7, '2026-04-11')).toBe(false)
  })
})