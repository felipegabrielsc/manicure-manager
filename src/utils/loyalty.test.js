import { describe, expect, it } from 'vitest'
import { deveContarVisita } from './loyalty.js'

const planoComFidelidade = {
  subscription_status: 'active',
  subscription_plans: { features: ['Agenda', 'Clientes', 'Financeiro', 'Fidelidade'] },
}

describe('fidelidade', () => {
  it('não conta visita sem o programa ligado', () => {
    expect(deveContarVisita({ settings: null, profile: planoComFidelidade })).toBe(false)
    expect(deveContarVisita({ settings: { active: false }, profile: planoComFidelidade })).toBe(false)
  })

  it('não conta visita no plano sem fidelidade', () => {
    expect(deveContarVisita({
      settings: { active: true },
      profile: { subscription_status: 'active', subscription_plans: { features: ['Agenda', 'Clientes', 'Financeiro'] } },
    })).toBe(false)
  })

  it('conta quando o programa foi ligado e o plano inclui fidelidade', () => {
    expect(deveContarVisita({ settings: { active: true }, profile: planoComFidelidade })).toBe(true)
  })
})
