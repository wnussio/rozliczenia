// Odczyt paragonu ze zdjęcia w telefonie (Tesseract.js, pliki w vendor/): nic nie jest wysyłane.
import { parseReceipt, scoreParse } from "./parser.js";
import { paddleRead, paddleReread, setPaddleProgress, initPaddle } from "./paddle.js";
// warianty ponownego odczytu (kolejność wg skuteczności w testach na pogorszonych zdjęciach)
const REREAD = ["upsharp", "sharp"];
export { initPaddle };

let ocrWorker = null, ocrProgress = () => {};
export const ocrState = { attempt: "" };
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Nie udało się wczytać " + src)); document.head.append(s); });
}
export async function getWorker() {
  if (ocrWorker) return ocrWorker;
  if (!window.Tesseract) await loadScript("vendor/tesseract/tesseract.min.js");
  const base = new URL("vendor/tesseract/", location.href).href;
  const w = await window.Tesseract.createWorker("pol", 1, {
    workerPath: base + "worker.min.js", corePath: base.replace(/\/$/, ""), langPath: base + "lang",
    workerBlobURL: false, logger: (m) => ocrProgress(m),
  });
  await w.setParameters({
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
    tessedit_char_whitelist: "AĄBCĆDEĘFGHIJKLŁMNŃOÓPQRSŚTUVWXYZŹŻaąbcćdeęfghijklłmnńoópqrsśtuvwxyzźż0123456789 ,.-:;/%*×()+&#'\"!?",
  });
  ocrWorker = w;
  return w;
}

/* przygotowanie zdjęcia: kadr na paragon → prostowanie → skala szarości → progowanie odporne na cienie */
function grayOf(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h).data, g = new Uint8Array(w * h);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
  return g;
}
function otsu(g) {
  const hist = new Float64Array(256); for (const v of g) hist[v]++;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = g.length - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; thr = t; }
  }
  return thr;
}
function integral(g, w, h) {
  const I = new Uint32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += g[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } }
  return I;
}
function localMean(I, w, h, x, y, S) {
  const x0 = Math.max(0, x - S), x1 = Math.min(w - 1, x + S), y0 = Math.max(0, y - S), y1 = Math.min(h - 1, y + S);
  const sum = I[(y1 + 1) * (w + 1) + x1 + 1] - I[y0 * (w + 1) + x1 + 1] - I[(y1 + 1) * (w + 1) + x0] + I[y0 * (w + 1) + x0];
  return sum / ((x1 - x0 + 1) * (y1 - y0 + 1));
}
function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d", { willReadFrequently: true })]; }
function findReceipt(bmp) {
  // Paragon to zwykle najjaśniejszy duży obszar na ciemniejszym tle (stół, dłoń).
  const sw = 300, sh = Math.max(1, Math.round(bmp.height * sw / bmp.width));
  const [, ctx] = canvas(sw, sh); ctx.drawImage(bmp, 0, 0, sw, sh);
  const g = grayOf(ctx, sw, sh);
  const thr = otsu(g);
  const run = (n, frac) => { // najdłuższy ciąg jasnych kolumn / wierszy
    let best = [0, n - 1], s = -1, bl = 0;
    for (let i = 0; i <= n; i++) {
      if (i < n && frac(i) > 0.25) { if (s < 0) s = i; }
      else if (s >= 0) { if (i - s > bl) { bl = i - s; best = [s, i - 1]; } s = -1; }
    }
    return bl ? best : [0, n - 1];
  };
  const colFrac = (x) => { let c = 0; for (let y = 0; y < sh; y++) c += g[y * sw + x] > thr; return c / sh; };
  const [x0, x1] = run(sw, colFrac);
  const rowFrac = (y) => { let c = 0; for (let x = x0; x <= x1; x++) c += g[y * sw + x] > thr; return c / (x1 - x0 + 1); };
  const [y0, y1] = run(sh, rowFrac);
  const k = bmp.width / sw, pad = 0.05;
  let r = { x: x0 * k, y: y0 * k, w: (x1 - x0 + 1) * k, h: (y1 - y0 + 1) * k };
  const area = (r.w * r.h) / (bmp.width * bmp.height);
  if (area < 0.15 || area > 0.85) return { x: 0, y: 0, w: bmp.width, h: bmp.height };
  r = { x: Math.max(0, r.x - r.w * pad), y: Math.max(0, r.y - r.h * pad), w: Math.min(bmp.width, r.w * (1 + 2 * pad)), h: Math.min(bmp.height, r.h * (1 + 2 * pad)) };
  r.w = Math.min(r.w, bmp.width - r.x); r.h = Math.min(r.h, bmp.height - r.y);
  return r;
}
function findSkew(bmp, r, invert, base = 0) {
  // Kąt, przy którym ciemne piksele najlepiej układają się w poziome wiersze tekstu.
  // Szukamy ±10° wokół położenia wybranego wcześniej (0°, 90°, 180°, 270°).
  const sw = 500, sh = Math.max(1, Math.round(r.h * sw / r.w));
  const [, ctx] = canvas(sw, sh); ctx.drawImage(bmp, r.x, r.y, r.w, r.h, 0, 0, sw, sh);
  const g = grayOf(ctx, sw, sh);
  if (invert) for (let i = 0; i < g.length; i++) g[i] = 255 - g[i];
  // ciemne = wyraźnie ciemniejsze od lokalnej średniej (litery), a nie po prostu ciemne tło
  const I = integral(g, sw, sh), S = Math.max(4, Math.round(Math.min(sw, sh) / 20));
  const xs = [], ys = [];
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const m = localMean(I, sw, sh, x, y, S);
    if (g[y * sw + x] < m * 0.75 && m > 60) { xs.push(x); ys.push(y); }
  }
  if (xs.length < 200) return base;
  const step = Math.max(1, Math.floor(xs.length / 40000)); // przyspieszenie dla bardzo zapisanych zdjęć
  let best = 0, bestScore = -1;
  const off = sw + sh + 2;
  const tryAngle = (a) => {
    const t = (a * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
    const bins = new Uint32Array(2 * off + 2);
    for (let i = 0; i < xs.length; i += step) bins[Math.round(ys[i] * c - xs[i] * s) + off]++;
    let score = 0; for (const b of bins) score += b * b;
    if (score > bestScore) { bestScore = score; best = a; }
  };
  for (let a = base - 10; a <= base + 10.001; a += 0.5) tryAngle(a);
  return best;
}
function polarity(bmp, r) {
  // Tryb ciemny (jasny tekst na ciemnym tle, np. zrzut z aplikacji sklepu) → trzeba odwrócić kolory.
  const sw = 200, sh = Math.max(1, Math.round(r.h * sw / r.w));
  const [, ctx] = canvas(sw, sh); ctx.drawImage(bmp, r.x, r.y, r.w, r.h, 0, 0, sw, sh);
  const g = Array.from(grayOf(ctx, sw, sh)).sort((a, b) => a - b);
  return g[g.length >> 1] < 110;
}
function render(bmp, r, angle, invert, maxW = 1800, binOnly = false) {
  const t = (-angle * Math.PI) / 180;
  let scale = Math.min(3, maxW / (Math.abs(Math.cos(t)) > 0.5 ? r.w : r.h));
  if (r.w * r.h * scale * scale > 8e6) scale = Math.sqrt(8e6 / (r.w * r.h));
  const w = r.w * scale, h = r.h * scale;
  const W = Math.round(Math.abs(w * Math.cos(t)) + Math.abs(h * Math.sin(t))), H = Math.round(Math.abs(w * Math.sin(t)) + Math.abs(h * Math.cos(t)));
  const [gc, ctx] = canvas(W, H);
  ctx.fillStyle = invert ? "#000" : "#fff"; ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2, H / 2); ctx.rotate(t);
  ctx.drawImage(bmp, r.x, r.y, r.w, r.h, -w / 2, -h / 2, w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // skala szarości z rozciągnięciem kontrastu
  const img = ctx.getImageData(0, 0, W, H), d = img.data, g = grayOf(ctx, W, H);
  if (invert) for (let j = 0; j < g.length; j++) g[j] = 255 - g[j];
  const hist = new Uint32Array(256); for (const v of g) hist[v]++;
  let lo = 0, hi = 255, acc = 0;
  while (lo < 255 && (acc += hist[lo]) < g.length * 0.01) lo++;
  acc = 0; while (hi > 0 && (acc += hist[hi]) < g.length * 0.01) hi--;
  const span = Math.max(1, hi - lo);
  for (let j = 0; j < g.length; j++) g[j] = Math.max(0, Math.min(255, ((g[j] - lo) * 255) / span));
  for (let i = 0, j = 0; j < g.length; i += 4, j++) d[i] = d[i + 1] = d[i + 2] = g[j];
  ctx.putImageData(img, 0, 0);
  // progowanie Bradleya: porównanie z lokalną średnią – cienie i nierówne światło nie przeszkadzają
  const [bc, bctx] = canvas(W, H);
  const out = bctx.createImageData(W, H), o = out.data;
  const I = integral(g, W, H);
  const S = Math.max(8, Math.round(W / 16)) >> 1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = g[y * W + x] <= localMean(I, W, H, x, y, S) * 0.85 ? 0 : 255, i = (y * W + x) * 4;
      o[i] = o[i + 1] = o[i + 2] = v; o[i + 3] = 255;
    }
  }
  bctx.putImageData(out, 0, 0);
  return { bin: bc, gray: gc };
}
export async function prepImage(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const r = findReceipt(bmp);
  return { bmp, r, invert: polarity(bmp, r) };
}

export function setProgress(fn) { ocrProgress = fn || (() => {}); setPaddleProgress((m) => ocrProgress({ ...m, paddle: true })); }
export function terminate() { if (ocrWorker) { ocrWorker.terminate(); ocrWorker = null; } }
export const workerReady = () => !!ocrWorker;
// Kilka prób odczytu; wygrywa ta, której pozycje sumują się do „SUMA PLN” (a przy remisie – pewniejsza).
const WORD = /[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]{3,}/g;
// Szybka ocena położenia: ile sensownych słów rozpoznaje się na zmniejszonym obrazie.
async function orientationScore(w, p, angle) {
  const img = render(p.bmp, p.r, angle, p.invert, 900).bin;
  await w.setParameters({ tessedit_pageseg_mode: "6" });
  const { data } = await w.recognize(img);
  return ((data.text || "").match(WORD) || []).length * (data.confidence || 0) / 100;
}
// Kilka prób odczytu; wygrywa ta, której pozycje sumują się do „SUMA PLN” (a przy remisie – pewniejsza).
export async function readReceipt(file, isCancelled = () => false) {
  // Główny silnik: PaddleOCR (sieć neuronowa, dużo lepszy na zdjęciach). Tesseract tylko gdy Paddle nie ruszy.
  try {
    const r = await paddleRead(file, isCancelled);
    if (!r) return null;
    if (r.text.trim()) {
      let best = { text: r.text, angle: r.angle, tries: 1, engine: "paddle", sc: scoreParse(parseReceipt(r.text)) };
      // suma się nie zgadza → jeszcze raz z wyostrzeniem / powiększeniem; wygrywa odczyt zgodny z SUMA PLN
      for (const v of REREAD) {
        if (best.sc === 0 || isCancelled()) break;
        const r2 = await paddleReread(file, r.angle, v, isCancelled);
        if (!r2) return null;
        const sc = scoreParse(parseReceipt(r2.text));
        best.tries++;
        if (sc < best.sc) best = { ...best, text: r2.text, sc };
      }
      return best;
    }
  } catch (e) { console.warn("PaddleOCR niedostępny, używam Tesseract:", e); }
  return readTesseract(file, isCancelled);
}
// Kilka zdjęć jednego paragonu. Najpierw zwykły odczyt wszystkich, potem ocena całości (score: połączone pozycje
// kontra SUMA PLN z któregokolwiek zdjęcia). Ponowne odczyty (ostrzej) tylko gdy suma się nie zgadza – i każdy
// zostaje tylko wtedy, gdy poprawia zgodność całego paragonu.
// files może rosnąć w trakcie (kolejne zdjęcie zrobione podczas odczytu) – nowe są czytane, zanim skończymy.
// rereadWithoutTotal(): czy czytać ponownie, gdy na żadnym zdjęciu nie ma SUMA PLN (dla pojedynczego zdjęcia jak dotąd).
export async function readReceipts(files, { isCancelled = () => false, score, rereadWithoutTotal = () => false, onStage = () => {} } = {}) {
  const reads = [], texts = [], rr = new Map(); // rr: wyniki ponownych odczytów „i:wariant” (żeby nie czytać dwa razy)
  let tries = 0, best = 1e9;
  const readNew = async () => {
    while (reads.length < files.length) {
      const i = reads.length;
      onStage({ phase: "read", i });
      let r;
      try { r = await firstRead(files[i], isCancelled); if (!r) return false; }
      catch (e) { if (isCancelled()) return false; r = { text: "", error: e }; }
      reads.push(r); texts.push(r.text || ""); tries++;
    }
    best = score(texts);
    return true;
  };
  if (!(await readNew())) return null;
  outer: for (;;) {
    if (best !== 0 && (best < 1e6 || rereadWithoutTotal())) {
      for (let i = 0; i < reads.length && best !== 0; i++) {
        if (reads[i].engine !== "paddle" || !reads[i].text.trim()) continue;
        for (const v of REREAD) {
          if (best === 0) break;
          if (reads.length < files.length) { if (!(await readNew())) return null; continue outer; }
          const key = i + ":" + v;
          if (!rr.has(key)) {
            onStage({ phase: "reread", i });
            const r2 = await paddleReread(files[i], reads[i].angle, v, isCancelled);
            if (!r2 || isCancelled()) return null;
            rr.set(key, r2.text); tries++;
          }
          const cand = texts.slice(); cand[i] = rr.get(key);
          const sc = score(cand);
          // bez SUMA PLN „więcej pozycji” nie znaczy „lepiej” (ostrzejszy odczyt dokłada też śmieci) – ponowny odczyt
          // zostaje tylko, gdy zgadza się z sumą lepiej, albo gdy pierwszy nie dał nic
          if (sc < best && (sc < 1e6 || best >= 1e9)) { best = sc; texts[i] = cand[i]; }
        }
      }
    }
    if (reads.length < files.length) { if (!(await readNew())) return null; continue; }
    break;
  }
  ocrState.attempt = "";
  return { texts, errors: reads.map((r) => r.error || null), tries, score: best };
}
async function firstRead(file, isCancelled) {
  try {
    const r = await paddleRead(file, isCancelled);
    if (!r) return null;
    if (r.text.trim()) return { text: r.text, angle: r.angle, engine: "paddle" };
  } catch (e) { if (isCancelled()) return null; console.warn("PaddleOCR niedostępny, używam Tesseract:", e); }
  const t = await readTesseract(file, isCancelled);
  return t && { text: t.text, angle: t.angle, engine: "tesseract" };
}
async function readTesseract(file, isCancelled) {
  const p = await prepImage(file);
  const w = await getWorker();
  let best = null, n = 0;
  const check = () => { if (isCancelled()) throw new Error("cancelled"); };
  try {
    // 1. położenie zdjęcia: najpierw zwykłe; obrócone sprawdzamy tylko, gdy zwykłe czyta się słabo
    ocrState.attempt = "orientacja";
    let base = 0, bestQ = await orientationScore(w, p, 0);
    if (bestQ < 25) {
      for (const a of [90, 270, 180]) {
        check();
        const q = await orientationScore(w, p, a);
        if (q > bestQ * 1.3) { bestQ = q; base = a; }
      }
    }
    // 2. dokładne prostowanie wokół wybranego położenia
    const angle = findSkew(p.bmp, p.r, p.invert, base);
    const imgs = render(p.bmp, p.r, angle, p.invert);
    const run = async (img, psm) => {
      check();
      ocrState.attempt = String(++n);
      await w.setParameters({ tessedit_pageseg_mode: psm });
      const { data } = await w.recognize(img);
      const res = parseReceipt(data.text || "");
      const cand = { sc: scoreParse(res), conf: data.confidence || 0, items: res.items.length, text: data.text || "", angle };
      if (!best || cand.sc < best.sc || (cand.sc === best.sc && cand.conf > best.conf)) best = cand;
    };
    await run(imgs.bin, "6");
    if (best.sc !== 0) await run(imgs.gray, "6");
    if (best.sc !== 0) await run(imgs.bin, "4");
  } catch (e) { if (e.message === "cancelled") return null; throw e; }
  ocrState.attempt = "";
  return { ...best, tries: n };
}
