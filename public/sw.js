// One-time cleanup service worker ("kill switch").
//
// This worker exists solely to recover browsers that still run an older,
// cache-poisoned version of the SwiftyDrop service worker. Browsers
// periodically re-fetch /sw.js on navigation (bypassing the old worker),
// receive this script, and activate it. On activation it:
//   1. deletes every Cache Storage bucket for this origin,
//   2. unregisters itself (and therefore every prior version), and
//   3. reloads any open tabs so they boot straight from the network.
//
// The app no longer registers a service worker (see src/main.tsx), so once
// this cleanup has run, no worker is ever installed again.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch {
        // Cache Storage unavailable — continue with unregister regardless.
      }

      let unregistered = false;
      try {
        unregistered = await self.registration.unregister();
      } catch {
        unregistered = false;
      }

      // Reload open tabs so they pick up the un-cached app. Only do this
      // after a successful unregister to avoid a reload loop.
      if (unregistered) {
        try {
          const windowClients = await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true,
          });
          await Promise.all(windowClients.map((client) => client.navigate(client.url)));
        } catch {
          // If navigation fails, the next manual refresh still loads cleanly.
        }
      }
    })(),
  );
});

// Deliberately no 'fetch' handler: without one the worker never intercepts
// requests, so all traffic goes straight to the network.
