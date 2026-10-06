# Flüssigere Darstellung auf schwächeren Geräten

Neue Geräte starten mit **Auto** statt pauschal mit **Hoch**. Bereits ausdrücklich gespeicherte
Qualitätsstufen bleiben erhalten. Über den Grafikknopf oben lässt sich Auto jederzeit auswählen.

Auto startet auf Mobilgeräten sowie bei höchstens vier logischen CPU-Kernen oder höchstens 4 GB
gemeldetem Arbeitsspeicher mit Niedrig. Bei mindestens acht Kernen und 8 GB startet es mit Hoch,
ansonsten mit Mittel. Diese Browserangaben sind eine vorsichtige Startannahme; sie messen keine GPU.

Bei anhaltend langsamen Frames passt sich die laufende Szene weiter an:

- Die Auflösung kann bis auf 50 % je Achse sinken; die DOM-Bedienelemente bleiben scharf.
  Die manuellen Stufen behalten ihre bisherige Untergrenze von 70 %.
- Bei mehr als 28 ms durchschnittlicher Framezeit und einer Auflösung von höchstens 80 %
  entfallen GTAO; Spiegelungen aktualisieren sich höchstens mit 15 Hz, Schatten mit 12 Hz.
- Bei mehr als 40 ms und höchstens 70 % entfallen zusätzlich Bloom, SMAA, MSAA und planare
  Spiegelungen. Die HDR-Farbausgabe bleibt erhalten. Objekte, Kamera und geöffnetes Spiel bleiben bestehen.
- Die Auflösung erholt sich bei ausreichender Leistung langsam. Abgeschaltete Effekte bleiben bis
  zum nächsten Hallenaufbau aus, damit die Darstellung nicht ständig zwischen Effekten wechselt.

Manuelle Stufen deaktivieren ihre Effekte nicht automatisch. Niedrig verwendet jetzt tatsächlich
keine zusätzliche Browser-Kantenglättung. Umgebungsspiegelungen werden in Niedrig/Mittel mit
64/128 statt 256 Pixeln pro Würfelseite aufgenommen. Entfernte Mitspieler aktualisieren ihre
Körperanimation wie die Croupiers mit 24/12 Hz; ihre Positionsinterpolation bleibt pro Frame aktiv.
Versteckte Tabs zeichnen keine Bilder, ihre Spielsimulation läuft weiter.

Die Auflösungsregelung verwendet den Abstand tatsächlich gerenderter Frames. Simulationstakte des
Watchdogs verkürzen diese Messung nicht mehr. Anhaltende Framezeiten bis 2,5 Sekunden werden
berücksichtigt; einzelne längere Ladepausen und versteckte Tabs zählen nicht zur Überlastung.

## Prüfung

41 automatisierte Tests sowie 85 Spiel-Mounts über alle Stufen einschließlich Auto bestehen.
Die WebGL-Prüfung der Effektumschaltung besteht mit unveränderter Szene, Kamera und geöffnetem
Blackjack-Spiel. [Prüfprotokolle](device-performance-evidence/) dokumentieren diesen Stand.

`npm test` prüft Geräteprofile, gespeicherte Einstellungen, anhaltende Überlastung, Erholung,
Effektumschaltung und das Timing bei Watchdog-Takten und versteckten Tabs.

Für echte WebGL-Prüfungen zuerst `npm run test:graphics` starten. Dieser Server verwendet eine
temporäre Datenbank. Mit zusätzlich installiertem Playwright:

```sh
node scripts/device-performance.mjs
CASINO_QA_AUTO=1 node scripts/graphics-regression.mjs
```

Der erste Test prüft die laufende Effektumschaltung mit einem geöffneten Blackjack-Spiel,
einschließlich Framebuffer-Neuanlage, unveränderter Kamera/Szene und erneuter Shader-Kompilierung.
Der zweite prüft alle 17 Spiele über Hoch → Mittel → Niedrig → Hoch → Auto (85 Mounts).

`CASINO_PLAYWRIGHT_MODULE`, `CASINO_CHROMIUM_EXECUTABLE`, `CASINO_CURRENT_PORT`,
`CASINO_QA_WIDTH`, `CASINO_QA_HEIGHT` und `CASINO_SOFTWARE_GL=1` ermöglichen andere lokale
Browserinstallationen und Software-WebGL. Software-Rendering in dieser Cloud eignet sich zur
Funktionsprüfung, liefert aber keine belastbare FPS-Prognose für reale Handys oder Laptops.
Schwächere Geräte benötigen im Auto-Modus weniger Bildqualität für flüssigere Darstellung.
