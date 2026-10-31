// Service worker: trzyma aplikację w telefonie, żeby działała bez internetu.
// Aplikacja nie wysyła żadnych danych; jedyne zapytania sieciowe to pobranie jej własnych plików.
// __VERSION__ podmienia GitHub Actions przy publikacji; nowa wersja = nowa pamięć podręczna.
const VERSION = "__VERSION__";
const CACHE = `rozliczenia-${VERSION}`;
const VENDOR = "rozliczenia-vendor-tesseract-7.0.0"; // duże pliki OCR – pobierane raz, przy pierwszym skanie
const FILES = ["./", "index.html", "style.css", "app.js", "parser.js", "ocr.js", "prices.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (event) => {
  // cache: "reload" – zawsze świeże pliki z serwera, nie stare kopie z pamięci przeglądarki
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("rozliczenia-") && k !== CACHE && k !== VENDOR).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data === "aktualizuj") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes("/vendor/")) {
    event.respondWith(caches.open(VENDOR).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }));
    return;
  }

  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: true })
      || (req.mode === "navigate" ? await cache.match("./") : undefined);
    return hit || fetch(req);
  }));
});
