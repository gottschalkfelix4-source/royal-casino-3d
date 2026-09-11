# 🎰 Royal Casino 3D

Online-Casino mit zwölf 3D-animierten Spielen, Benutzerkonten und virtuellem Spielgeld.
Kein echtes Geld – reines Unterhaltungsprojekt.

## Starten

```bash
npm install
npm start
```

Dann im Browser öffnen: http://localhost:3000

- `npm run dev` startet den Server mit automatischem Neustart bei Änderungen.
- `node scripts/smoke.js` führt einen End-to-End-Test aller API-Endpunkte gegen eine temporäre Datenbank aus.
- `npm run sim:slots` simuliert den Slot-Automaten (RTP ≈ 93 %).
- Port ändern: `PORT=8080 npm start`, Datenverzeichnis: `CASINO_DATA_DIR=/pfad`.

Voraussetzung: Node.js ≥ 22.13 (nutzt das eingebaute `node:sqlite`, keine nativen Abhängigkeiten).

## Spiele

| Spiel | Beschreibung |
|---|---|
| 🎰 Slots | 5 Walzen, 3 Reihen, 9 Gewinnlinien, Wild-Symbol, bis 800× |
| 🎡 Roulette | Europäisches Roulette (eine Null), 3D-Kessel mit Kugel, Setztisch |
| 🃏 Blackjack | 6 Decks, Blackjack 3:2, Dealer steht bei 17, Verdoppeln |
| ♠️ Video Poker | Jacks or Better (9/6-Tabelle), Karten halten per Klick oder Tasten 1–5 |
| 🎴 Baccarat | Punto Banco mit 8 Decks, Player/Banker/Tie |
| 🎲 Würfel | Sic Bo mit drei Würfeln: Klein/Groß, Gerade/Ungerade, Summen, Dreierpasch |
| 🔮 Plinko | 8/12/16 Reihen, drei Risikostufen, mehrere Kugeln gleichzeitig |
| 🚀 Crash | Exponentiell wachsender Multiplikator, manueller und Auto-Cashout |
| 💣 Mines | 5×5-Feld, 1–24 Minen, jederzeit auszahlen |
| 🪙 Münzwurf | Kopf oder Zahl, 1,96× |
| 🎯 Glücksrad | 24 Segmente mit Multiplikatoren bis 5× |
| 🔺 Hi-Lo | Höher/niedriger-Kette mit wachsendem Multiplikator |

## Lobby & Multiplayer

Die Lobby ist eine begehbare 3D-Casino-Halle im Stil der 2000er (Musterteppich, Kronleuchter, Neon, Bar).

- **Steuerung**: `W A S D` / Pfeiltasten laufen, `Shift` rennen, Maus ziehen zum Umsehen, `Q`/`E` drehen.
  In der Nähe eines Tisches: `E` oder Klick startet das Spiel. `Enter` fokussiert den Chat.
- **Andere Spieler** sind als Figuren mit Namensschild sichtbar – beim Herumlaufen und sitzend/stehend an
  dem Tisch oder Automaten, an dem sie gerade spielen. Gewinne und Verluste erscheinen live über der Figur
  und im Ticker; im Spiel zeigt „Am Tisch“ die Mitspieler an derselben Station samt Tisch-Chat.
- **Live-Hintergrund**: Die Halle läuft als eigene Ebene hinter der App dauerhaft weiter ([hall.js](public/js/views/hall.js)).
  Im Spiel rendert die Spielszene transparent darüber, die Kamera der Halle parkt am jeweiligen Tisch – man sieht
  weiterhin Mitspieler, Bots und die animierten Croupiers (Blackjack, Baccarat, Roulette, Würfel), die periodisch Karten geben.
- **Spielen am echten Tisch**: Öffnest du ein Spiel, setzt sich deine Kamera auf einen freien Stuhl dieser Station.
  Karten, Chips, Würfel, Kessel oder Walzen werden in realer Größe direkt auf den Hallentisch bzw. in den Automaten
  gerendert – Mitspieler und Croupier sitzen sichtbar daneben. Maus ziehen dreht auch im Sitzen den Blick.
- **Sprachchat** (🎤 in der Kopfzeile): WebRTC-Verbindungen zwischen den Spielern, Signalisierung über den WebSocket.
  Die Lautstärke sinkt mit der Entfernung in der Halle (voll bis ~2 m, stumm ab ~9 m) – Spieler an anderen
  Tischen hört man also nicht. Browser geben das Mikrofon nur über **HTTPS oder localhost** frei; hinter einem
  Reverse Proxy mit Zertifikat funktioniert es, über `http://ip:3000` nicht. Für Verbindungen über das Internet
  ggf. einen eigenen TURN-Server eintragen (`public/js/voice.js`, `ICE`).
- **Technik**: WebSocket (`/ws`, Paket `ws`), Auth über das Session-Cookie, Positionen 10 Hz, Chat mit Rate-Limit.
- **Bots**: Damit die Halle nicht leer ist, laufen standardmäßig 3 als 🤖 markierte Bots herum.
  Abschalten mit `CASINO_BOTS=0`, mehr mit z. B. `CASINO_BOTS=6`.
- **Grafikqualität**: Der ⚙-Schalter in der Kopfzeile wechselt zwischen Hoch / Mittel / Niedrig
  (Pixeldichte, Schatten). Rendering läuft über WebGL auf der GPU – bei ruckelnder Darstellung im Browser die
  Hardwarebeschleunigung aktivieren (Chrome: `chrome://settings/system`).

## Docker & Unraid

Das Rendering läuft im Browser der Besucher (WebGL auf deren GPU); der Server ist nur API + WebSocket + statische
Dateien und braucht keine GPU.

```bash
docker compose up -d          # nutzt ghcr.io/gottschalkfelix4-source/royal-casino-3d:latest
```

- Image: `ghcr.io/gottschalkfelix4-source/royal-casino-3d` (wird per GitHub Actions bei jedem Push auf `main` gebaut, amd64 + arm64)
- Port `3000`, Datenbank unter `/data` (Volume), `CASINO_BOTS` steuert die Bots
- **Unraid**: Template unter [`unraid/royal-casino-3d.xml`](unraid/royal-casino-3d.xml). In Unraid unter
  *Docker → Add Container → Template repositories* die URL
  `https://github.com/gottschalkfelix4-source/royal-casino-3d/tree/main/unraid` eintragen, oder das XML nach
  `/boot/config/plugins/dockerMan/templates-user/` kopieren und den Container daraus anlegen.
- Hinter einem Reverse Proxy (Nginx Proxy Manager, SWAG) muss WebSocket-Support für `/ws` aktiv sein.

## Konto & Guthaben

- Registrierung mit Benutzername + Passwort (scrypt-gehasht), Sessions per HttpOnly-Cookie.
- Startguthaben 🪙 10.000, Notfall-Guthaben 🪙 1.000 (unter 🪙 1, einmal pro Stunde).
- **Coins verdienen** („🎁 Belohnungen“ in der Kopfzeile, [server/rewards.js](server/rewards.js)):
  - Tagesbonus 🪙 500, +100 je Tag in Folge bis 🪙 1.500; ein verpasster Tag setzt die Serie zurück
  - 3 Tagesaufgaben (z. B. „3 Runden Blackjack“, „an 3 Tischen spielen“, „Chips sammeln“), Fortschritt automatisch aus den Runden, 🪙 100–400 je Aufgabe
  - Leuchtende Chips (🪙 10–50) liegen in der Halle – drüberlaufen sammelt sie ein, max. 🪙 500 pro Tag
  - 13 Erfolge mit einmaligem Bonus (erste Runde, 100 Runden, 10×-Gewinn, alle 12 Spiele, 5 Siege in Folge, High Roller, 7-Tage-Serie …)
- Profil mit Statistiken und vollständigem Buchungsverlauf, Rangliste nach Guthaben.

## Architektur

- **Server** (`server/`): Express 5, SQLite über `node:sqlite`. Sämtliche Zufallszahlen und Spiellogik laufen
  serverseitig (`crypto.randomInt`); der Browser bekommt nur Ergebnisse. Jede Buchung ist eine SQLite-Transaktion.
  Mehrstufige Spiele (Blackjack, Video Poker, Mines, Crash, Hi-Lo) speichern ihren Zustand in der Tabelle `games`
  und werden nach einem Reload wiederhergestellt.
- **Client** (`public/`): Vanilla JS (ES-Module) + Three.js. Alle Texturen (Karten, Chips, Würfel, Walzen, Filz)
  werden prozedural per Canvas erzeugt – keine Asset-Dateien nötig. `public/js/three/engine.js` kapselt Renderer,
  Kamera, Tweens und Picking; `public/js/games/base.js` ist die Basisklasse aller Spiele.
- **Datenbank**: `data/casino.db` (wird beim ersten Start angelegt).

## Projektstruktur

```
server/            Express-App, Auth, Wallet, Spiellogik (server/games/*)
public/            Frontend: index.html, css/, js/ (app, views, three, games)
scripts/           smoke.js (API-Test), sim-slots.js (RTP-Simulation)
data/              SQLite-Datenbank (automatisch erstellt)
```
