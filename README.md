# AI Addon Studio 0.3.0

Lokalny prototyp narzędzia do tworzenia paczek Minecraft Bedrock.

## Uruchomienie

Wymagany Node.js 20 lub nowszy.

```bash
npm start
```

Następnie otwórz http://localhost:3000.

## Funkcje w wersji 0.3.0

- Eksport prostego prototypu dodatku przedmiotowego jako `.mcaddon`.
- Eksport paczki zasobów jako `.mcpack`.
- Własne manifesty Behavior Pack i Resource Pack.
- Definicja przedmiotu `studio:<id>` oraz generowana tekstura PNG pixel-art.

## Ograniczenia

To nie jest jeszcze generator AI: opis jest używany do nazwania przedmiotu, a jego właściwości są na razie szablonowe. Brakuje generowania własnych modeli 3D, pełnej logiki mobów, bloków, pojazdów i map. Format i komponenty należy zweryfikować w docelowej wersji Minecraft Bedrock; zgodność może się różnić między platformami.

## Testowanie

Po uruchomieniu sprawdź `http://localhost:3000/api/status`. Pobraną paczkę testuj najpierw w kopii świata, nie w jedynym ważnym świecie.
