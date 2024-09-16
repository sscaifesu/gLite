const CACHE_NAME = 'gLite-v1';
const urlsToCache = [
  '/',
  '/output.css',
  '/index.html',
  // 添加其他需要缓存的静态资源
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => response || fetch(event.request))
  );
});
