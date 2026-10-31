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

## Prywatność

Aplikacja nie ma serwera ani bazy w chmurze i nie wysyła żadnych danych. Repozytorium zawiera tylko kod.
Dane: `localStorage` w telefonie. OCR: [Tesseract.js](https://github.com/naptha/tesseract.js) 7.0.0 (Apache 2.0), dołączony w `app/vendor/tesseract/` razem z polskim modelem językowym, więc nic nie jest pobierane z obcych serwerów.

## Jak to jest zbudowane

- `app/`: statyczna aplikacja (HTML/CSS/JS, bez kroku budowania), `parser.js` rozpoznaje układ polskiego paragonu fiskalnego, `sw.js` zapewnia pracę offline.
- Publikacja: GitHub Actions → GitHub Pages przy każdym pushu na `main` (`.github/workflows/pages.yml`).

## Model danych (`localStorage["rozliczenia.dane"]`)

- `config`: `{ people: [..2], options: [{id, label, share, person?, fixed?}], updatedAt }`, gdzie `share` to % należący do osoby 1.
- `entries[id]`: `{ id, payer: 0|1, store, date, group, items: [{name, g, opt}], scannedTotal, quick?, settled, settledAt?, createdAt, updatedAt }`, kwoty w groszach.
- `deleted[id]`: czas usunięcia (żeby usunięcia przenosiły się przy łączeniu plików).
