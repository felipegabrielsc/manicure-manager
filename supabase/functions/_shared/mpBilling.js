/** Regras puras da assinatura Mercado Pago. Sem I/O — usadas pelo webhook e pelos testes. */

export function parseExternalRef(ref) {
  if (!ref) return { userId: null, planId: null }
  const [userId, planId] = String(ref).split('|')
  return { userId: userId || null, planId: planId || null }
}

export function resolvePayer(payment) {
  const meta = payment?.metadata || {}
  const fromRef = parseExternalRef(payment?.external_reference)
  return {
    userId: meta.user_id || meta.userId || fromRef.userId || null,
    planId: meta.plan_id || meta.planId || fromRef.planId || null,
  }
}

export function planPeriodDays(intervalType) {
  const t = String(intervalType || 'monthly').toLowerCase()
  if (t === 'yearly' || t === 'year') return 365
  return 31
}

export function billingAction(mpStatus) {
  const s = String(mpStatus || '').toLowerCase()
  if (s === 'approved') return 'activate'
  if (s === 'refunded' || s === 'charged_back') return 'refund'
  if (s === 'pending' || s === 'in_process' || s === 'authorized') return 'wait'
  if (s === 'rejected' || s === 'cancelled') return 'reject'
  return 'wait'
}

export function computeExpiryIso(now, currentExpiresAt, days) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime()
  const cur = currentExpiresAt ? new Date(currentExpiresAt).getTime() : 0
  const start = cur > nowMs ? cur : nowMs
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + Math.max(1, Number(days) || 31))
  return end.toISOString()
}

/**
 * Um passo do efeito financeiro para um payment_id.
 * event.effect: null | none | activated | refunded
 */
export function reduceBillingEvent({
  event,
  profile,
  apiStatus,
  userId,
  planId,
  days,
  now,
  paymentId,
}) {
  const action = billingAction(apiStatus)
  const nextEvent = {
    ...(event || {}),
    mp_payment_id: paymentId || event?.mp_payment_id,
    status: apiStatus,
    user_id: userId || event?.user_id || null,
    plan_id: planId || event?.plan_id || null,
  }
  let nextProfile = profile || null

  if (action === 'activate') {
    if (event?.effect === 'activated') {
      return { event: nextEvent, profile: nextProfile, result: { ok: true, duplicate: true, effect: 'activated' } }
    }
    if (event?.effect === 'refunded') {
      return { event: nextEvent, profile: nextProfile, result: { ok: true, duplicate: true, effect: 'refunded' } }
    }
    if (!userId) {
      return { event: nextEvent, profile: nextProfile, result: { ok: false, reason: 'sem user_id' } }
    }
    const stackFrom = nextProfile?.subscription_status === 'active' ? nextProfile.subscription_expires_at : null
    const expires = computeExpiryIso(now, stackFrom, days)
    nextProfile = {
      ...(nextProfile || {}),
      id: userId,
      plan_id: planId || nextProfile?.plan_id || null,
      subscription_status: 'active',
      subscription_expires_at: expires,
      is_blocked: false,
      mp_last_payment_id: String(paymentId),
    }
    nextEvent.effect = 'activated'
    nextEvent.effect_applied_at = new Date(now).toISOString()
    return { event: nextEvent, profile: nextProfile, result: { ok: true, duplicate: false, effect: 'activated', expires_at: expires } }
  }

  if (action === 'refund') {
    if (event?.effect === 'refunded') {
      nextEvent.effect = 'refunded'
      return { event: nextEvent, profile: nextProfile, result: { ok: true, duplicate: true, effect: 'refunded' } }
    }
    if (event?.effect !== 'activated') {
      nextEvent.effect = event?.effect || 'none'
      return { event: nextEvent, profile: nextProfile, result: { ok: true, duplicate: false, effect: 'ignored' } }
    }
    nextEvent.effect = 'refunded'
    if (nextProfile?.mp_last_payment_id === String(paymentId)) {
      nextProfile = { ...nextProfile, subscription_status: 'cancelled' }
    }
    return { event: nextEvent, profile: nextProfile, result: { ok: true, duplicate: false, effect: 'refunded' } }
  }

  nextEvent.effect = event?.effect || 'none'
  return { event: nextEvent, profile: nextProfile, result: { ok: true, duplicate: false, effect: 'wait' } }
}

export function replayNotifications(steps, seed = {}) {
  let event = seed.event || null
  let profile = seed.profile || null
  const results = []
  for (const step of steps) {
    const out = reduceBillingEvent({
      event,
      profile,
      apiStatus: step.apiStatus,
      userId: step.userId,
      planId: step.planId,
      days: step.days ?? 31,
      now: step.now,
      paymentId: step.paymentId,
    })
    event = out.event
    profile = out.profile
    results.push(out.result)
  }
  return { event, profile, results }
}
