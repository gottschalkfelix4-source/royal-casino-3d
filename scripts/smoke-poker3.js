// Rauchtest für Three Card Poker gegen eine temporäre Datenbank (eigene Express-App, ohne server/index.js):  node scripts/smoke-poker3.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const PORT = 3982;
const BASE = `http://localhost:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'casino-poker3-'));
process.env.CASINO_DATA_DIR = dataDir;
process.env.PORT = String(PORT);

// Erst nach dem Setzen der Umgebung laden (db.js liest CASINO_DATA_DIR beim Import)
const { default: express } = await import('express');
const { attachUser, authRouter, requireAuth } = await import('../server/auth.js');
const { poker3Router, rank3, compare3, settle, dealRound, dealerQualifies, PAIR_PLUS } = await import('../server/games/poker3.js');

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(attachUser);
app.use('/api/auth', authRouter);
app.use('/api/games/poker3', requireAuth, poker3Router);
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

// Kurzschreibweise für Karten: 'AS' = Pik-Ass, 'TD' = Karo-10, 'QH' = Herz-Dame
const R = { A: 1, T: 10, J: 11, Q: 12, K: 13 };
const c = (str) => ({ r: R[str[0]] ?? Number(str[0]), s: str[1] });
const hand = (...cards) => cards.map(c);
const isCardList = (arr) => Array.isArray(arr) && arr.length === 3 && arr.every((x) => x.r >= 1 && x.r <= 13 && 'SHDC'.includes(x.s));
const isHidden = (arr) => Array.isArray(arr) && arr.length === 3 && arr.every((x) => x.hidden === true);
const gameShape = (g) => g && typeof g.id === 'string' && Number.isInteger(g.ante) && Number.isInteger(g.pairplus) && Number.isInteger(g.bet)
  && isCardList(g.player) && typeof g.playerRank?.name === 'string' && Number.isInteger(g.playerRank?.category) && 'result' in g && 'anteBonus' in g && 'pairPlusWin' in g;

try {
  console.log('Blattbewertung (rank3 / compare3)');
  const wheel = rank3(hand('AS', '2H', '3D'));
  const low = rank3(hand('2S', '3H', '4D'));
  const broadway = rank3(hand('QS', 'KH', 'AD'));
  check('A-2-3 ist Straße', wheel.category === 3 && wheel.name === 'Straße');
  check('A-2-3 < 2-3-4', compare3(wheel, low) === -1);
  check('Q-K-A ist höchste Straße', broadway.category === 3 && compare3(broadway, rank3(hand('JS', 'QH', 'KD'))) === 1);
  check('Drilling > Straße', compare3(rank3(hand('2S', '2H', '2D')), broadway) === 1);
  check('Flush < Straße', compare3(rank3(hand('AS', 'KS', '9S')), wheel) === -1);
  check('Straight Flush > Drilling', compare3(rank3(hand('AS', '2S', '3S')), rank3(hand('AH', 'AD', 'AC'))) === 1);
  check('Straight Flush erkannt', rank3(hand('QH', 'KH', 'AH')).category === 5 && rank3(hand('QH', 'KH', 'AH')).name === 'Straight Flush');
  check('Paar > Hohe Karte', compare3(rank3(hand('2S', '2H', '3D')), rank3(hand('AS', 'KH', '9D'))) === 1);
  check('Paar gegen Paar: Paarrang entscheidet', compare3(rank3(hand('9S', '9H', '2D')), rank3(hand('8S', '8H', 'AD'))) === 1);
  check('Paar gegen Paar: Kicker entscheidet', compare3(rank3(hand('9S', '9H', 'KD')), rank3(hand('9C', '9D', 'QD'))) === 1);
  check('Asse-Paar > Könige-Paar', compare3(rank3(hand('AS', 'AH', '2D')), rank3(hand('KS', 'KH', 'QD'))) === 1);
  check('Hohe Karte: zweite Karte entscheidet', compare3(rank3(hand('AS', 'KH', '2D')), rank3(hand('AD', 'QH', 'JD'))) === 1);
  check('Gleiche Blätter (andere Farben) = Unentschieden', compare3(rank3(hand('AS', 'KH', '2D')), rank3(hand('AD', 'KC', '2H'))) === 0);
  check('Flush mit Ass > Flush mit König', compare3(rank3(hand('AS', '9S', '2S')), rank3(hand('KH', '9H', '2H'))) === 1);
  check('Karten-Arrays direkt vergleichbar', compare3(hand('AS', 'AH', 'AD'), hand('KS', 'QH', 'JD')) === 1);

  console.log('Dealer-Qualifikation');
  check('J-hoch qualifiziert nicht', dealerQualifies(rank3(hand('JS', '9H', '4D'))) === false);
  check('Q-hoch qualifiziert', dealerQualifies(rank3(hand('QS', '3H', '2D'))) === true);
  check('Paar qualifiziert', dealerQualifies(rank3(hand('2S', '2H', '3D'))) === true);

  console.log('Auswertung (settle)');
  let s = settle({ player: hand('KS', '9H', '4D'), dealer: hand('JS', '9C', '4C'), ante: 1000, pairplus: 0 }, 'play');
  check('Dealer nicht qualifiziert: Ante 1:1 + Play zurück', s.result === 'no_qualify' && s.payout === 3000 && s.anteBonus === 0 && s.pairPlusWin === 0, JSON.stringify(s));
  s = settle({ player: hand('KS', '9H', '4D'), dealer: hand('QS', '9C', '4C'), ante: 1000, pairplus: 0 }, 'play');
  check('Dealer qualifiziert, Spieler besser: Ante + Play je 1:1', s.result === 'win' && s.payout === 4000);
  s = settle({ player: hand('QS', '9H', '4D'), dealer: hand('KS', '9C', '4C'), ante: 1000, pairplus: 500 }, 'play');
  check('Dealer besser: alles verloren', s.result === 'lose' && s.payout === 0 && s.pairPlusWin === 0);
  s = settle({ player: hand('KS', '9H', '4D'), dealer: hand('KC', '9C', '4H'), ante: 1000, pairplus: 0 }, 'play');
  check('Gleiches Blatt: beide Einsätze zurück', s.result === 'push' && s.payout === 2000);
  s = settle({ player: hand('2S', '3H', '4D'), dealer: hand('AS', 'AH', 'AD'), ante: 1000, pairplus: 0 }, 'play');
  check('Ante-Bonus Straße 1:1 trotz Verlust', s.result === 'lose' && s.anteBonus === 1000 && s.payout === 1000);
  s = settle({ player: hand('7S', '7H', '7D'), dealer: hand('JS', '9C', '4C'), ante: 1000, pairplus: 200 }, 'play');
  check('Drilling: Ante-Bonus 4:1 + Pair Plus 30:1 + no_qualify', s.result === 'no_qualify' && s.anteBonus === 4000 && s.pairPlusWin === 200 * 31 && s.payout === 3000 + 4000 + 6200, JSON.stringify(s));
  s = settle({ player: hand('QS', 'KS', 'AS'), dealer: hand('QH', 'KH', 'AH'), ante: 1000, pairplus: 100 }, 'play');
  check('Straight Flush gegen Straight Flush: Push + Bonus 5:1 + Pair Plus 40:1', s.result === 'push' && s.anteBonus === 5000 && s.pairPlusWin === 4100 && s.payout === 2000 + 5000 + 4100);
  s = settle({ player: hand('9S', '9H', '4D'), dealer: hand('AS', 'KC', '4C'), ante: 1000, pairplus: 500 }, 'fold');
  check('Passen mit Paar: nur Pair Plus 1:1 (inkl. Rückgabe)', s.result === 'fold' && s.payout === 1000 && s.anteBonus === 0 && s.pairPlusWin === 1000);
  s = settle({ player: hand('9S', '8H', '4D'), dealer: hand('AS', 'KC', '4C'), ante: 1000, pairplus: 500 }, 'fold');
  check('Passen ohne Paar: alles verloren', s.result === 'fold' && s.payout === 0);
  s = settle({ player: hand('2S', '3H', '4D'), dealer: hand('JS', '9C', '4C'), ante: 1000, pairplus: 0 }, 'fold');
  check('Passen mit Straße: kein Ante-Bonus', s.anteBonus === 0 && s.payout === 0);
  s = settle({ player: hand('2S', '9S', '4S'), dealer: hand('JS', '9C', '4C'), ante: 1000, pairplus: 300 }, 'fold');
  check('Passen mit Flush: Pair Plus 4:1', s.pairPlusWin === 1500 && s.payout === 1500);

  console.log('Auth');
  let r = await api('POST', '/api/auth/register', { username: 'poker3tester', password: 'geheim123' });
  check('register', r.status === 201 && r.data.user.balance === 1_000_000, JSON.stringify(r.data));
  let balance = r.data.user.balance;

  console.log('HTTP-Endpunkte');
  r = await api('GET', '/api/games/poker3/current');
  check('current ohne Spiel → null', r.status === 200 && r.data.game === null);
  r = await api('POST', '/api/games/poker3/start', {});
  check('start ohne Einsatz → 400', r.status === 400 && typeof r.data.error === 'string');
  r = await api('POST', '/api/games/poker3/start', { bet: 10 });
  check('start unter Mindesteinsatz → 400', r.status === 400);
  r = await api('POST', '/api/games/poker3/start', { bet: 1000, pairplus: 6000 });
  check('Pair Plus über 5× Ante → 400', r.status === 400);
  r = await api('POST', '/api/games/poker3/start', { bet: 1000, pairplus: -5 });
  check('negatives Pair Plus → 400', r.status === 400);
  r = await api('POST', '/api/games/poker3/start', { bet: 1000, pairplus: 'abc' });
  check('ungültiges Pair Plus → 400', r.status === 400);
  r = await api('POST', '/api/games/poker3/play');
  check('play ohne Spiel → 400', r.status === 400);
  r = await api('POST', '/api/games/poker3/fold');
  check('fold ohne Spiel → 400', r.status === 400);

  // start → play
  r = await api('POST', '/api/games/poker3/start', { bet: 1000, pairplus: 500 });
  check('start (Ante 10 + Pair Plus 5)', r.status === 200 && gameShape(r.data.game) && r.data.game.status === 'decide' && r.data.game.ante === 1000 && r.data.game.pairplus === 500 && r.data.game.bet === 1500, JSON.stringify(r.data));
  check('Dealerkarten verdeckt, Dealer-Rang unbekannt', isHidden(r.data.game.dealer) && r.data.game.dealerRank === null && r.data.game.result === null);
  check('Guthaben nach Start = vorher − Gesamteinsatz', r.data.game.balance === balance - 1500, `${r.data.game.balance} vs ${balance - 1500}`);
  balance = r.data.game.balance;
  const startedId = r.data.game.id;
  r = await api('POST', '/api/games/poker3/start', { bet: 1000 });
  check('doppelter start → 400', r.status === 400);
  r = await api('GET', '/api/games/poker3/current');
  check('current liefert laufendes Spiel', r.status === 200 && r.data.game?.id === startedId && r.data.game.status === 'decide' && isHidden(r.data.game.dealer));
  r = await api('POST', '/api/games/poker3/play');
  let g = r.data.game;
  check('play → finished', r.status === 200 && gameShape(g) && g.status === 'finished' && g.bet === 2500 && isCardList(g.dealer) && typeof g.dealerRank?.name === 'string' && typeof g.dealerQualifies === 'boolean', JSON.stringify(r.data));
  check('play: Ergebnis gültig', ['win', 'lose', 'push', 'no_qualify'].includes(g.result));
  {
    const exp = settle({ player: g.player, dealer: g.dealer, ante: g.ante, pairplus: g.pairplus }, 'play');
    check('play: Auszahlung entspricht settle()', g.payout === exp.payout && g.result === exp.result && g.anteBonus === exp.anteBonus && g.pairPlusWin === exp.pairPlusWin, JSON.stringify({ g, exp }));
    check('play: Guthaben = vorher − Ante (Play) + Auszahlung', g.balance === balance - 1000 + g.payout, `${g.balance} vs ${balance - 1000 + g.payout}`);
    balance = g.balance;
  }
  r = await api('POST', '/api/games/poker3/play');
  check('doppeltes play → 400', r.status === 400);
  r = await api('POST', '/api/games/poker3/fold');
  check('fold nach Ende → 400', r.status === 400);
  r = await api('GET', '/api/games/poker3/current');
  check('current nach Ende → null', r.data.game === null);

  // start → fold (ohne Pair Plus)
  r = await api('POST', '/api/games/poker3/start', { bet: 2000 });
  check('start ohne Pair Plus (Standard 0)', r.status === 200 && r.data.game.pairplus === 0 && r.data.game.bet === 2000 && r.data.game.balance === balance - 2000);
  balance = r.data.game.balance;
  r = await api('POST', '/api/games/poker3/fold');
  g = r.data.game;
  check('fold → finished, result fold', r.status === 200 && g.status === 'finished' && g.result === 'fold' && g.payout === 0 && g.anteBonus === 0 && g.bet === 2000, JSON.stringify(r.data));
  check('fold: Dealerkarten aufgedeckt', isCardList(g.dealer) && typeof g.dealerRank?.name === 'string');
  check('fold: Guthaben unverändert (Ante verloren)', g.balance === balance);
  balance = g.balance;

  // start → fold mit Pair Plus: Buchhaltung inkl. möglicher Pair-Plus-Auszahlung
  r = await api('POST', '/api/games/poker3/start', { bet: 1000, pairplus: 5000 });
  check('start mit Pair Plus = 5× Ante erlaubt', r.status === 200 && r.data.game.pairplus === 5000 && r.data.game.bet === 6000);
  balance = r.data.game.balance;
  r = await api('POST', '/api/games/poker3/fold');
  g = r.data.game;
  {
    const exp = settle({ player: g.player, dealer: g.dealer, ante: g.ante, pairplus: g.pairplus }, 'fold');
    check('fold mit Pair Plus: Auszahlung = settle()', g.payout === exp.payout && g.pairPlusWin === exp.pairPlusWin, JSON.stringify({ g, exp }));
    check('fold mit Pair Plus: Guthaben = vorher + Pair-Plus-Auszahlung', g.balance === balance + g.payout);
    balance = g.balance;
  }

  // Mehrere Runden: Buchhaltung über HTTP bleibt konsistent
  let ok = true;
  for (let i = 0; i < 12 && ok; i++) {
    r = await api('POST', '/api/games/poker3/start', { bet: 500, pairplus: i % 2 ? 100 : 0 });
    if (r.status !== 200 || r.data.game.balance !== balance - 500 - (i % 2 ? 100 : 0)) { ok = false; break; }
    balance = r.data.game.balance;
    const action = i % 3 === 0 ? 'fold' : 'play';
    r = await api('POST', `/api/games/poker3/${action}`);
    g = r.data.game;
    const expected = balance - (action === 'play' ? 500 : 0) + g.payout;
    if (r.status !== 200 || g.balance !== expected) { ok = false; break; }
    balance = g.balance;
  }
  check('12 Runden: Buchhaltung konsistent', ok, JSON.stringify(r.data));
  r = await api('POST', '/api/games/poker3/start', { bet: balance + 1 });
  check('Einsatz über Guthaben → 400', r.status === 400);

  console.log('Monte Carlo (reine Logik, ohne HTTP)');
  // Strategie: SPIELEN bei Q-6-4 oder besser, sonst PASSEN (nur Ante)
  const Q64 = rank3(hand('QS', '6H', '4D'));
  const N = 30_000;
  let wagered = 0; let anteTotal = 0; let returned = 0;
  let ppWagered = 0; let ppReturned = 0;
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const { player, dealer } = dealRound();
    const action = compare3(rank3(player), Q64) >= 0 ? 'play' : 'fold';
    const res = settle({ player, dealer, ante: 100, pairplus: 0 }, action);
    anteTotal += 100;
    wagered += action === 'play' ? 200 : 100;
    returned += res.payout;
    // Pair Plus separat (unabhängig von der Entscheidung, nur Spielerblatt)
    const pp = settle({ player, dealer, ante: 100, pairplus: 100 }, 'fold');
    ppWagered += 100; ppReturned += pp.pairPlusWin;
  }
  const rtpTotal = returned / wagered * 100;
  const rtpAnte = returned / anteTotal * 100;
  const rtpPP = ppReturned / ppWagered * 100;
  console.log(`  ${N} Runden in ${Date.now() - t0} ms · RTP Ante/Play bezogen auf Gesamteinsatz ${rtpTotal.toFixed(2)} % (bezogen auf Ante ${rtpAnte.toFixed(2)} %) · Pair Plus ${rtpPP.toFixed(2)} %`);
  check('RTP Ante/Play (Gesamteinsatz) im Zielbereich 95–99,5 % (Theorie ≈ 98,0 %)', rtpTotal >= 95 && rtpTotal <= 99.5, rtpTotal.toFixed(2));
  const wagerFactor = wagered / anteTotal;
  check('RTP bezogen auf Ante = RTP(Gesamteinsatz) × Einsatzfaktor (je nach Spielen/Passen)', Math.abs(rtpAnte - rtpTotal * wagerFactor) < 1e-9, `${rtpAnte.toFixed(2)} vs ${(rtpTotal * wagerFactor).toFixed(2)}`);
  check('Pair Plus RTP (Monte Carlo) im Bereich 92–99 %', rtpPP >= 92 && rtpPP <= 99, rtpPP.toFixed(2));

  // Exakte Pair-Plus-Rückzahlung durch Aufzählung aller C(52,3) = 22.100 Blätter
  const deck = [];
  for (const su of 'SHDC') for (let rk = 1; rk <= 13; rk++) deck.push({ r: rk, s: su });
  let exact = 0; let hands = 0;
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) for (let d = b + 1; d < 52; d++) {
    const cat = rank3([deck[a], deck[b], deck[d]]).category;
    exact += PAIR_PLUS[cat] ? PAIR_PLUS[cat] + 1 : 0;
    hands++;
  }
  const rtpExact = exact / hands * 100;
  console.log(`  Pair Plus exakt (${hands} Blätter): ${rtpExact.toFixed(2)} %`);
  check('Pair Plus RTP exakt im Zielbereich 96–99 %', hands === 22100 && rtpExact >= 96 && rtpExact <= 99, rtpExact.toFixed(2));
} catch (err) {
  failures++;
  console.error('FEHLER', err);
} finally {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  console.log(failures ? `\n${failures} Fehler` : '\nAlle Tests bestanden');
  process.exit(failures ? 1 : 0);
}
