const CACHE_NAME = 'chess-analyst-v45';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/board.js',
  './js/engine.js',
  './js/openings.js',
  './js/analysis.js',
  './js/training.js',
  './js/coach.js',
  './js/app.js',
  './js/chess.min.js',
  './js/stockfish-worker.js',
  './js/vendor/stockfish.js',
  './manifest.json',
  './icons/icon.svg'
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
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return response;
      })
      .catch(() => {
        const bareUrl = new URL(e.request.url);
        bareUrl.search = '';
        return caches.match(bareUrl.toString()) || caches.match(e.request);
      })
  );
});
