// Rauchtest für Keno gegen eine temporäre Datenbank (eigene Express-App, ohne server/index.js):  node scripts/smoke-keno.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const PORT = 3981;
const BASE = `http://localhost:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'casino-keno-'));
process.env.CASINO_DATA_DIR = dataDir;
process.env.PORT = String(PORT);

// Erst nach dem Setzen der Umgebung laden (db.js liest CASINO_DATA_DIR beim Import)
const { default: express } = await import('express');
const { attachUser, authRouter, requireAuth } = await import('../server/auth.js');
const { kenoRouter, paytable, hitProbability, rtpFor, drawNumbers, multiplierFor, POOL, DRAWS } = await import('../server/games/keno.js');

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(attachUser);
app.use('/api/auth', authRouter);
app.use('/api/games/keno', requireAuth, kenoRouter);
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

const distinct = (arr) => new Set(arr).size === arr.length;
const inRange = (arr) => arr.every((n) => Number.isInteger(n) && n >= 1 && n <= POOL);

try {
  console.log('Auth');
  let r = await api('POST', '/api/auth/register', { username: 'kenotester', password: 'geheim123' });
  check('register', r.status === 201 && r.data.user.balance === 1_000_000, JSON.stringify(r.data));
  let balance = r.data.user.balance;

  console.log('Konfiguration');
  r = await api('GET', '/api/games/keno/config');
  check('config', r.status === 200 && r.data.minSpots === 1 && r.data.maxSpots === 10 && r.data.draws === 20 && r.data.pool === 80, JSON.stringify(r.data));
  check('paytable vollständig (1..10)', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every((n) => r.data.paytable[n] && Object.keys(r.data.paytable[n]).length > 0));
  check('größter Multiplikator ≤ 10000', Object.values(r.data.paytable).every((row) => Object.values(row).every((m) => m <= 10000)));

  console.log('Exakte RTP je Tippanzahl');
  for (let n = 1; n <= 10; n++) {
    let sum = 0;
    for (let k = 0; k <= n; k++) sum += hitProbability(n, k);
    check(`Wahrscheinlichkeiten n=${n} summieren zu 1`, Math.abs(sum - 1) < 1e-9, String(sum));
    const rtp = rtpFor(n);
    check(`RTP n=${n} im Zielbereich 90–96 % (${(rtp * 100).toFixed(2)} %)`, rtp >= 0.9 && rtp <= 0.96);
  }

  console.log('Spielen');
  const numbers = [3, 17, 42, 66, 80];
  const bet = 500;
  r = await api('POST', '/api/games/keno/play', { bet, numbers });
  check('play (5 Tipps) status 200', r.status === 200, JSON.stringify(r.data));
  const d = r.data;
  check('20 gezogene Zahlen, verschieden, im Bereich', Array.isArray(d.drawn) && d.drawn.length === DRAWS && distinct(d.drawn) && inRange(d.drawn));
  check('numbers zurückgegeben', JSON.stringify(d.numbers) === JSON.stringify(numbers));
  const expectHits = numbers.filter((n) => d.drawn.includes(n));
  check('hits konsistent zu drawn', d.hits === expectHits.length && JSON.stringify(d.hitNumbers) === JSON.stringify(expectHits), JSON.stringify(d));
  check('multiplier aus Tabelle', d.multiplier === multiplierFor(5, d.hits));
  check('payout = floor(bet × multiplier)', d.payout === Math.floor(bet * d.multiplier));
  check('Antwortform { bet, payout, balance }', d.bet === bet && typeof d.payout === 'number' && typeof d.balance === 'number');
  check('Buchhaltung: Guthaben = vorher − Einsatz + Auszahlung', d.balance === balance - bet + d.payout, `${d.balance} != ${balance} - ${bet} + ${d.payout}`);
  balance = d.balance;

  // Mehrere Runden mit 10 Tipps, Buchhaltung fortlaufend prüfen
  let ok = true;
  for (let i = 0; i < 5; i++) {
    const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    r = await api('POST', '/api/games/keno/play', { bet: 100, numbers: nums });
    if (r.status !== 200 || r.data.balance !== balance - 100 + r.data.payout || r.data.drawn.length !== 20 || !distinct(r.data.drawn)) { ok = false; break; }
    balance = r.data.balance;
  }
  check('5 Runden mit 10 Tipps, Buchhaltung fortlaufend', ok, JSON.stringify(r.data));
  r = await api('POST', '/api/games/keno/play', { bet: 100, numbers: ['7'] });
  check('1 Tipp als String akzeptiert', r.status === 200 && r.data.numbers[0] === 7 && r.data.multiplier === multiplierFor(1, r.data.hits));
  balance = r.data.balance;

  console.log('Ungültige Eingaben');
  r = await api('POST', '/api/games/keno/play', { bet: 100, numbers: [] });
  check('0 Tipps → 400', r.status === 400, JSON.stringify(r.data));
  r = await api('POST', '/api/games/keno/play', { bet: 100, numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] });
  check('11 Tipps → 400', r.status === 400);
  r = await api('POST', '/api/games/keno/play', { bet: 100, numbers: [5, 5, 9] });
  check('Duplikate → 400', r.status === 400);
  r = await api('POST', '/api/games/keno/play', { bet: 100, numbers: [1, 81] });
  check('Zahl 81 → 400', r.status === 400);
  r = await api('POST', '/api/games/keno/play', { bet: 100, numbers: [0, 5] });
  check('Zahl 0 → 400', r.status === 400);
  r = await api('POST', '/api/games/keno/play', { bet: 100, numbers: [1.5, 5] });
  check('Kommazahl → 400', r.status === 400);
  r = await api('POST', '/api/games/keno/play', { bet: 100, numbers: 'abc' });
  check('numbers kein Array → 400', r.status === 400);
  r = await api('POST', '/api/games/keno/play', { bet: 100 });
  check('numbers fehlt → 400', r.status === 400);
  r = await api('POST', '/api/games/keno/play', { bet: 10, numbers: [1] });
  check('Einsatz unter Minimum → 400', r.status === 400);
  r = await api('POST', '/api/games/keno/play', { bet: 999_999_999_99, numbers: [1] });
  check('Einsatz über Guthaben → 400', r.status === 400);
  r = await api('POST', '/api/games/keno/play', { numbers: [1] });
  check('Einsatz fehlt → 400', r.status === 400);
  cookie = '';
  r = await api('POST', '/api/games/keno/play', { bet: 100, numbers: [1] });
  check('ohne Anmeldung → 401', r.status === 401);
  r = await api('POST', '/api/auth/login', { username: 'kenotester', password: 'geheim123' });
  r = await api('GET', '/api/auth/me');
  check('Guthaben nach Fehlversuchen unverändert', r.data.user?.balance === balance, `${r.data.user?.balance} != ${balance}`);

  console.log('Monte Carlo RTP (drawNumbers + paytable, ohne HTTP)');
  const ROUNDS = { 1: 200_000, 4: 600_000, 10: 50_000 }; // ≥ 20 000; bei n=4 dominiert der 140×-Gewinn (σ ≈ 1 pp bei 600 000)
  for (const n of [1, 4, 10]) {
    const picks = Array.from({ length: n }, (_, i) => i * 7 + 1); // feste Tipps (die Ziehung ist zufällig)
    let paid = 0;
    let bad = false;
    const rounds = ROUNDS[n];
    for (let i = 0; i < rounds; i++) {
      const drawn = drawNumbers();
      if (drawn.length !== DRAWS || !distinct(drawn) || !inRange(drawn)) { bad = true; break; }
      const set = new Set(drawn);
      const hits = picks.filter((p) => set.has(p)).length;
      paid += multiplierFor(n, hits);
    }
    check(`drawNumbers liefert stets 20 verschiedene Zahlen (n=${n})`, !bad);
    const mc = paid / rounds;
    const exact = rtpFor(n);
    const diff = Math.abs(mc - exact) * 100;
    const limit = n <= 4 ? 3 : 25; // bei 10 Tipps dominieren seltene Großgewinne, daher nur grobe Prüfung
    check(`Monte Carlo n=${n} (${rounds.toLocaleString('de-DE')} Runden): ${(mc * 100).toFixed(2)} % vs. exakt ${(exact * 100).toFixed(2)} % (Δ ${diff.toFixed(2)} pp)`, diff < limit);
  }
  // Empirische Trefferverteilung gegen hypergeometrisch (n = 4, 2 Treffer: P ≈ 21,3 %)
  let two = 0;
  const DIST = 50_000;
  for (let i = 0; i < DIST; i++) { const set = new Set(drawNumbers()); two += [10, 20, 30, 40].filter((p) => set.has(p)).length === 2 ? 1 : 0; }
  check(`Verteilung: 2 von 4 Treffern ≈ ${(hitProbability(4, 2) * 100).toFixed(1)} % (gemessen ${((two / DIST) * 100).toFixed(1)} %)`, Math.abs(two / DIST - hitProbability(4, 2)) < 0.01);
  check('paytable exportiert', paytable[10][10] === 10000);
} catch (err) {
  failures++;
  console.error('FEHLER', err);
} finally {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  console.log(failures ? `\n${failures} Fehler` : '\nAlle Tests bestanden');
  process.exit(failures ? 1 : 0);
}
