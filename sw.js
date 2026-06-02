// Strike Window — Service Worker v3
// index.html is always network-first so updates deploy instantly
// Only fonts and static assets get cached

const CACHE_NAME = 'strike-window-v3';

// API domains — always network, never cache
const NETWORK_ONLY = [
  'api.open-meteo.com',
  'marine-api.open-meteo.com',
  'api.anthropic.com',
  'windy.com',
  'embed.windy.com',
  'bmapi.bom.gov.au',
  '.netlify/functions'
];

// ── INSTALL: skip waiting immediately ──
self.addEventListener('install', event => {
  self.skipWaiting();
});

// ── ACTIVATE: delete ALL old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') return;

  // Live data APIs — network only, no caching
  const isLiveData = NETWORK_ONLY.some(p => url.href.includes(p));
  if (isLiveData) return; // fall through to browser default (network)

  // index.html and app pages — always network first, fall back to cache
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirstHtml(request));
    return;
  }

  // Google Fonts — cache first (they never change)
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('gstatic.com')) {
    event.respondWith(cacheFirst(request));
    return;
  }
});

async function networkFirstHtml(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline — serve cached version
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Strike Window — Offline</title>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>body{background:#080c0f;color:#9ab8c8;font-family:monospace;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:16px;text-align:center;padding:20px}
      h1{color:#00b4d8;font-size:28px;letter-spacing:0.1em;text-transform:uppercase}
      p{opacity:0.7;line-height:1.7;max-width:300px}</style></head>
      <body><h1>◈ Strike Window</h1><p>No connection.<br>Live data requires internet.<br><br>Try again when back online.</p></body></html>`,
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    );
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.status === 200) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
