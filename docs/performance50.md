# Browser-Rendering: zweiter Optimierungsstand

Vergleichsbasis ist der bereits optimierte und veröffentlichte Commit `377d0bb`, nicht die ältere
Ausgangsversion. Die Messung und die Bilder liegen in [performance50-evidence](performance50-evidence/).

## Umsetzung

- Die 3D-Szene erhält weiterhin 2× MSAA. Die anschließenden Vollbild-Effekte verwenden gewöhnliche
  HDR-Puffer: zusätzliche MSAA-Auflösungen und Tiefenkopien zwischen Effekten entfallen. SMAA bleibt aktiv.
- GTAO verwendet die aufgelöste Tiefe der sichtbaren Szene. Three rekonstruiert die geometrischen Normalen
  daraus, sodass die komplette Halle kein zweites Mal für AO gezeichnet werden muss. Radius, 12 Samples,
  Halbauflösung und Denoising bleiben erhalten. Die 252.028 zusätzlichen AO-Dreiecke werden nicht mehr angelegt.
  AO kann an Silhouetten und glatten Rundungen geringfügig anders ausfallen; ausgeschnittene Blätter werden
  nun entsprechend ihrer tatsächlichen Tiefenabdeckung berücksichtigt.
- Karten und Chips verwenden je einen Zeichenaufruf. Ein Oberflächenattribut wählt die ursprünglichen
  Texturen und Rauheiten; Geometrie, UVs und Texturauflösung bleiben erhalten. Der Austausch der Kartenfront
  über `setCardFace` bleibt möglich.
- Feste Einrichtung wird zusätzlich innerhalb größerer räumlicher Zellen zusammengefasst. Instanzmatrizen
  werden einmal in die Geometrie übernommen; Schattenmerkmale, Ebenen und Materialien bleiben getrennt.
  Das tauscht etwas zusätzliche Geometriekopie gegen weniger CPU-Aufwand pro Frame. Die Zellen werden
  weiterhin anhand ihres Sichtbereichs verworfen. Figuren und Spielobjekte bleiben unabhängig beweglich.
- Roulette und Glücksrad bündeln feste Teile innerhalb ihrer beweglichen Untergruppen. Die Barflaschen
  teilen Geometrie und Material, behalten aber Farbe, Emission und Glanz über Vertexfarben.
- Gemeinsame feste Materialien erhalten getrennte Zustände je benötigter Shader-Variante. Szenenmatrizen
  werden einmal nach der Simulation aktualisiert und für die Renderdurchläufe wiederverwendet.
- Die direkte Lichtberechnung überspringt BRDF-Auswertung nur, wenn Lichtfarbe beziehungsweise alle
  direkten Oberflächenbeiträge exakt null sind. Die Standard-Vignette teilt den Tonemapping-Durchlauf.
  Vollständig ausgeblendete Interaktionsringe erzeugen keine Zeichenaufrufe mehr.

Modelle, Texturen, Renderauflösung, Schattenauflösung und Bodenspiegelung wurden nicht herabgesetzt.
Die Qualitätskonfiguration gegenüber `377d0bb` bleibt gleich.

## Messverfahren

Chrome Headless mit echter NVIDIA RTX 4070 SUPER über ANGLE/D3D11, Qualitätsstufe Hoch,
Viewport 1920 × 1080, simulierte Geräte-DPR 2, tatsächlicher Renderpuffer **2494 × 1403**.
Adaptive Auflösung ist ausgeschaltet. Drei zusätzliche animierte Spielerfiguren sind in beiden Versionen aktiv.
Die vorhandenen Croupiers und Hallenanimationen laufen weiter.

Jede Ansicht erhält fünf Sekunden Aufwärmzeit und acht Sekunden Messzeit. Die Rundfahrt dauert genau
einen Acht-Sekunden-Zyklus. Drei Wiederholungen laufen in der Reihenfolge Vorher/Nachher,
Nachher/Vorher, Vorher/Nachher; verglichen werden die Mediane der drei gemittelten Bildraten.
Die gespeicherten Einzelintervalle ermöglichen die Nachrechnung von FPS und Perzentilen.

`--disable-frame-rate-limit` und `--disable-gpu-vsync` vermeiden, dass die Bildschirmfrequenz die
Renderleistung deckelt. Die Werte messen damit Browser-Renderdurchsatz und keine Garantie für die
sichtbare Bildrate eines Monitors. Es sind keine isolierten GPU-Zeiten. Die RTX 5060 des Nutzers wurde
nicht direkt gemessen. Dekorationszufall und Animationsphasen können zwischen Starts leicht variieren.

Chrome-Version: 153.0.8010.53. Auswertung der drei vollständigen Wiederholungen:

| Ansicht | Vorher FPS | Nachher FPS | Verbesserung |
|---|---:|---:|---:|
| Eingang | 108,9 | 184,5 | **69,4 %** |
| Rundgang | 124,9 | 212,7 | **70,3 %** |
| Blackjack-Tisch | 149,6 | 252,7 | **68,9 %** |
| Slot-Bank | 248,0 | 400,0 | **61,3 %** |

Damit liegt jede geprüfte Ansicht über dem Ziel von 50 % mehr Renderdurchsatz, gegenüber dem bereits
optimierten Stand `377d0bb`. [Rohdaten](performance50-evidence/measurements.json),
[Auswertung](performance50-evidence/summary.json) und [Spielwechselprüfung](performance50-evidence/regression.json)
gehören zu diesem Stand. Die Ansichten messen die laufende Halle; die separate Spielwechselprüfung
deckt Montage, Darstellung und Freigabe aller 17 Spiele ab, nicht deren jeweilige Spielrunden-FPS.

## Prüfung

- 33 automatisierte Tests prüfen unter anderem Geometrietransformationen, Layer, Schattenmerkmale,
  externe AO-Tiefe, MSAA-Puffer und AO-Abschaltung, Shader-Erweiterungen sowie Oberflächentexturen.
- 68 Spiel-Mounts über Hoch → Mittel → Niedrig → Hoch bestehen ohne Browser- oder Shaderfehler.
  Ein Canvas und ein Hallen-Updater bleiben nach jedem Durchlauf; die Texturregistry bleibt bei 223.
  Beide Hoch-Durchläufe enden mit identischen Speicherzählern: 706 Geometrien und 219 Texturen.
- Kartenfrontwechsel und unveränderte Dreiecksanzahl von Karten und Chips werden im Browser geprüft.
- Vorher-/Nachher-Bilder von Halle, Rundgang, Blackjack-Tisch und Slot-Bank wurden visuell verglichen.

## Wiederholen

In einem separaten Checkout von `377d0bb` den QA-Server mit `PORT=3101` starten; im aktuellen Checkout
`npm run test:graphics` auf Port 3100 starten. Beide QA-Server verwenden temporäre Datenbanken.

Mit installiertem Playwright:

```powershell
node scripts/graphics-regression.mjs
node scripts/performance-compare.mjs
```

Alternativ kann `CASINO_PLAYWRIGHT_MODULE` auf die Modul-URL einer vorhandenen Playwright-Installation
zeigen. `CASINO_BASELINE_PORT`, `CASINO_CURRENT_PORT`, `CASINO_BASELINE_COMMIT`,
`CASINO_PERF_REPETITIONS` und `CASINO_PERF_OUTPUT` erlauben andere Vergleichsziele und Ausgabeordner.
Standard sind drei Wiederholungen und der Ausgabeordner `docs/performance50-evidence`.
Die QA-Seiten und Testskripte werden nicht in das Docker-Image übernommen.
