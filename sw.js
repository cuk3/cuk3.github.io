// Proxy Landing — Service Worker (PWA)
// Версию меняй при каждом деплое чтобы инвалидировать кеш
const CACHE_NAME = 'proxy-landing-v2';

// Ресурсы, которые кешируются при установке SW
const PRECACHE = [
  '/',
  '/index.html',
  '/app.js',
  '/favicon.svg',
  '/manifest.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Стратегия: Network First для API-запросов, Cache First для статики
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API-запросы и dead drop — только сеть, без кеша
  if (
    url.hostname === 'gist.githubusercontent.com' ||
    url.hostname.endsWith('sslip.io')
  ) {
    return; // браузер обработает сам
  }

  // Статика — Cache First
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
