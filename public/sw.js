/*
 * Service Worker — Lote 10 / versão 13
 *
 * PWA/offline hardening:
 * - versioned cache with deterministic retirement of older app caches;
 * - network-first navigation with offline fallback;
 * - cache only same-origin app shell/build/static assets;
 * - never cache API/Supabase responses;
 * - quota/storage failures are non-fatal;
 * - explicit cache reset/update messages for operational recovery;
 * - activate/claim/skipWaiting supports controlled multi-tab updates.
 */

const CACHE_NAME = 'contabilidade-pj-v13';
const CACHE_PREFIX = 'contabilidade-pj-';

const APP_SHELL = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/assets/logo-horizontal.jpeg',
  '/assets/logo-square.png',
];

const isSameOriginGet = (request, url) =>
  request.method === 'GET' && url.origin === self.location.origin;

const isNextBuildAsset = (url) =>
  url.pathname.startsWith('/_next/static/');

const isPublicStaticAsset = (url) =>
  url.pathname.startsWith('/assets/') ||
  url.pathname === '/manifest.json' ||
  url.pathname === '/icon-192.png' ||
  url.pathname === '/icon-512.png';

const isApiRequest = (url) =>
  url.pathname.startsWith('/api/');

async function cacheResponse(request, response) {
  if (!response?.ok) return response;

  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  } catch {
    // Quota/storage failures must never break the application.
  }

  return response;
}

async function clearOldCaches() {
  const keys = await caches.keys();

  await Promise.all(
    keys
      .filter((key) => key.startsWith('contabilidade-pj-') && key !== CACHE_NAME)
      .map((key) => caches.delete(key)),
  );
}

async function clearAllAppCaches() {
  const keys = await caches.keys();

  await Promise.all(
    keys
      .filter((key) => key.startsWith('contabilidade-pj-'))
      .map((key) => caches.delete(key)),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    clearOldCaches()
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  const type = event.data?.type;

  if (type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
    return;
  }

  if (type === 'CLEAR_CACHES') {
    event.waitUntil(clearAllAppCaches());
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (!isSameOriginGet(event.request, url)) return;
  if (isApiRequest(url)) return;

  if (isNextBuildAsset(url)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;

        return fetch(event.request)
          .then((response) => cacheResponse(event.request, response));
      }),
    );
    return;
  }

  if (isPublicStaticAsset(url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => cacheResponse(event.request, response))
        .catch(() => caches.match(event.request)),
    );
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => cacheResponse(new Request('/'), response))
        .catch(() => caches.match('/')),
    );
  }
});
