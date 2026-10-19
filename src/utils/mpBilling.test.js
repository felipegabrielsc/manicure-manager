import { describe, expect, it } from 'vitest'
import {
  billingAction,
  computeExpiryIso,
  planPeriodDays,
  reduceBillingEvent,
  replayNotifications,
  resolvePayer,
} from '../../supabase/functions/_shared/mpBilling.js'

const now = new Date('2026-10-19T12:00:00.000Z')
const userId = 'user-1'
const planId = 'plan-1'
const paymentId = 'pay-1'

function activateOnce(extra = {}) {
  return reduceBillingEvent({
    event: extra.event || null,
    profile: extra.profile || { id: userId, subscription_status: 'trial' },
    apiStatus: extra.apiStatus || 'approved',
    userId,
    planId,
    days: extra.days ?? 31,
    now: extra.now || now,
    paymentId: extra.paymentId || paymentId,
  })
}

describe('mpBilling', () => {
  it('resolve pagador por metadata ou external_reference', () => {
    expect(resolvePayer({
      metadata: { user_id: userId, plan_id: planId },
    })).toEqual({ userId, planId })
    expect(resolvePayer({
      external_reference: `${userId}|${planId}`,
    })).toEqual({ userId, planId })
  })

  it('mapeia status da API oficial, não o tópico do webhook', () => {
    expect(billingAction('pending')).toBe('wait')
    expect(billingAction('approved')).toBe('activate')
    expect(billingAction('rejected')).toBe('reject')
    expect(billingAction('refunded')).toBe('refund')
    expect(billingAction('charged_back')).toBe('refund')
  })

  it('pendente depois aprovado ativa uma vez', () => {
    const { profile, results } = replayNotifications([
      { apiStatus: 'pending', userId, planId, now, paymentId, days: 31 },
      { apiStatus: 'approved', userId, planId, now, paymentId, days: 31 },
    ], { profile: { id: userId, subscription_status: 'trial' } })
    expect(results[0].effect).toBe('wait')
    expect(results[1].effect).toBe('activated')
    expect(results[1].duplicate).toBe(false)
    expect(profile.subscription_status).toBe('active')
    expect(profile.mp_last_payment_id).toBe(paymentId)
  })

  it('notificação duplicada aprovada não renova de novo', () => {
    const first = activateOnce()
    const second = activateOnce({ event: first.event, profile: first.profile })
    expect(second.result.duplicate).toBe(true)
    expect(second.profile.subscription_expires_at).toBe(first.profile.subscription_expires_at)
  })

  it('notificação atrasada aprovada ainda ativa se o efeito não rodou', () => {
    const late = activateOnce({
      event: { mp_payment_id: paymentId, status: 'pending', effect: 'none' },
      now: new Date('2026-10-21T12:00:00.000Z'),
    })
    expect(late.result.effect).toBe('activated')
    expect(late.result.duplicate).toBe(false)
  })

  it('aprovado depois pendente (fora de ordem no tópico) usa o status da API', () => {
    const { profile, results } = replayNotifications([
      { apiStatus: 'approved', userId, planId, now, paymentId, days: 31 },
      { apiStatus: 'approved', userId, planId, now, paymentId, days: 31 },
    ], { profile: { id: userId, subscription_status: 'trial' } })
    expect(results.filter(r => r.effect === 'activated' && !r.duplicate)).toHaveLength(1)
    expect(profile.subscription_status).toBe('active')
  })

  it('reembolso após ativação cancela só se for o último pagamento', () => {
    const paid = activateOnce()
    const refunded = reduceBillingEvent({
      event: paid.event,
      profile: paid.profile,
      apiStatus: 'refunded',
      userId,
      planId,
      days: 31,
      now,
      paymentId,
    })
    expect(refunded.result.effect).toBe('refunded')
    expect(refunded.profile.subscription_status).toBe('cancelled')

    const dup = reduceBillingEvent({
      event: refunded.event,
      profile: refunded.profile,
      apiStatus: 'refunded',
      userId,
      planId,
      days: 31,
      now,
      paymentId,
    })
    expect(dup.result.duplicate).toBe(true)
    expect(dup.profile.subscription_status).toBe('cancelled')
  })

  it('reembolso de pagamento que nunca ativou não altera o perfil', () => {
    const out = reduceBillingEvent({
      event: { mp_payment_id: paymentId, effect: 'none' },
      profile: { id: userId, subscription_status: 'trial' },
      apiStatus: 'refunded',
      userId,
      planId,
      days: 31,
      now,
      paymentId,
    })
    expect(out.result.effect).toBe('ignored')
    expect(out.profile.subscription_status).toBe('trial')
  })

  it('recusado só espera; não ativa', () => {
    const out = reduceBillingEvent({
      event: null,
      profile: { id: userId, subscription_status: 'trial' },
      apiStatus: 'rejected',
      userId,
      planId,
      days: 31,
      now,
      paymentId,
    })
    expect(out.result.effect).toBe('wait')
    expect(out.profile.subscription_status).toBe('trial')
  })

  it('pagamento novo empilha dias se a assinatura ainda vale', () => {
    const first = activateOnce({ days: 31 })
    const secondPay = reduceBillingEvent({
      event: null,
      profile: first.profile,
      apiStatus: 'approved',
      userId,
      planId,
      days: 31,
      now,
      paymentId: 'pay-2',
    })
    expect(secondPay.result.duplicate).toBe(false)
    expect(new Date(secondPay.profile.subscription_expires_at) > new Date(first.profile.subscription_expires_at)).toBe(true)
  })

  it('plano anual usa 365 dias', () => {
    expect(planPeriodDays('yearly')).toBe(365)
    const iso = computeExpiryIso(now, null, 365)
    expect(iso.startsWith('2027-10-19')).toBe(true)
  })
})
