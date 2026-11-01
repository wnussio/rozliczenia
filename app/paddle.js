// Odczyt tekstu ze zdjęcia (PaddleOCR, paddle-core.js) – w osobnym wątku, żeby strona nie zamarzała:
// bez tego cały odczyt szedł w wątku strony i stuknięcia (migawka, „Gotowe”) czekały po kilka sekund.
// Telefon bez OffscreenCanvas (starszy iPhone) albo bez działającego wątku → odczyt na stronie, jak dawniej.
const BASE = new URL("./", import.meta.url).href;
let progress = () => {};
export function setPaddleProgress(fn) { progress = fn || (() => {}); }

// numer zdjęcia – wątek dostaje za każdym razem kopię pliku, a po numerze trzyma zmniejszone zdjęcie na ponowne odczyty
const fileIds = new WeakMap();
let nextId = 1;
const idOf = (f) => { let i = fileIds.get(f); if (!i) fileIds.set(f, (i = nextId++)); return i; };

const workerOk = (() => {
  try { return typeof Worker !== "undefined" && !!new OffscreenCanvas(1, 1).getContext("2d"); } catch { return false; }
})();
let worker = null, seq = 0, core = null;
const pending = new Map();

function startWorker() {
  worker = new Worker(BASE + "paddle-worker.js");
  worker.onmessage = ({ data }) => {
    const p = pending.get(data.req); if (!p) return;
    if (data.progress) {
      if (p.isCancelled()) worker.postMessage({ type: "cancel", req: data.req }); else progress(data.progress);
      return;
    }
    pending.delete(data.req);
    if (data.error) p.rej(new Error(data.error)); else p.res(data.result);
  };
  worker.onerror = (e) => { // wątek padł (np. brak pamięci) – kończymy oczekujące i następnym razem startujemy od nowa
    e.preventDefault?.();
    for (const p of pending.values()) p.rej(new Error(e.message || "Błąd odczytu w tle"));
    pending.clear(); worker.terminate(); worker = null;
  };
}
function call(msg, isCancelled = () => false) {
  if (!worker) startWorker();
  return new Promise((res, rej) => {
    const req = ++seq;
    pending.set(req, { res, rej, isCancelled });
    worker.postMessage({ ...msg, req });
  });
}

async function mainCore() { // zapas: odczyt na stronie
  if (!core) {
    self.PADDLE_BASE = BASE;
    await new Promise((res, rej) => { const s = document.createElement("script"); s.src = BASE + "paddle-core.js"; s.onload = res; s.onerror = () => rej(new Error("Nie udało się wczytać paddle-core.js")); document.head.append(s); });
    core = self.PaddleCore;
  }
  core.setProgress((m) => progress(m));
  return core;
}

let ready = null, useWorker = workerOk;
export function initPaddle() {
  if (ready) return ready;
  ready = (async () => {
    if (useWorker) {
      try { return await call({ type: "init" }); }
      catch (e) { console.warn("Odczyt w tle niedostępny, czytam na stronie:", e); useWorker = false; worker?.terminate(); worker = null; }
    }
    return (await mainCore()).init();
  })();
  ready.catch(() => { ready = null; });
  return ready;
}
export async function paddleRead(file, isCancelled = () => false) {
  await initPaddle();
  if (useWorker) return call({ type: "read", file, id: idOf(file) }, isCancelled);
  return (await mainCore()).read(file, idOf(file), isCancelled);
}
export async function paddleReread(file, deg, variant, isCancelled = () => false) {
  await initPaddle();
  if (useWorker) return call({ type: "reread", file, id: idOf(file), deg, variant }, isCancelled);
  return (await mainCore()).reread(file, idOf(file), deg, variant, isCancelled);
}
