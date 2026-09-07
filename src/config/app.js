export const SUPPORT_WHATSAPP = import.meta.env.VITE_SUPPORT_WHATSAPP || '5516996097901'
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Agenda Manicure'
export const PUBLIC_APP_URL = (import.meta.env.VITE_PUBLIC_APP_URL || 'https://manicure-manager-ebon.vercel.app').replace(/\/$/, '')

/** URL do site em produção. Em dev local usa a origem atual (Vite). */
export function publicAppUrl() {
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    return window.location.origin
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin
    if (!/localhost|127\.0\.0\.1/i.test(origin)) return origin
  }
  return PUBLIC_APP_URL
}

export function openSupportWhatsApp(message) {
  window.open(
    `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`,
    '_blank'
  )
}
