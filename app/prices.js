// Typowe ceny produktów (zł) – szerokie widełki do wyłapywania błędów odczytu, np. pomidory za 89 zł/kg.
// kg: cena za kilogram (produkty na wagę), szt: cena za sztukę/opakowanie. Dopasowanie po fragmentach nazw
// z paragonów (bez polskich znaków, skróty z kas: „ZIEMN”, „KURC”, „WIEPRZ”…). Kolejność ma znaczenie:
// pierwsze pasujące wygrywa. Dla produktów spoza tabeli działa reguła ogólna, a z czasem – historia z paragonów.
const T = [
  // warzywa i owoce
  [/pomidor/, { kg: [2, 30], szt: [1.5, 25] }, "pomidory"],
  [/ogor/, { kg: [2, 25], szt: [1, 20] }, "ogórki"],
  [/ziemn|kartof/, { kg: [0.8, 12], szt: [2, 30] }, "ziemniaki"],
  [/cebul/, { kg: [1, 12], szt: [0.5, 15] }, "cebula"],
  [/marchew/, { kg: [1, 12], szt: [1, 15] }, "marchew"],
  [/papryk/, { kg: [4, 40], szt: [1, 20] }, "papryka"],
  [/kapust/, { kg: [1, 15], szt: [2, 20] }, "kapusta"],
  [/salat|rukol|szpinak/, { kg: [5, 80], szt: [1.5, 20] }, "sałata"],
  [/pieczark|grzyb/, { kg: [5, 60], szt: [2, 25] }, "pieczarki"],
  [/czosn/, { kg: [8, 60], szt: [0.5, 15] }, "czosnek"],
  [/natk|koper|szczypior|pietrusz/, { kg: [5, 80], szt: [0.5, 10] }, "zioła / natka"],
  [/cukini|bakla|brokul|kalafior/, { kg: [3, 30], szt: [2, 20] }, "warzywa"],
  [/burak|seler|por\b|rzodkiew/, { kg: [1, 20], szt: [1, 15] }, "warzywa korzeniowe"],
  [/banan/, { kg: [2.5, 15], szt: [0.5, 15] }, "banany"],
  [/jabl/, { kg: [1.5, 15], szt: [1, 20] }, "jabłka"],
  [/grusz|sliwk|brzoskw|nektaryn|morel/, { kg: [3, 30], szt: [1, 25] }, "owoce"],
  [/cytryn|limon|pomarancz|mandaryn|grejpfrut/, { kg: [3, 25], szt: [0.5, 20] }, "cytrusy"],
  [/winogron|truskaw|malin|borowk|jagod|czeres|wisni/, { kg: [5, 80], szt: [3, 35] }, "owoce"],
  [/awokado|mango|ananas|kiwi|granat/, { kg: [5, 50], szt: [1, 20] }, "owoce egzotyczne"],
  // pieczywo
  [/chleb/, { szt: [2, 20], kg: [4, 40] }, "chleb"],
  [/bulk|bulecz|bagiet|rogal|kajzer|croissant|paczek|drozdzow/, { szt: [0.3, 12] }, "pieczywo"],
  // nabiał
  [/mleko/, { szt: [1.5, 15] }, "mleko"],
  [/jogurt|kefir|maslank|skyr/, { szt: [0.8, 15] }, "jogurt / kefir"],
  [/smietan|smietank/, { szt: [1.5, 15] }, "śmietana"],
  [/maslo/, { szt: [3, 30], kg: [20, 90] }, "masło"],
  [/margaryn|marg\b|rama|delma/, { szt: [2.5, 15] }, "margaryna"],
  [/twarog|serek|bialy ser|homogen|mascarpone|ricotta/, { szt: [1, 20] }, "twaróg / serek"],
  [/\bser\b|gouda|edam|cheddar|mozzarel|parmez|feta|camembert|brie|podlask|salami ser/, { szt: [2, 40], kg: [15, 120] }, "ser"],
  [/jaja|jajk/, { szt: [4, 30] }, "jajka"],
  // mięso i wędliny
  [/filet|piers|kurc|kurcz|drob|udk|udziec|skrzyd|podudz/, { kg: [8, 50], szt: [5, 70] }, "drób"],
  [/indyk/, { kg: [15, 60], szt: [5, 60] }, "indyk"],
  [/wiepr|schab|lopat|karkow|boczek|zeberk|golonk|szynka wiep|poledw/, { kg: [10, 70], szt: [5, 80] }, "wieprzowina"],
  [/wolow|antrykot|rostbef|stek/, { kg: [25, 200], szt: [8, 120] }, "wołowina"],
  [/miel/, { kg: [10, 60], szt: [5, 40] }, "mięso mielone"],
  [/kielb|parow|frankfurt|kabanos|salami|szynk|poledwic|wedlin|mortadel|baleron/, { szt: [1.5, 45], kg: [12, 150] }, "wędliny"],
  [/pasztet/, { szt: [1.5, 20] }, "pasztet"],
  [/losos|dorsz|mintaj|sledz|tunczyk|makrel|pstrag|ryba|krewet/, { szt: [2, 70], kg: [15, 200] }, "ryby"],
  // suche i przetwory
  [/makaron|spaghetti|penne|gnocchi|tagliatel|lasagne/, { szt: [1.5, 20] }, "makaron"],
  [/ryz\b|ryz /, { szt: [2, 20] }, "ryż"],
  [/kasza|kaszk|platki owsian|musli|granola|platki/, { szt: [1.5, 25] }, "kasza / płatki"],
  [/maka\b|maka |maka$/, { szt: [2, 15] }, "mąka"],
  [/cukier(?!k)/, { szt: [2.5, 15] }, "cukier"],
  [/sol\b|sol /, { szt: [0.8, 10] }, "sól"],
  [/olej|oliwa/, { szt: [5, 60] }, "olej / oliwa"],
  [/ketchup|majonez|musztard|chrzan|sos|dressing|pesto/, { szt: [1.5, 25] }, "sos / przyprawa"],
  [/passata|koncentrat pomid|pomidory w puszce|przecier/, { szt: [1.5, 15] }, "przecier pomidorowy"],
  [/fasol|groszek|kukurydz|ciecierzyc|soczewic/, { szt: [1.5, 15] }, "strączki / konserwy"],
  [/ogorki kon|ogorki kis|ogorki kan|kiszon|marynow/, { szt: [2.5, 20] }, "przetwory"],
  [/zupa|bulion|kostk|rosol/, { szt: [0.8, 15] }, "zupy / bulion"],
  [/przypraw|pieprz|papryka slod|curry|bazyli|oregano|cynamon|ziele/, { szt: [0.8, 20] }, "przyprawy"],
  [/kawa/, { szt: [8, 130] }, "kawa"],
  [/herbat/, { szt: [2, 40] }, "herbata"],
  [/kakao|decomorreno/, { szt: [4, 35] }, "kakao"],
  [/miod/, { szt: [8, 60] }, "miód"],
  [/dzem|nutella|krem czekol/, { szt: [3, 30] }, "dżem / krem"],
  [/budyn|kisiel|galaret/, { szt: [0.8, 10] }, "budyń / kisiel"],
  [/orzech|migdal|pistacj|nerkow/, { szt: [3, 50] }, "orzechy"],
  [/koncentrat bialek|odzywka|protein|bialko/, { szt: [5, 180] }, "odżywka białkowa"],
  // słodycze i przekąski
  [/czekolad|schogetten|milka|wedel/, { szt: [2, 25] }, "czekolada"],
  [/cukierk|pralin|bombon|zelki|lizak|guma|zelp/, { szt: [0.5, 40], kg: [10, 120] }, "cukierki"],
  [/ciast|ciastk|wafel|herbatnik|baton|biszkopt|delicje|markiz/, { szt: [1, 30] }, "ciastka"],
  [/chips|chrupk|paluszk|krakers|popcorn/, { szt: [1, 20] }, "przekąski"],
  [/lody|kosteczki lod|lodow/, { szt: [1.5, 35] }, "lody"],
  // napoje
  [/woda/, { szt: [0.8, 20] }, "woda"],
  [/sok|nektar|napoj|oranzad|cola|pepsi|fanta|sprite|tymbark/, { szt: [1.5, 20] }, "sok / napój"],
  [/piwo|tyskie|zywiec piwo|lech|perla|harnas|okocim|warka/, { szt: [2, 15] }, "piwo"],
  [/wodka|zoladkow|soplica|wyborow|zubrowk|finlandia|absolwent|stock/, { szt: [10, 120] }, "wódka"],
  [/wino|prosecco|szampan/, { szt: [8, 120] }, "wino"],
  [/whisk|rum|gin\b|likier|brandy|koniak/, { szt: [20, 250] }, "alkohol mocny"],
  [/energet|red bull|monster|tiger/, { szt: [2, 12] }, "energetyk"],
  // chemia i dom
  [/papier toal|papier toalet|toal/, { szt: [4, 50] }, "papier toaletowy"],
  [/recznik\s*papier|reczniki/, { szt: [3, 30] }, "ręczniki papierowe"],
  [/proszek|kapsulk|zel do pran|plyn do pran|perwoll|vizir|ariel|persil/, { szt: [8, 90] }, "środek do prania"],
  [/plyn do naczyn|ludwik|fairy|tablet.*zmyw|finish/, { szt: [3, 80] }, "do zmywania"],
  [/szampon|zel pod prysz|mydlo|dezodor|pasta do zeb|prysz/, { szt: [2, 40] }, "kosmetyki"],
  [/worki|folia|torba|reklamowk/, { szt: [0.1, 20] }, "torby / worki"],
  [/znicz|wklad|parafi/, { szt: [1, 40] }, "znicze / wkłady"],
  [/karma|whiskas|pedigree|felix|friskies|dla psa|dla kota|d\/psa|d\/kota/, { szt: [1, 120] }, "karma dla zwierząt"],
  // więcej warzyw i owoców
  [/rzodkiew|rzodkiewk/, { kg: [3, 25], szt: [1, 10] }, "rzodkiewka"],
  [/fasolka szpar|szparag/, { kg: [5, 60], szt: [3, 30] }, "fasolka / szparagi"],
  [/dynia|patison/, { kg: [1.5, 15], szt: [3, 30] }, "dynia"],
  [/arbuz|melon/, { kg: [1.5, 15], szt: [4, 40] }, "arbuz / melon"],
  [/kiwi|figi|daktyl|rodzynk|zurawin|suszon/, { szt: [2, 30], kg: [10, 90] }, "bakalie"],
  [/mrozon|warzywa na patel|frytki|pierogi|pizza|zapiekank|nalesnik|krokiet/, { szt: [2, 40] }, "mrożonki / dania gotowe"],
  [/hummus|tofu|wegan|roslinn/, { szt: [2, 25] }, "produkty roślinne"],
  // nabiał – marki i rodzaje
  [/danone|activia|bakoma|zott|jogobella|danio|monte|actimel|fantasia/, { szt: [0.8, 15] }, "jogurt / deser"],
  [/mlekovita|laciate|mlekpol|piatnica|president|hochland|almette|philadelphia/, { szt: [1.5, 30] }, "nabiał"],
  [/budyn|deser|pudding|ryzogal/, { szt: [0.8, 10] }, "deser"],
  [/kefir|zsiadl|maslank/, { szt: [1, 10] }, "kefir / maślanka"],
  // mięso – rodzaje
  [/mielon|mies miel/, { kg: [10, 60], szt: [5, 40] }, "mięso mielone"],
  [/kotlet|sznycel|devolaj|nugget|stripsy|burger/, { szt: [3, 40], kg: [15, 80] }, "kotlety / panierowane"],
  [/kaczk|\bges\b|gesi|krolik|jagniec/, { kg: [15, 100], szt: [10, 120] }, "mięso"],
  [/watrob|zoladki\b|serca\b|serduszk/, { kg: [5, 30], szt: [3, 20] }, "podroby"],
  [/salceson|kaszank|pasztetow|smalec|leberka/, { szt: [2, 20], kg: [8, 50] }, "wędliny podrobowe"],
  [/kurczak caly|tuszk/, { kg: [7, 30], szt: [10, 60] }, "kurczak"],
  // pieczywo i wypieki
  [/tortill|wrap|pita|chleb tost|tostow/, { szt: [2, 15] }, "pieczywo pakowane"],
  [/sernik|szarlotk|placek|tort|babka|keks|muffin|donut|paczki/, { szt: [2, 60] }, "ciasto"],
  // spiżarnia
  [/drozdz/, { szt: [0.5, 8] }, "drożdże"],
  [/proszek do piecz|soda|cukier wanil|aromat/, { szt: [0.3, 8] }, "dodatki do pieczenia"],
  [/ocet|sos sojow|majeranek|lisc laur/, { szt: [1, 15] }, "przyprawy"],
  [/konserw|mielonka|tusz|paprykarz|pasztet drob/, { szt: [2, 20] }, "konserwy"],
  [/tunczyk|sardyn|szprot/, { szt: [3, 20] }, "konserwy rybne"],
  [/oliwki|kapary|suszone pomid/, { szt: [3, 25] }, "przetwory"],
  [/platki kukur|cini|nesquik|chocapic|corn flakes/, { szt: [4, 25] }, "płatki śniadaniowe"],
  [/maslo orzech|tahini|syrop|klonow/, { szt: [5, 40] }, "pasty / syropy"],
  // napoje
  [/kawa rozp|kawa ziarn|kawa mielon|lavazza|jacobs|tchibo|nescafe|espresso|barista/, { szt: [8, 150] }, "kawa"],
  [/lipton|saga|herbata owoc|herbata ziel|yerba/, { szt: [2, 50] }, "herbata"],
  [/izoton|kombucha|mleko roslin|napoj owsian|napoj sojow|napoj migdal/, { szt: [2, 20] }, "napoje"],
  [/kubus|leon|hortex|cappy|fortuna/, { szt: [1, 15] }, "soki"],
  [/cydr|radler|piwo bezalk|0%/, { szt: [2, 15] }, "piwo / cydr"],
  // słodycze i przekąski – marki
  [/prince polo|grzeski|kinder|snickers|mars|twix|bounty|kitkat|lion|princessa|mieszanka wedlow|ptasie mleczko|raffaello|merci|ferrero/, { szt: [1, 45] }, "słodycze"],
  [/lays|crunchips|pringles|doritos|cheetos|beskidzkie|lajkonik|precle/, { szt: [2, 20] }, "przekąski"],
  [/haribo|mamba|skittles|mentos|tic tac|orbit/, { szt: [1, 15] }, "żelki / gumy"],
  // dziecko
  [/pieluch|pampers|dada|huggies|chusteczki naw|chust nawilz/, { szt: [4, 90] }, "artykuły dziecięce"],
  [/kaszka|mleko modyf|bebiko|nan |humana|bobovita|gerber|sloiczek/, { szt: [2, 90] }, "żywność dla dzieci"],
  // chemia i dom – więcej
  [/domestos|cif|ajax|mr proper|plyn do podl|plyn do szyb|odkamien|wc |kret|udrazn/, { szt: [3, 35] }, "środki czystości"],
  [/gabk|scierk|zmywak|rekawic|mop|miotl/, { szt: [1, 40] }, "akcesoria do sprzątania"],
  [/chusteczki|husteczki|serwetk/, { szt: [1, 20] }, "chusteczki / serwetki"],
  [/podpask|tampon|wkladki/, { szt: [3, 30] }, "higiena"],
  [/maszynk|gillette|zel do gol|pianka do gol/, { szt: [3, 80] }, "golenie"],
  [/krem|balsam|nivea|dove|garnier|lakier|odzywka do wlos/, { szt: [3, 60] }, "kosmetyki"],
  [/bateri|zarowk|swieczk|zapalnicz|zapalk/, { szt: [1, 60] }, "drobne artykuły"],
  [/zwirek|kuweta|przysmak dla|gryzak/, { szt: [2, 80] }, "artykuły dla zwierząt"],
  [/papierosy|tyton|iqos|heets|terea|wklady do|liquid/, { szt: [8, 40] }, "wyroby tytoniowe"],
  [/gazeta|czasopism|kart.*podarun|doladowan/, { szt: [2, 300] }, "inne"],
  [/kwiat|bukiet|roz[ae]|tulipan|doniczk|ziemia do/, { szt: [2, 120] }, "kwiaty / ogród"],
  // sklepy niespożywcze (JYSK, IKEA, Pepco, Decathlon, RTV…) – szerokie widełki
  [/koldr|poduszk|poszew|posciel|przescierad|materac|koc\b|narzut|dywan|zaslon|firan|recznik(?!\s*papier|i)|obrus/, { szt: [5, 2000] }, "tekstylia domowe"],
  [/mebl|krzesl|stol|szafk|regal|lozk|sofa|fotel|komod|lustr|lamp/, { szt: [10, 5000] }, "meble / wyposażenie"],
  [/garnek|patelni|talerz|kubek|szklank|sztuc|noz\b|deska do|pojemnik|termos|czajnik/, { szt: [2, 800] }, "kuchnia"],
  [/buty|obuw|kurtk|spodni|bluz|koszul|sukien|spodnic|sweter|t-shirt|skarpet|majtk|bielizn|czapk|rekawiczk|szalik|legginsy|piżam|pizam/, { szt: [3, 1500] }, "ubrania / obuwie"],
  [/ladowark|kabel|sluchawk|glosnik|myszk|klawiatur|pendrive|karta pam|powerbank|telefon|etui|bateri/, { szt: [3, 5000] }, "elektronika"],
  [/zabawk|lego|klock|lalk|puzzl|gra plansz|pluszak|samochodzik/, { szt: [3, 1500] }, "zabawki"],
  [/rower|kask|pilka|rakiet|hantl|mata do|namiot|spiwor|plecak|torba sport/, { szt: [5, 5000] }, "sport"],
  [/farba|wkret|srub|wiertl|narzedz|mlotek|tasma|silikon|klej|panel|plytk|cement|zaprawa/, { szt: [1, 3000] }, "budowlane / narzędzia"],
  [/\blek|tabl|kaps|syrop|masc|krople|aerozol|spray do nosa|witamin|suplement|apap|ibuprom|ibuprofen|paracetamol|nurofen|mucosolvan|erdomed|sinulan|strepsils/, { szt: [2, 300] }, "leki / suplementy"],
  [/bilet|kino|seans|parking|oplat/, { szt: [1, 500] }, "usługi / bilety"],
  [/pizza|kebab|burger|frytki|zestaw|obiad|danie|kawa na wynos|latte|cappuccino|herbata na/, { szt: [3, 250] }, "jedzenie na mieście"],
  [/paliwo|benzyn|diesel|\bon\b|pb95|pb 95|pb98|lpg|adblue/, { szt: [5, 1500], kg: [3, 12] }, "paliwo"],
  [/kaucj/, { szt: [0.1, 2] }, "kaucja"],
];

const norm = (s) => String(s || "").toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "");
const zl = (x) => x.toLocaleString("pl-PL", { minimumFractionDigits: x % 1 ? 2 : 0, maximumFractionDigits: 2 });

// Zwraca opis, jeśli cena wygląda nietypowo, np. „pomidory zwykle 2–30 zł/kg, tu 89,00 zł/kg”.
export function checkTypicalPrice(it) {
  // OCR myli „l” z „1” i „o” z „0” w środku słowa: „M1eko” → „mleko”, „s0k” → „sok”
  const n = norm(it.name).replace(/([a-z])[1|]([a-z])/g, "$1l$2").replace(/([a-z])0([a-z])/g, "$1o$2");
  if (!n || !it.g) return null;
  const hit = T.find(([re]) => re.test(n));
  const weighedAny = it.qty && it.unit && it.qty % 1 !== 0;
  if (!hit) { // produkt spoza tabeli: łapiemy tylko wyraźne błędy (np. przesunięty przecinek)
    if (weighedAny && it.unit > 15000) return `Nietypowa cena: ${zl(it.unit / 100)} zł/kg – sprawdź, czy przecinek jest w dobrym miejscu`;
    const per = (it.unit && it.qty ? it.unit : it.g) / 100;
    if (!weighedAny && per > 150) return `Bardzo wysoka cena jak na jedną pozycję (${zl(per)} zł) – sprawdź`;
    return null;
  }
  const [, r, label] = hit;
  const weighed = it.qty && it.unit && it.qty % 1 !== 0; // ilość z przecinkiem = na wagę
  let price, range, unit;
  if (weighed && r.kg) { price = it.unit / 100; range = r.kg; unit = "zł/kg"; }
  else if (r.szt) { price = (it.unit && it.qty ? it.unit : it.g) / 100; range = r.szt; unit = "zł/szt."; }
  else return null;
  if (price >= range[0] * 0.8 && price <= range[1] * 1.25) return null; // margines na drogie marki i promocje
  return `Nietypowa cena: ${label} zwykle ${zl(range[0])}–${zl(range[1])} ${unit}, tu ${zl(price)} ${unit}`;
}
