export function workspaceId(profile, authUserId) {
  return profile?.workspace_id || profile?.salon_owner_id || authUserId || null
}

export function isStaffProfile(profile) {
  return !!profile?.is_staff || !!profile?.salon_owner_id
}
