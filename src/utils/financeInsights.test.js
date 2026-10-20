import { describe, expect, it } from 'vitest'
import { staffCommissions } from './financeInsights.js'

describe('staffCommissions', () => {
  it('calcula comissão e ignora mensalidade e pacote', () => {
    const list = staffCommissions([
      { staff_id: 'a', agreed_price: 100, payment_method: 'PIX', staff_members: { name: 'Ana', commission_percent: 20 } },
      { staff_id: 'a', agreed_price: 50, payment_method: 'MENSALIDADE', staff_members: { name: 'Ana', commission_percent: 20 } },
      { staff_id: 'a', agreed_price: 80, payment_method: 'PACOTE', staff_members: { name: 'Ana', commission_percent: 20 } },
      { staff_id: 'b', agreed_price: 200, payment_method: 'DINHEIRO', staff_members: { name: 'Bia', commission_percent: 10 } },
    ])
    expect(list).toHaveLength(2)
    const ana = list.find((row) => row.name === 'Ana')
    const bia = list.find((row) => row.name === 'Bia')
    expect(ana.bruto).toBe(100)
    expect(ana.comissao).toBe(20)
    expect(bia.comissao).toBe(20)
  })
})
