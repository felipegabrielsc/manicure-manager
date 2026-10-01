import { resolveWorkspaceId } from './workspace'

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
  if (settings?.active === false) return

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
