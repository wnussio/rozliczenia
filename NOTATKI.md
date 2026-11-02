# Notatki do dalszej pracy (stan: 31.10.2026)

## Gdzie co jest
- **Aplikacja**: `app/` → publikowana automatycznie na https://wnussio.github.io/rozliczenia/ (push na `main` → GitHub Actions → Pages; `__VERSION__` w `sw.js`/`app.js` = SHA commita).
- **Materiały testowe** (poza tym repo, prywatne): folder `dev-tests/` – skrypty testowe, wyniki, zdjęcia paragonów
  (`samples/` – zdjęcia użytkownika, `samples_web/`, `samples_all/` – Wikimedia Commons). Osobne prywatne repo `rozliczenia-dev`
  klonuje się do `rozliczenia/dev-tests/`. `samples_deg/` i `samples_degfail/` nie są w repo – odtwarza je `degrade.py`.

## Architektura (skrót)
| plik | rola |
|---|---|
| `app/app.js` | UI, dane w `localStorage`, łączenie zrzutów (`mergeScan`/`findOverlap`), kontrole pozycji (ilość×cena, widełki, historia cen), podpowiedzi przy niezgodnej sumie |
| `app/paddle.js` | OCR: PaddleOCR PP-OCRv4 (ONNX) w onnxruntime-web – detekcja, orientacja, rozpoznawanie, wiersze z nachyleniem, ponowny odczyt z wyostrzeniem |
| `app/ocr.js` | wybór silnika (Paddle → zapasowo Tesseract), ponowne próby gdy suma ≠ SUMA PLN |
| `app/parser.js` | tekst → pozycje polskiego paragonu (rabaty, formaty Lidl/Biedronka-app/Dino/Intermarché/Rossmann/apteka/Empik…, potwierdzanie sumy) |
| `app/prices.js` | widełki typowych cen (150 grup) |
| `app/fx.js`, `app/mascot.js` | animacje, maskotka Paragon-chan (styl anime) |

## Wyniki testów (31.10.2026)
- 119 polskich paragonów z Commons: **116/119 (97,5%)** zgodnych z SUMA PLN (w przeglądarce = w Pythonie).
- Zdjęcia użytkownika (papierowy paragon, także obrócone): 10/10; zrzuty Lidl/Biedronka: 100%.
- Symulacja aparatów (40×9): ok. 87% – słabo: silne poruszenie, „tani telefon”.
- Tabela cen: 0 fałszywych alarmów na 460 prawdziwych pozycjach.

## Jak testować (w `dev-tests/`, Windows + Git Bash)
```
pip install rapidocr_onnxruntime opencv-python-headless quickjs
python eval_paddle.py samples_all paddle_all.json      # PaddleOCR (Python) na wszystkich zdjęciach
python score.py paddle_all.json --list                 # wynik bieżącym parserem (bez ponownego OCR)
python showfail.py paddle_all.json c036,c038 20        # podgląd nieudanych
python dbg.py "linia z paragonu"                       # jak parser rozumie linię
python price_coverage.py paddle_all.json               # pokrycie i fałszywe alarmy tabeli cen
# przeglądarka (dokładnie ścieżka aplikacji): serwer + headless Edge
python server_t.py ../app samples_all js_all.json test_full.html &
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --user-data-dir=profile-x http://127.0.0.1:8768/_t.html
python score.py js_all.json --list
```
Uwaga: edycje regexów w JS rób narzędziem do edycji plików albo skryptem .py zapisanym do pliku – heredoc w Bashu potrafił zamienić `\b` na znak backspace (sprawdzaj `0x08`).

## Kilka zdjęć / szybkość (31.10.2026, wieczór)
- Kilka zdjęć jednego paragonu (`readReceipts` w `ocr.js`): najpierw zwykły odczyt wszystkich, potem ocena całości
  (`scoreTexts` w `app.js`: pozycje po `mergeScan` kontra SUMA PLN z dowolnego zdjęcia); ponowne odczyty tylko gdy
  suma się nie zgadza i tylko gdy poprawiają całość. Wcześniej każda część bez SUMA PLN była czytana 3×.
- Wielowątkowy OCR: `sw.js` dokłada COOP/COEP → `crossOriginIsolated` → onnxruntime na 4 wątkach (pierwsze otwarcie
  przed instalacją SW nadal na 1 wątku).
- Wyniki: 119 Commons 116/119 jak wcześniej (te same c036/c038/c143), mediana 3,3 s zamiast 9,0 s na zdjęcie;
  Lidl z 4 zdjęć (37f8,8e0c,0a03,94ad): stara wersja 94 s i zła suma, nowa 36 s i zgodna z SUMA PLN.

## Przyspieszenie, runda 2 (31.10.2026, noc)
- Profil (20 zdjęć): rozpoznawanie linii 81% czasu (w tym sprawdzanie „do góry nogami” 19%), detekcja 14%.
- **Wdrożone:** krótsze sprawdzanie orientacji (stop po 3 ramkach, gdy wynik oczywisty) → −27% czasu, tekst identyczny 30/30;
  kolejne zdjęcie można dodać w trakcie odczytu (dołącza do kolejki); `yieldUI` w `paddle.js` oddaje wątek przeglądarce
  między liniami (bez tego strona „zamarzała” na cały odczyt; koszt ok. 2,5%).
- **Odrzucone:** int8 (dynamiczna kwantyzacja) – w onnxruntime-web ok. 5% wolniej; detekcja na 1400 px – tylko ok. 3% zysku,
  a zmienia tekst OCR w 11/30 zdjęć.
- Testy (próbka 30 zdjęć co 5. z samples_all, `test_full_sample.html?step=5`): 23/23 zgodne, mediana 2,4 s (było 3,3 s).
  Lidl z 4 zdjęć: 36 s ✓ (naraz) i 37 s ✓ (dokładane co 3 s).
- Uwaga przy testach: zamykając procesy testowe nie szukaj po fragmencie własnej linii poleceń (zabija własną powłokę) –
  `killtag.ps1` w dev-tests pomija bieżący proces i zamyka tylko msedge/python.

## Kilka zdjęć naprawdę działa + aparat w aplikacji (01.11.2026)
- **Problem („aplikacja świruje”)**: przy kilku zdjęciach jednego paragonu tylko 70/100 zgodnych z SUMA PLN.
  Przyczyny: (1) zdjęcie samego dołu – parser przerywał listę na SUMA/płatności tylko gdy miał już pozycje, więc
  „Gotówka 63,99”, „Przelew”, godzina „11:22” wchodziły jako produkty (suma 2×); (2) zniekształcone „RAZEH”, „Sumh pln”,
  „UJUZAPEATY”, „Sorzedaz”; (3) dalsza słabsza „suma” (płatność z resztą, DO ZAPŁATY z kaucją) nadpisywała SUMA PLN;
  (4) ucięta linia na dolnym brzegu zdjęcia („00.75” z „75,00”) i nagłówek bez „PARAGON FISKALNY” jako pozycje;
  (5) ponowny odczyt zdjęcia bez sumy wybierał wersję z większą liczbą pozycji (czyli ze śmieciami).
- **Poprawki**: `parser.js` – `END` (pewny koniec listy), `started`/`ended`, `totalRank`; `app.js` – `addPart` (wspólne dla
  zapisu i `scoreTexts`): część za końcem listy nie dodaje pozycji, część z „PARAGON FISKALNY” usuwa wcześniejsze
  niepokrywające się (≤3) pozycje, słabsza suma nie zastępuje pewniejszej, sklep/data/suma także ze zdjęć bez pozycji;
  `ocr.js` – ponowny odczyt zostaje tylko gdy lepiej zgadza się z sumą.
- **Aparat w aplikacji** (`camera.js`, getUserMedia): kilka zdjęć z rzędu, każde od razu do kolejki odczytu (czyta w tle),
  latarka, 📱 = systemowy aparat. Systemowy aparat (input capture) wyrzucał stronę w tło – telefon potrafił ją zamknąć w trakcie odczytu.
- **Odrzucone**: rozpoznawanie paczkami po 6 linii (jak RapidOCR) – 99/100, ale wolniej (mediana 1,4 s zamiast 1,1 s).
- **Wyniki** (headless Edge, 4 wątki, przez prawdziwy interfejs – `bench.html`):

| zestaw | przed | po |
|---|---|---|
| 100 paragonów Commons, 1 zdjęcie (`cases_100.json`) | 98/100 | 98/100, mediana 1,1 s |
| te same pocięte na 3 z zakładką 12%, z galerii (`cases_100x3.json`) | 70/100 | **98/100**, mediana 2,1 s |
| 3 części dokładane co 2,5 s w trakcie odczytu (`cases_100x3_live.json`) | 67/100 | **98/100** |
| zdjęcia użytkownika: Lidl 4 zrzuty (też w trakcie), Biedronka 2, Dino 10 (`cases_user.json`) | – | 13/13 |
| pozostałe 19 Commons + 30 z internetu (`cases_extra.json`) | 47/49 | 47/49 |

  Z 3 zdjęć wychodzą te same ceny pozycji co z jednego w 98/100 (c036 z 3 zdjęć nawet lepiej). Nieudane: c038 (słaby skan),
  c080 (z 3 części – za mała rozdzielczość wycinka).

## Jak testować (dev-tests, PowerShell)
```
pip install opencv-python-headless pillow                     # quickjs nie buduje się na Pythonie 3.14 – testy idą w przeglądarce
python split3.py samples_100 samples_100x3 js_all.json        # cięcie na 3 części (raz)
python make_cases.py                                           # listy przypadków
.\run_bench.ps1 cases_100x3.json wynik.json 8772               # prawdziwy interfejs w headless Edge + raport
python bench_report.py wynik.json final2_100x3.json            # porównanie: pogorszone / poprawione
.\run_bench.ps1 -cases cases_extra.json -out old.json -app app_old   # inna wersja aplikacji (np. z git archive)
python make_y4m.py samples_100/c018.jpg cam_c018.y4m; .\run_cam.ps1  # aparat w aplikacji z udawaną kamerą
powershell -File awake.ps1                                     # komputer nie usypia w trakcie długich testów
```

## Aparat i zamarzanie strony (01.11.2026, wieczór)
- Zgłoszenie: migawka i „Gotowe” nie zawsze działają; kilka zdjęć – brakuje produktów, nie łapie duplikatów.
- Pomiar (`test_block.html`): podczas odczytu strona zamarzała prawie cały czas (najdłużej 1–1,9 s na PC, na telefonie kilka razy dłużej).
  **Wdrożone**: odczyt w osobnym wątku (`paddle-worker.js` + `paddle-core.js`, OffscreenCanvas; bez niego – na stronie jak dawniej);
  aparat: `takePhoto()` (pełna rozdzielczość, ostrzenie) zamiast klatki z podglądu, kolejka stuknięć, czekanie na gotowy podgląd,
  „Gotowe” nie gubi zdjęcia zrobionego tuż przed, rozdzielczość w rogu. Testy: zdjęcia użytkownika 13/13, aparat OK.
- **Niedokończone (jutro)** – `dev-tests/wip_laczenie_zdjec.patch` (app.js, parser.js): zakładka odporna na zgubioną linię i złą cyfrę
  (Dino z 3–4 symulowanych zdjęć telefonu: 7/20 → 12/20 1:1, duplikaty 14 → 2), sklejone kwoty („x11,99128” → 12,28).
  NIE wdrożone, bo psuje Lidla z 4 zrzutów (ucięta linia „0,20” z vouchera zostaje jako pozycja → +0,31 zł). Do naprawy i ponownego testu.
- Sprawdzone i odrzucone: wycinanie paragonu z pełnej rozdzielczości (na symulacji więcej śmieci; symulacja z małego zdjęcia
  tego nie oceni – potrzebne prawdziwe 12-Mpx zdjęcia); składanie wierszy wzdłuż lokalnego nachylenia (rozbija linie vouchera Lidla).
- Najważniejsze na jutro: **prawdziwe zdjęcia z telefonu** (paragon w całości + ten sam w 2–3 częściach, z aparatu w aplikacji).
- Testy na tym etapie: `cases_small.json` (1 zdjęcie, 24), `cases_dino.json` (paragon Dino z 3–4 zdjęć, `make_dino.py`, `dino_report.py`),
  `cases_user.json`, `test_merge.html` (łączenie tekstów bez OCR), `compare.py`.

## Łączenie zdjęć: powtórki, zgubione linie (02.11.2026)
- Zgłoszenie: „czasem 3 razy czyta zdjęcie i suma jest 2 razy większa”. Przyczyna: zakładkę szukano tylko na końcu poprzednich
  zdjęć (ostatnie 15 pozycji) → to samo zdjęcie 2×, części + całość, ponowne zdjęcie środka = wszystko dodane drugi raz
  (3 odczyty to ponowne odczyty przy niezgodnej sumie – skutek, nie przyczyna).
- **Wdrożone** (`app.js`, `parser.js`):
  - łatka WIP (zakładka odporna na zgubioną linię / złą cyfrę, „x11,99128” → 12,28) + naprawa Lidla: linia bez nazwy widoczna
    tylko na jednym zdjęciu (ucięta kwota vouchera „0,20”) to śmieć – nie zostaje i nie jest wstawiana;
  - `findRepeat`: nowe zdjęcie w ≥60% powtarza już zeskanowane (najdłuższy wspólny podciąg, gdziekolwiek) → tylko uzupełnia
    pewne zgubione linie, nie dubluje; powtórka środka nie ucina prawdziwego końca;
  - parser: `sure` = kwota odczytana osobno i równa ilość × cena; taka nazwana pozycja z dołu zdjęcia zostaje, gdy następne
    zdjęcie jej nie ma (POMIDOR „0512×13,99 7,16”); waga bez przecinka „0512” = 0,512;
  - ta sama pozycja z różnym rabatem na dwóch zdjęciach → rabat z nowszego (pozycja wyżej na zdjęciu), nie zawsze mniejszy.
- **Testy**: `merge_lab.py wynik.json [id,..] [--app app_head] [--v]` – łączenie gotowych tekstów bez OCR w sekundę (deterministycznie,
  do porównań wersji); `ocr_dbg.py zdjecie.jpg [podglad.png] [--v upsharp] [--lines]` – każda ramka OCR z pewnością + podgląd.
  Powtórki (`w_dups.json`, `w_dups2.json`): 21/22 (wdrożone wcześniej 7/22; jedyny „błąd” to Biedronka bez SUMA na zdjęciach).
  Dino na tych samych odczytach 6/20 → 10/20. Przez interfejs: 1 zdjęcie 23/24, użytkownika 13/13, 100×3 98/100, 100×3 na żywo 98/100 (bez pogorszeń).
- Dino – zostało: ponowny odczyt „upsharp” na mocno przekrzywionym, małym paragonie gubi całą linię w detekcji (ramki sąsiednich
  wierszy idą ukośnie), a wygrywa, bo poprawia inną cenę. Symulacja jest bardzo trudna – potrzebne prawdziwe zdjęcia.

## Do zrobienia (następne kroki)
1. **Szybkość**: WebGPU (paczki linii w WASM okazały się wolniejsze); kadrowanie do paragonu przed detekcją przy zdjęciach 12 Mpx.
2. **Dotrenowanie modelu** (prośba użytkownika): polskie znaki w nazwach (obecny model rec jest chiński – „Maslo”), odporność na poruszenie/tani aparat. Pomysł: model *latin* PP-OCR albo fine-tuning na syntetycznych liniach paragonów (czcionki termiczne + augmentacje blur/szum/JPEG).
3. Sprawdzić na prawdziwym telefonie (Android/iPhone): pierwsze pobranie modelu, czas, pamięć.
4. Pozostałe nieudane z Commons: c036/c038 (bardzo słabe skany Intermarché), c143 (Żabka, zbyt mała rozdzielczość).
