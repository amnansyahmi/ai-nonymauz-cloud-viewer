// Notifications for work that finished while the app was away.
// Deliberately no fetch handler: nothing is cached, so the app is never stale.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(self.registration.showNotification(data.title || 'AI Nonymauz', {
    body: data.body || '',
    tag: data.tag || undefined,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { kind: data.kind || '', task: data.task_id || '' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const { kind, task } = event.notification.data || {};
  const known = kind === 'chat' || kind === 'image' || kind === 'video';
  const url = known ? `/?open=${kind}&task=${encodeURIComponent(task || '')}` : '/';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (known) client.postMessage({ type: 'open-task', kind, task });
      if ('focus' in client) return client.focus();
    }
    return self.clients.openWindow(url);
  })());
});
