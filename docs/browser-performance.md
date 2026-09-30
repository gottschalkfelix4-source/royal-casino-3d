# Browser-Performance, 30. September 2026

Die Optimierung reduziert die Zahl der Zeichenaufrufe und wiederholten Berechnungen, ohne Möbel,
Figuren, Texturen oder Beleuchtung zu vereinfachen. Die Renderauflösung und die Auflösungen von
AO, Schatten und Spiegelung bleiben in allen Qualitätsstufen erhalten.

## Änderungen

- Statische Chip-Racks und andere Instanzen mit mehreren Materialien werden innerhalb räumlicher
  Zellen zusammengefasst. Die Weltposition jeder Instanz und ihre Materialgruppen bleiben erhalten.
- Karten zeichnen ihre vier identischen Kanten gemeinsam; Chips zeichnen ihre gleich texturierte
  Ober- und Unterseite gemeinsam. Karten benötigen drei statt sechs, Chips zwei statt drei
  Material-Durchläufe. Die Schnittstelle zum Austauschen der Kartenfront bleibt erhalten.
- Der AO-Durchlauf verwendet für gebündelte Möbel eine eigene, räumlich zusammengefasste Geometrie
  aus unveränderten Positionen und Normalen. Er benötigt dafür keine separaten Möbelmaterialien.
  Diese Geometrie ist ausschließlich auf der AO-Ebene sichtbar; bewegliche Figuren und Spielobjekte
  werden weiterhin mit ihrer aktuellen Pose berücksichtigt.
- Feste Einrichtung verwendet gespeicherte Transformationsmatrizen. Bewegliche Untergruppen und
  neu eingehängte Spiele bleiben aktualisierbar.
- Die Bodenspiegelung aktualisiert sich beim Bewegen höchstens 30-mal pro Sekunde, im Stand
  höchstens 10-mal. Zoom und eine geänderte Rendergröße werden berücksichtigt.
- Hoch und Mittel verwenden 2× statt 4× MSAA, weiterhin zusammen mit SMAA. Das spart Multisampling-
  Speicher und Bandbreite; an besonders feinen Blatt- und Haarkanten kann ein kleiner Unterschied
  entstehen. Es wird kein zusätzlicher Weichzeichner eingesetzt.
- Die automatische Auflösung berücksichtigt auch anhaltende Framezeiten zwischen 100 und 250 ms.
  Zuvor wurden diese grundsätzlich als Ladepausen verworfen. Bei starker Überlastung reagiert sie
  schneller; Untergrenze und Hysterese bleiben erhalten.

## Messungen

Verglichen wurden der Stand `9491fa7` und die optimierten Dateien. Beide wurden separat mit einer
temporären Datenbank gestartet und nacheinander in Chrome ohne sichtbares Browserfenster auf
derselben RTX 4070 SUPER gemessen. Die Qualität war **Hoch**, die automatische Auflösung für den
Vergleich abgeschaltet. Das Browserfenster hatte 1920 × 1080 Pixel, simulierten Geräte-DPR 2 und
in beiden Fällen denselben Renderpuffer von **2494 × 1403 Pixeln**. Nach sieben Sekunden Aufwärmen
wurden mindestens 400 Frames gesammelt; der Messpuffer enthält ein rollendes Fenster.

| Szene | Vorher FPS | Nachher FPS | Frame-Median vorher/nachher | Zeichenaufrufe vorher/nachher |
|---|---:|---:|---:|---:|
| Fester Blick vom Eingang | 105,9 | 123,0 | 8,8 / 7,7 ms | 1493 / 1246 |
| Bewegte Kamera | 110,1 | 134,1 | 8,8 / 6,9 ms | 1170 / 950 |

Damit stieg die gemittelte Bildrate in diesen Messungen um rund **16 % bzw. 22 %**. Der 95. Perzentil-
Framewert sank von 14,3 auf 12,3 ms im Stand und von 13,4 auf 11,0 ms bei Bewegung. Die CPU-Zeit für
Simulation und Render-Aufträge sank bei Bewegung von 8,4 auf 6,2 ms im Median.

Die Werte sind lokale Browser-Frameintervalle und keine isolierten GPU-Zeiten. Die Kamerafahrt ist
zeitbasiert; die rollenden Messfenster können leicht verschiedene Ausschnitte enthalten. Zufällige
Pflanzen, Bilder und Dekorationsanimationen unterscheiden sich zwischen den Starts. Die Werte
garantieren deshalb keine bestimmte Bildrate auf anderen Geräten oder Browsern.

Die zusätzliche AO-Geometrie enthält 252.028 Dreiecke in 37 Meshes. Die gesamte im Szenengraph
gezählte Dreiecksmenge steigt deshalb, obwohl diese Kopien ausschließlich im AO-Durchlauf sichtbar
sind. Das ist ein bewusster Tausch von zusätzlichem Geometriespeicher gegen weniger Zeichenaufrufe;
die Texturanzahl blieb in den Messungen gleich.

## Prüfung und Nachvollziehbarkeit

- 26 automatisierte Tests bestanden, einschließlich Instanztransformationen, AO-Geometrie,
  beweglicher Kinder fester Möbel, Fehlerbehandlung und Überlastungsregelung.
- 68 Spiel-Mounts über Hoch → Mittel → Niedrig → Hoch bestanden, ohne Browserfehler. Nach jedem
  Durchlauf ein Canvas und ein Hallen-Updater; Texturregistry stabil bei 223. Die beiden Hoch-
  Durchläufe endeten mit identischen Renderer-Speicherzählern.
- Kartenfronten lassen sich nach dem Zusammenfassen der Kanten weiterhin korrekt austauschen.
- Halle, Tisch und Figur wurden als Screenshots visuell geprüft.

Mit `npm run test:graphics` starten die Prüfseiten. `/__review.html?retina=1` zeigt die Messung im
Stand, `/__review.html?retina=1&scenario=tour` die Kamerafahrt. `/__qa.html` prüft die Spielwechsel.
Die Testseiten sind im normalen Serverbetrieb nicht verfügbar.

Rohdaten und Bilder liegen in [performance-evidence](performance-evidence/):
[Vorher](performance-evidence/before-hall.png), [Nachher](performance-evidence/after-hall.png),
[Tisch](performance-evidence/after-table.png), [Figur](performance-evidence/after-dealer.png).
