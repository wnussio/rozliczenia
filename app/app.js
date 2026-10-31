// Rozliczenia – wspólne rachunki dwóch osób.
// Dane: Firebase Firestore (synchronizacja między telefonami, działa też offline).
// Skanowanie paragonów: Claude API, klucz zapisany tylko w danym telefonie.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, onSnapshot, setDoc, deleteDoc, getDoc,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const ANTHROPIC_SDK = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.134.0/+esm";
const MODEL = "claude-opus-5-5";

/* ---------- pomocnicze ---------- */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (g) => (g / 100).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";
const fmtIn = (g) => (g / 100).toFixed(2).replace(".", ",");
const parseMoney = (s) => { const n = parseFloat(String(s).replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const fmtDate = (s) => (s ? new Date(s + "T12:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" }) : "");
const LS = {
  get(k) { try { return localStorage.getItem("rozliczenia." + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem("rozliczenia." + k, v); } catch { /* brak pamięci */ } },
  del(k) { try { localStorage.removeItem("rozliczenia." + k); } catch { /* brak pamięci */ } },
};
function notice(sel, text, kind = "") { $(sel).innerHTML = text ? `<div class="notice ${kind}">${esc(text)}</div>` : ""; }

/* ---------- stan ---------- */
const DEFAULT_CONFIG = { people: ["Osoba 1", "Osoba 2"], options: [
  { id: "shared", label: "Wspólne", share: 50, fixed: true },
  { id: "p0", person: 0, share: 100, fixed: true },
  { id: "p1", person: 1, share: 0, fixed: true },
] };
let config = structuredClone(DEFAULT_CONFIG);
let receipts = [], payments = [];
let fs = null, household = null, unsubs = [];
let draft = null, quick = null, scanCtl = null;
const P = (i) => config.people[i] || (i ? "Osoba 2" : "Osoba 1");

/* ---------- logika podziału (share = % należący do osoby 1) ---------- */
const optById = (id) => config.options.find((o) => o.id === id) || config.options[0];
const optLabel = (o) => (o.person != null ? P(o.person) : o.label);
const optClass = (o) => (o.person === 0 ? "c-p0" : o.person === 1 ? "c-p1" : o.id === "shared" ? "c-sh" : "c-cx");
const pct = (o, who) => (who === 0 ? o.share : 100 - o.share);
const itemOwed = (it, payer) => Math.round((it.g || 0) * pct(optById(it.opt), 1 - payer) / 100);
const rOwed = (r) => (r.items || []).reduce((s, it) => s + itemOwed(it, r.payer), 0);
const rTotal = (r) => (r.items || []).reduce((s, it) => s + (it.g || 0), 0);
function balance() { // > 0: osoba 2 oddaje osobie 1
  let b = 0;
  for (const r of receipts) b += r.payer === 0 ? rOwed(r) : -rOwed(r);
  for (const p of payments) b += p.from === 1 ? -p.g : p.g;
  return b;
}

/* ---------- baza ---------- */
const hhDoc = () => doc(fs, "households", household);
const col = (name) => collection(fs, "households", household, name);
function write(promise, sel) {
  // Zapis trafia od razu do pamięci telefonu; do bazy wysyła się, gdy jest internet.
  promise.catch((e) => notice(sel, "Nie udało się zapisać w bazie: " + (e?.code || e?.message || e) + ". Sprawdź internet i spróbuj ponownie.", "bad"));
}
function newCode() {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}
const joinLink = () => location.origin + location.pathname + "#dolacz=" + household;

function subscribe() {
  unsubs.forEach((u) => u()); unsubs = [];
  const fail = (e) => notice("#home-notice", e?.code === "permission-denied"
    ? "Brak dostępu do tej bazy. Sprawdź link albo reguły bazy (INSTRUKCJA.txt)."
    : "Problem z połączeniem z bazą: " + (e?.code || e?.message || e), "bad");
  unsubs.push(onSnapshot(hhDoc(), (s) => {
    if (s.exists()) {
      const c = s.data();
      config = { people: c.people || DEFAULT_CONFIG.people, options: c.options?.length ? c.options : DEFAULT_CONFIG.options };
    }
    renderHome();
    if (!$("#v-edit").hidden) renderEditor();
    if (!$("#v-quick").hidden) renderQuick();
  }, fail));
  unsubs.push(onSnapshot(col("receipts"), (s) => { receipts = s.docs.map((d) => ({ id: d.id, ...d.data() })); renderHome(); }, fail));
  unsubs.push(onSnapshot(col("payments"), (s) => { payments = s.docs.map((d) => ({ id: d.id, ...d.data() })); renderHome(); }, fail));
}

/* ---------- widoki ---------- */
const VIEWS = ["missing", "start", "home", "quick", "edit", "settings"];
function show(view) {
  for (const v of VIEWS) $("#v-" + v).hidden = v !== view;
  $("#tabs").hidden = !["home", "settings"].includes(view);
  document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === view)));
  window.scrollTo(0, 0);
}
$("#tabs").onclick = (e) => {
  const v = e.target.closest("[data-view]")?.dataset.view; if (!v) return;
  if (v === "settings") renderSettings();
  show(v);
};

/* ---------- start: utwórz / dołącz ---------- */
function useHousehold(code) {
  household = code; LS.set("household", code);
  if (location.hash) history.replaceState(null, "", location.pathname);
  receipts = []; payments = [];
  subscribe(); show("home"); renderHome();
}
$("#btn-create").onclick = async () => {
  const code = newCode();
  $("#btn-create").disabled = true;
  household = code;
  const people = [$("#new-p0").value.trim() || DEFAULT_CONFIG.people[0], $("#new-p1").value.trim() || DEFAULT_CONFIG.people[1]];
  config = { ...structuredClone(DEFAULT_CONFIG), people };
  write(setDoc(hhDoc(), { ...config, createdAt: Date.now() }), "#home-notice");
  useHousehold(code);
  $("#btn-create").disabled = false;
};
$("#btn-join").onclick = async () => {
  const raw = $("#join-code").value.trim();
  const code = (raw.match(/dolacz=([a-z0-9]+)/i)?.[1] || raw).toLowerCase();
  if (code.length < 20) { notice("#start-notice", "To nie wygląda na kod bazy. Kod ma 24 znaki; najprościej otworzyć link od drugiej osoby.", "warn"); return; }
  $("#btn-join").disabled = true;
  try {
    household = code;
    const s = await getDoc(hhDoc());
    if (!s.exists()) { notice("#start-notice", "Nie ma bazy o takim kodzie. Sprawdź link.", "bad"); household = null; }
    else useHousehold(code);
  } catch (e) {
    if (e?.code === "unavailable") useHousehold(code); // offline: dołącz, sprawdzi się po połączeniu
    else { notice("#start-notice", "Nie udało się dołączyć: " + (e?.code || e?.message), "bad"); household = null; }
  }
  $("#btn-join").disabled = false;
};

/* ---------- ekran główny ---------- */
function renderHome() {
  const b = balance();
  if (b === 0) { $("#bal-who").textContent = "Jesteście kwita"; $("#bal-amt").textContent = fmt(0); $("#btn-settle").hidden = true; }
  else {
    const debtor = b > 0 ? 1 : 0;
    $("#bal-who").innerHTML = `<span class="who who-${debtor}">${esc(P(debtor))}</span> oddaje → <span class="who who-${1 - debtor}">${esc(P(1 - debtor))}</span>`;
    $("#bal-amt").textContent = fmt(Math.abs(b));
    $("#btn-settle").hidden = !$("#settle").hidden;
  }
  const entries = [
    ...receipts.map((r) => ({ k: "r", date: r.date || "", ts: r.createdAt || 0, r })),
    ...payments.map((p) => ({ k: "p", date: p.date || "", ts: p.createdAt || 0, p })),
  ].sort((a, c) => c.date.localeCompare(a.date) || c.ts - a.ts);
  if (!entries.length) {
    $("#list").innerHTML = `<div class="empty">Nic tu jeszcze nie ma.<br><b>📷 Paragon</b> – zeskanuj i przypisz pozycje.<br><b>+ Kwota</b> – wpisz wydatek bez paragonu.</div>`;
    return;
  }
  const months = new Map();
  for (const e of entries) { const m = e.date.slice(0, 7); if (!months.has(m)) months.set(m, []); months.get(m).push(e); }
  let html = "";
  for (const [m, list] of months) {
    const name = m ? new Date(m + "-01T12:00:00").toLocaleDateString("pl-PL", { month: "long", year: "numeric" }) : "Bez daty";
    const spent = list.filter((e) => e.k === "r").reduce((s, e) => s + rTotal(e.r), 0);
    html += `<div class="month"><div class="month-h"><h2>${esc(name)}</h2><span class="muted num small">wydane ${fmt(spent)}</span></div>`;
    for (const e of list) {
      if (e.k === "r") {
        const r = e.r, o = rOwed(r), other = 1 - r.payer;
        html += `<button type="button" class="card" data-rid="${esc(r.id)}">
          <div class="card-top"><strong>${esc(r.store || "Zakupy")}${r.quick ? "" : `<span class="tag">paragon</span>`}</strong><span class="num">${fmt(rTotal(r))}</span></div>
          <div class="card-sub"><span>${esc(fmtDate(r.date))} · płacił(a) <span class="who who-${r.payer}">${esc(P(r.payer))}</span></span>
          <span>${o ? `<span class="who who-${other}">${esc(P(other))}</span> oddaje <span class="num">${fmt(o)}</span>` : "nic do oddania"}</span></div></button>`;
      } else {
        const p = e.p;
        html += `<div class="card pay">
          <div class="card-top"><strong>Spłata: <span class="who who-${p.from}">${esc(P(p.from))}</span> → <span class="who who-${p.to}">${esc(P(p.to))}</span></strong><span class="num">${fmt(p.g)}</span></div>
          <div class="card-sub"><span>${esc(fmtDate(p.date))}</span><button type="button" class="btn danger small" data-delpay="${esc(p.id)}">Usuń</button></div></div>`;
      }
    }
    html += `</div>`;
  }
  $("#list").innerHTML = html;
}
$("#list").onclick = (e) => {
  const del = e.target.closest("[data-delpay]");
  if (del) {
    if (del.dataset.armed) write(deleteDoc(doc(col("payments"), del.dataset.delpay)), "#home-notice");
    else { del.dataset.armed = "1"; del.textContent = "Na pewno?"; }
    return;
  }
  const c = e.target.closest("[data-rid]");
  if (c) { const r = receipts.find((x) => x.id === c.dataset.rid); if (r) (r.quick ? openQuick(r) : openEditor(r)); }
};
$("#btn-settle").onclick = () => {
  const b = balance(), debtor = b > 0 ? 1 : 0;
  $("#settle-txt").innerHTML = `<span class="who who-${debtor}">${esc(P(debtor))}</span> oddał(a):`;
  $("#settle-amt").value = fmtIn(Math.abs(b));
  $("#settle").hidden = false; $("#btn-settle").hidden = true;
};
$("#settle-cancel").onclick = () => { $("#settle").hidden = true; renderHome(); };
$("#settle-ok").onclick = () => {
  const g = parseMoney($("#settle-amt").value); if (g <= 0) return;
  const from = balance() > 0 ? 1 : 0;
  write(setDoc(doc(col("payments")), { from, to: 1 - from, g, date: today(), createdAt: Date.now() }), "#home-notice");
  $("#settle").hidden = true; renderHome();
};
$("#btn-new").onclick = () => openEditor(null);
$("#btn-quick").onclick = () => openQuick(null);

/* ---------- kwota bez paragonu ---------- */
function chipsHtml(sel, attr) {
  return config.options.map((o) => `<button type="button" class="chip ${optClass(o)}" ${attr}="${esc(o.id)}" aria-pressed="${o.id === sel}">${esc(optLabel(o))}</button>`).join("");
}
function openQuick(r) {
  quick = r
    ? { id: r.id, createdAt: r.createdAt, payer: r.payer, desc: r.store || "", g: rTotal(r), opt: r.items?.[0]?.opt || "shared", date: r.date || today() }
    : { payer: 0, desc: "", g: 0, opt: "shared", date: today() };
  $("#q-title").textContent = r ? "Edytuj kwotę" : "Kwota bez paragonu";
  $("#q-amt").value = quick.g ? fmtIn(quick.g) : "";
  $("#q-desc").value = quick.desc; $("#q-date").value = quick.date;
  $("#q-del-wrap").hidden = !quick.id; $("#q-del").textContent = "Usuń wpis"; delete $("#q-del").dataset.armed;
  notice("#q-check", "");
  renderQuick(); show("quick");
  if (!r) setTimeout(() => $("#q-amt").focus(), 50);
}
function renderQuick() {
  $("#q-payer").innerHTML = [0, 1].map((i) => `<button type="button" class="p${i}" data-payer="${i}" aria-pressed="${quick.payer === i}">${esc(P(i))}</button>`).join("");
  $("#q-opts").innerHTML = chipsHtml(quick.opt, "data-opt");
  renderQuickOwe();
}
function renderQuickOwe() {
  const o = itemOwed({ g: quick.g, opt: quick.opt }, quick.payer), other = 1 - quick.payer;
  $("#q-owe").innerHTML = o ? `<span class="who who-${other}">${esc(P(other))}</span> oddaje <b class="num">${fmt(o)}</b>` : (quick.g ? "Nic do oddania" : "");
}
$("#q-payer").onclick = (e) => { const b = e.target.closest("[data-payer]"); if (!b) return; quick.payer = +b.dataset.payer; renderQuick(); };
$("#q-opts").onclick = (e) => { const b = e.target.closest("[data-opt]"); if (!b) return; quick.opt = b.dataset.opt; renderQuick(); };
$("#q-amt").oninput = (e) => { quick.g = parseMoney(e.target.value); renderQuickOwe(); };
$("#q-desc").oninput = (e) => { quick.desc = e.target.value; };
$("#q-date").oninput = (e) => { quick.date = e.target.value; };
$("#q-cancel").onclick = () => { quick = null; show("home"); renderHome(); };
$("#q-save").onclick = () => {
  if (!quick.g) { notice("#q-check", "Wpisz kwotę.", "bad"); return; }
  const desc = quick.desc.trim() || "Wydatek";
  const body = { quick: true, payer: quick.payer, store: desc, date: quick.date || today(), items: [{ name: desc, g: quick.g, opt: quick.opt }], createdAt: quick.createdAt || Date.now() };
  write(setDoc(quick.id ? doc(col("receipts"), quick.id) : doc(col("receipts")), body), "#home-notice");
  quick = null; show("home"); renderHome();
};
$("#q-del").onclick = () => {
  const b = $("#q-del");
  if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Na pewno usunąć? Stuknij jeszcze raz"; return; }
  write(deleteDoc(doc(col("receipts"), quick.id)), "#home-notice");
  quick = null; show("home"); renderHome();
};

/* ---------- paragon ---------- */
function openEditor(r) {
  draft = r ? structuredClone({ ...r }) : { payer: 0, store: "", date: today(), items: [], scannedTotal: null };
  draft.items = draft.items || [];
  draft.defOpt = "shared";
  $("#ed-store").value = draft.store || ""; $("#ed-date").value = draft.date || today();
  $("#ed-del-wrap").hidden = !draft.id; $("#btn-del").textContent = "Usuń paragon"; delete $("#btn-del").dataset.armed;
  $("#scan-status").textContent = LS.get("apiKey")
    ? "Zrób zdjęcie paragonu, a pozycje wpiszą się same. Możesz też dodać je ręcznie."
    : "Żeby skanować, dodaj klucz API w Ustawieniach. Pozycje możesz też wpisać ręcznie.";
  if (!draft.items.length) draft.items.push({ name: "", g: 0, opt: "shared" });
  renderEditor(); show("edit");
}
function renderEditor() {
  $("#payer").innerHTML = [0, 1].map((i) => `<button type="button" class="p${i}" data-payer="${i}" aria-pressed="${draft.payer === i}">${esc(P(i))}</button>`).join("");
  $("#bulk").innerHTML = chipsHtml(null, "data-bulk");
  $("#items").innerHTML = draft.items.map((it, i) => `
    <div class="item" data-i="${i}">
      <div class="item-top">
        <input class="it-name" id="it-name-${i}" value="${esc(it.name)}" placeholder="Nazwa" aria-label="Nazwa pozycji">
        <input class="it-price" id="it-price-${i}" value="${it.g ? fmtIn(it.g) : ""}" inputmode="decimal" placeholder="0,00" aria-label="Cena">
        <button type="button" class="x" data-delitem aria-label="Usuń pozycję">×</button>
      </div>
      <div class="chips">${chipsHtml(it.opt, "data-opt")}<span class="owe num" id="owe-${i}"></span></div>
    </div>`).join("");
  renderTotals();
}
function renderTotals() {
  const other = 1 - draft.payer;
  draft.items.forEach((it, i) => { const o = itemOwed(it, draft.payer); const el = $("#owe-" + i); if (el) el.textContent = o ? `oddaje ${fmt(o)}` : ""; });
  const total = rTotal(draft), owed = rOwed(draft);
  $("#bar-total").textContent = fmt(total);
  $("#bar-owe").innerHTML = owed ? `<span class="who who-${other}">${esc(P(other))}</span> oddaje <span class="num">${fmt(owed)}</span>` : "Nic do oddania";
  const groups = new Map();
  for (const it of draft.items) { if (!it.g) continue; const o = optById(it.opt); groups.set(o, (groups.get(o) || 0) + it.g); }
  $("#groups").innerHTML = [...groups].map(([o, g]) => `<span><b style="color:var(--${optClass(o).slice(2)})">${esc(optLabel(o))}</b> <span class="num">${fmt(g)}</span></span>`).join("");
  if (draft.scannedTotal != null && draft.scannedTotal !== total)
    $("#ed-check").innerHTML = `<div class="notice warn">SUMA PLN na paragonie: <span class="num">${fmt(draft.scannedTotal)}</span>, a pozycje dają <span class="num">${fmt(total)}</span>. Sprawdź ceny.</div>`;
  else if (draft.scannedTotal != null) $("#ed-check").innerHTML = `<div class="notice">Zgadza się z SUMA PLN na paragonie ✓</div>`;
  else $("#ed-check").innerHTML = "";
}
$("#payer").onclick = (e) => { const b = e.target.closest("[data-payer]"); if (!b) return; draft.payer = +b.dataset.payer; renderEditor(); };
$("#bulk").onclick = (e) => { const b = e.target.closest("[data-bulk]"); if (!b) return; draft.defOpt = b.dataset.bulk; draft.items.forEach((it) => { it.opt = b.dataset.bulk; }); renderEditor(); };
$("#items").onclick = (e) => {
  const row = e.target.closest(".item"); if (!row) return; const i = +row.dataset.i;
  if (e.target.closest("[data-delitem]")) { draft.items.splice(i, 1); renderEditor(); return; }
  const c = e.target.closest("[data-opt]");
  if (c) { draft.items[i].opt = c.dataset.opt; row.querySelectorAll("[data-opt]").forEach((x) => x.setAttribute("aria-pressed", String(x === c))); renderTotals(); }
};
$("#items").oninput = (e) => {
  const row = e.target.closest(".item"); if (!row) return; const it = draft.items[+row.dataset.i];
  if (e.target.classList.contains("it-name")) it.name = e.target.value;
  else if (e.target.classList.contains("it-price")) { it.g = parseMoney(e.target.value); renderTotals(); }
};
$("#btn-add-item").onclick = () => { draft.items.push({ name: "", g: 0, opt: draft.defOpt || "shared" }); renderEditor(); $("#it-name-" + (draft.items.length - 1))?.focus(); };
$("#ed-store").oninput = (e) => { draft.store = e.target.value; };
$("#ed-date").oninput = (e) => { draft.date = e.target.value; };
$("#btn-cancel").onclick = () => { scanCtl?.abort(); draft = null; show("home"); renderHome(); };
$("#btn-save").onclick = () => {
  const items = draft.items.filter((it) => it.g).map((it) => ({ name: (it.name || "").trim() || "Pozycja", g: it.g, opt: it.opt }));
  if (!items.length) { $("#ed-check").innerHTML = `<div class="notice bad">Dodaj przynajmniej jedną pozycję z ceną.</div>`; return; }
  const body = { payer: draft.payer, store: (draft.store || "").trim(), date: draft.date || today(), items, scannedTotal: draft.scannedTotal ?? null, createdAt: draft.createdAt || Date.now() };
  scanCtl?.abort();
  write(setDoc(draft.id ? doc(col("receipts"), draft.id) : doc(col("receipts")), body), "#home-notice");
  draft = null; show("home"); renderHome();
};
$("#btn-del").onclick = () => {
  const b = $("#btn-del");
  if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Na pewno usunąć? Stuknij jeszcze raz"; return; }
  write(deleteDoc(doc(col("receipts"), draft.id)), "#home-notice");
  draft = null; show("home"); renderHome();
};

/* ---------- skanowanie (Claude API) ---------- */
const SCAN_PROMPT = `Na zdjęciu jest polski paragon fiskalny. Odczytaj kupione pozycje.
Zwróć wyłącznie JSON w tym kształcie, bez żadnego innego tekstu:
{"store": "nazwa sklepu albo null", "date": "RRRR-MM-DD albo null", "total": 123.45, "items": [{"name": "Mleko UHT 3,2% 1L", "price": 3.49}]}
Zasady:
- price to końcowa kwota za pozycję w złotych (ilość × cena jednostkowa), po odjęciu rabatów. Linie typu RABAT, OPUST, PROMOCJA odejmij od pozycji nad nimi, nie dodawaj ich osobno.
- Pomiń linie PTU, SPRZEDAŻ OPODATKOWANA, SUMA, płatność kartą/gotówką, resztę, numery NIP.
- Kaucję za butelki zostaw jako osobną pozycję.
- Nazwy zapisz czytelnie po polsku (rozwiń oczywiste skróty, zwykła wielkość liter).
- total to kwota SUMA PLN z paragonu albo null.`;

async function shrinkImage(file) {
  // Zdjęcia z telefonu mają po kilka MB; zmniejszamy dłuższy bok do 2000 px (paragon dalej czytelny).
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", 0.85);
  return url.slice(url.indexOf(",") + 1);
}
function parseJson(text) {
  try { return JSON.parse(text); } catch { /* dalej */ }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* dalej */ } }
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(text.slice(a, b + 1));
  throw new Error("brak JSON");
}
async function scan(file) {
  const apiKey = LS.get("apiKey");
  if (!apiKey) { $("#scan-status").textContent = "Najpierw dodaj klucz API w Ustawieniach."; return; }
  if (!navigator.onLine) { $("#scan-status").textContent = "Skanowanie wymaga internetu. Pozycje możesz wpisać ręcznie."; return; }
  scanCtl = new AbortController();
  $("#btn-scan").disabled = $("#btn-gallery").disabled = true; $("#btn-scan-stop").hidden = false;
  $("#scan-status").textContent = "Czytam paragon… zwykle 10–40 sekund.";
  try {
    const data = await shrinkImage(file);
    const { default: Anthropic } = await import(ANTHROPIC_SDK);
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    const msg = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data } },
        { type: "text", text: SCAN_PROMPT },
      ] }],
    }, { signal: scanCtl.signal });
    if (msg.stop_reason === "refusal") throw { code: "refusal" };
    const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const res = parseJson(text);
    const parsed = (Array.isArray(res?.items) ? res.items : [])
      .map((x) => ({ name: String(x?.name ?? "").trim(), g: Math.round(Number(x?.price) * 100) || 0, opt: draft.defOpt || "shared" }))
      .filter((x) => x.g);
    if (!parsed.length) throw { code: "empty" };
    draft.items = draft.items.filter((it) => it.g || it.name).concat(parsed);
    if (res.store && !draft.store) { draft.store = String(res.store); $("#ed-store").value = draft.store; }
    if (/^\d{4}-\d{2}-\d{2}$/.test(res.date || "")) { draft.date = res.date; $("#ed-date").value = res.date; }
    draft.scannedTotal = res.total != null && Number.isFinite(Number(res.total)) ? Math.round(Number(res.total) * 100) : null;
    $("#scan-status").textContent = `Wczytano ${parsed.length} pozycji. Przypisz je poniżej.`;
    renderEditor();
  } catch (err) {
    if (!draft) return;
    const s = err?.status;
    let m = "Coś poszło nie tak przy skanowaniu. Spróbuj ponownie albo wpisz pozycje ręcznie.";
    if (err?.name === "AbortError" || err?.constructor?.name === "APIUserAbortError") m = "Przerwano.";
    else if (err?.code === "empty") m = "Nie znalazłem pozycji na zdjęciu. Zrób wyraźniejsze zdjęcie, z całym paragonem w kadrze.";
    else if (err?.code === "refusal") m = "Claude odmówił odczytania tego zdjęcia. Spróbuj innego zdjęcia.";
    else if (s === 401) m = "Klucz API jest nieprawidłowy. Popraw go w Ustawieniach.";
    else if (s === 400 && /credit/i.test(err?.message || "")) m = "Brak środków na koncie Anthropic. Doładuj je na console.anthropic.com.";
    else if (s === 429) m = "Za dużo skanów naraz. Spróbuj za minutę.";
    else if (s >= 500) m = "Serwer Claude jest chwilowo przeciążony. Spróbuj za chwilę.";
    else if (err?.message === "brak JSON" || err instanceof SyntaxError) m = "Nie udało się odczytać odpowiedzi. Spróbuj jeszcze raz.";
    else if (!navigator.onLine) m = "Brak internetu.";
    $("#scan-status").textContent = m;
  } finally {
    $("#btn-scan").disabled = $("#btn-gallery").disabled = false; $("#btn-scan-stop").hidden = true;
  }
}
$("#btn-scan").onclick = () => $("#scan-file").click();
$("#btn-gallery").onclick = () => $("#scan-gallery").click();
$("#btn-scan-stop").onclick = () => scanCtl?.abort();
for (const id of ["#scan-file", "#scan-gallery"]) {
  $(id).onchange = (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) scan(f); };
}

/* ---------- ustawienia ---------- */
let setDraft = null;
function renderSettings() {
  setDraft = structuredClone(config);
  $("#set-p0").value = setDraft.people[0]; $("#set-p1").value = setDraft.people[1];
  $("#hh-code").textContent = joinLink();
  $("#api-key").value = LS.get("apiKey") ? "••••••••••••" : "";
  notice("#set-notice", ""); notice("#key-notice", "");
  renderOpts();
}
function renderOpts() {
  $("#set-p0-name").textContent = setDraft.people[0] || "Osoba 1";
  const name = (o) => (o.person != null ? (setDraft.people[o.person] || "") : o.label);
  $("#opt-fixed").innerHTML = setDraft.options.filter((o) => o.fixed).map((o) =>
    `<div class="opt-fixed"><span>${esc(name(o))}</span><span class="muted num">${o.share}% / ${100 - o.share}%</span></div>`).join("");
  $("#opt-custom").innerHTML = setDraft.options.map((o, i) => (o.fixed ? "" :
    `<div class="opt-row" data-i="${i}"><input id="opt-l-${i}" value="${esc(o.label)}" placeholder="np. Dom 60/40" aria-label="Nazwa wyboru">
     <input id="opt-s-${i}" value="${o.share}" inputmode="numeric" aria-label="Procent osoby 1" class="num">
     <button type="button" class="x" data-delopt aria-label="Usuń wybór">×</button></div>`)).join("");
}
$("#set-p0").oninput = (e) => { setDraft.people[0] = e.target.value; renderOpts(); };
$("#set-p1").oninput = (e) => { setDraft.people[1] = e.target.value; };
$("#opt-custom").oninput = (e) => {
  const row = e.target.closest(".opt-row"); if (!row) return; const o = setDraft.options[+row.dataset.i];
  if (e.target.id.startsWith("opt-l")) o.label = e.target.value;
  else o.share = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));
};
$("#opt-custom").onclick = (e) => { const b = e.target.closest("[data-delopt]"); if (!b) return; setDraft.options.splice(+b.closest(".opt-row").dataset.i, 1); renderOpts(); };
$("#btn-add-opt").onclick = () => { setDraft.options.push({ id: "o" + Date.now().toString(36), label: "", share: 50 }); renderOpts(); };
$("#btn-save-set").onclick = () => {
  setDraft.people = setDraft.people.map((p, i) => p.trim() || DEFAULT_CONFIG.people[i]);
  setDraft.options = setDraft.options.filter((o) => o.fixed || o.label.trim()).map((o) => (o.fixed ? o : { ...o, label: o.label.trim() }));
  write(setDoc(hhDoc(), { people: setDraft.people, options: setDraft.options }, { merge: true }), "#set-notice");
  notice("#set-notice", "Zapisano.");
};
$("#btn-share").onclick = async () => {
  try { await navigator.share({ title: "Rozliczenia", text: "Dołącz do naszych wspólnych rozliczeń:", url: joinLink() }); }
  catch (e) { if (e?.name !== "AbortError") $("#btn-copy").click(); }
};
$("#btn-copy").onclick = async () => {
  try { await navigator.clipboard.writeText(joinLink()); notice("#set-notice", "Link skopiowany."); }
  catch { const r = document.createRange(); r.selectNodeContents($("#hh-code")); getSelection().removeAllRanges(); getSelection().addRange(r); notice("#set-notice", "Zaznaczyłem link – skopiuj go ręcznie."); }
};
$("#btn-save-key").onclick = () => {
  const v = $("#api-key").value.trim();
  if (v.startsWith("•")) { notice("#key-notice", "Klucz jest już zapisany."); return; }
  if (!v.startsWith("sk-ant-")) { notice("#key-notice", "Klucz API zaczyna się od sk-ant-. Skopiuj go z console.anthropic.com.", "warn"); return; }
  LS.set("apiKey", v); $("#api-key").value = "••••••••••••"; notice("#key-notice", "Klucz zapisany w tym telefonie.");
};
$("#btn-clear-key").onclick = () => { LS.del("apiKey"); $("#api-key").value = ""; notice("#key-notice", "Klucz usunięty z tego telefonu."); };
$("#btn-leave").onclick = () => {
  const b = $("#btn-leave");
  if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Na pewno? Stuknij jeszcze raz"; return; }
  unsubs.forEach((u) => u()); unsubs = []; LS.del("household"); household = null;
  b.textContent = "Odłącz od bazy"; delete b.dataset.armed; show("start");
};

/* ---------- online / offline ---------- */
function renderStatus() {
  const st = $("#status");
  st.textContent = navigator.onLine ? "" : "offline – zapisy wyślą się po połączeniu";
  st.classList.toggle("off", !navigator.onLine);
}
addEventListener("online", renderStatus); addEventListener("offline", renderStatus);

/* ---------- aktualizacje aplikacji (service worker) ---------- */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").then((reg) => {
    const offer = (w) => { $("#update-banner").hidden = false; $("#update-btn").onclick = () => w.postMessage("aktualizuj"); };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) offer(w); });
    });
  }).catch(() => { /* bez trybu offline */ });
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloaded) { reloaded = true; location.reload(); } });
}

/* ---------- start ---------- */
(async () => {
  renderStatus();
  const hashCode = location.hash.match(/dolacz=([a-z0-9]+)/i)?.[1]?.toLowerCase();
  if (!firebaseConfig?.apiKey || firebaseConfig.apiKey.startsWith("WKLEJ")) { show("missing"); return; }
  const app = initializeApp(firebaseConfig);
  fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  const auth = getAuth(app);
  try {
    const user = await new Promise((res) => { const un = onAuthStateChanged(auth, (u) => { un(); res(u); }); });
    if (!user) await signInAnonymously(auth);
  } catch (e) {
    show("start");
    notice("#start-notice", "Nie udało się połączyć z bazą (" + (e?.code || e?.message) + "). Sprawdź internet; przy pierwszym uruchomieniu jest potrzebny.", "bad");
    return;
  }
  const saved = LS.get("household");
  if (hashCode && hashCode !== saved) {
    show("start"); $("#join-code").value = hashCode;
    notice("#start-notice", saved ? "Ten telefon jest podłączony do innej bazy. Stuknij Dołącz, żeby przełączyć się na bazę z linku." : "Stuknij Dołącz, żeby połączyć się ze wspólną bazą.");
    return;
  }
  if (saved) useHousehold(saved); else show("start");
})();
