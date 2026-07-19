// Fält-PWA service worker — cache-first-skal så appen öppnas offline (installerad till hemskärmen).
// API:t (/api/*) cachas ALDRIG: dynamiskt + nyckel-skyddat. Envägs-speglingen sköts av sidans localStorage-cache
// (stale-while-revalidate i index.astro); den här SW:n gör bara att SKALET (HTML + manifest) laddas offline.
var CACHE = "falt-shell-v1";
var SHELL = ["/falt", "/falt.webmanifest"];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  var url = new URL(req.url);
  if (req.method !== "GET") return;                    // POST (spara anteckning) går alltid till nätet
  if (url.origin !== self.location.origin) return;     // tredjeparts-request: rör inte
  if (url.pathname.indexOf("/api/") === 0) return;     // API aldrig cachad
  var isShell = req.mode === "navigate" || url.pathname === "/falt" || url.pathname === "/falt.webmanifest";
  if (!isShell) return;
  // Cache-first med bakgrundsuppdatering (stale-while-revalidate): direkt öppning offline, färsk cache online.
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      }).catch(function () { return hit || caches.match("/falt", { ignoreSearch: true }); });
      return hit || net;
    })
  );
});
