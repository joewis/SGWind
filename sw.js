/**
 * sw.js — Service Worker
 *
 * Strategy:
 * - Cache-first for static assets (HTML, CSS, JS, fonts, icons)
 * - Network-first, cache-fallback for realtime API responses
 */

const STATIC_CACHE = 'sw-static-v4';
const API_CACHE = 'sw-api-v3';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/state.js',
  '/js/wind.js',
  '/js/geo.js',
  '/js/api.js',
  '/js/db.js',
  '/js/ui.js',
  '/manifest.json',
];

// ─── Install: cache static assets ──────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        // Ignore individual failures — some assets might not exist yet
        console.warn('sw: cache.addAll partial failure', err);
      });
    })
  );
  self.skipWaiting();
});

// ─── Activate: clear old caches ───────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n !== STATIC_CACHE && n !== API_CACHE)
          .map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

// ─── Fetch: route-based strategy ────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Realtime API responses — network-first, cache-fallback
  if (
    url.hostname === 'api-open.data.gov.sg' ||
    url.hostname === 'api-production.data.gov.sg'
  ) {
    event.respondWith(networkFirst(event.request, API_CACHE));
    return;
  }

  // Static assets — cache-first
  event.respondWith(cacheFirst(event.request, STATIC_CACHE));
});

// ─── Cache strategies ──────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
