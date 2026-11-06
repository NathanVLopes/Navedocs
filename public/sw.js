/* NAVEDOCS PWA — apenas recursos públicos estáticos. Nunca armazenar dados pessoais. */
const CACHE = 'navedocs-static-v013';
const ASSETS = ['/styles.css','/navetran.svg','/icon-192.png','/icon-512.png','/offline.html'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('navedocs-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Páginas com formulários, sessão, CPF, downloads e API nunca entram em cache.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }
  if (url.pathname.startsWith('/api/') || url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return;
  if (!ASSETS.includes(url.pathname)) return;
  event.respondWith(caches.match(req).then(cached => cached || fetch(req)));
});
