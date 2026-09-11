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
- **Technik**: WebSocket (`/ws`, Paket `ws`), Auth über das Session-Cookie, Positionen 10 Hz, Chat mit Rate-Limit.
- **Bots**: Damit die Halle nicht leer ist, laufen standardmäßig 3 als 🤖 markierte Bots herum.
  Abschalten mit `CASINO_BOTS=0`, mehr mit z. B. `CASINO_BOTS=6`.
- **Grafikqualität**: Der ⚙-Schalter in der Kopfzeile wechselt zwischen Hoch / Mittel / Niedrig
  (Pixeldichte, Schatten). Rendering läuft über WebGL auf der GPU – bei ruckelnder Darstellung im Browser die
  Hardwarebeschleunigung aktivieren (Chrome: `chrome://settings/system`).

## Konto & Guthaben

- Registrierung mit Benutzername + Passwort (scrypt-gehasht), Sessions per HttpOnly-Cookie.
- Startguthaben 🪙 10.000, Tagesbonus 🪙 5.000 (alle 24 h), Notfall-Guthaben 🪙 1.000 (unter 🪙 1, einmal pro Stunde).
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
