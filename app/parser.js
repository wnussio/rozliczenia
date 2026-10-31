// Rozpoznawanie polskiego paragonu fiskalnego z tekstu (z OCR albo wklejonego z aparatu).
// Zwraca { store, date, total, items: [{ name, g }] }; kwoty w groszach.

const LETTERS = /[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]/g;
const AMOUNT = /-?\d{1,5}\s?[.,]\s?\d{2}(?![\d%])/g;
const STOP = /SPRZEDA[ŻZ2]|SUMA|PTU|RAZEM|DO\s*ZAP[ŁL]ATY|ROZLICZENIE|P[ŁL]ATNO|GOT[ÓO]WKA|KARTA|RESZTA|NIEFISKALNY/i;
const DISCOUNT = /RABAT|OPUST|PROMOC|OBNI[ŻZ]K|UPUST|ZNI[ŻZ]K/i;
const QTY = /\s\d+(?:[.,]\d+)?\s*(?:szt\.?|kg|op\.?|l)?\s*[x×*]\s*\d/i;

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

const toGr =(s) => Math.round(parseFloat(s.replace(/\s/g, "").replace(",", ".")) * 100);
const letterCount = (s) => (s.match(LETTERS) || []).length;

function cleanName(s) {
  let n = s.replace(/[|_~^"]+/g, " ").replace(/\s+[A-G]$/, "").replace(/\s+/g, " ").trim();
  n = n.replace(/^[^\wĄĆĘŁŃÓŚŹŻąćęłńóśźż]+/, "");
  if (n === n.toUpperCase()) n = n.toLowerCase(); // „MLEKO UHT” → „mleko uht”
  return n.charAt(0).toUpperCase() + n.slice(1);
}

export function parseReceipt(raw) {
  const lines = String(raw || "").split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  let date = null, total = null;

  for (const l of lines) {
    let m = l.match(/(20\d{2})[-./](\d{2})[-./](\d{2})/);
    if (m) { date = `${m[1]}-${m[2]}-${m[3]}`; break; }
    m = l.match(/(\d{2})[-./](\d{2})[-./](20\d{2})/);
    if (m) { date = `${m[3]}-${m[2]}-${m[1]}`; break; }
  }
  for (const l of lines) {
    if (/SUMA/i.test(l) && !/PTU/i.test(l)) {
      const a = [...l.matchAll(AMOUNT)];
      if (a.length) { total = toGr(a[a.length - 1][0]); if (/PLN|Z[ŁL]/i.test(l)) break; }
    }
  }

  let start = lines.findIndex((l) => /PARAGON\s*FISKALNY/i.test(l));
  const head = lines.slice(0, start > 0 ? start : 3);
  const headText = lines.slice(0, Math.max(start, 6)).join(" ");
  const chain = CHAINS.find(([re]) => re.test(headText));
  const storeLine = head.find((l) => letterCount(l) >= 3 && !/NIP|ul\.|al\.|tel|^\d/i.test(l));
  const store = chain ? chain[1] : storeLine ? cleanName(storeLine) : null;

  const items = [];
  let pending = "";
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (STOP.test(l)) { if (items.length) break; pending = ""; continue; }
    const amounts = [...l.matchAll(AMOUNT)];
    if (DISCOUNT.test(l)) {
      if (amounts.length && items.length) {
        const v = Math.abs(toGr(amounts[amounts.length - 1][0]));
        items[items.length - 1].g -= v;
      }
      pending = "";
      continue;
    }
    if (!amounts.length) { if (letterCount(l) >= 2) pending = l; continue; }

    const last = amounts[amounts.length - 1];
    const value = toGr(last[0]);
    if (value < 0) { if (items.length) items[items.length - 1].g += value; continue; }

    const q = l.search(QTY);
    let name = l.slice(0, q >= 0 ? q : amounts[0].index);
    if (letterCount(name) < 2) name = pending; // nazwa w linii nad ceną
    else if (pending && letterCount(pending) >= 2 && q === 0) name = pending;
    pending = "";
    if (letterCount(name) < 2 || !value) continue;
    items.push({ name: cleanName(name), g: value });
  }
  return { store, date, total, items: items.filter((it) => it.g > 0) };
}
