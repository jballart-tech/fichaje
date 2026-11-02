// Sube la versión al publicar cambios para que los móviles descarguen la app nueva.
const VERSION = 'fichaje-nexa-v2';
const BASE = ['./', 'index.html', 'idiomas.js', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  // La API siempre va a la red. La app guarda sus datos aparte.
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  // Primero la red para recibir actualizaciones. Sin conexión, la copia guardada.
  e.respondWith(fetch(req).then(r => {
    if (r.ok) {
      const copia = r.clone();
      caches.open(VERSION).then(c => c.put(req.mode === 'navigate' ? 'index.html' : req, copia));
    }
    return r;
  }).catch(() => caches.match(req.mode === 'navigate' ? 'index.html' : req, { ignoreSearch: true })));
});
