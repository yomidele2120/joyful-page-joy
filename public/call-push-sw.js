/* Call alerts (Web Push). A small, separate service worker: it only shows "incoming call" notifications.
 * It is registered with its own scope (/call-push/) so it never touches page loads, caching or the site's main service worker. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { /* not JSON */ }
  if (data.type !== 'incoming_call') return;
  const video = data.callType === 'video';
  const title = video ? 'Incoming video call' : 'Incoming voice call';
  const body = (data.name || 'Someone') + ' is calling you. Tap to answer.';
  event.waitUntil((async () => {
    // If the site is already open and in front, it rings on its own screen: no notification needed.
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some((c) => c.visibilityState === 'visible' && c.focused)) return;
    await self.registration.showNotification(title, {
      body,
      tag: 'incoming-call',
      renotify: true,
      requireInteraction: true,
      vibrate: [400, 200, 400, 200, 400, 200, 400],
      icon: '/assets/logo.jpeg',
      timestamp: Date.now(),
      data: { callId: data.callId, expiresAt: data.expiresAt, url: '/' },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of wins) {
      if ('focus' in c) { await c.focus(); return; }
    }
    await self.clients.openWindow(url);
  })());
});
