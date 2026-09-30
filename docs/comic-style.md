# Dezenter Comic-Look

Ausgangspunkt: `259a450`. Die vorhandene Casino-Palette, Modelle und Texturen bleiben erhalten.
Die Darstellung erhält breitere Glanzlichter, weniger Klarlack, ruhigere Normalmap-Strukturen und
etwas kräftigere Oberflächenfarben. Metalle behalten Reflexe, bekommen aber mehr diffuse Farbe.
Unbeleuchtete Bildschirmmaterialien, Sprites und DOM-Beschriftungen bleiben unverändert.

Die Halle nutzt etwas mehr Raumlicht, einen schwächeren Hauptspot und weniger Bloom. Die
Kontaktabdunklung durch GTAO ist zurückgenommen; die Bodenspiegelung ist schwächer und diffuser.
Keine Cel-Shading-Stufen und keine schwarzen Konturen: Ziel ist der vom Nutzer gewählte dezente Stil.

`graphic-style.js` ergänzt die vorhandenen Three-PBR-Shader vor der ersten Kompilierung. Die Anpassung
der Oberflächen erfolgt nach der Textur- und Kartenflächenauswahl; deren eigene Shader-Hooks und
Materialidentitäten bleiben erhalten. Normalmap-Abschwächung gilt nur für Standard/Physical-Materialien.
Es gibt keinen zusätzlichen Renderdurchlauf. Renderauflösung, Geometrie, Texturauflösung,
MSAA/SMAA, Schattenauflösung und Batching bleiben gleich.

## Prüfung

33 Node-Tests bestanden. Vier Vorher-/Nachher-Ansichten wurden visuell verglichen:
[Eingang](comic-evidence/after-entrance.png), [Blackjack](comic-evidence/after-blackjack.png),
[Slot-Bank](comic-evidence/after-slots.png), [Baccarat](comic-evidence/after-baccarat.png).
Die Rohdaten liegen in [before.json](comic-evidence/before.json) und [after.json](comic-evidence/after.json).

Chrome 153.0.8010.53 mit RTX 4070 SUPER, Hoch, Viewport 1920 × 1080, simulierte DPR 2,
Renderpuffer 2494 × 1403. Adaptive Auflösung aus. Vorhandene Croupiers und Animationen laufen.
Pro Ansicht drei Messfenster von vier Sekunden nach drei Sekunden Aufwärmzeit;
verglichen wird der Median der drei mittleren Bildraten. Erst der vorherige Stil, danach der neue Stil.
Diese kurze sequenzielle Prüfung dient der Kontrolle auf Leistungsrückgänge; Differenzen von 1–2 %
sind kein belastbarer Geschwindigkeitsgewinn. VSync und Frame-Limit sind aus, die Werte messen
Renderdurchsatz. Die RTX 5060 des Nutzers wurde nicht direkt getestet.

| Ansicht | Vorher FPS | Nachher FPS |
|---|---:|---:|
| Eingang | 206,6 | 210,9 |
| Blackjack | 219,5 | 222,0 |
| Slot-Bank | 422,2 | 426,5 |
| Baccarat | 200,6 | 204,4 |

Keine Browser-/Shaderfehler in diesen Ansichten. Die separate Spielwechselprüfung prüft alle
17 Spiele auf Hoch → Mittel → Niedrig → Hoch; Ergebnis: [regression.json](comic-evidence/regression.json).

## Wiederholen

`npm run test:graphics` startet einen QA-Server mit temporärer Datenbank auf Port 3100.
Mit installiertem Playwright (oder `CASINO_PLAYWRIGHT_MODULE` als Modul-URL):

```powershell
$env:CASINO_STYLE_LABEL='before' # im Checkout des Ausgangsstands, mit style-review.mjs
node scripts/style-review.mjs
$env:CASINO_STYLE_LABEL='after' # im aktuellen Checkout
node scripts/style-review.mjs
$env:CASINO_PERF_OUTPUT='docs/comic-evidence'
node scripts/graphics-regression.mjs
```

Die QA-Skripte und Dokumentation werden nicht ins Docker-Image kopiert.
