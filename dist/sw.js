/* IT Hub Africa service worker.
 *
 * What it does
 *  - Built JS/CSS (/assets/*, filenames contain a content hash): served from the device after the first visit.
 *  - Images from this site (product pictures, brand logos): shown from the device at once, refreshed in the background.
 *  - Page loads: network first (always the newest version when online). If the visitor is offline, the last
 *    copy of the app shell is shown, or a simple offline page.
 *
 * What it never touches
 *  - Anything not on this site's own address: Supabase (data, sign-in, storage), Paystack, Klump, video.
 *  - Anything that is not a GET request.
 *  So prices, stock, orders, payments and sign-in always come live from the server.
 *
 * To switch it off for everyone, deploy with VITE_DISABLE_SW=true (see CACHING.md).
 */
const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const IMAGES = `images-${VERSION}`;
const KEEP = [SHELL, ASSETS, IMAGES];
const OFFLINE_URL = '/offline.html';
const SHELL_KEY = '/';
const MAX_ASSETS = 150;
const MAX_IMAGES = 200;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.add(OFFLINE_URL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Keep a cache from growing forever: drop the oldest entries beyond the limit.
async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k)));
}

async function cacheFirst(request, cacheName, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone());
    trim(cacheName, max);
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then(response => {
      if (response.ok) {
        cache.put(request, response.clone());
        trim(cacheName, max);
      }
      return response;
    })
    .catch(() => undefined);
  return hit || (await refresh) || Response.error();
}

async function navigation(request) {
  try {
    const response = await fetch(request);
    // The app is a single page, so every page load returns the same shell: keep one copy for offline use.
    if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
      const cache = await caches.open(SHELL);
      cache.put(SHELL_KEY, response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(SHELL);
    return (await cache.match(SHELL_KEY)) || (await cache.match(OFFLINE_URL)) || Response.error();
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js') return;

  if (request.mode === 'navigate') {
    event.respondWith(navigation(request));
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSETS, MAX_ASSETS));
  } else if (request.destination === 'image' || /^\/(demo-products|brands)\//.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, IMAGES, MAX_IMAGES));
  }
});
