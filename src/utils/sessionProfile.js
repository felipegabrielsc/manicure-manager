/** Monta o perfil da sessão só com o que o banco devolveu. UUID no front não vira admin. */

export function assembleSessionProfile(row, userId, extra = {}) {
  if (!row || !userId) return null

  if (row.salon_owner_id) {
    const ownerRow = extra.ownerRow || {}
    return {
      ...ownerRow,
      id: userId,
      is_admin: false,
      is_staff: true,
      salon_owner_id: row.salon_owner_id,
      workspace_id: row.salon_owner_id,
      staff_member_id: extra.staffMemberId || null,
      onboarding_done: true,
      is_blocked: row.is_blocked === true || ownerRow.is_blocked === true,
    }
  }

  return {
    ...row,
    is_admin: row.is_admin === true,
    is_staff: false,
    workspace_id: userId,
  }
}

export function isPlatformAdmin(profile) {
  return profile?.is_admin === true
}
