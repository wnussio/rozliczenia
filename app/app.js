// Rozliczenia – wspólne rachunki dwóch osób. Wszystko zostaje w telefonie:
// dane w pamięci przeglądarki (localStorage), paragony czyta OCR w telefonie (Tesseract.js),
// między telefonami dane przenosi się plikiem (opcjonalnie zaszyfrowanym hasłem).
import { parseReceipt } from "./parser.js";
import { readReceipt, setProgress, terminate, workerReady, ocrState } from "./ocr.js";
let scanToken = 0;

/* ---------- pomocnicze ---------- */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (g) => (g / 100).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";
const fmtIn = (g) => (g / 100).toFixed(2).replace(".", ",");
const parseMoney = (s) => { const n = parseFloat(String(s).replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const fmtDate = (s) => (s ? new Date(s + "T12:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" }) : "");
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const LS = {
  get(k) { try { return localStorage.getItem("rozliczenia." + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem("rozliczenia." + k, v); } catch { /* brak miejsca */ } },
};
function notice(sel, text, kind = "") { $(sel).innerHTML = text ? `<div class="notice ${kind}">${esc(text)}</div>` : ""; }
function armed(btn, label) { // potwierdzenie drugim stuknięciem
  if (btn.dataset.armed) return true;
  btn.dataset.armed = "1"; btn.dataset.label = btn.textContent; btn.textContent = label;
  setTimeout(() => { if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; } }, 4000);
  return false;
}
function disarm(btn) { if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; } }

/* ---------- dane ---------- */
const KEY = "rozliczenia.dane";
const DEFAULT_CONFIG = { people: ["Osoba 1", "Osoba 2"], options: [
  { id: "shared", label: "Wspólne", share: 50, fixed: true },
  { id: "p0", person: 0, share: 100, fixed: true },
  { id: "p1", person: 1, share: 0, fixed: true },
], updatedAt: 0 };
let db = load();
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.entries) return { config: s.config || structuredClone(DEFAULT_CONFIG), entries: s.entries, deleted: s.deleted || {} };
  } catch { /* pusto */ }
  return { config: structuredClone(DEFAULT_CONFIG), entries: {}, deleted: {} };
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
  catch (e) { notice("#home-notice", "Nie udało się zapisać w pamięci telefonu (" + e.name + "). Zrób kopię zapasową w Ustawieniach.", "bad"); return false; }
}
const entries = () => Object.values(db.entries);
function putEntry(e) { e.updatedAt = Date.now(); db.entries[e.id] = e; persist(); }
function removeEntries(ids) { const t = Date.now(); for (const id of ids) { delete db.entries[id]; db.deleted[id] = t; } persist(); }
navigator.storage?.persist?.().catch(() => {}); // prośba, żeby przeglądarka nie czyściła danych

/* ---------- logika podziału (share = % należący do osoby 1) ---------- */
const cfg = () => db.config;
const P = (i) => cfg().people[i] || (i ? "Osoba 2" : "Osoba 1");
const optById = (id) => cfg().options.find((o) => o.id === id) || cfg().options[0];
const optLabel = (o) => (o.person != null ? P(o.person) : o.label);
const optClass = (o) => (o.person === 0 ? "c-p0" : o.person === 1 ? "c-p1" : o.id === "shared" ? "c-sh" : "c-cx");
const pct = (o, who) => (who === 0 ? o.share : 100 - o.share);
const itemOwed = (it, payer) => Math.round((it.g || 0) * pct(optById(it.opt), 1 - payer) / 100);
const rOwed = (r) => (r.items || []).reduce((s, it) => s + itemOwed(it, r.payer), 0);
const rTotal = (r) => (r.items || []).reduce((s, it) => s + (it.g || 0), 0);
const signed = (r) => (r.payer === 0 ? rOwed(r) : -rOwed(r)); // > 0: osoba 2 oddaje osobie 1
const balanceOf = (list) => list.filter((r) => !r.settled).reduce((s, r) => s + signed(r), 0);
function oweHtml(b) {
  if (!b) return "nic do oddania";
  const d = b > 0 ? 1 : 0;
  return `<span class="who who-${d}">${esc(P(d))}</span> oddaje <span class="num">${fmt(Math.abs(b))}</span>`;
}
const groupNames = () => [...new Set(entries().map((e) => (e.group || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pl"));

/* ---------- widoki ---------- */
function show(view) {
  for (const v of ["home", "quick", "edit", "settings"]) $("#v-" + v).hidden = v !== view;
  $("#tabs").hidden = !["home", "settings"].includes(view);
  document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === view)));
  if (view !== "home") exitSelect();
  window.scrollTo(0, 0);
}
$("#tabs").onclick = (e) => {
  const v = e.target.closest("[data-view]")?.dataset.view; if (!v) return;
  if (v === "settings") renderSettings(); else renderHome();
  show(v);
};
function goHome() { show("home"); renderHome(); }

/* ---------- ekran główny ---------- */
let filter = LS.get("filter") || "open";
let groupBy = LS.get("groupBy") || "month";
let selecting = false;
const selected = new Set();

function renderHome() {
  const all = entries();
  const b = balanceOf(all);
  if (!b) { $("#bal-who").textContent = all.some((e) => !e.settled) ? "Nic do oddania" : "Jesteście kwita"; $("#bal-amt").textContent = fmt(0); }
  else {
    const d = b > 0 ? 1 : 0;
    $("#bal-who").innerHTML = `<span class="who who-${d}">${esc(P(d))}</span> oddaje → <span class="who who-${1 - d}">${esc(P(1 - d))}</span>`;
    $("#bal-amt").textContent = fmt(Math.abs(b));
  }
  $("#btn-settle-pick").hidden = !all.some((e) => !e.settled) || selecting;
  document.querySelectorAll("#f-filter button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.f === filter)));
  document.querySelectorAll("#f-group button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.g === groupBy)));
  $("#btn-select").textContent = selecting ? "Zakończ" : "Zaznacz";
  $("#groups-list").innerHTML = groupNames().map((g) => `<option value="${esc(g)}">`).join("");

  const list = all
    .filter((e) => (filter === "open" ? !e.settled : filter === "done" ? e.settled : true))
    .sort((a, c) => (c.date || "").localeCompare(a.date || "") || (c.createdAt || 0) - (a.createdAt || 0));
  if (!list.length) {
    $("#list").innerHTML = all.length
      ? `<div class="empty">${filter === "open" ? "Wszystko rozliczone ✓" : "Brak wpisów w tym widoku."}</div>`
      : `<div class="empty">Nic tu jeszcze nie ma.<br><b>📷 Paragon</b>: zeskanuj i przypisz pozycje.<br><b>+ Kwota</b>: wydatek bez paragonu.</div>`;
    renderSelbar(); return;
  }
  const sections = new Map();
  for (const e of list) {
    const k = groupBy === "group" ? (e.group || "").trim() : (e.date || "").slice(0, 7);
    if (!sections.has(k)) sections.set(k, []);
    sections.get(k).push(e);
  }
  let keys = [...sections.keys()];
  if (groupBy === "group") keys = keys.filter(Boolean).concat(keys.includes("") ? [""] : []);
  let html = "";
  for (const k of keys) {
    const items = sections.get(k);
    const title = groupBy === "group" ? (k || "Bez grupy")
      : (k ? new Date(k + "-01T12:00:00").toLocaleDateString("pl-PL", { month: "long", year: "numeric" }) : "Bez daty");
    const sb = balanceOf(items);
    const right = selecting
      ? `<button type="button" class="link" data-selsec="${esc(k)}">Zaznacz wszystkie</button>`
      : groupBy === "group" ? `<span class="small">${sb ? oweHtml(sb) : ""}</span>`
      : `<span class="muted num small">wydane ${fmt(items.reduce((s, e) => s + rTotal(e), 0))}</span>`;
    html += `<div class="month"><div class="month-h"><h2>${esc(title)}</h2>${right}</div>`;
    for (const r of items) {
      const o = rOwed(r), other = 1 - r.payer, sel = selected.has(r.id);
      html += `<div class="card${r.settled ? " done" : ""}${sel ? " sel" : ""}" data-id="${esc(r.id)}" role="button" tabindex="0">
        ${selecting ? `<span class="tick" aria-hidden="true">${sel ? "✓" : ""}</span>` : ""}
        <div class="card-body">
          <div class="card-top"><strong>${esc(r.store || "Zakupy")}${r.group && groupBy !== "group" ? `<span class="tag">${esc(r.group)}</span>` : ""}</strong><span class="num">${fmt(rTotal(r))}</span></div>
          <div class="card-sub"><span>${esc(fmtDate(r.date))} · płacił(a) <span class="who who-${r.payer}">${esc(P(r.payer))}</span></span>
          <span>${r.settled ? "rozliczone ✓" : o ? `<span class="who who-${other}">${esc(P(other))}</span> oddaje <span class="num">${fmt(o)}</span>` : "nic do oddania"}</span></div>
        </div></div>`;
    }
    html += `</div>`;
  }
  $("#list").innerHTML = html;
  renderSelbar();
}
$("#f-filter").onclick = (e) => { const f = e.target.closest("[data-f]")?.dataset.f; if (!f) return; filter = f; LS.set("filter", f); renderHome(); };
$("#f-group").onclick = (e) => { const g = e.target.closest("[data-g]")?.dataset.g; if (!g) return; groupBy = g; LS.set("groupBy", g); renderHome(); };
$("#list").onclick = (e) => {
  const sec = e.target.closest("[data-selsec]");
  if (sec) {
    const k = sec.dataset.selsec;
    sec.closest(".month").querySelectorAll("[data-id]").forEach((c) => selected.add(c.dataset.id));
    void k; renderHome(); return;
  }
  const c = e.target.closest("[data-id]"); if (!c) return;
  const id = c.dataset.id;
  if (selecting) { selected.has(id) ? selected.delete(id) : selected.add(id); renderHome(); return; }
  const r = db.entries[id]; if (r) (r.quick ? openQuick(r) : openEditor(r));
};
$("#list").onkeydown = (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-id]")) { e.preventDefault(); e.target.click(); } };

/* ---------- zaznaczanie: rozlicz / usuń wybrane ---------- */
function enterSelect(preselectOpen) {
  selecting = true; selected.clear();
  if (preselectOpen) { if (filter === "done") { filter = "open"; LS.set("filter", "open"); } entries().filter((e) => !e.settled).forEach((e) => selected.add(e.id)); }
  renderHome();
}
function exitSelect() { if (!selecting) return; selecting = false; selected.clear(); $("#selbar").hidden = true; renderHome(); }
function renderSelbar() {
  $("#selbar").hidden = !selecting;
  if (!selecting) return;
  const sel = [...selected].map((id) => db.entries[id]).filter(Boolean);
  $("#sel-count").textContent = `Zaznaczone: ${sel.length}`;
  $("#sel-owe").innerHTML = sel.length ? oweHtml(balanceOf(sel)) : "Stuknij wpisy, żeby je zaznaczyć";
  $("#sel-settle").disabled = !sel.some((e) => !e.settled);
  $("#sel-unsettle").hidden = !sel.some((e) => e.settled);
  $("#sel-del").disabled = !sel.length;
  disarm($("#sel-del"));
}
$("#btn-select").onclick = () => (selecting ? exitSelect() : enterSelect(false));
$("#btn-settle-pick").onclick = () => enterSelect(true);
$("#sel-cancel").onclick = exitSelect;
$("#sel-settle").onclick = () => {
  const t = Date.now();
  for (const id of selected) { const e = db.entries[id]; if (e && !e.settled) { e.settled = true; e.settledAt = t; e.updatedAt = t; } }
  persist(); const n = selected.size; exitSelect(); notice("#home-notice", `Oznaczono jako rozliczone: ${n}.`);
};
$("#sel-unsettle").onclick = () => {
  const t = Date.now();
  for (const id of selected) { const e = db.entries[id]; if (e && e.settled) { e.settled = false; delete e.settledAt; e.updatedAt = t; } }
  persist(); exitSelect(); notice("#home-notice", "Cofnięto rozliczenie zaznaczonych wpisów.");
};
$("#sel-del").onclick = () => {
  const b = $("#sel-del");
  if (!armed(b, `Usunąć ${selected.size}? Stuknij ponownie`)) return;
  const n = selected.size; removeEntries([...selected]); exitSelect(); notice("#home-notice", `Usunięto wpisy: ${n}.`);
};
$("#btn-new").onclick = () => openEditor(null);
$("#btn-quick").onclick = () => openQuick(null);

/* ---------- kwota bez paragonu ---------- */
let quick = null;
function chipsHtml(sel, attr) {
  return cfg().options.map((o) => `<button type="button" class="chip ${optClass(o)}" ${attr}="${esc(o.id)}" aria-pressed="${o.id === sel}">${esc(optLabel(o))}</button>`).join("");
}
function openQuick(r) {
  quick = r
    ? { ...structuredClone(r), g: rTotal(r), opt: r.items?.[0]?.opt || "shared", desc: r.store || "" }
    : { id: null, payer: 0, desc: "", g: 0, opt: "shared", date: today(), group: "", settled: false };
  $("#q-title").textContent = r ? "Edytuj kwotę" : "Kwota bez paragonu";
  $("#q-amt").value = quick.g ? fmtIn(quick.g) : "";
  $("#q-desc").value = quick.desc; $("#q-date").value = quick.date || today();
  $("#q-group").value = quick.group || ""; $("#q-settled").checked = !!quick.settled;
  $("#q-del-wrap").hidden = !quick.id; disarm($("#q-del"));
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
$("#q-cancel").onclick = () => { quick = null; goHome(); };
$("#q-save").onclick = () => {
  const g = parseMoney($("#q-amt").value);
  if (!g) { notice("#q-check", "Wpisz kwotę.", "bad"); return; }
  const desc = $("#q-desc").value.trim() || "Wydatek";
  const settled = $("#q-settled").checked;
  putEntry({
    id: quick.id || newId(), quick: true, payer: quick.payer, store: desc, date: $("#q-date").value || today(),
    group: $("#q-group").value.trim(), items: [{ name: desc, g, opt: quick.opt }],
    settled, ...(settled ? { settledAt: quick.settledAt || Date.now() } : {}), createdAt: quick.createdAt || Date.now(),
  });
  quick = null; goHome();
};
$("#q-del").onclick = () => {
  if (!armed($("#q-del"), "Na pewno usunąć? Stuknij jeszcze raz")) return;
  removeEntries([quick.id]); quick = null; goHome();
};

/* ---------- paragon ---------- */
let draft = null;
function openEditor(r) {
  draft = r ? structuredClone(r) : { id: null, payer: 0, store: "", date: today(), group: "", items: [], scannedTotal: null, settled: false };
  draft.items = draft.items || [];
  draft.defOpt = "shared";
  $("#ed-store").value = draft.store || ""; $("#ed-date").value = draft.date || today();
  $("#ed-group").value = draft.group || ""; $("#ed-settled").checked = !!draft.settled;
  $("#ed-del-wrap").hidden = !draft.id; disarm($("#btn-del"));
  $("#paste-box").hidden = true; $("#raw-box").hidden = true;
  $("#scan-status").textContent = "Paragon czyta telefon, zdjęcie nigdzie nie jest wysyłane. Pozycje możesz też dodać ręcznie.";
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
    $("#ed-check").innerHTML = `<div class="notice warn">SUMA PLN na paragonie: <span class="num">${fmt(draft.scannedTotal)}</span>, a pozycje dają <span class="num">${fmt(total)}</span>. Różnica <span class="num">${fmt(Math.abs(draft.scannedTotal - total))}</span>: sprawdź ceny albo dodaj brakującą pozycję.</div>`;
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
$("#btn-cancel").onclick = () => { stopScan(); draft = null; goHome(); };
$("#btn-save").onclick = () => {
  const items = draft.items.filter((it) => it.g).map((it) => ({ name: (it.name || "").trim() || "Pozycja", g: it.g, opt: it.opt }));
  if (!items.length) { $("#ed-check").innerHTML = `<div class="notice bad">Dodaj przynajmniej jedną pozycję z ceną.</div>`; return; }
  stopScan();
  const settled = $("#ed-settled").checked;
  putEntry({
    id: draft.id || newId(), payer: draft.payer, store: $("#ed-store").value.trim(), date: $("#ed-date").value || today(),
    group: $("#ed-group").value.trim(), items, scannedTotal: draft.scannedTotal ?? null,
    settled, ...(settled ? { settledAt: draft.settledAt || Date.now() } : {}), createdAt: draft.createdAt || Date.now(),
  });
  draft = null; goHome();
};
$("#btn-del").onclick = () => {
  if (!armed($("#btn-del"), "Na pewno usunąć? Stuknij jeszcze raz")) return;
  removeEntries([draft.id]); draft = null; goHome();
};

/* ---------- odczyt paragonu w telefonie (Tesseract.js, pliki w vendor/) ---------- */
function applyParsed(text) {
  const res = parseReceipt(text);
  $("#raw-text").value = text; $("#raw-box").hidden = false;
  if (!res.items.length) { $("#scan-status").textContent = "Nie rozpoznałem pozycji. Zrób zdjęcie z bliska, płasko, w dobrym świetle (długi paragon: w dwóch częściach) albo popraw odczytany tekst poniżej."; return; }
  const parsed = res.items.map((x) => ({ name: x.name, g: x.g, opt: draft.defOpt || "shared", scan: true }));
  draft.items = draft.items.filter((it) => !it.scan && (it.g || it.name)).concat(parsed);
  if (res.store && !$("#ed-store").value.trim()) $("#ed-store").value = res.store;
  if (res.date) $("#ed-date").value = res.date;
  draft.scannedTotal = res.total;
  $("#scan-status").textContent = `Rozpoznano ${parsed.length} pozycji. Sprawdź nazwy i ceny, potem przypisz je poniżej.`;
  renderEditor();
}
function stopScan() {
  scanToken++;
  if (workerReady() && !$("#btn-scan-stop").hidden) terminate();
  $("#btn-scan").disabled = $("#btn-gallery").disabled = false; $("#btn-scan-stop").hidden = true;
}
async function scan(file) {
  const token = ++scanToken;
  $("#btn-scan").disabled = $("#btn-gallery").disabled = true; $("#btn-scan-stop").hidden = false;
  $("#scan-status").textContent = "Przygotowuję zdjęcie (kadrowanie, prostowanie)…";
  setProgress((m) => {
    if (token !== scanToken) return;
    const p = m.progress ? ` ${Math.round(m.progress * 100)}%` : "";
    const a = ocrState.attempt;
    $("#scan-status").textContent = m.status === "recognizing text"
      ? `Czytam paragon${a && a !== "1/3" ? ` (próba ${a}: szukam odczytu zgodnego z sumą)` : ""}…${p}`
      : `Przygotowuję odczyt (pierwszy raz trwa dłużej)…${p}`;
  });
  try {
    const res = await readReceipt(file, () => token !== scanToken || !draft);
    if (!res || token !== scanToken || !draft) return;
    applyParsed(res.text);
  } catch (err) {
    if (token !== scanToken) return;
    $("#scan-status").textContent = "Nie udało się odczytać zdjęcia (" + (err?.message || err) + "). Spróbuj ponownie albo wpisz pozycje ręcznie.";
  } finally {
    if (token === scanToken) { $("#btn-scan").disabled = $("#btn-gallery").disabled = false; $("#btn-scan-stop").hidden = true; }
  }
}
$("#btn-scan").onclick = () => $("#scan-file").click();
$("#btn-gallery").onclick = () => $("#scan-gallery").click();
$("#btn-scan-stop").onclick = () => { stopScan(); $("#scan-status").textContent = "Przerwano."; };
for (const id of ["#scan-file", "#scan-gallery"]) {
  $(id).onchange = (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) scan(f); };
}
$("#btn-paste").onclick = () => { $("#paste-box").hidden = !$("#paste-box").hidden; if (!$("#paste-box").hidden) $("#paste-text").focus(); };
$("#btn-reparse").onclick = () => { const t = $("#raw-text").value; if (t.trim()) applyParsed(t); };
$("#btn-paste-go").onclick =() => { const t = $("#paste-text").value; if (t.trim()) { applyParsed(t); $("#paste-box").hidden = true; $("#paste-text").value = ""; } };

/* ---------- ustawienia ---------- */
let setDraft = null;
function renderSettings() {
  setDraft = structuredClone(cfg());
  $("#set-p0").value = setDraft.people[0]; $("#set-p1").value = setDraft.people[1];
  notice("#set-notice", ""); notice("#sync-notice", "");
  const last = +LS.get("lastBackup");
  $("#backup-info").textContent = last ? `Ostatni zapisany plik: ${new Date(last).toLocaleString("pl-PL")}` : "Nie zapisano jeszcze żadnej kopii.";
  disarm($("#btn-wipe"));
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
$("#btn-add-opt").onclick = () => { setDraft.options.push({ id: "o" + newId(), label: "", share: 50 }); renderOpts(); };
$("#btn-save-set").onclick = () => {
  db.config = {
    people: setDraft.people.map((p, i) => p.trim() || DEFAULT_CONFIG.people[i]),
    options: setDraft.options.filter((o) => o.fixed || o.label.trim()).map((o) => (o.fixed ? o : { ...o, label: o.label.trim() })),
    updatedAt: Date.now(),
  };
  if (persist()) notice("#set-notice", "Zapisano.");
  renderSettings(); notice("#set-notice", "Zapisano.");
};
$("#btn-wipe").onclick = () => {
  if (!armed($("#btn-wipe"), "Na pewno? Stuknij jeszcze raz")) return;
  db = { config: structuredClone(DEFAULT_CONFIG), entries: {}, deleted: {} }; persist();
  renderSettings(); notice("#sync-notice", "Usunięto wszystkie dane z tego telefonu.");
};

/* ---------- plik: eksport, import, łączenie, szyfrowanie ---------- */
const te = new TextEncoder(), td = new TextDecoder();
function toB64(buf) { const b = new Uint8Array(buf); let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function deriveKey(pw, salt) {
  const base = await crypto.subtle.importKey("raw", te.encode(pw), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function encrypt(text, pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await deriveKey(pw, salt), te.encode(text));
  return { salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
}
async function decrypt(o, pw) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(o.iv) }, await deriveKey(pw, fromB64(o.salt)), fromB64(o.ct));
  return td.decode(pt);
}
$("#btn-export").onclick = async () => {
  const pw = $("#sync-pw").value;
  const b = $("#btn-export"); b.disabled = true;
  try {
    const body = pw ? { app: "rozliczenia", v: 1, enc: true, ...(await encrypt(JSON.stringify(db), pw)) } : { app: "rozliczenia", v: 1, enc: false, data: db };
    const name = `rozliczenia-${today()}.json`;
    const file = new File([JSON.stringify(body)], name, { type: "application/json" });
    let shared = false;
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Rozliczenia" }); shared = true; }
      catch (e) { if (e?.name === "AbortError") { b.disabled = false; return; } }
    }
    if (!shared) {
      const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name;
      document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    LS.set("lastBackup", String(Date.now()));
    notice("#sync-notice", pw ? "Plik zaszyfrowany i gotowy. Na drugim telefonie wpisz to samo hasło przed wczytaniem." : "Plik gotowy. Uwaga: bez hasła każdy, kto dostanie plik, zobaczy wydatki.", pw ? "" : "warn");
    renderSettings();
  } catch (e) { notice("#sync-notice", "Nie udało się zapisać pliku: " + (e?.message || e), "bad"); }
  b.disabled = false;
};
$("#btn-import").onclick = () => $("#import-file").click();
$("#import-file").onchange = async (e) => {
  const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
  try {
    const body = JSON.parse(await f.text());
    if (body?.app !== "rozliczenia") throw new Error("To nie jest plik z Rozliczeń.");
    let data = body.data;
    if (body.enc) {
      const pw = $("#sync-pw").value;
      if (!pw) { notice("#sync-notice", "Plik jest zaszyfrowany. Wpisz hasło w polu powyżej i wczytaj go ponownie.", "warn"); return; }
      try { data = JSON.parse(await decrypt(body, pw)); }
      catch { notice("#sync-notice", "Złe hasło do pliku.", "bad"); return; }
    }
    const r = merge(data);
    persist();
    notice("#sync-notice", `Wczytano. Nowe: ${r.added}, zaktualizowane: ${r.updated}, usunięte: ${r.removed}.`);
    renderSettings(); notice("#sync-notice", `Wczytano. Nowe: ${r.added}, zaktualizowane: ${r.updated}, usunięte: ${r.removed}.`);
  } catch (err) { notice("#sync-notice", "Nie udało się wczytać pliku: " + (err?.message || err), "bad"); }
};
function merge(inc) {
  // Łączenie dwóch telefonów: dla każdego wpisu wygrywa nowsza zmiana; usunięcia też się przenoszą.
  let added = 0, updated = 0, removed = 0;
  for (const [id, t] of Object.entries(inc.deleted || {})) db.deleted[id] = Math.max(db.deleted[id] || 0, t);
  for (const [id, e] of Object.entries(inc.entries || {})) {
    if ((db.deleted[id] || 0) >= (e.updatedAt || 0)) continue;
    const cur = db.entries[id];
    if (!cur) { db.entries[id] = e; added++; }
    else if ((e.updatedAt || 0) > (cur.updatedAt || 0)) { db.entries[id] = e; updated++; }
  }
  for (const [id, e] of Object.entries(db.entries)) {
    if ((db.deleted[id] || 0) >= (e.updatedAt || 0)) { delete db.entries[id]; removed++; }
  }
  if (inc.config && (inc.config.updatedAt || 0) > (db.config.updatedAt || 0)) db.config = inc.config;
  return { added, updated, removed };
}

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
// Przy pierwszym uruchomieniu od razu prosimy o imiona.
if (!entries().length && !cfg().updatedAt) { renderSettings(); show("settings"); notice("#set-notice", "Witaj! Wpisz imiona i stuknij „Zapisz ustawienia”."); }
else goHome();
