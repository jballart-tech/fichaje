// Cambia la versión al publicar cambios para que la app se actualice.
const VERSION = 'fichaje-v1';
const BASE = ['./', 'index.html', 'manifest.webmanifest', 'xlsx.full.min.js', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

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
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // La comprobación de hora siempre va a la red.
  if (url.pathname.endsWith('/hora.txt')) return;

  // La página: primero la red para recibir actualizaciones, la copia si no hay conexión.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => {
      const copia = r.clone();
      caches.open(VERSION).then(c => c.put('index.html', copia));
      return r;
    }).catch(() => caches.match('index.html')));
    return;
  }

  // El resto (librería, iconos, fuentes): primero la copia guardada.
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok || r.type === 'opaque') {
      const copia = r.clone();
      caches.open(VERSION).then(c => c.put(req, copia));
    }
    return r;
  })));
});
