// Odczyt tekstu ze zdjęcia w telefonie: PaddleOCR PP-OCRv4 (detekcja + rozpoznawanie) w onnxruntime-web.
// Wierny port przetwarzania z RapidOCR (Python), na którym mierzymy jakość. Nic nie jest wysyłane.
const BASE = new URL("./", import.meta.url).href;
let ready = null, det = null, rec = null, keys = null;
let progress = () => {};
export function setPaddleProgress(fn) { progress = fn || (() => {}); }

function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Nie udało się wczytać " + src)); document.head.append(s); });
}
export function initPaddle() {
  if (ready) return ready;
  ready = (async () => {
    if (!window.ort) await loadScript(BASE + "vendor/ort/ort.wasm.min.js");
    const ort = window.ort;
    ort.env.wasm.wasmPaths = BASE + "vendor/ort/";
    // Kilka wątków, gdy strona jest „cross-origin isolated” (nagłówki COOP/COEP dokłada sw.js) – ten sam wynik, szybciej.
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1;
    const opts = { executionProviders: ["wasm"], graphOptimizationLevel: "all" };
    progress({ status: "Ładuję model rozpoznawania (pierwszy raz ok. 30 MB)…", progress: 0.05 });
    det = await ort.InferenceSession.create(BASE + "models/det.onnx", opts);
    progress({ status: "Ładuję model rozpoznawania…", progress: 0.5 });
    rec = await ort.InferenceSession.create(BASE + "models/rec.onnx", opts);
    const k = (await (await fetch(BASE + "models/keys.txt")).text()).split(/\r?\n/);
    if (k.length && k[k.length - 1] === "") k.pop();
    keys = ["", ...k, " "]; // 0 = pusty znak CTC, na końcu spacja
    return true;
  })();
  ready.catch(() => { ready = null; });
  return ready;
}

/* ---------- obraz ---------- */
function canvas(w, h) { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
function ctx2d(c) { const x = c.getContext("2d", { willReadFrequently: true }); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high"; return x; }
function rotateCanvas(src, deg) { // 90 = zgodnie z ruchem wskazówek zegara
  if (!deg) return src;
  const swap = deg % 180 !== 0, c = canvas(swap ? src.height : src.width, swap ? src.width : src.height), x = ctx2d(c);
  x.translate(c.width / 2, c.height / 2); x.rotate((deg * Math.PI) / 180); x.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}
function rotatePoint([x, y], deg, W, H) { // współrzędne po obrocie obrazu W×H
  if (deg === 90) return [H - y, x];
  if (deg === 270) return [y, W - x];
  if (deg === 180) return [W - x, H - y];
  return [x, y];
}
// BGR, (x/255-0.5)/0.5, układ NCHW – jak w RapidOCR (obraz z OpenCV)
function toTensor(data, w, h) {
  const n = w * h, t = new Float32Array(3 * n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    t[i] = data[j + 2] / 127.5 - 1; t[n + i] = data[j + 1] / 127.5 - 1; t[2 * n + i] = data[j] / 127.5 - 1;
  }
  return t;
}

/* ---------- geometria ---------- */
function hull(pts) { // otoczka wypukła (monotone chain)
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop();
  return lo.concat(up);
}
function minAreaRect(h) { // najmniejszy obrócony prostokąt (obracające się suwmiarki)
  if (h.length === 1) return { cx: h[0][0], cy: h[0][1], w: 0, h: 0, ux: 1, uy: 0 };
  let best = null;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length];
    let ux = b[0] - a[0], uy = b[1] - a[1]; const len = Math.hypot(ux, uy); if (!len) continue; ux /= len; uy /= len;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of h) { const u = p[0] * ux + p[1] * uy, v = -p[0] * uy + p[1] * ux; if (u < minU) minU = u; if (u > maxU) maxU = u; if (v < minV) minV = v; if (v > maxV) maxV = v; }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area) {
      const cu = (minU + maxU) / 2, cv = (minV + maxV) / 2;
      best = { area, cx: cu * ux - cv * uy, cy: cu * uy + cv * ux, w: maxU - minU, h: maxV - minV, ux, uy };
    }
  }
  return best;
}
function rectPoints(r) {
  const hx = r.w / 2, hy = r.h / 2, ux = r.ux, uy = r.uy, vx = -uy, vy = ux;
  return [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map(([a, b]) => [r.cx + a * ux + b * vx, r.cy + a * uy + b * vy]);
}
function orderPoints(p) { // kolejność jak get_mini_boxes w RapidOCR: lewy-górny, prawy-górny, prawy-dolny, lewy-dolny
  const s = [...p].sort((a, b) => a[0] - b[0]);
  const [i1, i4] = s[1][1] > s[0][1] ? [0, 1] : [1, 0];
  const [i2, i3] = s[3][1] > s[2][1] ? [2, 3] : [3, 2];
  return [s[i1], s[i2], s[i3], s[i4]];
}
function inQuad(x, y, q) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (c !== 0) { const s = c > 0 ? 1 : -1; if (sign && s !== sign) return false; sign = s; }
  }
  return true;
}

/* ---------- detekcja ramek tekstu (DB) ---------- */
async function detect(src) {
  const W = src.width, H = src.height;
  const ratio = Math.min(W, H) < 736 ? 736 / Math.min(W, H) : 1;
  const rh = Math.max(32, Math.round(Math.trunc(H * ratio) / 32) * 32), rw = Math.max(32, Math.round(Math.trunc(W * ratio) / 32) * 32);
  const c = canvas(rw, rh), x = ctx2d(c); x.drawImage(src, 0, 0, rw, rh);
  const out = await det.run({ x: new window.ort.Tensor("float32", toTensor(x.getImageData(0, 0, rw, rh).data, rw, rh), [1, 3, rh, rw]) });
  const P = out[det.outputNames[0]].data;
  const w = rw, h = rh, bm = new Uint8Array(w * h), mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) bm[i] = P[i] > 0.3 ? 1 : 0;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { // dylatacja 2×2
    const i = yy * w + xx;
    mask[i] = bm[i] | (xx ? bm[i - 1] : 0) | (yy ? bm[i - w] : 0) | (xx && yy ? bm[i - w - 1] : 0);
  }
  const seen = new Uint8Array(w * h), stack = new Int32Array(w * h), boxes = [];
  for (let s0 = 0; s0 < w * h; s0++) {
    if (!mask[s0] || seen[s0]) continue;
    let top = 0; stack[top++] = s0; seen[s0] = 1;
    const rows = new Map();
    while (top) {
      const i = stack[--top], yy = (i / w) | 0, xx = i - yy * w;
      const r = rows.get(yy); if (!r) rows.set(yy, [xx, xx]); else { if (xx < r[0]) r[0] = xx; if (xx > r[1]) r[1] = xx; }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = xx + dx, ny = yy + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx; if (mask[j] && !seen[j]) { seen[j] = 1; stack[top++] = j; }
      }
    }
    const pts = []; for (const [yy, [a, b]] of rows) { pts.push([a, yy]); if (b !== a) pts.push([b, yy]); }
    let r = minAreaRect(hull(pts));
    if (Math.min(r.w, r.h) < 3) continue;
    const q = rectPoints(r);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of q) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(w - 1, Math.ceil(x1)); y1 = Math.min(h - 1, Math.ceil(y1));
    let sum = 0, cnt = 0;
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) if (inQuad(xx, yy, q)) { sum += P[yy * w + xx]; cnt++; }
    if (!cnt || sum / cnt < 0.5) continue;
    const d = (r.w * r.h * 1.6) / (2 * (r.w + r.h)); // „unclip” jak w PaddleOCR
    r = { ...r, w: r.w + 2 * d, h: r.h + 2 * d };
    if (Math.min(r.w, r.h) < 5) continue;
    const pts2 = rectPoints(r).map(([px, py]) => [Math.min(W, Math.max(0, Math.round((px / w) * W))), Math.min(H, Math.max(0, Math.round((py / h) * H)))]);
    boxes.push(orderPoints(pts2));
  }
  return boxes;
}

/* ---------- rozpoznawanie tekstu w ramce (CRNN/SVTR + CTC) ---------- */
function crop(src, b, flip = false) {
  const [p0, p1, , p3] = b;
  const cw = Math.max(1, Math.trunc(Math.max(Math.hypot(b[0][0] - b[1][0], b[0][1] - b[1][1]), Math.hypot(b[2][0] - b[3][0], b[2][1] - b[3][1]))));
  const ch = Math.max(1, Math.trunc(Math.max(Math.hypot(b[0][0] - b[3][0], b[0][1] - b[3][1]), Math.hypot(b[1][0] - b[2][0], b[1][1] - b[2][1]))));
  // przekształcenie obraz → wycinek: odwrotność (u,v) ↦ p0 + u·(p1−p0)/cw + v·(p3−p0)/ch
  const ax = (p1[0] - p0[0]) / cw, ay = (p1[1] - p0[1]) / cw, bx = (p3[0] - p0[0]) / ch, by = (p3[1] - p0[1]) / ch;
  const det_ = ax * by - bx * ay || 1e-9;
  const ia = by / det_, ib = -ay / det_, ic = -bx / det_, id = ax / det_;
  let c = canvas(cw, ch); const x = ctx2d(c);
  x.setTransform(ia, ib, ic, id, -(ia * p0[0] + ic * p0[1]), -(ib * p0[0] + id * p0[1]));
  x.drawImage(src, 0, 0);
  if (ch / cw >= 1.5) c = rotateCanvas(c, 270); // np.rot90 – obrót przeciwnie do wskazówek
  if (flip) c = rotateCanvas(c, 180);
  return c;
}
async function recognize(c) {
  const ratio = c.width / c.height, H = 48;
  const W = Math.trunc(H * Math.max(320 / 48, ratio)), rw = Math.min(W, Math.ceil(H * ratio));
  const r = canvas(rw, H), x = ctx2d(r); x.drawImage(c, 0, 0, rw, H);
  const d = x.getImageData(0, 0, rw, H).data, n = W * H, t = new Float32Array(3 * n); // dopełnienie zerami jak w RapidOCR
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < rw; xx++) {
    const j = (yy * rw + xx) * 4, i = yy * W + xx;
    t[i] = d[j + 2] / 127.5 - 1; t[n + i] = d[j + 1] / 127.5 - 1; t[2 * n + i] = d[j] / 127.5 - 1;
  }
  const out = await rec.run({ x: new window.ort.Tensor("float32", t, [1, 3, H, W]) });
  const o = out[rec.outputNames[0]], [, T, C] = o.dims, p = o.data;
  let text = "", conf = 0, cnt = 0, last = 0;
  for (let s = 0; s < T; s++) {
    let bi = 0, bv = -1;
    for (let k = 0; k < C; k++) { const v = p[s * C + k]; if (v > bv) { bv = v; bi = k; } }
    if (bi && bi !== last) { text += keys[bi] ?? ""; conf += bv; cnt++; }
    last = bi;
  }
  return { text, conf: cnt ? conf / cnt : 0 };
}

/* ---------- wiersze: ramki → linie paragonu (z uwzględnieniem nachylenia) ---------- */
function toLines(items) {
  const angs = [], boxes = [];
  for (const { box: [p0, p1, p2, p3], text } of items) {
    const wdt = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    if (wdt > 30) angs.push(Math.atan2(p1[1] - p0[1], p1[0] - p0[0]));
    const hgt = (Math.hypot(p3[0] - p0[0], p3[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1])) / 2;
    boxes.push({ x: (p0[0] + p1[0] + p2[0] + p3[0]) / 4, y: (p0[1] + p1[1] + p2[1] + p3[1]) / 4, h: hgt, text });
  }
  angs.sort((a, b) => a - b);
  const a = angs.length ? angs[angs.length >> 1] : 0, c = Math.cos(-a), s = Math.sin(-a);
  for (const b of boxes) { const { x, y } = b; b.x = x * c - y * s; b.y = x * s + y * c; }
  boxes.sort((p, q) => p.y - q.y);
  const rows = [];
  for (const b of boxes) {
    const r = rows.find((r) => Math.abs(r.cy - b.y) < 0.5 * Math.max(b.h, r.h));
    if (r) { r.items.push(b); r.cy = r.items.reduce((t, i) => t + i.y, 0) / r.items.length; }
    else rows.push({ cy: b.y, h: b.h, items: [b] });
  }
  rows.sort((p, q) => p.cy - q.cy);
  return rows.map((r) => r.items.sort((p, q) => p.x - q.x).map((i) => i.text).join("  ")).join("\n");
}

const alnum = (t) => (t.match(/[0-9A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]/g) || []).length;

/* ---------- całość: zdjęcie → tekst paragonu ---------- */
// Zdjęcie zdekodowane i zmniejszone raz – ponowne odczyty tego samego pliku biorą kopię (dekodowanie 12 Mpx trwa).
const scaled = new WeakMap();
async function loadScaled(file) {
  let base = scaled.get(file);
  if (!base) {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const sc = Math.min(1, 2000 / Math.max(bmp.width, bmp.height)); // jak max_side_len w RapidOCR
    base = canvas(bmp.width * sc, bmp.height * sc); ctx2d(base).drawImage(bmp, 0, 0, base.width, base.height);
    bmp.close?.();
    scaled.set(file, base);
  }
  const img = canvas(base.width, base.height); ctx2d(img).drawImage(base, 0, 0);
  return img;
}
export async function paddleRead(file, isCancelled = () => false) {
  await initPaddle();
  let img = await loadScaled(file);
  progress({ status: "Szukam tekstu na zdjęciu…", progress: 0.1 });
  let boxes = await detect(img);
  if (isCancelled()) return null;
  // 1) zdjęcie bokiem? – większość ramek pionowa → obróć o 90°
  let vert = 0, hor = 0;
  for (const b of boxes) { const bw = Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1]), bh = Math.hypot(b[3][0] - b[0][0], b[3][1] - b[0][1]); if (bh > bw * 1.3) vert += bw * bh; else hor += bw * bh; }
  let deg = 0;
  if (vert > hor) { // tekst pionowy: obróć i wykryj ramki od nowa (na pionowym tekście detektor tnie linie na kawałki)
    img = rotateCanvas(img, 90); deg = 90;
    progress({ status: "Obracam zdjęcie…", progress: 0.15 });
    boxes = await detect(img);
  }
  return finish(img, boxes, deg, isCancelled);
}

// Ponowny odczyt z innym przygotowaniem obrazu (wyostrzenie, powiększenie) – przy znanym już położeniu zdjęcia.
export async function paddleReread(file, deg, variant, isCancelled = () => false) {
  await initPaddle();
  const img = applyVariant(rotateCanvas(await loadScaled(file), deg), variant);
  progress({ status: "Czytam jeszcze raz, ostrzej…", progress: 0.1 });
  const boxes = await detect(img);
  if (isCancelled()) return null;
  return finish(img, boxes, deg, isCancelled, true);
}

/* ---------- warianty obrazu ---------- */
function blurChannels(src, w, h, r) { // rozmycie pudełkowe ×3 ≈ Gauss (osobno w poziomie i w pionie)
  let a = src, b = new Float32Array(src.length);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) for (let c = 0; c < 3; c++) { // poziomo
      let acc = 0; const row = y * w;
      for (let x = -r; x <= r; x++) acc += a[(row + Math.min(w - 1, Math.max(0, x))) * 3 + c];
      for (let x = 0; x < w; x++) {
        b[(row + x) * 3 + c] = acc / (2 * r + 1);
        acc += a[(row + Math.min(w - 1, x + r + 1)) * 3 + c] - a[(row + Math.max(0, x - r)) * 3 + c];
      }
    }
    [a, b] = [b, a];
    for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) { // pionowo
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += a[(Math.min(h - 1, Math.max(0, y)) * w + x) * 3 + c];
      for (let y = 0; y < h; y++) {
        b[(y * w + x) * 3 + c] = acc / (2 * r + 1);
        acc += a[(Math.min(h - 1, y + r + 1) * w + x) * 3 + c] - a[(Math.max(0, y - r) * w + x) * 3 + c];
      }
    }
    [a, b] = [b, a];
  }
  return a;
}
function unsharp(c, amount, radius) {
  const x = ctx2d(c), im = x.getImageData(0, 0, c.width, c.height), d = im.data, n = c.width * c.height;
  const f = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { f[i * 3] = d[i * 4]; f[i * 3 + 1] = d[i * 4 + 1]; f[i * 3 + 2] = d[i * 4 + 2]; }
  const bl = blurChannels(f, c.width, c.height, radius);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) d[i * 4 + k] = Math.max(0, Math.min(255, f[i * 3 + k] * (1 + amount) - bl[i * 3 + k] * amount));
  x.putImageData(im, 0, 0);
  return c;
}
function applyVariant(img, v) {
  if (v === "sharp") return unsharp(img, 1.6, 2);
  if (v === "upsharp") {
    const f = Math.min(1.8, 2600 / Math.max(img.width, img.height));
    if (f <= 1.05) return unsharp(img, 1.0, 1);
    const c = canvas(img.width * f, img.height * f); ctx2d(c).drawImage(img, 0, 0, c.width, c.height);
    return unsharp(c, 1.0, 1);
  }
  return img;
}

async function finish(img, boxes, deg, isCancelled, fixedOrientation = false) {
  const turn = (d) => { const W = img.width, H = img.height; boxes = boxes.map((b) => orderPoints(b.map((p) => rotatePoint(p, d, W, H)))); img = rotateCanvas(img, d); deg = (deg + d) % 360; };
  if (fixedOrientation) return readAll(img, boxes, deg, isCancelled);
  // 2) do góry nogami? – próbny odczyt największych ramek w obu kierunkach
  const sample = [...boxes].sort((p, q) => Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) - Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1])).slice(0, 8);
  let up = 0, down = 0;
  for (const b of sample) {
    const r0 = await recognize(crop(img, b)), r1 = await recognize(crop(img, b, true));
    up += alnum(r0.text) * r0.conf; down += alnum(r1.text) * r1.conf;
  }
  if (down > up * 1.15) turn(180);
  return readAll(img, boxes, deg, isCancelled);
}
async function readAll(img, boxes, deg, isCancelled) {
  // 3) odczyt wszystkich ramek
  const items = [];
  for (let i = 0; i < boxes.length; i++) {
    if (isCancelled()) return null;
    if (i % 5 === 0) progress({ status: `Czytam paragon… ${Math.round((i / boxes.length) * 100)}%`, progress: 0.2 + 0.8 * (i / boxes.length) });
    const r = await recognize(crop(img, boxes[i]));
    if (r.conf >= 0.5 && r.text.trim()) items.push({ box: boxes[i], text: r.text });
  }
  return { text: toLines(items), angle: deg, boxes: boxes.length };
}
