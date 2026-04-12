/**
 * PWA Service Worker Template
 * SD: SD-DUALPLAT-MOBILE-WEB-ORCH-001-C
 *
 * Cache-first strategy with configurable TTL and version-stamped cache keys.
 * This template is injected into venture builds when target_platform includes mobile.
 *
 * Configuration is injected at build time via string replacement:
 *   __CACHE_VERSION__ → deployment hash
 *   __CACHE_TTL_MS__  → TTL in milliseconds (default: 86400000 = 24hr)
 */

const CACHE_NAME = 'venture-cache-v__CACHE_VERSION__';
const CACHE_TTL_MS = __CACHE_TTL_MS__ || 86400000; // 24 hours default

// Assets to precache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install: precache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean up old cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('venture-cache-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: cache-first with TTL
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Skip non-HTTP(S) requests
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);

      if (cached) {
        // Check TTL via custom header
        const cachedAt = cached.headers.get('x-cached-at');
        if (cachedAt && Date.now() - parseInt(cachedAt, 10) < CACHE_TTL_MS) {
          return cached;
        }
      }

      // Fetch from network, cache the response
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          // Clone and add timestamp header for TTL tracking
          const headers = new Headers(response.headers);
          headers.set('x-cached-at', String(Date.now()));
          const timestamped = new Response(await response.clone().blob(), {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
          cache.put(event.request, timestamped);
        }
        return response;
      } catch {
        // Network failed — serve stale cache if available
        if (cached) return cached;
        return new Response('Offline', { status: 503 });
      }
    })
  );
});
