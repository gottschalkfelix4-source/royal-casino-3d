# Ladezeit beim Browserstart

Stand: 6. Oktober 2026. Vergleichsbasis ist Commit `1fceed2`.

Der Browser lud die Anwendung zuvor als großen Baum einzelner ES-Module. Die gesamte
Oberfläche wartete auf Materialtexturen, Figuren und externe Schriftarten. Danach erzeugte
die Halle ihre Canvas-Texturen und kompilierte Shader während des ersten Renderns.
Das CPU-Profil zeigte besonders lange Shader-Wartezeiten und GPU-Rücklesevorgänge beim
Berechnen der Texturkörnung.

## Änderungen

- Esbuild bündelt und minifiziert die Browser-Module. Gemeinsame Abhängigkeiten liegen in
  geteilten Chunks; die 17 Spiele werden weiterhin erst beim Öffnen nachgeladen.
- HTML verweist über ein Build-Manifest auf Dateien mit Inhalts-Hash. Diese Dateien werden
  langfristig gecacht; HTML und Quellmodule bleiben revalidierbar. Ohne Build funktioniert
  der bisherige Start mit Quellmodulen weiterhin.
- Der Server komprimiert JavaScript, CSS und GLB-Modelle entsprechend dem Browser.
- Cinzel und Inter werden als lokale WOFF2-Dateien ausgeliefert. Die Display-Schrift wird
  vor dem Backen der Canvas-Beschriftungen ausdrücklich geladen. Das Warten hängt dadurch
  nicht mehr von Google Fonts ab.
- Generierte Textur-Canvases verwenden `willReadFrequently`, wodurch die Berechnung der
  Körnung weniger GPU-Rücklesevorgänge benötigt.
- Die Halle bereitet ihre Shader mit `compileAsync` gemeinsam für den tatsächlichen
  HDR-Renderpuffer vor. Der Renderloop startet danach. Beim Qualitätswechsel während der
  Vorbereitung wird der alte Canvas sofort entfernt und seine GPU-Ressourcen nach Ende
  der Kompilierung freigegeben.
- Eine Ladeanzeige ist bereits im HTML vorhanden. Grafikstufen, Texturauflösungen und
  Modellgeometrien bleiben erhalten.

## Messung

Chromium Headless, 1280 × 720, Qualität Hoch, SwiftShader (Software-WebGL), simulierte
10 Mbit/s Downloadrate und 100 ms Latenz. Je zwei Kaltstarts, in wechselnder Reihenfolge,
mit jeweils frischem Browserprofil und ausgeschaltetem HTTP-Cache. Die Baseline wurde
aus einem Archiv des unveränderten Commits gestartet. Gemessen wird der erste sichtbare
Hallenframe nach dem ersten Rendern, einschließlich Shader-Vorbereitung. Datenmengen
stammen aus CDP-Netzwerkereignissen, nicht aus potenziell unvollständigen Resource-Timing-Größen.

| Kennzahl | Vorher | Nachher |
|---|---:|---:|
| Zeit bis zum ersten Hallenframe, Median | 30,84 s | 18,65 s |
| Übertragene Daten | 15,82 MB | 11,23 MB |
| Ressourcenanfragen | 107 | 38 |

Das sind rund **40 % weniger Startzeit**, **29 % weniger Daten** und **64 % weniger
Anfragen**. Software-Rendering ist deutlich langsamer als eine echte GPU; die absoluten
Zeiten sind keine Vorhersage für den Browser des Nutzers. Die spätere Cubemap-Aufnahme
und die laufende Bildrate sind nicht Teil der Zeit bis zum ersten Frame. Der externe
Google-Fonts-Aufruf der Baseline war hier blockiert; die neue Version benötigt ihn nicht.

[Rohdaten](loading-evidence/startup.json) und [Auswertung](loading-evidence/summary.json).

## Validierung und Betrieb

- 36 automatisierte Tests bestanden, einschließlich Kompression, Build-Manifest,
  Cache-Headern und Freigabe eines Renderers während der Shader-Vorbereitung.
- API-Smoke-Test und WebSocket-Multiplayer-Test bestanden.
- [68 Spiel-Mounts](loading-evidence/regression.json) über Hoch → Mittel → Niedrig → Hoch
  ohne JavaScript- oder Shaderfehler. Nach jedem Durchlauf ein Canvas, ein Hallen-Updater
  und eine Texturregistry mit 223 Einträgen. GPU-Speicherzähler sind Sichtbarkeits- und
  LOD-abhängig und werden als Rohdaten festgehalten.
- Docker-Image gebaut und gestartet. Auth-Endpunkt, gebündelter Einstieg und lokale Fonts
  geprüft. [Alle 17 Spiele](loading-evidence/bundle-smoke.json) auch im gebündelten
  Produktionsfrontend nach Anmeldung geöffnet, ohne HTTP- oder Browserfehler.
- `npm run dev` baut Browser-Dateien bei Änderungen automatisch neu und startet den Server
  bei Änderungen seiner Module neu. Ein Quell-Dateiwechsel löste einen erneuten Build aus.

Lokal: `npm ci`, dann `npm run dev`. Produktion: `npm ci`, `npm run build`, `npm start`.
Docker baut die Browser-Dateien in einer eigenen Stage und übernimmt nur die Ergebnisse;
das Laufzeit-Image enthält Esbuild nicht. Hinter einem HTTPS-Proxy kann eine bestehende
vertrauenswürdige CA-Datei als BuildKit-Secret `npm_ca_bundle` eingebunden werden.

Den Vergleich mit verfügbarem Playwright wiederholen:

```sh
node scripts/startup-performance.mjs
```

Die Baseline muss auf Port 3001, die aktuelle Anwendung auf Port 3000 laufen. Beide benötigen
eigene Datenverzeichnisse. Alternativen: `CASINO_BASELINE_PORT`, `CASINO_CURRENT_PORT`,
`CASINO_PERF_REPETITIONS`, `CASINO_PERF_OUTPUT`, `CASINO_PLAYWRIGHT_MODULE`,
`CASINO_CHROMIUM_EXECUTABLE` und `CASINO_SOFTWARE_GL=1`.
