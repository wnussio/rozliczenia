// Rozpoznawanie polskiego paragonu fiskalnego z tekstu (z OCR albo wklejonego z aparatu).
// Zwraca { store, date, total, items: [{ name, g }] }; kwoty w groszach.

const L = "A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż";
const LETTERS = new RegExp(`[${L}]`, "g");
const AMOUNT = /-?\d{1,5}[.,]\d{2}(?![\d%])/g;
// Koniec listy zakupów: podsumowania podatku, sumy, płatności.
const STOP = /SPRZEDA|SPRZ\.?\s*OPOD|OPODAT|\bP\s?T\s?U\b|\bS?UMA\s*(PLN|PTU|:)|\bSUMA\b|\bRAZEM\b|DO\s*ZAP|\bKWOTA\s+[A-G]\b|ROZLICZ|P[ŁL]ATNO|P[ŁL]ATN\.|GOT[ÓO]W|\bKARTA\b|\bKARTY\b|RESZTA|NIEFISK|\bOG[ÓO][ŁL]EM\b|PODSUMOW/i;
const DISCOUNT = /RABAT|OPUST|PROMOC|OBNI[ŻZ]K|UPUST|ZNI[ŻZ]K|KUPON/i;
const DISCOUNT_SUMMARY = /[ŁL][ĄA]CZN|SUMA|RAZEM|W\s*TYM|OSZCZ[ĘE]DZ|ZAOSZCZ/i; // „Opust łącznie”, „Suma rabatów”
const QTY = /(?:^|\s)\d+(?:[.,]\d+)?\s*(?:szt\.?|kg|op\.?|l)?\s*[x×*]\s*-?\d{1,5}[.,]\d{2}(?!\d)/i;
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

const toGr = (s) => Math.round(parseFloat(s.replace(",", ".")) * 100);
const letterCount = (s) => (s.match(LETTERS) || []).length;

// Typowe pomyłki OCR w kwotach: „3:00”, „3;00”, „3, 00”, „- 3,00”, „3,O0”, „1l,99”.
function normalize(line) {
  let l = line.replace(/[—–−]/g, "-").replace(/\s+/g, " ").trim();
  l = l.replace(/(^|\s)([-\dOoIl|]{1,6}[.,:;][\dOoIl|]{2})(?=[A-G]?(\s|$))/g, (m, pre, tok) =>
    pre + tok.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1"));
  l = l.replace(/(\d)\s?[:;]\s?(\d{2})(?![\d%])/g, "$1,$2");
  l = l.replace(/(\d)([.,])\s(\d{2})(?![\d%])/g, "$1$2$3");
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

  const start = lines.findIndex((l) => /PARAGON\s*FISK/i.test(l));
  const headText = lines.slice(0, Math.max(start, 6)).join(" ");
  const chain = CHAINS.find(([re]) => re.test(headText));
  const storeLine = lines.slice(0, start >= 0 ? start : 3).find((l) => letterCount(l) >= 3 && !/NIP|ul\.|al\.|tel|^\d/i.test(l));
  const store = chain ? chain[1] : storeLine ? cleanName(storeLine) : null;

  const items = [];
  let pending = "", pendingDiscount = false;
  const discountLast = (v) => { if (items.length) items[items.length - 1].g -= Math.abs(v); };

  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    const amounts = [...l.matchAll(AMOUNT)];
    const isDiscount = DISCOUNT.test(l);

    if (isDiscount && DISCOUNT_SUMMARY.test(l)) { pending = ""; pendingDiscount = false; continue; } // podsumowanie rabatów – już odjęte
    if (STOP.test(l)) { if (items.length) break; pending = ""; continue; }
    if (/\d[.,]\d{2}\s*%/.test(l)) continue; // stawki VAT
    if (isDiscount) {
      if (amounts.length) discountLast(toGr(amounts[amounts.length - 1][0]));
      else pendingDiscount = true; // kwota rabatu w następnej linii
      pending = "";
      continue;
    }
    if (!amounts.length) { if (letterCount(l) >= 3) pending = l; continue; }

    const last = amounts[amounts.length - 1];
    let value = toGr(last[0]);
    const nameRaw = l.slice(0, (() => { const q = l.search(QTY); return q >= 0 ? q : amounts[0].index; })());
    const nameLetters = letterCount(nameRaw.replace(UNIT_TOKENS, " "));

    // Linia z samą ujemną kwotą (np. „-3,00 C”) albo kwota po „Rabat” w poprzedniej linii.
    if (pendingDiscount || (value < 0 && nameLetters < 3)) {
      discountLast(value); pendingDiscount = false; pending = ""; continue;
    }
    if (value < 0) { discountLast(value); pending = ""; continue; }

    // Ilość × cena bez wartości na końcu (OCR zgubił) – policz.
    const qm = l.match(/(\d+(?:[.,]\d+)?)\s*(?:szt\.?|kg|op\.?|l)?\s*[x×*]\s*(\d{1,5}[.,]\d{2})/i);
    if (qm && amounts.length === 1 && amounts[0].index >= l.indexOf(qm[2])) {
      value = Math.round(parseFloat(qm[1].replace(",", ".")) * toGr(qm[2]));
    }

    let name = nameLetters >= 3 ? nameRaw : pending; // Lidl: nazwa w linii nad ceną
    pending = "";
    if (!value) continue;
    name = cleanName(name || "");
    items.push({ name: letterCount(name) >= 2 ? name : "Pozycja (sprawdź nazwę)", g: value });
  }
  return { store, date, total, items: items.filter((it) => it.g > 0) };
}

// Ocena odczytu: im bliżej sumy z paragonu, tym lepiej (do wyboru najlepszego trybu OCR).
export function scoreParse(res) {
  const sum = res.items.reduce((s, it) => s + it.g, 0);
  if (res.total == null) return res.items.length ? 1e6 - res.items.length : 1e9;
  return Math.abs(res.total - sum);
}
