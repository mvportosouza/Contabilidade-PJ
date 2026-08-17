const CACHE_NAME = 'financas-pj-static-v2'

const STATIC_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request

  // Nunca interceptar requisições que não sejam GET
  if (request.method !== 'GET') {
    return
  }

  const url = new URL(request.url)

  // Nunca interceptar requisições externas
  if (url.origin !== self.location.origin) {
    return
  }

  // Nunca interceptar Next.js, JavaScript, CSS, APIs ou páginas.
  // Isso evita conflitos entre versões de deploy.
  if (
    url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/api/')
  ) {
    return
  }

  // Cache somente dos recursos estáticos explicitamente definidos.
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        return cachedResponse || fetch(request)
      })
    )
  }
})