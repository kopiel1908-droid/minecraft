# AI Addon Studio 0.4.11

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
- Trzy style tekstury PNG pixel-art: miecz, kryształ i magiczna kula; pięć palet kolorów: lodowy błękit, ogień, szmaragd, pustka i złoto.
- Ustawiane obrażenia (1–20), trwałość (0–1000; 0 wyłącza komponent), rzadkość (zwykły, niezwykły, rzadki, epicki) i wielkość stosu (1–64).
- Prosta receptura craftingu z wyborem składnika i liczbą otrzymywanych sztuk (1–4).
- Eksperymentalny blok z teksturą PNG, mapowaniem atlasu terenu, definicją `minecraft:block` i eksportem `.mcaddon`.

## Ograniczenia

To nie jest jeszcze generator AI: opis służy głównie jako nazwa, a grafika jest prostym wzorem pixel-art. Własne modele 3D, moby, pojazdy i mapy nie są jeszcze generowane. Bloki są eksperymentalnym prototypem i wymagają sprawdzenia w docelowej wersji Bedrock. Zgodność plików trzeba sprawdzić w docelowej wersji Minecraft Bedrock; obsługa może różnić się między platformami.

## Testowanie

Uruchom automatyczne testy dymne poleceniem `npm test`. Sprawdzają endpoint statusu, archiwum `.mcaddon`, obecność paczek `.mcpack`, manifestów, tekstury, definicji przedmiotu wraz z trwałością i rzadkością i receptury z wybranym składnikiem oraz konfigurowalną liczbą sztuk. Styl ikony i paletę kolorów można wybrać w interfejsie. Testy sprawdzają też strukturę eksperymentalnego eksportu bloku.

Po uruchomieniu sprawdź `http://localhost:3000/api/status`. Importuj wygenerowane paczki najpierw w kopii świata testowego.
