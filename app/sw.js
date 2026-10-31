// Service worker: trzyma aplikację w telefonie, żeby otwierała się bez internetu.
// __VERSION__ podmienia GitHub Actions przy publikacji; nowa wersja = nowa pamięć podręczna.
const VERSION = "__VERSION__";
const CACHE = `rozliczenia-${VERSION}`;
const LIBS = "rozliczenia-libs-1"; // biblioteki z CDN mają przypięte wersje, więc mogą zostać na stałe
const FILES = ["./", "index.html", "style.css", "app.js", "firebase-config.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];
const LIB_HOSTS = ["www.gstatic.com", "cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("rozliczenia-") && k !== CACHE && k !== LIBS).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data === "aktualizuj") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    event.respondWith(caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true })
        || (req.mode === "navigate" ? await cache.match("./") : undefined);
      return hit || fetch(req);
    }));
    return;
  }

  // Biblioteki (Firebase, SDK Claude, czcionki): najpierw z pamięci, jeśli brak – z sieci i zapamiętaj.
  // Zapytania do samej bazy (firestore.googleapis.com) i do API Claude nie są tu przechwytywane.
  if (LIB_HOSTS.includes(url.hostname)) {
    event.respondWith(caches.open(LIBS).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") cache.put(req, res.clone());
      return res;
    }));
  }
});
