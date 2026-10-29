import { hasFeature } from './entitlements.js'
import { resolveWorkspaceId } from './workspace'

/** Sem linha, ou com a chave desligada, a visita não entra no cartão. */
export function deveContarVisita({ settings, profile, profileError = false } = {}) {
  if (settings?.active !== true) return false
  if (profileError) return true
  if (!profile) return false
  return hasFeature(profile, 'Fidelidade')
}

/** Soma uma visita no cartão de fidelidade. Não usa RPC (evita 400 no console). */
export async function incrementLoyaltyVisit(supabase, clientId) {
  if (!clientId) return
  const ws = await resolveWorkspaceId(supabase)
  if (!ws) return

  const { data: settings } = await supabase
    .from('loyalty_settings')
    .select('active')
    .eq('user_id', ws)
    .maybeSingle()

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_admin, subscription_status, subscription_expires_at, trial_ends_at, subscription_plans(features)')
    .eq('id', ws)
    .maybeSingle()

  if (!deveContarVisita({ settings, profile, profileError: !!profileError })) return

  const { data: client, error } = await supabase
    .from('clients')
    .select('loyalty_visits')
    .eq('id', clientId)
    .eq('user_id', ws)
    .maybeSingle()
  if (error || !client) return

  await supabase
    .from('clients')
    .update({ loyalty_visits: (Number(client.loyalty_visits) || 0) + 1 })
    .eq('id', clientId)
    .eq('user_id', ws)
}
