const CACHE_VERSION = "omok-pwa-v2";
const OFFLINE_FILES = [
  "./", "./index.html", "./omok.html", "./kingdom30.html", "./baseball.html", "./minesweeper.html",
  "./memory.html", "./rps.html", "./tictactoe.html", "./manifest.webmanifest",
  "./icons/omok-192.png", "./icons/omok-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(OFFLINE_FILES)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then((response) => {
      const copy = response.clone(); caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match("./omok.html"))));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    const copy = response.clone(); caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
    return response;
  })));
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
