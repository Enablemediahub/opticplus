self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let message = {}
  try {
    message = event.data ? event.data.json() : {}
  } catch {
    message = { body: event.data?.text() ?? '' }
  }

  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const visibleClients = clients.filter((client) => (
      new URL(client.url).origin === self.location.origin && client.visibilityState === 'visible'
    ))
    if (message.type === 'bank-balance-change' && visibleClients.length) {
      return new Promise((resolve) => {
        let settled = false
        const channels = []
        const finish = (handled) => {
          if (settled) return
          settled = true
          clearTimeout(timeoutId)
          channels.forEach((channel) => channel.port1.close())
          resolve(handled)
        }
        const timeoutId = setTimeout(() => finish(false), 1200)

        visibleClients.forEach((client) => {
          const channel = new MessageChannel()
          channels.push(channel)
          channel.port1.onmessage = (reply) => {
            if (reply.data?.handled) finish(true)
          }
          client.postMessage({
            type: 'opticplus:bank-balance-change',
            ...message,
          }, [channel.port2])
        })
      }).then((handled) => handled ? undefined : showPushNotification(message))
    }

    return showPushNotification(message)
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/#/', self.location.origin)
  if (target.origin !== self.location.origin) return

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          return client.navigate(target.href).then(() => client.focus())
        }
      }
      return self.clients.openWindow(target.href)
    }),
  )
})

function showPushNotification(message) {
  const options = {
    body: message.body || 'There is an item waiting for your review.',
    icon: '/icons/opticplus-192.png',
    badge: '/icons/opticplus-192.png',
    data: { url: message.url || '/#/' },
    tag: message.tag || 'opticplus-manager-review',
    renotify: true,
  }
  const tasks = [self.registration.showNotification(message.title || 'OPTICPLUS', options)]
  if (self.registration.setAppBadge) {
    tasks.push(self.registration.setAppBadge(1).catch((error) => {
      console.warn('The installed app badge could not be updated.', error)
    }))
  }
  return Promise.all(tasks)
}
