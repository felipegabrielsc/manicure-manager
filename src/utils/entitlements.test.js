import { describe, expect, it } from 'vitest'
import { hasFeature, isSubscriptionUsable, canOpenPath } from './entitlements.js'
import { toTimeInput, toDateInputValue } from './dates.js'

describe('entitlements', () => {
  it('admin passa em tudo', () => {
    const profile = { is_admin: true }
    expect(hasFeature(profile, 'Estoque')).toBe(true)
    expect(canOpenPath(profile, '/equipe')).toBe(true)
  })

  it('trial sem Pro não abre estoque', () => {
    const profile = { is_admin: false, subscription_status: 'trial', trial_ends_at: '2099-01-01' }
    expect(isSubscriptionUsable(profile)).toBe(true)
    expect(hasFeature(profile, 'Estoque')).toBe(false)
    expect(canOpenPath(profile, '/estoque')).toBe(false)
    expect(canOpenPath(profile, '/')).toBe(true)
  })

  it('expirado só planos e config', () => {
    const profile = { subscription_status: 'expired' }
    expect(canOpenPath(profile, '/planos')).toBe(true)
    expect(canOpenPath(profile, '/')).toBe(false)
  })
})

describe('dates', () => {
  it('normaliza time do Postgres', () => {
    expect(toTimeInput('09:00:00')).toBe('09:00')
    expect(toTimeInput('')).toBe('09:00')
  })

  it('formata data civil local', () => {
    expect(toDateInputValue(new Date(2026, 8, 5, 22, 0, 0))).toBe('2026-09-05')
  })
})
