const APP_VERSION = '2.3.2';
const CACHE_NAME = `moobank-shell-${APP_VERSION}`;
const versioned = path => `${path}?v=${APP_VERSION}`;
const APP_SHELL = [
  './',
  './index.html',
  versioned('./version.json'),
  versioned('./manifest.json'),
  versioned('./assets/css/app.css'),
  versioned('./assets/css/v2.css'),
  './assets/brand/moobank-mark.svg',
  versioned('./assets/js/core.js'),
  versioned('./assets/js/trajectory-core.js'),
  versioned('./assets/js/app.js'),
  versioned('./assets/js/history-import.js'),
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const pathname = url.pathname;
  const mustStayFresh = request.mode === 'navigate' ||
    request.destination === 'script' || request.destination === 'style' ||
    pathname.endsWith('/version.json') || pathname.endsWith('/manifest.json');

  if (mustStayFresh) {
    event.respondWith(
      fetch(new Request(request, { cache: 'no-store' }))
        .then(response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const cacheKey = request.mode === 'navigate' ? './index.html' : request;
          event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(cacheKey, response.clone())));
          return response;
        })
        .catch(async () => {
          if (request.mode === 'navigate') return (await caches.match('./index.html')) || caches.match('./');
          return (await caches.match(request)) || Response.error();
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)));
      }
      return response;
    }))
  );
});
