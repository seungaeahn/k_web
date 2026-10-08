const CACHE_NAME = 'kw-cache-v134';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './css/MUNMAK_DALBANCHE.ttf',
  './js/icons.js',
  './js/utils.js',
  './js/filestore.js',
  './js/storage.js',
  './js/ravelry.js',
  './js/modal.js',
  './js/sampler.js',
  './js/characters.js',
  './js/yarnjar.js',
  './js/demo.js',
  './js/app.js',
  './vendor/pdfjs/pdf.min.js',
  './vendor/pdfjs/pdf.worker.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 앱 파일(같은 사이트): 인터넷이 되면 새 파일 먼저, 안 되거나 3초 넘게 걸리면 캐시
// 그래야 업데이트가 바로 반영되고 옛 파일과 새 파일이 섞이지 않음
const NETWORK_TIMEOUT = 3000;
function networkFirst(req) {
  return new Promise((resolve) => {
    let done = false;
    const fallback = () => {
      if (done) return;
      done = true;
      const isNav = req.mode === 'navigate';
      resolve(caches.match(req, { ignoreSearch: isNav })
        .then((cached) => cached || caches.match('./index.html'))
        .then((cached) => cached || Response.error()));
    };
    const timer = setTimeout(fallback, NETWORK_TIMEOUT);
    fetch(req).then((res) => {
      if (res && res.status === 200 && res.type === 'basic') {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
      }
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(res);
    }).catch(() => { clearTimeout(timer); fallback(); });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin === self.location.origin) {
    event.respondWith(networkFirst(req));
    return;
  }

  // 다른 사이트(글꼴 CDN, Ravelry 이미지): 캐시 먼저
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached || caches.match('./index.html'));
      return cached || network;
    })
  );
});
