const CACHE_NAME = 'niannian-app-shell-20260808-studio-module-bypass-r27';
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css?v=20260728-header-logo-removed-r1',
  '/product.css?v=20260727-media-direct-r1',
  '/video-batch-gate/video-batch-panel.css?v=20260727-video-batch-cost-gate-r1',
  '/product-system.css?v=20260727-media-direct-r1',
  '/hero-oil-paint.css?v=20260727-media-direct-r1',
  '/vendor/gsap-3.13.0.min.js?v=3.13.0',
  '/vendor/gsap-flip-3.13.0.min.js?v=3.13.0',
  '/app.js?v=20260807-local-auth-r1',
  '/mvp-step02-r13.js?v=20260804-workbench-clarity-r2',
  '/mvp-step03-r1.js?v=20260727-media-direct-r1',
  '/video-batch-gate/video-batch-panel.js?v=20260727-video-batch-cost-gate-r1',
  '/video-batch-gate/video-batch-integrated.js?v=20260727-video-batch-cost-gate-r1',
  '/mvp-step01-ledger-r1.js?v=20260727-media-direct-r1',
  '/mvp-step01-story-r1.js?v=20260727-media-direct-r1',
  '/mvp-source-truth-r1.js?v=20260727-media-direct-r1',
  '/manifest.webmanifest'
];

function isProjectOrMediaRequest(url) {
  return url.pathname.startsWith('/api/') || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/studio/assets/');
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isProjectOrMediaRequest(url)) {
    event.respondWith(fetch(request));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request))
  );
});
