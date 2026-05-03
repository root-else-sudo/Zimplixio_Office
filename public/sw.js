self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'Zimplixio Office'
  const body = data.body || 'You have a new notification.'

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/favicon.ico',
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow('/'))
})
