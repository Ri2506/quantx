// ============================================================================
// SWING AI — SERVICE WORKER FOR WEB PUSH NOTIFICATIONS
// ============================================================================

self.addEventListener('push', function (event) {
  const data = event.data ? event.data.json() : {}

  const options = {
    body: data.body || '',
    icon: '/images/logo-icon.png',
    badge: '/images/badge.png',
    data: data.data || {},
    tag: data.tag || 'swingai-' + Date.now(),
    renotify: true,
    requireInteraction: data.data?.type === 'sl_hit' || data.data?.type === 'target_hit',
    actions: [
      { action: 'open', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'SwingAI Alert', options)
  )
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()

  if (event.action === 'dismiss') return

  // Determine URL based on notification type
  const data = event.notification.data || {}
  let url = '/dashboard'

  switch (data.type) {
    case 'signal':
      url = '/signals'
      break
    case 'sl_hit':
    case 'target_hit':
      url = '/trades'
      break
    case 'vix_alert':
      url = '/dashboard'
      break
  }

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        // Focus existing tab if available
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(url)
            return client.focus()
          }
        }
        // Open new tab
        return clients.openWindow(url)
      })
  )
})
