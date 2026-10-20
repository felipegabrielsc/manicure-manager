import { describe, expect, it } from 'vitest'
import { computeDeposit, pixCopyText, remainingDue } from './deposit.js'

describe('sinal PIX', () => {
  it('calcula valor fixo e percentual sem passar do preço', () => {
    expect(computeDeposit(100, 'off', 30)).toBe(0)
    expect(computeDeposit(100, 'fixed', 30)).toBe(30)
    expect(computeDeposit(100, 'fixed', 150)).toBe(100)
    expect(computeDeposit(80, 'percent', 25)).toBe(20)
  })

  it('abate o sinal só depois de pago', () => {
    expect(remainingDue({ agreed_price: 100, deposit_amount: 30, deposit_status: 'pending' })).toBe(100)
    expect(remainingDue({ agreed_price: 100, deposit_amount: 30, deposit_status: 'paid' })).toBe(70)
    expect(remainingDue({ agreed_price: 100, deposit_amount: 100, deposit_status: 'paid' })).toBe(0)
  })

  it('monta o texto do PIX com a chave', () => {
    expect(pixCopyText({ pixKey: '11999999999', amount: 40, businessName: 'Carla' })).toContain('PIX 11999999999')
    expect(pixCopyText({ pixKey: '', amount: 40, businessName: 'Carla' })).toContain('WhatsApp')
  })
})
