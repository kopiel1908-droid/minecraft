# AI Addon Studio 0.4.2

Lokalny prototyp narzędzia do tworzenia paczek Minecraft Bedrock.

## Uruchomienie

Wymagany Node.js 20 lub nowszy.

```bash
npm start
```

Następnie otwórz http://localhost:3000.

## Funkcje

- Eksport prototypu dodatku przedmiotowego jako `.mcaddon`, który zawiera pliki `.mcpack` dla Behavior Pack i Resource Pack.
- Eksport paczki zasobów jako `.mcpack`.
- Osobne manifesty i zależność Behavior Pack od Resource Pack.
- Generowana tekstura PNG w stylu pixel-art.
- Ustawiane obrażenia przedmiotu (1–20) i wielkość stosu (1–64).
- Prosta receptura craftingu dla generowanego przedmiotu.

## Ograniczenia

To nie jest jeszcze generator AI: opis służy głównie jako nazwa, a grafika jest prostym wzorem pixel-art. Własne modele 3D, moby, bloki, pojazdy i mapy nie są jeszcze generowane. Zgodność plików trzeba sprawdzić w docelowej wersji Minecraft Bedrock; obsługa może różnić się między platformami.

## Testowanie

Uruchom automatyczne testy dymne poleceniem `npm test`. Sprawdzają endpoint statusu i to, czy eksport przedmiotu zwraca archiwum ZIP z rozszerzeniem `.mcaddon`.

Po uruchomieniu sprawdź `http://localhost:3000/api/status`. Importuj wygenerowane paczki najpierw w kopii świata testowego.
