export const BASIC_FEATURES = ['Agenda', 'Clientes', 'Financeiro']

export const FEATURE_BY_PATH = {
  '/estoque': 'Estoque',
  '/fidelidade': 'Fidelidade',
  '/equipe': 'Equipe',
}

export function isSubscriptionUsable(profile) {
  if (!profile) return false
  if (profile.is_admin) return true

  const status = profile.subscription_status || 'trial'
  const now = Date.now()

  if (status === 'active') {
    if (profile.subscription_expires_at && new Date(profile.subscription_expires_at).getTime() < now) {
      return false
    }
    return true
  }

  if (status === 'trial') {
    const end = profile.trial_ends_at || profile.subscription_expires_at
    if (end && new Date(end).getTime() < now) return false
    return true
  }

  return false
}

export function planFeatures(profile) {
  const fromPlan = profile?.subscription_plans?.features
  if (Array.isArray(fromPlan) && fromPlan.length) return fromPlan
  return BASIC_FEATURES
}

export function hasFeature(profile, featureName) {
  if (!featureName) return true
  if (profile?.is_admin) return true
  if (!isSubscriptionUsable(profile)) return false
  return planFeatures(profile).includes(featureName)
}

export function canOpenPath(profile, pathname) {
  if (pathname === '/onboarding') return true
  if (profile?.is_staff) {
    if (['/equipe', '/planos', '/admin', '/configuracoes'].includes(pathname)) return false
  }
  if (pathname === '/planos' || pathname === '/configuracoes' || pathname === '/admin') {
    if (pathname === '/admin') return !!profile?.is_admin
    return true
  }
  if (!isSubscriptionUsable(profile)) return false
  const feature = FEATURE_BY_PATH[pathname]
  if (!feature) return true
  return hasFeature(profile, feature)
}
