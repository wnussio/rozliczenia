// Service worker: trzyma aplikację w telefonie, żeby działała bez internetu.
// Aplikacja nie wysyła żadnych danych; jedyne zapytania sieciowe to pobranie jej własnych plików.
// __VERSION__ podmienia GitHub Actions przy publikacji; nowa wersja = nowa pamięć podręczna.
const VERSION = "__VERSION__";
const CACHE = `rozliczenia-${VERSION}`;
const VENDOR = "rozliczenia-vendor-ocr-2"; // duże pliki OCR (PaddleOCR, onnxruntime, Tesseract) – pobierane raz
const FILES = ["./", "index.html", "style.css", "app.js", "parser.js", "ocr.js", "prices.js", "fx.js", "mascot.js", "paddle.js", "camera.js", "fonts/fonts.css", "fonts/mplus-rounded-400-latin.woff2", "fonts/mplus-rounded-400-latin-ext.woff2", "fonts/mplus-rounded-700-latin.woff2", "fonts/mplus-rounded-700-latin-ext.woff2", "fonts/mplus-rounded-800-latin.woff2", "fonts/mplus-rounded-800-latin-ext.woff2", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

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

// GitHub Pages nie pozwala ustawić nagłówków, więc dokładamy je tutaj: COOP/COEP → strona „cross-origin isolated”
// → OCR może liczyć na kilku wątkach (ten sam wynik, szybciej). Wszystkie pliki aplikacji są z tej samej domeny.
function isolated(res) {
  if (!res || res.type === "opaque" || res.type === "opaqueredirect" || !res.status) return res;
  const h = new Headers(res.headers);
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  h.set("Cross-Origin-Embedder-Policy", "require-corp");
  h.set("Cross-Origin-Resource-Policy", "same-origin");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes("/vendor/") || url.pathname.includes("/models/")) {
    event.respondWith(caches.open(VENDOR).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return isolated(hit);
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return isolated(res);
    }));
    return;
  }

  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: true })
      || (req.mode === "navigate" ? await cache.match("./") : undefined);
    return isolated(hit || await fetch(req));
  }));
});
