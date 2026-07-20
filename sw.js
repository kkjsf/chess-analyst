const CACHE_NAME = 'chess-analyst-v103';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/board.js',
  './js/engine.js',
  './js/openings.js',
  './js/analysis.js',
  './js/training.js',
  './js/guess.js',
  './js/endgame.js',
  './js/tactics.js',
  './js/repertoire.js',
  './js/coach.js',
  './js/app.js',
  './js/chess.min.js',
  './js/stockfish-worker.js',
  './js/vendor/stockfish.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
  self.clients.matchAll().then(clients => {
    clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' }));
  });
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname.endsWith('index.html')) {
    e.respondWith((async () => {
      const formData = await e.request.formData();
      const text = formData.get('text') || '';
      const redirectUrl = new URL(url.pathname, url.origin);
      redirectUrl.searchParams.set('text', text);
      return Response.redirect(redirectUrl.toString(), 303);
    })());
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then(response => {
        // Only runtime-cache same-origin successful GETs. Skipping 404s,
        // opaque cross-origin responses (chess.com API) and non-GET requests
        // keeps the cache from growing without bound and from pinning errors.
        if (e.request.method === 'GET' && response.ok && response.type === 'basic'
            && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(async () => {
        // Offline: try the exact request first, then ignore the ?v= query so a
        // versioned asset still resolves to its precached (unversioned) entry.
        return (await caches.match(e.request))
          || (await caches.match(e.request, { ignoreSearch: true }));
      })
  );
});
