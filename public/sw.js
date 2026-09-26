// Service worker: shows push reminders (even when no H2O tab is open), handles the
// Pause / Turn off buttons on the pop-up, and caches the page for offline use.
const CACHE = 'h2o-v2';
const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first so updates show up right away; cache is the offline fallback. API calls are never cached.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});

const windows = () => self.clients.matchAll({ type: 'window', includeUncontrolled: true });

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { /* ignore */ }
  e.waitUntil((async () => {
    await self.registration.showNotification(d.title || 'Time to drink water 💧', {
      body: d.body || 'Grab a glass of water and stay hydrated!',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: 'h2o',
      renotify: true,
      data: { id: d.id, test: !!d.test },
      actions: [
        { action: 'pause', title: '⏸ Pause 1 hour' },
        { action: 'off', title: 'Turn off' },
      ],
    });
    // If an H2O page is open, let the boy walk in there too.
    (await windows()).forEach((c) => c.postMessage({ type: 'reminder' }));
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const id = e.notification.data && e.notification.data.id;
  if ((e.action === 'pause' || e.action === 'off') && id) {
    e.waitUntil((async () => {
      await fetch('/api/action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: e.action }),
      }).catch(() => {});
      (await windows()).forEach((c) => c.postMessage({ type: 'changed' }));
    })());
    return;
  }
  // Clicked the pop-up itself: open H2O and play the boy.
  e.waitUntil((async () => {
    const scope = self.registration.scope;
    const win = (await windows()).find((c) => c.url.startsWith(scope));
    if (win) { await win.focus(); win.postMessage({ type: 'reminder' }); }
    else await self.clients.openWindow(scope + (e.notification.data && e.notification.data.test ? '?test=1' : '') + '#reminder');
  })());
});
