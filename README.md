# Rozliczenia

Aplikacja na telefon (PWA) do rozliczania wspólnych zakupów dwóch osób. **Wszystkie dane zostają w telefonie.**

**Aplikacja:** https://wnussio.github.io/rozliczenia/ · instalacja i obsługa: [`INSTRUKCJA.txt`](INSTRUKCJA.txt)

## Co robi

- **Paragon**: zdjęcie → rozpoznawanie tekstu w telefonie (offline) → pozycje, ceny po rabatach, sklep, data, kontrola z „SUMA PLN”. Można też wkleić tekst skopiowany z aparatu.
- Każdą pozycję oznaczasz jako **Wspólne / Osoba 1 / Osoba 2** albo własny podział (np. 60/40).
- **+ Kwota**: wydatek bez paragonu.
- **Grupy** (np. „Wakacje”) z saldem dla każdej grupy; widok po miesiącach albo po grupach.
- **Rozliczanie**: zaznaczasz wpisy i oznaczasz je jako rozliczone (albo cofasz / usuwasz). Saldo liczy tylko nierozliczone.
- **Dwa telefony / kopia**: plik eksportu (opcjonalnie szyfrowany AES-256-GCM hasłem, PBKDF2 250k), import łączy wpisy bez duplikatów.

## Wygląd

Styl anime: pastelowe niebo, płatki sakury w tle, maskotka **Paragon-chan** (autorska postać, SVG w `app/mascot.js`) z nastrojami zależnymi od sytuacji,
spadające ikonki produktów po skanie i przy przewijaniu do pozycji, konfetti przy zgodnej sumie (`app/fx.js`).
Czcionka [M PLUS Rounded 1c](https://github.com/coz-m/MPLUS_FONTS) (SIL OFL 1.1) dołączona w `app/fonts/` – działa offline.

## Prywatność

Aplikacja nie ma serwera ani bazy w chmurze i nie wysyła żadnych danych. Repozytorium zawiera tylko kod.
Dane: `localStorage` w telefonie. Odczyt zdjęć w telefonie (nic nie jest wysyłane):
- główny silnik: **PaddleOCR PP-OCRv4** (detekcja + rozpoznawanie, Apache 2.0) uruchamiany przez [onnxruntime-web](https://github.com/microsoft/onnxruntime) 1.30.0 (MIT) – `app/paddle.js`, modele w `app/models/`, runtime w `app/vendor/ort/` (ok. 30 MB, pobierane raz i trzymane offline);
- zapasowy: [Tesseract.js](https://github.com/naptha/tesseract.js) 7.0.0 (Apache 2.0) w `app/vendor/tesseract/` – gdy PaddleOCR nie wystartuje na starym telefonie.

## Jakość odczytu (testy 31.10.2026)

| Zestaw | Wynik (suma pozycji = SUMA PLN co do grosza) |
|---|---|
| 119 polskich paragonów z Wikimedia Commons | **116/119 (97,5%)** – wcześniej z Tesseract ok. 80% |
| zdjęcia papierowego paragonu użytkownika (Dino, także bokiem/do góry nogami) | **10/10** |
| zrzuty z aplikacji Lidl Plus / Moja Biedronka (także złożone z kilku zrzutów) | 100% |
| 100 paragonów, każdy z 3 zdjęć (z galerii albo robionych w trakcie odczytu), testy 01.11.2026 | **98/100** (wcześniej 70/100) |
| 40 paragonów × 9 symulacji aparatu (rozmycie, poruszenie, niska rozdzielczość, JPEG, szum, cień, przechylenie, tani telefon) | ok. 87% (JPEG/cień 100%, rozmycie 95%, 50% rozdz. 98%; najsłabiej silne poruszenie) |

Gdy suma się nie zgadza, aplikacja czyta zdjęcie jeszcze raz z wyostrzeniem/powiększeniem i wybiera odczyt zgodny z SUMA PLN.
Aparat w aplikacji (`app/camera.js`) pozwala zrobić kilka zdjęć długiego paragonu z rzędu – każde jest czytane w tle, zanim zrobisz następne.

## Jak to jest zbudowane

- `app/`: statyczna aplikacja (HTML/CSS/JS, bez kroku budowania), `parser.js` rozpoznaje układ polskiego paragonu fiskalnego, `sw.js` zapewnia pracę offline.
- Publikacja: GitHub Actions → GitHub Pages przy każdym pushu na `main` (`.github/workflows/pages.yml`).

## Model danych (`localStorage["rozliczenia.dane"]`)

- `config`: `{ people: [..2], options: [{id, label, share, person?, fixed?}], updatedAt }`, gdzie `share` to % należący do osoby 1.
- `entries[id]`: `{ id, payer: 0|1, store, date, group, items: [{name, g, opt}], scannedTotal, quick?, settled, settledAt?, createdAt, updatedAt }`, kwoty w groszach.
- `deleted[id]`: czas usunięcia (żeby usunięcia przenosiły się przy łączeniu plików).
