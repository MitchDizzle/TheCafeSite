/* Order Up's service worker (owner 2026-11-13: "Add to Home Screen").
   It exists so phones offer to install the game, and does nothing else:
   it caches nothing and never answers a request itself, so it can never
   serve an old copy of the game. Its scope is /play only. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function () { /* the network, as always */ });
