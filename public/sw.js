// Hyperscales service worker.
// Strategy:
//  - precache the offline shell + landing assets at install
//  - stale-while-revalidate for static assets (/img, /icon-*, /audio, fonts)
//  - network-first for HTML navigations, with offline.html fallback
//  - never cache /api/* or /play/* server-rendered pages
//
// Bump CACHE_VERSION to invalidate everything on next visit.

const CACHE_VERSION = 'hs-v3';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const PRECACHE = [
  '/',
  '/offline.html',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/og.webp',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE).catch(() => null)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)),
    )).then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  const p = url.pathname;
  return p.startsWith('/img/') || p.startsWith('/audio/') || p.startsWith('/css/') ||
         p.startsWith('/icon-') || p === '/apple-touch-icon.png' || p === '/favicon.svg' ||
         p === '/manifest.webmanifest' || p === '/og.webp' || p === '/og.jpg' ||
         p.endsWith('.woff2') || p.endsWith('.woff') || p.endsWith('.css') ||
         (url.host.includes('fonts.gstatic.com'));
}

function isHTMLNav(req) {
  return req.mode === 'navigate' ||
         (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never touch APIs or auth flows — keep them strict network.
  if (url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/auth/') ||
      url.pathname.startsWith('/login') ||
      url.pathname.startsWith('/signup')) {
    return;
  }

  // Static assets: stale-while-revalidate
  if (isStaticAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(req);
      const fetchPromise = fetch(req).then((resp) => {
        if (resp && resp.ok && resp.type !== 'opaque') cache.put(req, resp.clone());
        return resp;
      }).catch(() => null);
      return cached || (await fetchPromise) || new Response('', { status: 504 });
    })());
    return;
  }

  // HTML navigations: network-first → offline.html fallback
  if (isHTMLNav(req)) {
    event.respondWith((async () => {
      try {
        const resp = await fetch(req);
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(req, resp.clone()).catch(() => {});
        return resp;
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        return (await caches.match('/offline.html')) ||
               new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  // Everything else: passthrough
});

// Allow the page to ask for an immediate update.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
