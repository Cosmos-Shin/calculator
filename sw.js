// Bump VERSION whenever an app file changes. Storage is independent of this cache.
const VERSION = 'v1';
const CACHE_PREFIX = `position-size-calculator:${self.registration.scope}:`;
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;
const FILES = [
  './', './index.html', './styles.css', './app.js', './calculator.mjs', './storage.mjs',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
];
const ASSET_URLS = new Set(FILES.map((path) => new URL(path, self.registration.scope).href));

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // A failed download fails the installation; the previous worker stays usable.
    await cache.addAll(FILES.map((path) => new Request(new URL(path, self.registration.scope), { cache: 'reload' })));
  })());
  // Wait for existing tabs to close so versions are never mixed during editing.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const root = new URL('./', self.registration.scope);
  if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return;
  // Only the single calculator page gets the navigation fallback, never other paths.
  const isAppNavigation = request.mode === 'navigate' &&
    (url.pathname === root.pathname || url.pathname === `${root.pathname}index.html`);
  if (!isAppNavigation && !ASSET_URLS.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(isAppNavigation ? new URL('./index.html', root).href : request);
    return cached || fetch(request);
  })());
});
