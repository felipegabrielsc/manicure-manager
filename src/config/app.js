export const SUPPORT_WHATSAPP = import.meta.env.VITE_SUPPORT_WHATSAPP || '5516996097901'
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Agenda Manicure'

export function openSupportWhatsApp(message) {
  window.open(
    `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`,
    '_blank'
  )
}
