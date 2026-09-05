import { Navigate, useLocation } from 'react-router-dom'
import { useSessionProfile } from '../context/SessionProfile'
import { canOpenPath, isSubscriptionUsable, FEATURE_BY_PATH, hasFeature } from '../utils/entitlements'

export default function PlanGate() {
  const { profile } = useSessionProfile()
  const location = useLocation()
  const path = location.pathname

  if (!profile) return null

  if (path === '/admin' && !profile.is_admin) {
    return <Navigate to="/" replace />
  }

  if (!canOpenPath(profile, path)) {
    const feature = FEATURE_BY_PATH[path]
    if (feature && isSubscriptionUsable(profile) && !hasFeature(profile, feature)) {
      return <Navigate to="/planos" replace state={{ needFeature: feature }} />
    }
    return <Navigate to="/planos" replace state={{ expired: true }} />
  }

  return null
}
