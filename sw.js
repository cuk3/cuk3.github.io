// Proxy Landing — Service Worker (PWA)
// Версия кэша: обновляй при деплое чтобы сбросить старый кэш у пользователей
const CACHE_NAME = 'proxy-landing-v5';

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

// Стратегия: Cache First для статики, Network для API / CDN
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Сторонние запросы — без кэша
  if (
    url.hostname !== self.location.hostname
  ) {
    return;
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
