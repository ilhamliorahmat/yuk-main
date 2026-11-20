// Yuk Main v4.0.0 — Offline-First Static-Export-Safe Service Worker
const CACHE_VERSION = 'yukmain-v4.0.0';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const FONT_CACHE = `${CACHE_VERSION}-fonts`;

const PRECACHE_URLS = [
  '/',
  '/manifest.webmanifest',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        Promise.allSettled(
          PRECACHE_URLS.map((url) =>
            cache.add(new Request(url, { cache: 'reload' })).catch(() => null),
          ),
        ),
      )
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
            .filter(
              (key) =>
                key !== SHELL_CACHE && key !== ASSET_CACHE && key !== FONT_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache Firebase Auth / Firestore / RTDB traffic
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firebasedatabase.app') ||
    url.hostname.includes('googleapis.com') && !url.hostname.startsWith('fonts.') ||
    url.hostname.includes('gstatic.com') && !url.hostname.startsWith('fonts.')
  ) {
    return;
  }

  // Google Fonts: CacheFirst for crisp offline typography
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response && (response.ok || response.type === 'opaque')) {
            cache.put(request, response.clone()).catch(() => {});
          }
          return response;
        } catch {
          return new Response('', { status: 503 });
        }
      }),
    );
    return;
  }

  // Only handle same-origin requests beyond fonts
  if (url.origin !== self.location.origin) return;

  // HTML Navigation: Network-first with instant cached App Shell fallback for Airplane Mode
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => {
              cache.put('/', copy).catch(() => {});
            });
          }
          return response;
        })
        .catch(async () => {
          const shell = await caches.open(SHELL_CACHE);
          return (
            (await shell.match(request)) ||
            (await shell.match('/')) ||
            new Response('Offline — buka kembali Yuk Main setelah terhubung sekali.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          );
        }),
    );
    return;
  }

  // Next.js static chunks, images, CSS, JS, manifests: CacheFirst + background refresh
  const isStaticAsset =
    url.pathname.startsWith('/_next/static/') ||
    /\.(?:js|css|png|jpg|jpeg|webp|svg|ico|woff2?|webmanifest)$/i.test(url.pathname);

  if (isStaticAsset) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const networkFetch = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              cache.put(request, response.clone()).catch(() => {});
            }
            return response;
          })
          .catch(() => null);

        if (cached) {
          // Stale-while-revalidate in background when online
          event.waitUntil(networkFetch);
          return cached;
        }
        const netResp = await networkFetch;
        return netResp || new Response('', { status: 503 });
      }),
    );
  }
});
