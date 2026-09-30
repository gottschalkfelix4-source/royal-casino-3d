# Zweite Grafikrunde: Kanten, Polster und Licht

## Umsetzung

- **Kantenglättung:** Hoch und Mittel kombinieren 4× MSAA mit SMAA. SMAA läuft in der installierten Three-Version im linearen Farbraum vor dem OutputPass. Damit werden auch Kontraste aus Texturen, Glanzlichtern und Nachbearbeitung geglättet. HTML-Bedienelemente bleiben außerhalb dieses Filters. Niedrig rendert weiterhin direkt mit der nativen Browser-Kantenglättung.
- **Pflanzen:** Alpha-to-Coverage glättet freigestellte Blattränder im Multisampling-Puffer.
- **Möbel:** Geschlossene Stuhllehnen mit Innenfläche, Außenfläche und abgerundeten Enden ersetzen dünne, offene Zylinderflächen. Dezente Messingzierlinien ersetzen die überhellen oberen Chromränder. Die Tellerfüße haben einen profilierten Rand.
- **Tische:** Eine durchgehende Armauflage ersetzt überlappende Einzelpolster. Elliptische Polster behalten überall dieselbe Dicke. Ein Formfehler bei halbrunden Tischen ist korrigiert: Drehen vor dem Skalieren erhält die angegebene Breite und Tiefe. Fußstützen folgen jetzt der tatsächlichen Kontur und haben Halterungen.
- **Oberflächen und Schatten:** Ruhigeres, dunkleres Chrom; weniger scharfe Lackreflexe; PCF-Schatten mit breiterem Filter und angepasstem Normalenversatz.
- **Figuren:** Geformter Haaransatz mit sichtbarer Stirn, Revers, Hemdmanschetten und ein Jackenknopf. Diese Details bleiben innerhalb der vorhandenen zwei Körper-Draw-Calls und der Detailstufen.
- **Lastregelung:** Die automatische Auflösung reagiert jetzt oberhalb von durchschnittlich 18 statt 20 ms, damit sie nicht dauerhaft bei ungefähr 50 FPS stehen bleibt. Die Hysterese verhindert häufige Wechsel.

## Prüfung

**Ergebnis:** 13 automatisierte Tests bestanden; 68 Spiel-Mounts über Hoch → Mittel → Niedrig → Hoch bestanden; keine Browserfehler. Nach jedem Durchlauf genau ein Canvas und ein Hallen-Updater, Texturregistry stabil bei 213. Syntax- und Diff-Prüfung ohne Fehler. Zusätzlich wurde die niedrige Stufe bei 390 × 844 visuell geprüft.

Die neuen Geometrietests prüfen die tatsächlichen Tischabmessungen, den gleichmäßigen Polsterradius, geschlossene Übergänge sowie von innen und außen sichtbare Lehnenflächen. Die Browserprüfung kontrolliert außerdem Reihenfolge und Auflösung der SMAA-Puffer beim Verkleinern und Vergrößern sowie den Qualitätswechsel.

Die Messungen sind lokale Browser-Frameintervalle nach dem Aufwärmen, keine isolierten GPU-Zeiten. Retina wurde durch DPR 2 simuliert; der Renderer begrenzt auf 1,75. Schwankungen durch Hintergrundlast und Schatten-/Spiegelungszyklen sind möglich. Kein Test auf einem echten Mobilgerät.

Bei 1280 × 720 und DPR 1 stieg der Median gegenüber dem Beginn dieser Runde von 9,2 auf 9,5 ms; die gemittelte Bildrate betrug 109,0 beziehungsweise 101,5 FPS. Die abschließende Szene hat 545.018 statt 478.458 Dreiecke, enthält dafür die geschlossenen Lehnen und zusätzlichen Möbelrundungen.

Bei 1280 × 720 mit simuliertem Retina-DPR:

| Einstellung | Median | Gemittelte Bildrate | Renderpuffer |
|---|---:|---:|---|
| SMAA aus, feste Auflösung | 18,0 ms | 54,5 FPS | 2240 × 1260 |
| SMAA an, feste Auflösung | 19,4 ms | 50,4 FPS | 2240 × 1260 |
| SMAA an, automatische Auflösung | 17,2 ms | 57,0 FPS | 2016 × 1134 |

Diese Zahlen zeigen den Qualitäts-/Leistungsabgleich; eine feste Bildrate auf anderen Geräten ist damit nicht zugesichert. In den beiden festen Retina-Messungen unterscheiden sich die Fußstützen um 480 Dreiecke; die abschließende adaptive Messung verwendet bereits die sparsameren Rohre.

## Bilder und Rohdaten

- [Vorher](graphics-polish-evidence/hall-before.png)
- [Nachher](graphics-polish-evidence/hall-after.png)
- [Möbel im Detail](graphics-polish-evidence/table-detail.png)
- [Figur im Detail](graphics-polish-evidence/dealer.png)
- Sämtliche Rohmessungen liegen in `graphics-polish-evidence/`.

Der bisherige prozedurale Stil bleibt erkennbar. Individuell modellierte Figuren und stärker ausgearbeitete Animationen wären ein weiterer eigener Arbeitsschritt für einen hochwertigeren Gesamteindruck.
