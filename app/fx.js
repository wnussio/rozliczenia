// Grafiki i animacje: ikonki produktów (emoji) i efekty – spadające produkty po skanie,
// konfetti przy zgodnej sumie, monety przy rozliczeniu. Bez obrazków z sieci – działa offline.

// Pierwsze pasujące wygrywa (nazwy z paragonów: bez polskich znaków, skróty kas).
const FOOD = [
  [/pierog|uszka|kolduny|pielmien/, "🥟"], [/pizza/, "🍕"], [/kebab|tortill|wrap|burrito/, "🌯"], [/burger|hamburger/, "🍔"],
  [/frytk/, "🍟"], [/hot.?dog/, "🌭"], [/sushi/, "🍣"], [/nalesnik|placek|pancake/, "🥞"],
  [/pomidor|passata|ketchup|przecier/, "🍅"], [/ogor/, "🥒"], [/ziemn|kartof/, "🥔"], [/cebul/, "🧅"],
  [/czosn/, "🧄"], [/marchew/, "🥕"], [/papryk(?!a slod)/, "🫑"], [/kukurydz/, "🌽"], [/brokul|kalafior/, "🥦"],
  [/salat|rukol|szpinak|natk|koper|pietrusz|szczypior|zielen/, "🥬"], [/pieczark|grzyb/, "🍄"], [/baklaz/, "🍆"],
  [/awokado/, "🥑"], [/banan/, "🍌"], [/jabl|mus .*jabl/, "🍎"], [/grusz/, "🍐"], [/cytryn|limon/, "🍋"],
  [/pomarancz|mandaryn|grejpfrut/, "🍊"], [/winogron/, "🍇"], [/truskaw|malin/, "🍓"], [/borowk|jagod/, "🫐"],
  [/czeres|wisni/, "🍒"], [/brzoskw|nektaryn|morel/, "🍑"], [/ananas/, "🍍"], [/arbuz|melon/, "🍉"], [/kiwi/, "🥝"],
  [/kokos/, "🥥"], [/mango/, "🥭"],
  [/chleb|bagiet|tost/, "🍞"], [/croissant|rogal/, "🥐"], [/bulk|bulecz|kajzer|precel/, "🥯"],
  [/ciast|tort|sernik|szarlot|babka|muffin|paczek|donut/, "🍰"], [/ciastk|herbatnik|wafel|delicje|markiz|biszkop/, "🍪"],
  [/jaja|jajk/, "🥚"], [/mleko|kefir|maslank|smietan|skyr|jogurt/, "🥛"], [/maslo|margaryn/, "🧈"],
  [/\bser\b|gouda|edam|cheddar|mozzarel|parmez|feta|camembert|twarog|serek/, "🧀"],
  [/kurc|kurcz|drob|indyk|udk|udziec|skrzyd|podudz|filet/, "🍗"], [/kielb|parow|frankfurt|kabanos|serdel/, "🌭"],
  [/boczek|bekon/, "🥓"], [/schab|wiepr|wolow|karkow|lopat|stek|mies|miel|kotlet|zeberk|szynk|salami|wedlin|poledw/, "🥩"],
  [/losos|dorsz|mintaj|sledz|tunczyk|makrel|pstrag|ryb|sardyn|szprot/, "🐟"], [/krewet/, "🦐"],
  [/makaron|spaghetti|penne|gnocchi|tagliatel|lasagne/, "🍝"], [/ryz\b|ryz /, "🍚"], [/kasza|platki|musli|granola/, "🥣"],
  [/zupa|bulion|rosol/, "🍲"], [/musztard|majonez|sos\b|sos |chrzan|pesto|dressing|pasztet/, "🫙"],
  [/budyn|kisiel|galaret|deser|pudding/, "🍮"], [/papryka slod|ostra papryka/, "🧂"], [/koncentrat bialek|bialko|odzywk|protein/, "💪"], [/konserw|fasol|groszek|ciecierzyc|soczewic/, "🥫"], [/olej|oliwa/, "🫒"],
  [/sol\b|sol |przypraw|pieprz|curry|ziele/, "🧂"], [/miod/, "🍯"], [/orzech|migdal|pistacj|nerkow/, "🥜"],
  [/czekolad|schogetten|milka|wedel|kakao|nutella|prince polo|grzeski|kinder|snickers|mars|twix|baton/, "🍫"],
  [/cukierk|pralin|zelki|lizak|haribo|mamba|bombon/, "🍬"], [/lody|lodow/, "🍦"], [/chips|chrupk|paluszk|popcorn/, "🍿"],
  [/kawa|espresso|barista|lavazza|jacobs|tchibo|nescafe|latte|cappuccino/, "☕"], [/herbat|lipton|saga|yerba/, "🍵"],
  [/piwo|tyskie|zywiec|lech|perla|harnas|okocim|warka|radler/, "🍺"], [/wino|prosecco|szampan/, "🍷"],
  [/wodka|zoladkow|soplica|wyborow|zubrowk|whisk|rum\b|gin\b|likier|brandy/, "🥃"],
  [/woda/, "💧"], [/sok|nektar|napoj|oranzad|cola|pepsi|fanta|sprite|tymbark|energet|izoton|syrop/, "🧃"],
  [/papier toal|toal/, "🧻"], [/recznik|chusteczk|serwetk/, "🧻"],
  [/proszek|kapsulk|perwoll|vizir|ariel|persil|plyn|domestos|cif|ajax|fairy|ludwik|zmyw/, "🧼"],
  [/szampon|zel pod|mydlo|dezodor|pasta do zeb|krem|balsam|nivea|dove|kosmet|gill|maszynk/, "🧴"],
  [/pieluch|pampers|dada|huggies/, "👶"], [/karma|whiskas|pedigree|felix|friskies|d\/psa|dla psa/, "🐶"], [/dla kota|d\/kota|kuweta|zwirek/, "🐱"],
  [/znicz|wklad|parafi|swieczk/, "🕯️"], [/kwiat|bukiet|tulipan|roz[ae]\b/, "💐"], [/torba|reklamowk|worki/, "🛍️"],
  [/\blek|tabl\b|tabletk|kaps|witamin|apap|ibuprom|ibuprofen|paracetamol|apteka|recept/, "💊"],
  [/koldr|poduszk|posciel|koc\b|materac/, "🛏️"], [/buty|obuw/, "👟"], [/kurtk|bluz|koszul|spodni|sweter|t-shirt|sukien/, "👕"],
  [/zabawk|lego|klock|lalk|puzzl|pluszak|magnes/, "🧸"], [/bilet|kino|seans/, "🎟️"], [/prasa|gazeta|czasopism/, "📰"],
  [/paliwo|benzyn|diesel|\bon\b|pb95|lpg/, "⛽"], [/bateri|ladowark|kabel|sluchawk/, "🔋"], [/kaucj|butelk/, "♻️"],
];

const norm = (s) => String(s || "").toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/([a-z])[1|]([a-z])/g, "$1l$2").replace(/([a-z])0([a-z])/g, "$1o$2");

export function foodEmoji(name) {
  const n = norm(name);
  if (!n) return null;
  const hit = FOOD.find(([re]) => re.test(n));
  return hit ? hit[1] : null;
}

/* ---------- efekty ---------- */
let enabled = true;
export function setAnimations(on) { enabled = !!on; }
const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const allowed = () => enabled && !reduced() && document.visibilityState === "visible";

function layer() {
  let l = document.getElementById("fx-layer");
  if (!l) { l = document.createElement("div"); l.id = "fx-layer"; l.setAttribute("aria-hidden", "true"); document.body.append(l); }
  return l;
}
const rnd = (a, b) => a + Math.random() * (b - a);

// Spadające emoji, np. 🥟🥟🍅🧀 po zeskanowaniu paragonu.
export function rain(emojis, count = 18) {
  if (!allowed() || !emojis.length) return;
  const l = layer();
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.className = "fx-fall";
    s.textContent = emojis[i % emojis.length];
    s.style.left = rnd(2, 92) + "vw";
    s.style.fontSize = rnd(26, 46) + "px";
    s.style.setProperty("--rot", rnd(-220, 220) + "deg");
    s.style.setProperty("--sway", rnd(-40, 40) + "px");
    s.style.animationDuration = rnd(1.8, 3.2) + "s";
    s.style.animationDelay = rnd(0, 0.9) + "s";
    s.addEventListener("animationend", () => s.remove());
    l.append(s);
  }
}

// Wybuch konfetti z danego miejsca ekranu (np. przy „Zgadza się z SUMA PLN”).
export function burst(x = innerWidth / 2, y = innerHeight / 2, pieces = ["✨", "🎉", "⭐", "✅"], count = 22) {
  if (!allowed()) return;
  const l = layer();
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.className = "fx-burst";
    s.textContent = pieces[i % pieces.length];
    const ang = rnd(0, Math.PI * 2), dist = rnd(70, 190);
    s.style.left = x + "px"; s.style.top = y + "px";
    s.style.fontSize = rnd(16, 28) + "px";
    s.style.setProperty("--dx", Math.cos(ang) * dist + "px");
    s.style.setProperty("--dy", Math.sin(ang) * dist - 40 + "px");
    s.style.setProperty("--rot", rnd(-180, 180) + "deg");
    s.style.animationDelay = rnd(0, 0.12) + "s";
    s.addEventListener("animationend", () => s.remove());
    l.append(s);
  }
}

// Emoji produktów z listy pozycji – częściej występujące pojawiają się częściej.
export function emojisFor(items) {
  const out = [];
  for (const it of items) { const e = foodEmoji(it.name); if (e) out.push(e); }
  return out.length ? out : ["🧾"];
}
