// Rauchtest für das Rubbellos gegen eine temporäre Datenbank:  node scripts/smoke-scratch.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 3984;
const BASE = `http://localhost:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'casino-scratch-'));
process.env.CASINO_DATA_DIR = dataDir;
process.env.PORT = String(PORT);

// Erst nach dem Setzen der Umgebung laden (db.js liest CASINO_DATA_DIR beim Import)
const { default: express } = await import('express');
const { attachUser, authRouter, requireAuth } = await import('../server/auth.js');
const { scratchRouter, generateCard, PRIZES, TIERS, SYMBOLS, RTP, WIN_CHANCE } = await import('../server/games/scratch.js');

const app = express();
app.use(express.json());
app.use(attachUser);
app.use('/api/auth', authRouter);
app.use('/api/games/scratch', requireAuth, scratchRouter);
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Ungültiges JSON' });
  if (!err.expose) console.error(err);
  res.status(err.status ?? 500).json({ error: err.expose ? err.message : 'Serverfehler' });
});
const server = await new Promise((resolve) => { const s = app.listen(PORT, () => resolve(s)); });

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

const SYMBOL_KEYS = new Set(SYMBOLS.map((s) => s.key));
const MULT_OF = Object.fromEntries(SYMBOLS.map((s) => [s.key, s.multiplier]));
const countOf = (grid) => grid.reduce((m, k) => { m[k] = (m[k] ?? 0) + 1; return m; }, {});

/** Prüft die Struktur eines Loses (Raster, Symbole, Drilling nur bei Gewinn) */
function validCard(card, price) {
  if (!Array.isArray(card.grid) || card.grid.length !== 9) return 'kein 3×3-Raster';
  if (!card.grid.every((k) => SYMBOL_KEYS.has(k))) return 'ungültiges Symbol';
  const counts = countOf(card.grid);
  if (card.winSymbol) {
    if (counts[card.winSymbol] !== 3) return 'Gewinnsymbol nicht genau dreimal';
    if (Object.entries(counts).some(([k, n]) => k !== card.winSymbol && n > 2)) return 'anderes Symbol öfter als zweimal';
    if (card.multiplier !== MULT_OF[card.winSymbol]) return 'Multiplikator passt nicht zum Symbol';
    if (card.payout !== price * card.multiplier) return `Auszahlung ${card.payout} ≠ ${price} × ${card.multiplier}`;
  } else {
    if (Object.values(counts).some((n) => n > 2)) return 'Niete mit Drilling';
    if (card.multiplier !== 0 || card.payout !== 0) return 'Niete mit Auszahlung';
  }
  return null;
}

try {
  console.log('Auth');
  let r = await api('POST', '/api/auth/register', { username: 'rubbler', password: 'geheim123' });
  check('register', r.status === 201 && r.data.user.balance === 1_000_000, JSON.stringify(r.data));
  let balance = r.data.user.balance;

  console.log('Konfiguration');
  r = await api('GET', '/api/games/scratch/config');
  check('config', r.status === 200 && r.data.tiers.length === 3 && r.data.symbols.length === 7 && r.data.prizeTable.length === 7, JSON.stringify(r.data));
  check('Stufen: Silber 100, Gold 500, Platin 2000', r.data.tiers.map((t) => `${t.key}:${t.price}`).join(',') === 'silber:10000,gold:50000,platin:200000');
  check('Symbole mit Emoji und Multiplikator', r.data.symbols.every((s) => s.key && s.label && s.multiplier > 0));

  console.log('Kauf je Stufe');
  for (const tier of TIERS) {
    r = await api('POST', '/api/games/scratch/buy', { tier: tier.key });
    const ok = r.status === 200 && r.data.bet === tier.price && r.data.tier === tier.key && typeof r.data.balance === 'number';
    check(`buy ${tier.key}: Antwortform`, ok, JSON.stringify(r.data));
    if (!ok) continue;
    const problem = validCard(r.data, tier.price);
    check(`buy ${tier.key}: Los gültig (${r.data.winSymbol ? `Gewinn ${r.data.multiplier}×` : 'Niete'})`, problem === null, problem ?? '');
    const expected = balance - tier.price + r.data.payout;
    check(`buy ${tier.key}: Buchhaltung (vorher − Einsatz + Auszahlung)`, r.data.balance === expected, `${r.data.balance} ≠ ${expected}`);
    balance = r.data.balance;
  }

  console.log('Ungültige Eingaben');
  r = await api('POST', '/api/games/scratch/buy', { tier: 'diamant' });
  check('unbekannte Stufe → 400', r.status === 400, JSON.stringify(r.data));
  r = await api('POST', '/api/games/scratch/buy', {});
  check('fehlende Stufe → 400', r.status === 400, JSON.stringify(r.data));
  r = await api('POST', '/api/games/scratch/buy', { tier: 42 });
  check('Stufe als Zahl → 400', r.status === 400, JSON.stringify(r.data));
  const saved = cookie; cookie = '';
  r = await api('POST', '/api/games/scratch/buy', { tier: 'silber' });
  check('ohne Anmeldung → 401', r.status === 401);
  cookie = saved;

  console.log('Serie von Käufen (Buchhaltung, Struktur)');
  let structural = 0;
  for (let i = 0; i < 40; i++) {
    r = await api('POST', '/api/games/scratch/buy', { tier: 'silber' });
    if (r.status !== 200) { structural++; continue; }
    if (validCard(r.data, 100_00) !== null) structural++;
    if (r.data.balance !== balance - 100_00 + r.data.payout) structural++;
    balance = r.data.balance;
  }
  check('40 Lose ohne Struktur-/Buchungsfehler', structural === 0, `${structural} Fehler`);
  r = await api('GET', '/api/auth/me');
  check('Kontostand serverseitig gleich', r.data.user.balance === balance, `${r.data.user.balance} ≠ ${balance}`);

  console.log('Guthaben-Grenze');
  // Platin-Lose kaufen, bis das Guthaben nicht mehr reicht → 400 statt Minuskonto
  let limitHit = false;
  for (let i = 0; i < 400 && !limitHit; i++) {
    r = await api('POST', '/api/games/scratch/buy', { tier: 'platin' });
    if (r.status === 400) limitHit = true;
    else balance = r.data.balance;
  }
  r = await api('GET', '/api/auth/me');
  check('Kauf ohne Deckung → 400, Guthaben nie negativ', limitHit && r.data.user.balance >= 0 && r.data.user.balance < 2000_00, `limit=${limitHit} balance=${r.data.user.balance}`);

  console.log('Monte Carlo (reine Logik, kein HTTP)');
  const theoretical = RTP;
  console.log(`  theoretische Auszahlungsquote Σ p·m = ${(theoretical * 100).toFixed(2)} %, Gewinnanteil Σ p = ${(WIN_CHANCE * 100).toFixed(2)} %`);
  check('theoretische RTP zwischen 90 % und 94 %', theoretical >= 0.90 && theoretical <= 0.94);
  check('Wahrscheinlichkeiten summieren sich unter 1', PRIZES.every((p) => p.p > 0) && WIN_CHANCE < 1);
  const N = 200_000;
  const PRICE = 100_00;
  let paid = 0; let wins = 0; let bad = 0;
  const hist = {};
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const c = generateCard(PRICE);
    if (validCard(c, PRICE) !== null) bad++;
    paid += c.payout;
    if (c.multiplier > 0) wins++;
    hist[c.multiplier] = (hist[c.multiplier] ?? 0) + 1;
  }
  const rtp = paid / (N * PRICE);
  const winShare = wins / N;
  console.log(`  ${N} Lose in ${Date.now() - t0} ms · gemessene RTP ${(rtp * 100).toFixed(2)} % · Gewinnlose ${(winShare * 100).toFixed(2)} %`);
  console.log('  Verteilung: ' + Object.entries(hist).sort((a, b) => a[0] - b[0]).map(([m, n]) => `${m}×:${n}`).join(' '));
  check('alle simulierten Lose strukturell gültig', bad === 0, `${bad} ungültig`);
  // Die seltenen 100×/500×-Treffer streuen stark (σ ≈ 1,4 Punkte bei 200k): ±4 Punkte um den Sollwert
  check('gemessene RTP nahe am Sollwert (±4 Punkte) und im Zielbereich 88–96 %', Math.abs(rtp - theoretical) < 0.04 && rtp > 0.88 && rtp < 0.96, `${(rtp * 100).toFixed(2)} %`);
  check('Anteil Gewinnlose ≈ 28 % (27–29,5 %)', winShare > 0.27 && winShare < 0.295, `${(winShare * 100).toFixed(2)} %`);
  const drilling = Array.from({ length: 2000 }, () => generateCard(PRICE)).filter((c) => !c.winSymbol && Object.values(countOf(c.grid)).some((n) => n >= 3)).length;
  check('Nieten enthalten nie drei gleiche Symbole', drilling === 0);
} catch (err) {
  failures++;
  console.error('FEHLER', err);
} finally {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  console.log(failures ? `\n${failures} Fehler` : '\nAlle Tests bestanden');
  process.exit(failures ? 1 : 0);
}
