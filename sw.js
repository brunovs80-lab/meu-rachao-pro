const CACHE_NAME = 'rachao-v20';
const ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/css/pages.css',
  '/js/config.js',
  '/js/data.js',
  '/js/api.js',
  '/js/app.js',
  '/js/fantasy.js',
  '/manifest.json',
  '/assets/logo.png',
  '/assets/icon-192.png',
  '/assets/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Não cachear chamadas à API do Supabase
  if (url.hostname.includes('supabase.co') || url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() => new Response(JSON.stringify({ error: 'offline' }), {
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

  // Network-first para código (HTML/CSS/JS/JSON) — garante que updates
  // chegam imediatamente ao usuário; cache só pra suporte offline.
  const isCode = /\.(html|css|js|json)$/.test(url.pathname) || url.pathname === '/' || url.pathname.endsWith('/');
  if (isCode) {
    e.respondWith(
      fetch(e.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first pra assets (imagens, fontes) — não mudam com frequência
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetched = fetch(e.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
