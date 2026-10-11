# AI Addon Studio 0.4.19

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
- Cztery style tekstury PNG pixel-art: miecz, kryształ, magiczna kula i runiczny talizman; pięć palet kolorów: lodowy błękit, ogień, szmaragd, pustka i złoto.
- Ustawiane obrażenia (1–20), trwałość (0–1000; 0 wyłącza komponent), rzadkość (zwykły, niezwykły, rzadki, epicki) i opcjonalny magiczny połysk i wielkość stosu (1–64).
- Prosta receptura craftingu z wyborem głównego składnika, drugiego składnika (patyk, blaze rod, kość lub odłamek ametystu) i liczbą otrzymywanych sztuk (1–4).
- Eksperymentalny blok z czterema wzorami tekstury PNG (kryształ, cegły, ruda, metal), mapowaniem atlasu terenu, definicją `minecraft:block`, ustawianą twardością, odpornością na wybuch i emisją światła (0–15), tarciem powierzchni (0–1) i dźwiękiem (kamień, drewno, szkło, trawa, metal) oraz eksportem `.mcaddon`.

## Ograniczenia

To nie jest jeszcze generator AI: opis służy głównie jako nazwa, a grafika jest prostym wzorem pixel-art. Własne modele 3D, moby, pojazdy i mapy nie są jeszcze generowane. Bloki są eksperymentalnym prototypem i wymagają sprawdzenia w docelowej wersji Bedrock. Zgodność plików trzeba sprawdzić w docelowej wersji Minecraft Bedrock; obsługa może różnić się między platformami.

## Testowanie

Uruchom automatyczne testy dymne poleceniem `npm test`. Sprawdzają endpoint statusu, archiwum `.mcaddon`, obecność paczek `.mcpack`, manifestów, tekstury, definicji przedmiotu wraz z trwałością, rzadkością i połyskiem i receptury z wybranym składnikiem oraz konfigurowalną liczbą sztuk. Styl ikony (miecz, kryształ, kula, talizman) i paletę kolorów można wybrać w interfejsie. Testy sprawdzają też strukturę eksperymentalnego eksportu bloku, zapisaną emisję światła i tarcie powierzchni oraz to, że cztery style tekstury bloku tworzą różne pliki PNG.

Po uruchomieniu sprawdź `http://localhost:3000/api/status`. Importuj wygenerowane paczki najpierw w kopii świata testowego.
