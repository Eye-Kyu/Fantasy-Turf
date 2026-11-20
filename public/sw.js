// Keeps the live-scoring screen usable with no signal. Only two things are cached:
// the scoring page itself (so it opens offline) and Next's static assets (so it runs).
// Everything else, including the events API, always goes to the network.
const CACHE = "scoring-v1";
const isScoringPage = (url) => /^\/matches\/[0-9a-f-]{36}\/score\/?$/.test(url.pathname);
const isStaticAsset = (url) => url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (isScoringPage(url)) {
    // Network first so scorers see fresh data; fall back to the last copy offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit ?? Response.error())),
    );
  } else if (isStaticAsset(url)) {
    // Hashed filenames never change, so a cached copy is always right.
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
