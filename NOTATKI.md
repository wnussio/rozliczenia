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

## Do zrobienia (następne kroki)
1. **Szybkość odczytu na telefonie** (10–17 s na laptopie → telefon wolniej): detekcja na mniejszym obrazie dla dużych zdjęć, mniej próbek orientacji, ewentualnie WebGPU.
2. **Dotrenowanie modelu** (prośba użytkownika): polskie znaki w nazwach (obecny model rec jest chiński – „Maslo”), odporność na poruszenie/tani aparat. Pomysł: model *latin* PP-OCR albo fine-tuning na syntetycznych liniach paragonów (czcionki termiczne + augmentacje blur/szum/JPEG).
3. Sprawdzić na prawdziwym telefonie (Android/iPhone): pierwsze pobranie modelu, czas, pamięć.
4. Pozostałe nieudane z Commons: c036/c038 (bardzo słabe skany Intermarché), c143 (Żabka, zbyt mała rozdzielczość).
