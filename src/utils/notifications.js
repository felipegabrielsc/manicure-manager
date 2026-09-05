import { supabase } from '../supabaseClient'

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  return Notification.requestPermission()
}

export function showLocalNotification(title, body, url = '/') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, {
        body,
        icon: '/carla-icon.svg',
        badge: '/carla-icon.svg',
        data: { url },
      })
    })
  } else {
    new Notification(title, { body, icon: '/carla-icon.svg' })
  }
}

export function getPushCapabilities() {
  const vapid = Boolean(VAPID_PUBLIC && String(VAPID_PUBLIC).trim())
  const notificationApi = typeof window !== 'undefined' && 'Notification' in window
  const serviceWorker = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
  const pushManager = typeof window !== 'undefined' && 'PushManager' in window
  const standalone = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
  )
  const permission = notificationApi ? Notification.permission : 'unsupported'
  const canSubscribe = vapid && notificationApi && serviceWorker && pushManager
  return { vapid, notificationApi, serviceWorker, pushManager, standalone, permission, canSubscribe }
}

export async function subscribeToPush(userId) {
  const caps = getPushCapabilities()
  if (!caps.notificationApi) return { ok: false, reason: 'unsupported' }
  if (!caps.vapid) return { ok: false, reason: 'no_vapid' }
  if (!caps.serviceWorker || !caps.pushManager) return { ok: false, reason: 'no_sw' }

  try {
    const permission = await requestNotificationPermission()
    if (permission !== 'granted') return { ok: false, reason: permission === 'denied' ? 'denied' : 'permission' }

    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      })
    }

    const json = sub.toJSON()
    await supabase.from('push_subscriptions').upsert({
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
    }, { onConflict: 'user_id,endpoint' })

    await supabase.from('profiles').update({ push_enabled: true }).eq('id', userId)
    return { ok: true }
  } catch (err) {
    console.warn('Push subscription failed:', err)
    return { ok: false, reason: 'failed' }
  }
}

export async function unsubscribePush(userId) {
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) await sub.unsubscribe()
  }
  await supabase.from('push_subscriptions').delete().eq('user_id', userId)
  await supabase.from('profiles').update({ push_enabled: false }).eq('id', userId)
}

export async function checkPendingNotifications(userId) {
  const { data: perfil } = await supabase
    .from('profiles')
    .select('push_enabled, reminder_hours_before')
    .eq('id', userId)
    .single()

  if (!perfil?.push_enabled || Notification.permission !== 'granted') return

  const horas = perfil.reminder_hours_before ?? 24
  const agora = new Date()
  const limite = new Date(agora.getTime() + horas * 60 * 60 * 1000)

  const { data: pendentes } = await supabase
    .from('appointments')
    .select('id, start_time, clients(name)')
    .eq('user_id', userId)
    .eq('status', 'PENDENTE')

  pendentes?.forEach(p => {
    showLocalNotification(
      'Nova solicitação!',
      `${p.clients?.name} solicitou um horário.`,
      '/'
    )
  })

  const { data: lembretes } = await supabase
    .from('appointments')
    .select('id, start_time, clients(name)')
    .eq('user_id', userId)
    .eq('status', 'AGENDADO')
    .is('reminder_sent_at', null)
    .gte('start_time', agora.toISOString())
    .lte('start_time', limite.toISOString())

  if (lembretes?.length) {
    showLocalNotification(
      `${lembretes.length} lembrete(s) pendente(s)`,
      `Próximo: ${lembretes[0].clients?.name} às ${new Date(lembretes[0].start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
      '/'
    )
  }
}
