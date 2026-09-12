// Rauchtest für Casino War gegen eine temporäre Datenbank (eigene Express-App, ohne server/index.js):  node scripts/smoke-war.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const PORT = 3983;
const BASE = `http://localhost:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'casino-war-'));
process.env.CASINO_DATA_DIR = dataDir;
process.env.PORT = String(PORT);

// Erst nach dem Setzen der Umgebung laden (db.js liest CASINO_DATA_DIR beim Import)
const { default: express } = await import('express');
const { attachUser, authRouter, requireAuth } = await import('../server/auth.js');
const { warRouter, cardValue, resolveWar, surrenderPayout, simulateRound } = await import('../server/games/war.js');
const { newShoe } = await import('../server/games/cards.js');
const { randInt } = await import('../server/games/rng.js');

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(attachUser);
app.use('/api/auth', authRouter);
app.use('/api/games/war', requireAuth, warRouter);
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Ungültiges JSON' });
  if (!err.expose) console.error(err);
  res.status(err.status ?? 500).json({ error: err.expose ? err.message : 'Serverfehler' });
});
const server = http.createServer(app);
await new Promise((resolve) => server.listen(PORT, resolve));

let cookie = '';
let failures = 0;

async function api(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const data = await res.json();
  return { status: res.status, data };
}

function check(name, cond, extra = '') {
  if (cond) console.log(`  ✔ ${name}`);
  else { failures++; console.log(`  ✘ ${name} ${extra}`); }
}

const isCard = (c) => c && Number.isInteger(c.r) && c.r >= 1 && c.r <= 13 && 'SHDC'.includes(c.s);
const shapeOk = (g) => g && typeof g.id === 'string' && Number.isInteger(g.ante) && Number.isInteger(g.bet)
  && ['tie', 'finished'].includes(g.status) && Array.isArray(g.player) && Array.isArray(g.dealer)
  && g.player.every(isCard) && g.dealer.every(isCard) && Number.isInteger(g.burned) && typeof g.balance === 'number';

/** Monte-Carlo: Karten aus einem 6er-Schuh ohne Neumischen je Runde (Teil-Fisher-Yates), wie im Spiel frischer Schuh je Runde */
function monteCarlo(rounds, strategy, ante = 100) {
  const shoe = newShoe(6);
  let used = 0;
  const draw = () => {
    const j = used + randInt(0, shoe.length - used);
    [shoe[used], shoe[j]] = [shoe[j], shoe[used]];
    return shoe[used++];
  };
  let wagered = 0; let anteTotal = 0; let payout = 0;
  const results = {};
  for (let i = 0; i < rounds; i++) {
    used = 0; // frischer Schuh je Runde (wie der Server)
    const r = simulateRound(draw, ante, strategy);
    wagered += r.wagered; anteTotal += ante; payout += r.payout;
    results[r.result] = (results[r.result] ?? 0) + 1;
  }
  return { rtp: payout / wagered, rtpAnte: payout / anteTotal, results };
}

try {
  console.log('Auth');
  let r = await api('POST', '/api/auth/register', { username: 'wartester', password: 'geheim123' });
  check('register', r.status === 201 && r.data.user.balance === 1_000_000, JSON.stringify(r.data));
  let balance = r.data.user.balance;

  console.log('Reine Logik');
  check('cardValue: Ass = 14', cardValue({ r: 1, s: 'S' }) === 14);
  check('cardValue: König = 13 < Ass', cardValue({ r: 13, s: 'H' }) === 13 && cardValue({ r: 13, s: 'H' }) < cardValue({ r: 1, s: 'D' }));
  check('cardValue: 2 = 2, 10 = 10, Bube = 11, Dame = 12', cardValue({ r: 2, s: 'C' }) === 2 && cardValue({ r: 10, s: 'C' }) === 10 && cardValue({ r: 11, s: 'C' }) === 11 && cardValue({ r: 12, s: 'C' }) === 12);
  let x = resolveWar({ r: 1, s: 'S' }, { r: 13, s: 'H' }, 1000, 'start');
  check('start: Ass schlägt König → win 2×', x.status === 'finished' && x.result === 'win' && x.payout === 2000, JSON.stringify(x));
  x = resolveWar({ r: 2, s: 'S' }, { r: 13, s: 'H' }, 1000, 'start');
  check('start: 2 gegen König → lose 0', x.status === 'finished' && x.result === 'lose' && x.payout === 0, JSON.stringify(x));
  x = resolveWar({ r: 7, s: 'S' }, { r: 7, s: 'H' }, 1000, 'start');
  check('start: 7 gegen 7 → tie (Farbe egal)', x.status === 'tie' && x.result === null && x.payout === null, JSON.stringify(x));
  x = resolveWar({ r: 12, s: 'S' }, { r: 11, s: 'H' }, 1000, 'war');
  check('war: Dame schlägt Bube → war_win 3×', x.status === 'finished' && x.result === 'war_win' && x.payout === 3000, JSON.stringify(x));
  x = resolveWar({ r: 3, s: 'S' }, { r: 4, s: 'H' }, 1000, 'war');
  check('war: 3 gegen 4 → war_lose 0', x.result === 'war_lose' && x.payout === 0, JSON.stringify(x));
  x = resolveWar({ r: 1, s: 'S' }, { r: 1, s: 'C' }, 1000, 'war');
  check('war: Ass gegen Ass → war_tie 4× (Bonus)', x.result === 'war_tie' && x.payout === 4000, JSON.stringify(x));
  check('surrender: floor(ante/2)', surrenderPayout(1000) === 500 && surrenderPayout(1001) === 500 && surrenderPayout(1) === 0);

  console.log('HTTP: Eingaben');
  r = await api('GET', '/api/games/war/current');
  check('current ohne Spiel → null', r.status === 200 && r.data.game === null, JSON.stringify(r.data));
  r = await api('POST', '/api/games/war/war');
  check('war ohne laufendes Spiel → 400', r.status === 400);
  r = await api('POST', '/api/games/war/surrender');
  check('surrender ohne laufendes Spiel → 400', r.status === 400);
  r = await api('POST', '/api/games/war/start', { bet: 10 });
  check('Einsatz unter Minimum → 400', r.status === 400);
  r = await api('POST', '/api/games/war/start', { bet: 'abc' });
  check('ungültiger Einsatz → 400', r.status === 400);
  r = await api('POST', '/api/games/war/start', {});
  check('fehlender Einsatz → 400', r.status === 400);
  r = await api('POST', '/api/games/war/start', { bet: 999_999_999_99 });
  check('Einsatz über Guthaben → 400', r.status === 400);
  r = await api('GET', '/api/games/war/current');
  check('nach abgelehnten Starts kein Spiel aktiv', r.data.game === null);

  console.log('HTTP: Runden bis zum ersten Gleichstand (Krieg)');
  const BET = 500;
  let tieGame = null; let starts = 0; let finishedOk = true; let bookOk = true;
  for (let i = 0; i < 400 && !tieGame; i++) {
    r = await api('POST', '/api/games/war/start', { bet: BET });
    starts++;
    if (r.status !== 200 || !shapeOk(r.data.game)) { finishedOk = false; console.log('    Antwort:', JSON.stringify(r.data)); break; }
    const g = r.data.game;
    if (g.status === 'tie') { tieGame = g; break; }
    // abgeschlossene Runde: Ergebnis und Buchhaltung prüfen
    const p = cardValue(g.player[0]); const d = cardValue(g.dealer[0]);
    const expect = p > d ? ['win', BET * 2] : ['lose', 0];
    if (g.result !== expect[0] || g.payout !== expect[1] || g.bet !== BET || g.ante !== BET || g.player.length !== 1 || g.dealer.length !== 1 || g.burned !== 0) finishedOk = false;
    if (g.balance !== balance - BET + g.payout) bookOk = false;
    balance = g.balance;
  }
  check(`Antwortform & Ergebnis aller abgeschlossenen Starts (${starts} Starts)`, finishedOk);
  check('Buchhaltung abgeschlossener Runden (Guthaben = vorher − Einsatz + Auszahlung)', bookOk);
  check('Gleichstand innerhalb von 400 Starts aufgetreten', !!tieGame);
  if (tieGame) {
    check('tie: Karten gleichwertig, kein Ergebnis, Einsatz abgezogen', cardValue(tieGame.player[0]) === cardValue(tieGame.dealer[0]) && tieGame.result === null && tieGame.payout === null && tieGame.balance === balance - BET, JSON.stringify(tieGame));
    balance = tieGame.balance;
    r = await api('GET', '/api/games/war/current');
    check('current liefert das laufende tie-Spiel', r.status === 200 && r.data.game?.id === tieGame.id && r.data.game.status === 'tie', JSON.stringify(r.data));
    r = await api('POST', '/api/games/war/start', { bet: BET });
    check('start während laufendem Spiel → 400', r.status === 400);
    r = await api('POST', '/api/games/war/war');
    check('war → 200 und finished', r.status === 200 && shapeOk(r.data.game) && r.data.game.status === 'finished', JSON.stringify(r.data));
    if (r.status === 200) {
      const g = r.data.game;
      check('war: 3 Karten verbrannt, je 2 Karten', g.burned === 3 && g.player.length === 2 && g.dealer.length === 2);
      check('war: Gesamteinsatz 2×Ante', g.bet === BET * 2 && g.ante === BET);
      const p = cardValue(g.player[1]); const d = cardValue(g.dealer[1]);
      const expect = p > d ? ['war_win', BET * 3] : p < d ? ['war_lose', 0] : ['war_tie', BET * 4];
      check(`war: Ergebnis ${g.result} passt zu den Karten`, g.result === expect[0] && g.payout === expect[1], JSON.stringify(g));
      check('war: Buchhaltung (zweiter Einsatz abgezogen, Auszahlung gutgeschrieben)', g.balance === balance - BET + g.payout, `balance=${g.balance} erwartet=${balance - BET + g.payout}`);
      balance = g.balance;
    }
    r = await api('POST', '/api/games/war/war');
    check('war doppelt → 400', r.status === 400);
    r = await api('POST', '/api/games/war/surrender');
    check('surrender nach Abschluss → 400', r.status === 400);
    r = await api('GET', '/api/games/war/current');
    check('current nach Abschluss → null', r.data.game === null);
  }

  console.log('HTTP: Runden bis zum nächsten Gleichstand (Aufgeben)');
  tieGame = null; starts = 0; bookOk = true;
  for (let i = 0; i < 400 && !tieGame; i++) {
    r = await api('POST', '/api/games/war/start', { bet: BET + 1 }); // ungerade Ante: floor(ante/2) prüfen
    starts++;
    if (r.status !== 200) { bookOk = false; break; }
    const g = r.data.game;
    if (g.status === 'tie') { tieGame = g; break; }
    if (g.balance !== balance - (BET + 1) + g.payout) bookOk = false;
    balance = g.balance;
  }
  check(`Buchhaltung bis zum Gleichstand (${starts} Starts)`, bookOk);
  check('zweiter Gleichstand innerhalb von 400 Starts aufgetreten', !!tieGame);
  if (tieGame) {
    balance = tieGame.balance;
    r = await api('POST', '/api/games/war/surrender');
    check('surrender → 200 und finished', r.status === 200 && shapeOk(r.data.game) && r.data.game.status === 'finished', JSON.stringify(r.data));
    if (r.status === 200) {
      const g = r.data.game;
      check('surrender: result und halbe Ante (abgerundet)', g.result === 'surrender' && g.payout === Math.floor((BET + 1) / 2) && g.bet === BET + 1 && g.burned === 0 && g.player.length === 1);
      check('surrender: Buchhaltung', g.balance === balance + g.payout, `balance=${g.balance} erwartet=${balance + g.payout}`);
      balance = g.balance;
    }
    r = await api('POST', '/api/games/war/surrender');
    check('surrender doppelt → 400', r.status === 400);
    r = await api('POST', '/api/games/war/war');
    check('war nach Aufgabe → 400', r.status === 400);
  }
  r = await api('GET', '/api/auth/me');
  check('Kontostand laut /me stimmt mit Buchhaltung überein', r.data.user?.balance === balance, `me=${r.data.user?.balance} erwartet=${balance}`);

  console.log('Monte Carlo (reine Logik, 300.000 Runden je Strategie)');
  const N = 300_000;
  const mcWar = monteCarlo(N, 'war');
  const tieRate = ((mcWar.results.war_win ?? 0) + (mcWar.results.war_tie ?? 0) + (mcWar.results.war_lose ?? 0)) / N;
  console.log(`    immer Krieg:    RTP ${(mcWar.rtp * 100).toFixed(2)} % vom Gesamteinsatz · ${(mcWar.rtpAnte * 100).toFixed(2)} % von der Ante · Gleichstandsquote ${(tieRate * 100).toFixed(2)} %`);
  check('Gleichstandsquote ≈ 7,4 % (6 Decks)', tieRate > 0.068 && tieRate < 0.08);
  check(`RTP „immer Krieg“ im Zielbereich 96–98,5 % (${(mcWar.rtp * 100).toFixed(2)} %)`, mcWar.rtp >= 0.96 && mcWar.rtp <= 0.985);
  const mcSur = monteCarlo(N, 'surrender');
  console.log(`    immer aufgeben: RTP ${(mcSur.rtp * 100).toFixed(2)} % (theoretisch 96,30 %)`);
  check(`RTP „immer aufgeben“ im Zielbereich 95,5–97 % (${(mcSur.rtp * 100).toFixed(2)} %)`, mcSur.rtp >= 0.955 && mcSur.rtp <= 0.97);
  check('Krieg lohnt sich mehr als Aufgeben', mcWar.rtpAnte > mcSur.rtpAnte);
} catch (err) {
  failures++;
  console.error('FEHLER', err);
} finally {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  console.log(failures ? `\n${failures} Fehler` : '\nAlle Tests bestanden');
  process.exit(failures ? 1 : 0);
}
