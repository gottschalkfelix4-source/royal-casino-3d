// Rauchtest für das Derby gegen eine temporäre Datenbank (eigene Express-App, ohne server/index.js):  node scripts/smoke-derby.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const PORT = 3985;
const BASE = `http://localhost:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'casino-derby-'));
process.env.CASINO_DATA_DIR = dataDir;
process.env.PORT = String(PORT);

// Erst nach dem Setzen der Umgebung laden (db.js liest CASINO_DATA_DIR beim Import)
const { default: express } = await import('express');
const { attachUser, authRouter, requireAuth } = await import('../server/auth.js');
const { derbyRouter, HORSES, RTP, winProbabilities, drawWinner, raceOrder } = await import('../server/games/derby.js');

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(attachUser);
app.use('/api/auth', authRouter);
app.use('/api/games/derby', requireAuth, derbyRouter);
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

const IDS = new Set(HORSES.map((h) => h.id));
const isPermutation = (order) => Array.isArray(order) && order.length === HORSES.length && new Set(order).size === HORSES.length && order.every((id) => IDS.has(id));
const shapeOk = (d) => d && typeof d.bet === 'number' && typeof d.payout === 'number' && typeof d.balance === 'number'
  && isPermutation(d.order) && IDS.has(d.winner) && IDS.has(d.horse) && typeof d.won === 'boolean';

try {
  console.log('Reine Logik');
  const probs = winProbabilities();
  check('Gewinnwahrscheinlichkeiten summieren zu 1', Math.abs(probs.reduce((a, b) => a + b, 0) - 1) < 1e-12, String(probs.reduce((a, b) => a + b, 0)));
  check('RTP = 1 / Σ(1/Quote)', Math.abs(RTP - 1 / HORSES.reduce((s, h) => s + 1 / h.odds, 0)) < 1e-12, String(RTP));
  check('RTP im Zielbereich 90–95 %', RTP >= 0.9 && RTP <= 0.95, `${(RTP * 100).toFixed(2)} %`);
  check('jedes Pferd hat dieselbe Auszahlungsquote', HORSES.every((h, i) => Math.abs(probs[i] * h.odds - RTP) < 1e-12));
  const order = raceOrder();
  check('raceOrder ist eine Permutation aller Pferde', isPermutation(order), JSON.stringify(order));

  console.log('Auth');
  let r = await api('POST', '/api/auth/register', { username: 'derbytester', password: 'geheim123' });
  check('register', r.status === 201 && r.data.user.balance === 1_000_000, JSON.stringify(r.data));
  let balance = r.data.user.balance;

  console.log('Konfiguration');
  r = await api('GET', '/api/games/derby/config');
  check('config liefert 6 Pferde mit Quote und Farbe', r.status === 200 && r.data.horses.length === 6 && r.data.horses.every((h) => h.id && h.name && h.color && h.odds > 1), JSON.stringify(r.data));

  console.log('Spielen');
  const horse = HORSES[0].id;
  const bet = 500;
  r = await api('POST', '/api/games/derby/race', { bet, horse });
  check('race status 200', r.status === 200, JSON.stringify(r.data));
  const d = r.data;
  check('Antwortform { bet, payout, balance, order, winner, horse, won }', shapeOk(d), JSON.stringify(d));
  check('Zieleinlauf enthält alle Pferde genau einmal', isPermutation(d.order));
  check('Sieger ist Erster im Zieleinlauf', d.winner === d.order[0]);
  check('won passt zu Sieger und Wahl', d.won === (d.winner === d.horse));
  check('Auszahlung = Quote × Einsatz bei Sieg, sonst 0', d.payout === (d.won ? Math.floor(bet * HORSES[0].odds) : 0), JSON.stringify(d));
  check('Buchhaltung: Guthaben = vorher − Einsatz + Auszahlung', d.balance === balance - bet + d.payout, `${d.balance} != ${balance} - ${bet} + ${d.payout}`);
  balance = d.balance;

  const orderCounts = {};
  let ok = true;
  for (let i = 0; i < 60; i++) {
    const h = HORSES[i % HORSES.length].id;
    r = await api('POST', '/api/games/derby/race', { bet: 100, horse: h });
    if (r.status !== 200 || !shapeOk(r.data) || r.data.balance !== balance - 100 + r.data.payout || r.data.winner !== r.data.order[0]) { ok = false; break; }
    orderCounts[r.data.winner] = (orderCounts[r.data.winner] ?? 0) + 1;
    balance = r.data.balance;
  }
  check('60 Rennen: Struktur und Buchhaltung konsistent', ok, JSON.stringify(r.data));

  console.log('Ungültige Eingaben');
  r = await api('POST', '/api/games/derby/race', { bet: 100, horse: 99 });
  check('unbekanntes Pferd → 400', r.status === 400, JSON.stringify(r.data));
  r = await api('POST', '/api/games/derby/race', { bet: 100 });
  check('fehlendes Pferd → 400', r.status === 400);
  r = await api('POST', '/api/games/derby/race', { bet: 10, horse: 1 });
  check('Einsatz unter Minimum → 400', r.status === 400);
  r = await api('POST', '/api/games/derby/race', { bet: 999_999_999_99, horse: 1 });
  check('Einsatz über Guthaben → 400', r.status === 400);
  r = await api('GET', '/api/auth/me');
  check('Guthaben nach Fehlversuchen unverändert', r.data.user?.balance === balance, `${r.data.user?.balance} != ${balance}`);

  console.log('Monte Carlo (drawWinner, ohne HTTP)');
  const N = 400_000;
  const counts = new Array(HORSES.length).fill(0);
  for (let i = 0; i < N; i++) {
    const id = drawWinner();
    counts[HORSES.findIndex((h) => h.id === id)]++;
  }
  // RTP einer Wette auf ein einzelnes Pferd = p_i × Quote_i; über alle Pferde gemittelt
  let rtp = 0; let maxDev = 0;
  HORSES.forEach((h, i) => {
    const p = counts[i] / N;
    rtp += (p * h.odds) / HORSES.length;
    maxDev = Math.max(maxDev, Math.abs(p - probs[i]));
  });
  console.log(`  ${N.toLocaleString('de-DE')} Ziehungen · mittlerer RTP ${(rtp * 100).toFixed(2)} % vs. exakt ${(RTP * 100).toFixed(2)} % · max. Abweichung ${(maxDev * 100).toFixed(2)} pp`);
  check('gemessener RTP nahe am Sollwert (±0,5 pp)', Math.abs(rtp - RTP) < 0.005, `${(rtp * 100).toFixed(2)} %`);
  check('alle Pferde im Rahmen der Erwartung gezogen (max. ±0,6 pp)', maxDev < 0.006, `${(maxDev * 100).toFixed(2)} pp`);
} catch (err) {
  failures++;
  console.error('FEHLER', err);
} finally {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  console.log(failures ? `\n${failures} Fehler` : '\nAlle Tests bestanden');
  process.exit(failures ? 1 : 0);
}
