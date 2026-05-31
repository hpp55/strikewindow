// Strike Window — Service Worker
// Strategy: cache-first for app shell, network-first for live data APIs

const CACHE_NAME = 'strike-window-v1';
const CACHE_STATIC_NAME = 'strike-window-static-v1';

// App shell — files that make the UI work offline
const SHELL_URLS = [
  '/',
  '/index.html',
  'https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Barlow+Condensed:wght@300;400;500;600;700;900&family=Barlow:wght@300;400;500&display=swap'
];

// API domains that should always go network-first (live data)
const NETWORK_FIRST_PATTERNS = [
  'api.open-meteo.com',
  'marine-api.open-meteo.com',
  'api.anthropic.com',
  'windy.com',
  'embed.windy.com',
  'bmapi.bom.gov.au',
  'api.tidesandcurrents.noaa.gov'
];

// ── INSTALL: cache the app shell ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC_NAME)
      .then(cache => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Shell cache failed (some assets may be missing):', err))
  );
});

// ── ACTIVATE: clean up old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key !== CACHE_STATIC_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: routing logic ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and chrome-extension requests
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') return;

  // Network-first for live data APIs
  const isLiveData = NETWORK_FIRST_PATTERNS.some(p => url.hostname.includes(p));
  if (isLiveData) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Cache-first for Google Fonts (they change rarely)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, CACHE_STATIC_NAME));
    return;
  }

  // Cache-first for the app shell itself
  event.respondWith(cacheFirst(request, CACHE_STATIC_NAME));
});

// ── STRATEGIES ──

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline — return cached version if we have one
    const cached = await caches.match(request);
    if (cached) return cached;
    // No cache — return a simple offline JSON for API calls
    return new Response(JSON.stringify({ error: 'offline', message: 'No live data — check your connection.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Return a simple offline page if the shell itself isn't cached
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Strike Window — Offline</title>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>body{background:#080c0f;color:#9ab8c8;font-family:monospace;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:16px;text-align:center;padding:20px}
      h1{color:#00b4d8;font-size:28px;letter-spacing:0.1em;text-transform:uppercase}
      p{opacity:0.7;line-height:1.7;max-width:300px}</style></head>
      <body><h1>◈ Strike Window</h1><p>No connection detected.<br>Live data requires an internet connection.<br><br>Try again when you're back online.</p></body></html>`,
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    );
  }
}

// ── BACKGROUND SYNC: notify clients when back online ──
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
