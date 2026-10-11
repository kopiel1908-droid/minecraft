# AI Addon Studio 0.4.28

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
- Tryb zestawu: generuje trzy przedmioty tematyczne (odłamek, rdzeń i relikt), każdy z własną ikoną, parametrami, recepturą i manifestami, zebrane w jednym pliku `.mcaddon`.
- Osobne manifesty i zależność Behavior Pack od Resource Pack.
- Cztery style tekstury PNG pixel-art: miecz, kryształ, magiczna kula i runiczny talizman; pięć palet kolorów: lodowy błękit, ogień, szmaragd, pustka i złoto.
- Eksperymentalne modele geometrii Bedrock dla czterech stylów przedmiotów, wraz z plikami attachable i mapowaniem UV na sześciu ścianach brył. Testy sprawdzają strukturę geometrii i referencje tekstur, ale wyświetlanie modelu w grze nadal wymaga testu w Minecraft Bedrock; nie jest to jeszcze pełny edytor modeli 3D.
- Efekt po użyciu: szybkość, siła, skok, regeneracja, widzenie w ciemności lub odporność; czas 1–120 sekund i poziom I–V. Przedmiot z efektem otrzymuje komponenty konsumpcji Bedrock.
- Opcjonalna blokada ponownego użycia przedmiotu (cooldown) od 1 do 60 sekund; 0 wyłącza blokadę. Wymaga testu zgodności w grze.
- Ustawiana możliwość zaklinania (0–30) i typ slotu zaklinania (np. miecz, łuk, element zbroi, narzędzia). Wartość 0 pomija komponent `minecraft:enchantable`; sprawdź zgodność slotu w docelowej wersji Bedrock.
- Wybór animacji używania przedmiotu: domyślna, jedzenie, picie, łuk, kusza, włócznia, luneta, szczotka lub aparat. Animacje specjalne wymagają zgodnego zachowania przedmiotu i testu w grze.
- Ustawiane obrażenia (1–20), trwałość (0–1000; 0 wyłącza komponent), rzadkość, magiczny połysk, wielkość stosu (1–64), kategoria ekwipunku i sposób wyświetlania przedmiotu w dłoni.
- Receptura craftingu z wyborem dwóch składników (patyk, blaze rod, kość lub odłamek ametystu), trybu bez układu albo z układem oraz liczbą otrzymywanych sztuk (1–4).
- Eksperymentalny blok z czterema wzorami tekstury PNG (kryształ, cegły, ruda, metal), mapowaniem atlasu terenu, definicją `minecraft:block`, ustawianą twardością, odpornością na wybuch i emisją światła (0–15), tarciem powierzchni (0–1) i dźwiękiem (kamień, drewno, szkło, trawa, metal) oraz eksportem `.mcaddon`.

## Ograniczenia

To nie jest jeszcze generator AI: opis służy głównie jako nazwa, a grafika jest prostym wzorem pixel-art. Własne modele 3D, moby, pojazdy i mapy nie są jeszcze generowane. Zestaw trzech przedmiotów jest generowany według stałych reguł, a nie na podstawie analizy AI. Bloki są eksperymentalnym prototypem i wymagają sprawdzenia w docelowej wersji Bedrock. Zgodność plików trzeba sprawdzić w docelowej wersji Minecraft Bedrock; obsługa może różnić się między platformami.

## Testowanie

Uruchom automatyczne testy dymne poleceniem `npm test`. Sprawdzają endpoint statusu, archiwum `.mcaddon`, obecność paczek `.mcpack`, manifestów, tekstury, definicji przedmiotu wraz z trwałością, rzadkością i połyskiem i receptury z wybieranymi składnikami, trybem shapeless/shaped i liczbą sztuk, a także efekt użycia przedmiotu i ustawienia kategorii ekwipunku oraz sposobu trzymania przedmiotu. Styl ikony (miecz, kryształ, kula, talizman) i paletę kolorów można wybrać w interfejsie. Testy sprawdzają też strukturę geometrii modeli Bedrock, mapowanie UV i referencje attachable, strukturę eksperymentalnego eksportu bloku, zapisaną emisję światła i tarcie powierzchni oraz to, że cztery style tekstury bloku tworzą różne pliki PNG.

Po uruchomieniu sprawdź `http://localhost:3000/api/status`. Importuj wygenerowane paczki najpierw w kopii świata testowego.
