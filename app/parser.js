// Rozpoznawanie polskiego paragonu fiskalnego z tekstu (z OCR albo wklejonego z aparatu).
// Zwraca { store, date, total, items: [{ name, g }] }; kwoty w groszach.

const L = "A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż";
const LETTERS = new RegExp(`[${L}]`, "g");
const AMOUNT = /-?\d{1,5}[.,]\d{2}(?![\d%])/g;
// Koniec listy zakupów: podsumowania podatku, sumy, płatności.
const STOP = /SPRZEDA|SPRZ\.?\s*OPOD|OPODAT|\bP\s?T\s?U\b|\bS?UMA\s*(PLN|PTU|:)|\bSUMA\b|\bRAZEM\b|DO\s*ZAP|\bKWOTA\s+[A-G]\b|ROZLICZ|P[ŁL]ATNO|P[ŁL]ATN\.|GOT[ÓO]W|\bKARTA\b|\bKARTY\b|RESZTA|NIEFISK|\bOG[ÓO][ŁL]EM\b|PODSUMOW/i;
const DISCOUNT = /RABAT|OPUST|PROMOC|OBNI[ŻZ]K|UPUST|ZNI[ŻZ]K|KUPON|VOUCHER|GRATIS|LIDL\s*PLUS/i;
const DISCOUNT_SUMMARY = /[ŁL][ĄA]CZN|SUMA|RAZEM|W\s*TYM|OSZCZ[ĘE]DZ|ZAOSZCZ/i; // „Opust łącznie”, „Suma rabatów”
const QTY_G = /(?:^|\s)\d+(?:[.,]\d+)?\s*(?:szt\.?|kg|op\.?|l)?\s*[x×*][:.]?\s*-?\d{1,5}[.,]\d{1,2}(?!\d)/gi;
// pozycja ostatniego „ilość × cena” w linii (pierwsze bywa częścią nazwy, np. „Woda 6x1,5L”)
const qtyPos = (l) => { let pos = -1; for (const m of l.matchAll(QTY_G)) pos = m.index; return pos; };
const UNIT_TOKENS = /\b(?:szt|kg|op|x|l|[A-G])\b\.?/gi;

const CHAINS = [
  [/BIEDRONKA|JERONIMO/i, "Biedronka"], [/\bLIDL\b/i, "Lidl"], [/[ŻZ]ABKA/i, "Żabka"], [/KAUFLAND/i, "Kaufland"],
  [/AUCHAN/i, "Auchan"], [/CARREFOUR/i, "Carrefour"], [/\bNETTO\b/i, "Netto"], [/\bDINO\b/i, "Dino"],
  [/STOKROTKA/i, "Stokrotka"], [/\bALDI\b/i, "Aldi"], [/INTERMARCH/i, "Intermarché"], [/POLOMARKET/i, "Polomarket"],
  [/LEWIATAN/i, "Lewiatan"], [/DELIKATESY CENTRUM/i, "Delikatesy Centrum"], [/SELGROS/i, "Selgros"], [/\bMAKRO\b/i, "Makro"],
  [/ROSSMANN/i, "Rossmann"], [/\bHEBE\b/i, "Hebe"], [/PEPCO/i, "Pepco"], [/\bACTION\b/i, "Action"],
  [/LEROY/i, "Leroy Merlin"], [/CASTORAMA/i, "Castorama"], [/\bOBI\b/i, "OBI"], [/DECATHLON/i, "Decathlon"],
  [/\bIKEA\b/i, "IKEA"], [/MEDIA ?MARKT/i, "Media Markt"], [/EURO ?AGD|EURO-NET/i, "RTV Euro AGD"],
  [/ORLEN/i, "Orlen"], [/\bBP\b/i, "BP"], [/\bSHELL\b/i, "Shell"], [/CIRCLE ?K/i, "Circle K"], [/\bMOYA\b/i, "Moya"],
  [/APTEKA/i, "Apteka"], [/SPO[ŁL]EM/i, "Społem"], [/SUPER-?PHARM/i, "Super-Pharm"], [/SMYK/i, "Smyk"],
];

const MONTHS = /STYCZ|LUT|MAR[CZ]|KWIE|\bMAJ|CZERW|LIP|SIERP|WRZE|PA[ŹZ]D|LISTOP|GRUD|\b(STY|LUT|MAR|KWI|CZE|LIP|SIE|WRZ|PA[ŹZ]|LIS|GRU)\b/i;
const DATE_RE = /(20\d{2})[-./](\d{2})[-./](\d{2})|(\d{2})[-./](\d{2})[-./](20\d{2})/;
const toGr = (s) => Math.round(parseFloat(s.replace(",", ".")) * 100);
const letterCount = (s) => (s.match(LETTERS) || []).length;

// Typowe pomyłki OCR w kwotach: „3:00”, „3;00”, „3, 00”, „- 3,00”, „3,O0”, „1l,99”.
function normalize(line) {
  let l = line.replace(/[—–−]/g, "-").replace(/\s+/g, " ").trim();
  l = l.replace(/(^|\s)([-\dOoIl|]{1,6}[.,:;][\dOoIl|]{2})(?=[A-G]?(\s|$))/g, (m, pre, tok) =>
    pre + tok.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1"));
  // „3:00” → „3,00”, ale nie godzina w linii z datą („2026-10-19 17:04”)
  if (!DATE_RE.test(l)) {
    l = l.replace(/-(\d{1,4})\s?[:;]\s?(\d{2})(?![\d%:])/g, "-$1,$2");
    l = l.replace(/(\S.*\s)(\d{1,4})\s?[:;]\s?(\d{2})(\s?[A-G])?$/, (m, a, b, c, d) => (/^\d{1,2}$/.test(b) && /^\s*\d{1,2}[:;]\d{2}/.test(m) ? m : `${a}${b},${c}${d || ""}`));
  }
  // litera stawki VAT odczytana jako cyfra na końcu linii: „2,744” → „2,74 A”, „7,998” → „7,99 B”
  l = l.replace(/(\d[.,]\d{2})([4805])\W{0,2}$/, (m, a, d) => `${a} ${{ 4: "A", 8: "B", 0: "C", 5: "C" }[d]}`);
  l = l.replace(/(\d)([.,])\s(\d{2})(?![\d%])/g, "$1$2$3");
  l = l.replace(/(\d)\s([.,])(\d{2})(?![\d%])/g, "$1$2$3"); // „210 ,97” (duża czcionka sumy)
  l = l.replace(/(^|\s)-\s(\d)/g, "$1-$2");
  return l;
}

function cleanName(s) {
  let n = s.replace(/[|_~^"'`]+/g, " ").replace(/\s+/g, " ").trim().replace(/(\s+[A-Ga-g]{1,2}\.?)+$/, "");
  n = n.replace(new RegExp(`^[^0-9${L}]+`), "").replace(/[\s.,:;*x×-]+$/i, "");
  if (n === n.toUpperCase()) n = n.toLowerCase(); // „MLEKO UHT” → „mleko uht”
  return n.charAt(0).toUpperCase() + n.slice(1);
}

export function parseReceipt(raw) {
  const lines = String(raw || "").split(/\r?\n/).map(normalize).filter(Boolean);
  let date = null, total = null;

  for (const l of lines) {
    let m = l.match(/(20\d{2})[-./](\d{2})[-./](\d{2})/);
    if (m) { date = `${m[1]}-${m[2]}-${m[3]}`; break; }
    m = l.match(/(\d{2})[-./](\d{2})[-./](20\d{2})/);
    if (m) { date = `${m[3]}-${m[2]}-${m[1]}`; break; }
  }
  // Suma: „SUMA PLN” (OCR potrafi zgubić literę: „UMA PLN”, „SUMA PL”), „Do zapłaty”.
  const totalOf = (re) => {
    for (const l of lines) {
      if (re.test(l) && !/PTU|P\s?T\s?U|RABAT|OPUST|VAT/i.test(l)) { const a = [...l.matchAll(AMOUNT)]; if (a.length) return toGr(a[a.length - 1][0]); }
    }
    return null;
  };
  total = totalOf(/S?U\s?M\s?A\s*:?\s*P\s?L/i) ?? totalOf(/DO\s*ZAP[ŁL]AT/i) ?? totalOf(/\bSUMA\b/i) ?? totalOf(/\bPLN\b/i);

  const start = lines.findIndex((l) => /PARAGON\s*(NIE)?\s*FISK/i.test(l));
  const headText = lines.slice(0, Math.max(start, 6)).join(" ");
  const chain = CHAINS.find(([re]) => re.test(headText));
  const storeLine = lines.slice(0, start >= 0 ? start : 3).find((l) => letterCount(l) >= 3 && !/NIP|ul\.|al\.|tel|^\d/i.test(l));
  const store = chain ? chain[1] : storeLine ? cleanName(storeLine) : null;

  const items = [];
  // pending: linia bez kwoty – albo nazwa następnej pozycji (Lidl: nazwa nad ceną),
  // albo dokończenie nazwy poprzedniej (aplikacja Biedronki: „Ser ż gouda … 12,59” / „400g”).
  let pending = "", pendingDiscount = false, contTarget = null, skipSummary = false;
  let lead = 0; // rabaty nad pierwszą pozycją – należą do pozycji z poprzedniego zrzutu ekranu
  const discountLast = (v) => { if (items.length) items[items.length - 1].g -= Math.abs(v); else lead += Math.abs(v); };
  const flushCont = () => {
    if (pending && contTarget && letterCount(pending) + /\d/.test(pending) >= 1 && pending.length <= 30) contTarget.name = cleanName(contTarget.name + " " + pending);
    pending = ""; contTarget = null;
  };

  for (let i = start + 1; i < lines.length; i++) {
    let l = lines[i];
    if (DATE_RE.test(l) && letterCount(l) < 4) continue; // linia z datą i godziną
    if (/\b20\d{2}\b/.test(l) && MONTHS.test(l) && !/\d[.,]\d{2}/.test(l)) continue; // nagłówek aplikacji sklepu: „19 Października 2026”
    const amounts = [...l.matchAll(AMOUNT)];
    const isDiscount = DISCOUNT.test(l);

    if (isDiscount && DISCOUNT_SUMMARY.test(l)) { flushCont(); pendingDiscount = false; skipSummary = !amounts.length; continue; } // podsumowanie rabatów – już odjęte
    if (skipSummary && amounts.length && letterCount(l) < 3) { skipSummary = false; continue; }
    skipSummary = false;
    if (STOP.test(l)) { flushCont(); if (items.length) break; continue; }
    if (/\d[.,]\d{2}\s*%/.test(l)) continue; // stawki VAT
    if (isDiscount) {
      flushCont();
      if (amounts.length) discountLast(toGr(amounts[amounts.length - 1][0]));
      else pendingDiscount = true; // kwota rabatu w następnej linii
      continue;
    }
    if (!amounts.length) {
      if (letterCount(l) >= 3 || (contTarget && /^\d{2,4}g$/.test(l)) || (contTarget && /^[\d.,]+\s*(g|kg|ml|l|szt)\b/i.test(l))) {
        if (pending && contTarget) flushCont(); // dwie linie bez ceny: pierwsza dokańczała poprzednią nazwę
      if (contTarget && /^\d{2,4}9$/.test(l)) l = l.slice(0, -1) + "g"; // „4009” → „400g” (OCR myli g z 9)
        pending = l;
      }
      continue;
    }

    const last = amounts[amounts.length - 1];
    let value = toGr(last[0]);
    const q = qtyPos(l);
    const nameRaw = l.slice(0, q >= 0 ? q : amounts[0].index);
    const nameLetters = letterCount(nameRaw.replace(UNIT_TOKENS, " "));

    // Linia z samą ujemną kwotą (np. „-3,00 C”) albo kwota po „Rabat” w poprzedniej linii.
    if (pendingDiscount || (value < 0 && nameLetters < 3)) { discountLast(value); pendingDiscount = false; flushCont(); continue; }
    if (value < 0) { discountLast(value); flushCont(); continue; }

    // Sama kwota równa cenie poprzedniej pozycji po rabacie (aplikacja Biedronki: „12.99C”) – to nie nowa pozycja.
    if (nameLetters < 3 && q < 0 && amounts.length === 1 && items.length && value === items[items.length - 1].g && !(pending && !contTarget)) {
      flushCont(); continue;
    }

    // Ilość × cena bez wartości na końcu (OCR zgubił albo ucięta) – policz.
    const qm = q >= 0 ? l.slice(q).match(/(\d+(?:[.,]\d+)?)\s*(?:szt\.?|kg|op\.?|l)?\s*[x×*][:.]?\s*(\d{1,5}[.,]\d{2})(?!\d)/i) : null;
    let alt = null; // ilość × cena – do sprawdzenia krzyżowego z kwotą
    if (qm) {
      const calc = Math.round(parseFloat(qm[1].replace(",", ".")) * toGr(qm[2]));
      const unitIsLast = amounts.length === 1 || amounts[amounts.length - 1].index <= l.indexOf(qm[2], q) + 1;
      if (unitIsLast) value = calc; // brak kwoty na końcu (OCR zgubił)
      else if (calc !== value) alt = calc;
    }
    if (!value) { flushCont(); continue; }

    let name;
    if (nameLetters >= 3) { flushCont(); name = nameRaw; }
    else { name = pending; pending = ""; contTarget = null; } // Lidl: nazwa w linii nad ceną
    name = cleanName(name || "");
    const item = { name: letterCount(name) >= 2 ? name : "Pozycja (sprawdź nazwę)", g: value, base: value };
    if (alt) item.alt = alt - value;
    items.push(item);
    contTarget = nameLetters >= 3 ? item : null;
  }
  flushCont();
  fixWithTotal(items, total);
  for (const it of items) delete it.alt;
  return { store, date, total, lead, items: items.filter((it) => it.g > 0) };
}

// Gdy suma pozycji ≠ SUMA PLN, a w niektórych liniach kwota nie zgadza się z „ilość × cena”,
// wybierz dla nich tę wersję, przy której wszystko się sumuje (OCR myli pojedyncze cyfry).
function fixWithTotal(items, total) {
  if (total == null) return;
  const c = items.filter((it) => it.alt).slice(0, 12);
  if (!c.length) return;
  const diff = total - items.reduce((s, it) => s + it.g, 0);
  if (!diff) return;
  let best = null;
  for (let mask = 1; mask < 1 << c.length; mask++) {
    let d = 0, k = 0;
    for (let i = 0; i < c.length; i++) if (mask & (1 << i)) { d += c[i].alt; k++; }
    const err = Math.abs(diff - d);
    if (!best || err < best.err || (err === best.err && k < best.k)) best = { err, k, mask };
  }
  // tylko dokładne trafienie – inaczej źle odczytana suma mogłaby „poprawić” dobre ceny
  if (best.err === 0) c.forEach((it, i) => { if (best.mask & (1 << i)) { it.g += it.alt; it.base += it.alt; } });
}

// Ocena odczytu: im bliżej sumy z paragonu, tym lepiej (do wyboru najlepszego trybu OCR).
export function scoreParse(res) {
  const sum = res.items.reduce((s, it) => s + it.g, 0);
  if (res.total == null) return res.items.length ? 1e6 - res.items.length : 1e9;
  return Math.abs(res.total - sum);
}
