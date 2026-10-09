// VireonGames Owner — service worker: shows push alerts, even when the app is closed.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'VireonGames', body: e.data ? e.data.text() : '' }; }
  const url = new URL(d.url || './#alerts', self.registration.scope).href;
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.title || 'VireonGames', {
      body: d.body || '',
      icon: 'icons/icon-192.png',
      badge: 'icons/badge-96.png',
      tag: d.tag,
      data: { url }
    }),
    self.navigator.setAppBadge ? self.navigator.setAppBadge().catch(() => {}) : null
  ]));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope)) {
        await c.focus();
        c.postMessage({ type: 'open', url });
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
