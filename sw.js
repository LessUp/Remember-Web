const CACHE_NAME = 'memory-match-v2';
const RUNTIME_CDN_CACHE = 'runtime-cdn-v1';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
  console.info('[Remember][SW] installed - cached core assets', { count: ASSETS.length });
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))))).then(() => self.clients.claim())
  );
  console.info('[Remember][SW] activated - cleaned up old caches');
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Runtime cache for Tailwind CDN to improve offline styles
  if (url.hostname === 'cdn.tailwindcss.com' && req.method === 'GET') {
    event.respondWith(
      caches.open(RUNTIME_CDN_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const fetchPromise = fetch(req).then((res) => {
          // Cache opaque/no-cors responses too for offline fallback
          cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Only handle same-origin requests beyond this line
  if (url.origin !== self.location.origin) return;

  // For navigation requests, use network-first then cache fallback
  if (req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'))) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch((err) => {
          console.warn('[Remember][SW] navigation fallback triggered', err);
          return caches.match(req).then((res) => res || caches.match('./index.html'));
        })
    );
    return;
  }

  // For other GET requests, cache-first then network
  if (req.method === 'GET') {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        });
      })
    );
  }
});
