// Marlboro Ridge Equestrian Center service worker — Phase 1 scope is push notifications only.
// No offline cache, no asset interception. The browser still uses HTTP cache
// for app shell; we don't need a separate strategy yet.

self.addEventListener('install', (event) => {
  // Skip waiting so the new SW activates immediately on first install.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Take control of any open tabs without requiring a reload.
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload = {}
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'New message', body: event.data.text() }
  }

  const title = payload.title || 'Marlboro Ridge Equestrian Center'
  const options = {
    body:  payload.body || '',
    icon:  '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: payload.url || '/my/messages' },
    // Tag groups same-thread notifications so a chatty thread doesn't
    // stack notifications endlessly. The new one replaces the old.
    tag: payload.tag,
    renotify: true,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/my/messages'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // If the app is already open in a tab/window, focus it and navigate.
      for (const w of wins) {
        if ('focus' in w) {
          w.focus()
          if ('navigate' in w) w.navigate(targetUrl)
          return
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    })
  )
})
