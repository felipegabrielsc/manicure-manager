/** Não use isto como autorização. Admin de plataforma é só profiles.is_admin no banco. */
export const SITE_OWNER_IDS = new Set()

export function isSiteOwnerId() {
  return false
}
