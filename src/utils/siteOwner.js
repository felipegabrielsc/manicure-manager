export const SITE_OWNER_IDS = new Set([
  '9bcc70ad-16b6-4d91-b64d-28c44ba75795',
])

export function isSiteOwnerId(userId) {
  return !!userId && SITE_OWNER_IDS.has(userId)
}
