// Aparat w aplikacji: kilka zdjęć z rzędu bez wychodzenia z ekranu. Każde zdjęcie od razu idzie do odczytu
// (onShot), więc telefon czyta pierwszą część paragonu, kiedy robisz zdjęcie następnej.
// Systemowy aparat (input capture) wyrzuca stronę w tło – telefon potrafi ją wtedy zamknąć w trakcie odczytu.
const $ = (s) => document.querySelector(s);
let stream = null, onShot = null, shots = 0;

export const cameraSupported = () => !!navigator.mediaDevices?.getUserMedia;

// true = aparat działa; false = brak dostępu (wtedy używamy systemowego aparatu)
export async function openCamera(handler) {
  onShot = handler; shots = 0;
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
  try { await v.play(); } catch {}
  const track = stream.getVideoTracks()[0];
  const caps = track.getCapabilities?.() || {};
  $("#cam-torch").hidden = !caps.torch; $("#cam-torch").setAttribute("aria-pressed", "false");
  // ciągły autofokus, jeśli telefon pozwala wybrać
  if (caps.focusMode?.includes("continuous")) track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
  render();
  return true;
}

export function closeCamera() {
  stream?.getTracks().forEach((t) => t.stop()); stream = null;
  for (const img of $("#cam-thumbs").querySelectorAll("img")) URL.revokeObjectURL(img.src);
  $("#cam-thumbs").innerHTML = "";
  $("#cam-video").srcObject = null;
  $("#cam").hidden = true; document.body.classList.remove("cam-open");
}

function render() {
  $("#cam-count").textContent = shots ? `Zdjęć: ${shots}` : "";
  $("#cam-done").textContent = shots ? "Gotowe" : "Zamknij";
  $("#cam-tip").textContent = shots
    ? "Dalsza część? Zrób kolejne zdjęcie z kawałkiem poprzedniej – czytam w tle."
    : "Paragon płasko, w całości na ekranie. Długi? Rób zdjęcia od góry do dołu.";
}

async function shoot() {
  const v = $("#cam-video");
  if (!stream || !v.videoWidth) return;
  const c = document.createElement("canvas");
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext("2d").drawImage(v, 0, 0);
  const flash = $("#cam-flash"); flash.classList.remove("on"); void flash.offsetWidth; flash.classList.add("on");
  navigator.vibrate?.(30);
  shots++; render();
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.92));
  const thumb = document.createElement("img"); thumb.src = URL.createObjectURL(blob); thumb.alt = `Zdjęcie ${shots}`;
  $("#cam-thumbs").append(thumb);
  onShot?.(new File([blob], `aparat-${Date.now()}.jpg`, { type: "image/jpeg", lastModified: Date.now() }));
}

$("#cam-shot").onclick = shoot;
$("#cam-done").onclick = closeCamera;
$("#cam-torch").onclick = (e) => {
  const on = e.currentTarget.getAttribute("aria-pressed") !== "true";
  stream?.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: on }] }).then(() => e.currentTarget.setAttribute("aria-pressed", String(on))).catch(() => {});
};
