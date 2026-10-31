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

## Do zrobienia (następne kroki)
1. **Szybkość**: dalej rozpoznawanie kilku linii naraz (paczki w `rec.run`) i WebGPU – oba wymagają pełnego testu dokładności.
2. **Dotrenowanie modelu** (prośba użytkownika): polskie znaki w nazwach (obecny model rec jest chiński – „Maslo”), odporność na poruszenie/tani aparat. Pomysł: model *latin* PP-OCR albo fine-tuning na syntetycznych liniach paragonów (czcionki termiczne + augmentacje blur/szum/JPEG).
3. Sprawdzić na prawdziwym telefonie (Android/iPhone): pierwsze pobranie modelu, czas, pamięć.
4. Pozostałe nieudane z Commons: c036/c038 (bardzo słabe skany Intermarché), c143 (Żabka, zbyt mała rozdzielczość).
