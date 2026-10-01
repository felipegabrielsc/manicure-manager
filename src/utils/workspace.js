export function workspaceId(profile, authUserId) {
  return profile?.workspace_id || profile?.salon_owner_id || authUserId || null
}

export function isStaffProfile(profile) {
  return !!profile?.is_staff || !!profile?.salon_owner_id
}

/** Dona do salão lendo a linha de profiles, para código que não está numa tela. */
export async function resolveWorkspaceId(supabaseClient) {
  const { data: { user } } = await supabaseClient.auth.getUser()
  if (!user) return null
  const { data } = await supabaseClient
    .from('profiles')
    .select('salon_owner_id')
    .eq('id', user.id)
    .maybeSingle()
  return data?.salon_owner_id || user.id
}
