self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames.map((cacheName) =>
            caches.delete(cacheName)
          )
        )
      ),
      self.registration.unregister(),
    ]).then(() =>
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.navigate(client.url)
        })
      })
    )
  )
})