/*
 * Service Worker — Lote O / versão 12
 *
 * Objetivos:
 * - permitir reabertura real do PWA sem rede depois de um carregamento online;
 * - manter o HTML do app como fallback offline;
 * - cachear somente assets estáticos/build assets do mesmo domínio;
 * - nunca cachear APIs, Supabase ou respostas dinâmicas de dados financeiros;
 * - usar nomes de cache versionados para evitar mistura entre builds.
 */

const CACHE_NAME = 'contabilidade-pj-v12';

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

const cacheResponse = async (request, response) => {
  if (!response || !response.ok) return response;

  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  } catch {
    // Cache é apenas uma camada de resiliência; nunca deve quebrar a navegação.
  }

  return response;
};

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
            .filter((key) => key.startsWith('contabilidade-pj-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CLEAR_CACHES') return

  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (!isSameOriginGet(event.request, url)) return;
  if (isApiRequest(url)) return;

  /*
   * Assets do build do Next são identificados por hashes e podem ser
   * cacheados com segurança. Cache-first também permite que o PWA reabra
   * depois de ser encerrado e sem conexão.
   */
  if (isNextBuildAsset(url)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;

        return fetch(event.request).then((response) =>
          cacheResponse(event.request, response),
        );
      }),
    );
    return;
  }

  /* Assets públicos do app: rede primeiro, cache como fallback/atualização. */
  if (isPublicStaticAsset(url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => cacheResponse(event.request, response))
        .catch(() => caches.match(event.request)),
    );
    return;
  }

  /*
   * Navegação: rede primeiro para receber o HTML do build atual.
   * Se a rede estiver indisponível, usa o último HTML conhecido.
   */
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => cacheResponse('/', response))
        .catch(() => caches.match('/')),
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
