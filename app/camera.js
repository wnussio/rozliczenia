// Aparat w aplikacji: kilka zdjęć z rzędu bez wychodzenia z ekranu. Każde zdjęcie od razu idzie do odczytu
// (onShot), więc telefon czyta pierwszą część paragonu, kiedy robisz zdjęcie następnej.
// Systemowy aparat (input capture) wyrzuca stronę w tło – telefon potrafi ją wtedy zamknąć w trakcie odczytu.
import { releaseHeld } from "./fx.js";
const $ = (s) => document.querySelector(s);
let stream = null, onShot = null, shots = 0, capture = null, queue = Promise.resolve();
// busy: zdjęcie w trakcie – kolejne stuknięcia nie robią serii zdjęć; fast: telefon robi pełne zdjęcie za wolno → klatki z podglądu
let busy = false, fast = false, photoCaps = null, torchOn = false, refocus = 0;

export const cameraSupported = () => !!navigator.mediaDevices?.getUserMedia;

// true = aparat działa; false = brak dostępu (wtedy używamy systemowego aparatu)
export async function openCamera(handler) {
  onShot = handler; shots = 0; busy = false; fast = false; photoCaps = null; torchOn = false;
  $("#cam-thumbs").innerHTML = "";
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      // jak najwyższa rozdzielczość – drobny druk paragonu musi być ostry
      video: { facingMode: { ideal: "environment" }, width: { ideal: 4096 }, height: { ideal: 4096 } },
    });
  } catch (e) { console.warn("Aparat niedostępny:", e); stream = null; return false; }
  const v = $("#cam-video");
  v.srcObject = stream;
  $("#cam").hidden = false; document.body.classList.add("cam-open");
  $("#cam-res").textContent = "";
  try { await v.play(); } catch {}
  const track = stream.getVideoTracks()[0];
  // prawdziwe zdjęcie (ostrzenie, pełna rozdzielczość aparatu) zamiast klatki z podglądu – tam, gdzie telefon pozwala
  capture = typeof ImageCapture !== "undefined" ? new ImageCapture(track) : null;
  ready().then(async () => {
    let res = `${v.videoWidth}×${v.videoHeight}`;
    try { const pc = photoCaps = await capture?.getPhotoCapabilities(); if (pc?.imageWidth?.max) res = `${pc.imageWidth.max}×${pc.imageHeight.max}`; } catch {}
    if (stream) $("#cam-res").textContent = res;
  });
  const caps = track.getCapabilities?.() || {};
  $("#cam-torch").hidden = !caps.torch; $("#cam-torch").setAttribute("aria-pressed", "false");
  // ciągły autofokus, jeśli telefon pozwala wybrać
  if (caps.focusMode?.includes("continuous")) track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
  render();
  return true;
}

// Ekran znika od razu; kamera gaśnie dopiero, gdy zapiszą się zdjęcia zrobione tuż przed „Gotowe”.
export function closeCamera() {
  if (!stream) return;
  $("#cam").hidden = true; document.body.classList.remove("cam-open");
  releaseHeld(); // deszcz produktów z odczytu, który skończył się przy otwartym aparacie
  const s = stream;
  queue.then(() => {
    s.getTracks().forEach((t) => t.stop());
    if (stream !== s) return; // w międzyczasie otwarty na nowo
    stream = null; capture = null; $("#cam-video").srcObject = null;
    $("#cam-thumbs").innerHTML = "";
  });
}

function render() {
  $("#cam-count").textContent = shots ? `Zdjęć: ${shots}` : "";
  $("#cam-done").textContent = shots ? "Gotowe" : "Zamknij";
  $("#cam-tip").textContent = shots
    ? "Dalsza część? Zrób kolejne zdjęcie z kawałkiem poprzedniej – czytam w tle."
    : "Paragon płasko, w całości na ekranie. Nieostro? Stuknij w paragon. Długi? Rób zdjęcia od góry do dołu.";
}

// podgląd gotowy (pierwsze klatki) – do 4 s; wcześniej stuknięcie w migawkę czeka zamiast przepaść
function ready() {
  const v = $("#cam-video");
  if (v.videoWidth) return Promise.resolve(true);
  return new Promise((r) => {
    const t = setTimeout(() => r(!!v.videoWidth), 4000);
    v.addEventListener("loadeddata", () => { clearTimeout(t); r(true); }, { once: true });
  });
}
// Klatka z podglądu: zapamiętana od razu (szybkie kopiowanie), zapis do JPEG później – w tle.
function grab() {
  const v = $("#cam-video"), c = document.createElement("canvas");
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext("2d").drawImage(v, 0, 0);
  return c;
}
const encode = (c) => new Promise((r) => c.toBlob((b) => { c.width = c.height = 0; r(b); }, "image/jpeg", 0.92)); // c.width = 0 zwalnia pamięć (iPhone)
const frame = () => encode(grab());
// Mała miniatura z podglądu w chwili stuknięcia – widać od razu, że zdjęcie jest, zanim zapisze się pełne.
function mini() {
  const v = $("#cam-video");
  if (!v.videoWidth) return null;
  const c = document.createElement("canvas"), h = 108;
  c.height = h; c.width = Math.max(1, Math.round((h * v.videoWidth) / v.videoHeight));
  c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
  return c;
}
const take = (opts) => Promise.race([capture.takePhoto(opts), new Promise((_, rej) => setTimeout(() => rej(new Error("takePhoto: za długo")), 5000))]);
async function still() {
  if (capture && !fast) {
    const t0 = performance.now(), v = $("#cam-video");
    // bez lampy błyskowej: inaczej telefon najpierw mierzy światło pod błysk (to potrafi trwać 2–3 s)
    const opts = !torchOn && photoCaps?.fillLightMode?.includes("off") ? { fillLightMode: "off" } : undefined;
    try {
      let b;
      try { b = await take(opts); } catch (e) { if (!opts) throw e; b = await take(); }
      const dt = performance.now() - t0;
      // pełne zdjęcie trwa za długo (paragon zdąży się poruszyć) – dalej klatki z podglądu, jeśli podgląd jest dość ostry
      if (dt > 1500 && Math.max(v.videoWidth, v.videoHeight) >= 1900) fast = true;
      $("#cam-res").textContent = `${$("#cam-res").textContent.split(" · ")[0]} · ${(dt / 1000).toFixed(1)} s${fast ? " → szybki tryb" : ""}`;
      if (b?.size) return b;
    } catch (e) { console.warn("Zdjęcie z podglądu zamiast pełnego:", e); capture = null; }
  }
  return frame();
}
// Każde stuknięcie to zdjęcie (po kolei, nawet gdy poprzednie jeszcze się zapisuje); błysk i miniatura od razu.
// Klatka z podglądu (iPhone, szybki tryb) jest kopiowana w chwili stuknięcia – migawka od razu gotowa na kolejne zdjęcie;
// wcześniej czekała na zapis JPEG, który przy trwającym odczycie poprzedniego zdjęcia potrafił trwać kilka sekund.
function shoot() {
  if (!stream || busy) return; // pełne zdjęcie jeszcze się robi – nie rób serii
  const v = $("#cam-video");
  const flash = $("#cam-flash"); flash.classList.remove("on"); void flash.offsetWidth; flash.classList.add("on");
  navigator.vibrate?.(30);
  shots++; render();
  const n = shots, thumb = mini();
  if (thumb) { thumb.className = "pending"; thumb.setAttribute("role", "img"); thumb.setAttribute("aria-label", `Zdjęcie ${n}`); $("#cam-thumbs").append(thumb); }
  const grabbed = (!capture || fast) && v.videoWidth ? grab() : null;
  const done = () => { busy = false; $("#cam-shot").classList.remove("busy"); };
  if (!grabbed) { busy = true; $("#cam-shot").classList.add("busy"); }
  queue = queue.then(async () => {
    let blob;
    if (grabbed) blob = await encode(grabbed);
    else {
      if (!stream || !(await ready())) { thumb?.remove(); return; }
      blob = await still().finally(done);
    }
    if (!blob) { thumb?.remove(); return; }
    thumb?.classList.remove("pending");
    onShot?.(new File([blob], `aparat-${Date.now()}.jpg`, { type: "image/jpeg", lastModified: Date.now() }));
  }).catch((e) => { thumb?.remove(); console.warn("Zdjęcie nieudane:", e); }).finally(() => { if (!grabbed) done(); });
}

// Stuknięcie w podgląd = wyostrz w tym miejscu (gdzie telefon pozwala), potem z powrotem ciągły autofokus.
async function focusAt(e) {
  const track = stream?.getVideoTracks()[0], v = $("#cam-video");
  if (!track || !v.videoWidth) return;
  const caps = track.getCapabilities?.() || {};
  const r = v.getBoundingClientRect(), s = Math.max(r.width / v.videoWidth, r.height / v.videoHeight); // object-fit: cover
  const x = (e.clientX - r.left - (r.width - v.videoWidth * s) / 2) / (v.videoWidth * s);
  const y = (e.clientY - r.top - (r.height - v.videoHeight * s) / 2) / (v.videoHeight * s);
  const ring = $("#cam-focus");
  ring.style.left = `${e.clientX}px`; ring.style.top = `${e.clientY}px`;
  ring.classList.remove("on"); void ring.offsetWidth; ring.classList.add("on");
  const point = { pointsOfInterest: [{ x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }] };
  const single = caps.focusMode?.includes("single-shot"), cont = caps.focusMode?.includes("continuous");
  try { await track.applyConstraints({ advanced: [single ? { ...point, focusMode: "single-shot" } : point] }); } catch {}
  clearTimeout(refocus);
  if (single && cont) refocus = setTimeout(() => track.readyState === "live" && track.applyConstraints({ advanced: [{ ...point, focusMode: "continuous" }] }).catch(() => {}), 3000);
}

$("#cam-shot").onclick = shoot;
$("#cam-video").addEventListener("pointerup", focusAt);
$("#cam-done").onclick = closeCamera;
$("#cam-torch").onclick = (e) => {
  const btn = e.currentTarget, on = btn.getAttribute("aria-pressed") !== "true"; // currentTarget znika po obsłudze zdarzenia
  stream?.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: on }] }).then(() => { torchOn = on; btn.setAttribute("aria-pressed", String(on)); }).catch(() => {});
};
