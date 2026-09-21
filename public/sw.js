const VERSION = 'campusops-v1';
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = ['/', OFFLINE_URL];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) => cache.add(url).catch(() => undefined)),
      ),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('campusops-') && ![STATIC_CACHE, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

function isStaticAsset(request) {
  return ['style', 'script', 'image', 'font', 'worker'].includes(request.destination);
}

function isNavigation(request) {
  return request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html');
}

async function cacheResponse(cacheName, request, response) {
  if (response && response.ok) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }
  return response;
}

async function handleNavigation(request) {
  try {
    return await cacheResponse(RUNTIME_CACHE, request, await fetch(request));
  } catch {
    return (await caches.match(request)) || (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

async function handleStaticAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    return await cacheResponse(RUNTIME_CACHE, request, await fetch(request));
  } catch {
    return Response.error();
  }
}

async function handleRuntimeRequest(request) {
  try {
    return await cacheResponse(RUNTIME_CACHE, request, await fetch(request));
  } catch {
    return (await caches.match(request)) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (isNavigation(request)) event.respondWith(handleNavigation(request));
  else if (isStaticAsset(request)) event.respondWith(handleStaticAsset(request));
  else event.respondWith(handleRuntimeRequest(request));
});
