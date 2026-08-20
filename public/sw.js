/*
 * Service Worker — versão 10
 *
 * Correção de tela branca/PWA:
 * - não armazena chunks do Next.js (_next) no cache persistente;
 * - mantém a navegação online como fonte principal;
 * - limpa caches antigos na ativação;
 * - mantém apenas o shell básico para fallback offline;
 * - força a troca para a versão nova via skipWaiting/clients.claim.
 */

const CACHE_NAME = 'contabilidade-pj-v10';

const APP_SHELL = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

const isSameOriginGet = (request, url) => {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;
  return true;
};

const isNextAsset = (url) => url.pathname.startsWith('/_next/');

const isCacheableShellAsset = (url) =>
  url.pathname === '/' ||
  url.pathname === '/manifest.json' ||
  url.pathname === '/icon-192.png' ||
  url.pathname === '/icon-512.png';

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
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (!isSameOriginGet(event.request, url)) return;

  // Nunca persistir chunks/builds do Next.js.
  // Isso evita misturar arquivos de builds diferentes no iPhone/PWA.
  if (isNextAsset(url)) return;

  // APIs/Supabase externas não passam pelo cache do Service Worker.
  if (url.pathname.startsWith('/api/')) return;

  const isNavigation = event.request.mode === 'navigate';

  // Navegação: sempre tenta a versão atual na rede.
  // Se estiver offline, usa somente o shell conhecido.
  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put('/', copy))
              .catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Somente assets estáticos do shell podem ser persistidos.
  if (isCacheableShellAsset(url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, copy))
              .catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
