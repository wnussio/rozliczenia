# Rozliczenia

Aplikacja na telefon (PWA) do rozliczania wspólnych zakupów dwóch osób.

**Aplikacja:** https://wnussio.github.io/rozliczenia/ · konfiguracja i instalacja: [`INSTRUKCJA.txt`](INSTRUKCJA.txt)

## Co robi

- **Paragon**: zdjęcie paragonu → Claude odczytuje pozycje, ceny (po rabatach), sklep, datę i sprawdza zgodność z „SUMA PLN”.
- Każdą pozycję oznaczasz jako **Wspólne / Osoba 1 / Osoba 2** (imiona ustawia się przy tworzeniu bazy i w Ustawieniach) albo własny podział (np. 60/40).
- **+ Kwota**: wydatek bez paragonu.
- **Saldo**: kto komu ile oddaje; **spłaty** je zerują. Historia pogrupowana po miesiącach.
- **Synchronizacja** między telefonami przez wspólną bazę (link z kodem). Działa offline.

## Jak to jest zbudowane

- `app/`: statyczna aplikacja (HTML/CSS/JS, bez kroku budowania), service worker do pracy offline.
- Baza: Firebase Firestore z pamięcią offline + anonimowe logowanie; dane w `households/{kod}/…`, reguły w `firestore.rules`.
- Skanowanie: Claude API (`claude-opus-5-5`, SDK `@anthropic-ai/sdk` z CDN, z zapasowym modelem przy odmowie). Klucz API trzymany tylko w `localStorage` telefonu.
- Publikacja: GitHub Actions → GitHub Pages przy każdym pushu na `main` (`.github/workflows/pages.yml`).

## Model danych

- `households/{kod}`: `{ people: [..2], options: [{id, label, share, person?, fixed?}] }`, gdzie `share` to % należący do osoby 1.
- `households/{kod}/receipts/{id}`: `{ payer: 0|1, store, date, items: [{name, g, opt}], scannedTotal, quick?, createdAt }`, kwoty w groszach.
- `households/{kod}/payments/{id}`: `{ from, to, g, date, createdAt }`.
