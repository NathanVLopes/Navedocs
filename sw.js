
const CACHE = 'navedocs-shell-v2';

const ASSETS = [
  '/styles.css',
  '/navetran.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/favicon.png',
  '/apple-touch-icon.png',
  '/offline.html',
  '/contingencia.html',
  '/contingencia.css',
  '/contingencia.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );

  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key =>
          key.startsWith('navedocs-shell-') && key !== CACHE
        )
        .map(key => caches.delete(key))
    );

    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return;

  if (
    url.pathname.startsWith('/api/') ||
    url.pathname === '/admin' ||
    url.pathname.startsWith('/admin/')
  ) return;

  if (req.mode === 'navigate') {
    if (url.pathname === '/contingencia.html') {
      event.respondWith(
        fetch(req).catch(() => caches.match('/contingencia.html'))
      );
      return;
    }

    event.respondWith(
      fetch(req).catch(() => caches.match('/offline.html'))
    );

    return;
  }

  if (!ASSETS.includes(url.pathname)) return;

  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req))
  );
});
