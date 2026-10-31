// Odczyt paragonu ze zdjęcia w telefonie (Tesseract.js, pliki w vendor/): nic nie jest wysyłane.
import { parseReceipt, scoreParse } from "./parser.js";

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
function findSkew(bmp, r) {
  // Kąt, przy którym ciemne piksele najlepiej układają się w poziome wiersze tekstu.
  const sw = 500, sh = Math.max(1, Math.round(r.h * sw / r.w));
  const [, ctx] = canvas(sw, sh); ctx.drawImage(bmp, r.x, r.y, r.w, r.h, 0, 0, sw, sh);
  const g = grayOf(ctx, sw, sh);
  // ciemne = wyraźnie ciemniejsze od lokalnej średniej (litery), a nie po prostu ciemne tło
  const I = integral(g, sw, sh), S = Math.max(4, Math.round(sw / 20));
  const xs = [], ys = [];
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const m = localMean(I, sw, sh, x, y, S);
    if (g[y * sw + x] < m * 0.75 && m > 60) { xs.push(x); ys.push(y); }
  }
  if (xs.length < 200) return 0;
  let best = 0, bestScore = -1;
  for (let a = -8; a <= 8.001; a += 0.5) {
    const t = (a * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
    const off = sw + 2, bins = new Uint32Array(sh + 2 * off);
    for (let i = 0; i < xs.length; i++) bins[Math.round(ys[i] * c - xs[i] * s) + off]++;
    let score = 0; for (const b of bins) score += b * b;
    if (score > bestScore) { bestScore = score; best = a; }
  }
  return best;
}
export async function prepImage(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const r = findReceipt(bmp);
  const angle = findSkew(bmp, r);
  let scale = Math.min(3, 1800 / r.w);
  if (r.w * r.h * scale * scale > 8e6) scale = Math.sqrt(8e6 / (r.w * r.h));
  const w = r.w * scale, h = r.h * scale, t = (-angle * Math.PI) / 180;
  const W = Math.round(Math.abs(w * Math.cos(t)) + Math.abs(h * Math.sin(t))), H = Math.round(Math.abs(w * Math.sin(t)) + Math.abs(h * Math.cos(t)));
  const [gc, ctx] = canvas(W, H);
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2, H / 2); ctx.rotate(t);
  ctx.drawImage(bmp, r.x, r.y, r.w, r.h, -w / 2, -h / 2, w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // skala szarości z rozciągnięciem kontrastu
  const img = ctx.getImageData(0, 0, W, H), d = img.data, g = grayOf(ctx, W, H);
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
  const I = new Uint32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += g[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
  const S = Math.max(8, Math.round(W / 16)) >> 1;
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - S), y1 = Math.min(H - 1, y + S);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - S), x1 = Math.min(W - 1, x + S);
      const cnt = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = I[(y1 + 1) * (W + 1) + x1 + 1] - I[y0 * (W + 1) + x1 + 1] - I[(y1 + 1) * (W + 1) + x0] + I[y0 * (W + 1) + x0];
      const v = g[y * W + x] * cnt <= sum * 0.85 ? 0 : 255, i = (y * W + x) * 4;
      o[i] = o[i + 1] = o[i + 2] = v; o[i + 3] = 255;
    }
  }
  bctx.putImageData(out, 0, 0);
  return { bin: bc, gray: gc, angle };
}

export function setProgress(fn) { ocrProgress = fn || (() => {}); }
export function terminate() { if (ocrWorker) { ocrWorker.terminate(); ocrWorker = null; } }
export const workerReady = () => !!ocrWorker;
// Do trzech prób odczytu; wygrywa ta, której pozycje sumują się do „SUMA PLN”.
export async function readReceipt(file, isCancelled = () => false) {
  const imgs = await prepImage(file);
  const w = await getWorker();
  const tries = [{ img: "bin", psm: "6" }, { img: "gray", psm: "6" }, { img: "bin", psm: "4" }];
  let best = null;
  for (let k = 0; k < tries.length; k++) {
    if (isCancelled()) return null;
    ocrState.attempt = `${k + 1}/${tries.length}`;
    await w.setParameters({ tessedit_pageseg_mode: tries[k].psm });
    const { data } = await w.recognize(imgs[tries[k].img]);
    const sc = scoreParse(parseReceipt(data.text || ""));
    if (!best || sc < best.sc) best = { sc, text: data.text || "", tries: k + 1 };
    if (sc === 0) break;
  }
  ocrState.attempt = "";
  return { ...best, angle: imgs.angle };
}
