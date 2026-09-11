// End-to-End-Rauchtest der API gegen eine temporäre Datenbank:  node scripts/smoke.js
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'casino-smoke-'));

const server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
  env: { ...process.env, PORT: String(PORT), CASINO_DATA_DIR: dataDir },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

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

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE + '/api/auth/me'); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('Server startet nicht');
}

try {
  await waitForServer();
  console.log('Auth');
  let r = await api('POST', '/api/auth/register', { username: 'tester', password: 'geheim123' });
  check('register', r.status === 201 && r.data.user.balance === 1_000_000, JSON.stringify(r.data));
  r = await api('POST', '/api/auth/register', { username: 'TESTER', password: 'geheim123' });
  check('duplicate username rejected', r.status === 409);
  r = await api('POST', '/api/auth/logout');
  r = await api('POST', '/api/auth/login', { username: 'tester', password: 'falsch' });
  check('wrong password rejected', r.status === 401);
  r = await api('POST', '/api/auth/login', { username: 'tester', password: 'geheim123' });
  check('login', r.status === 200);
  r = await api('GET', '/api/auth/me');
  check('me', r.data.user?.username === 'tester');

  console.log('Wallet');
  r = await api('POST', '/api/rewards/daily');
  check('daily bonus (Tag 1 = 500)', r.status === 200 && r.data.amount === 500_00 && r.data.streak === 1 && r.data.user.balance === 1_050_000, JSON.stringify(r.data));
  r = await api('POST', '/api/rewards/daily');
  check('daily bonus twice rejected', r.status === 400);
  r = await api('GET', '/api/rewards');
  check('rewards summary', r.status === 200 && r.data.missions.length === 3 && r.data.achievements.length > 5 && r.data.daily.claimedToday, JSON.stringify(r.data.daily));
  r = await api('POST', '/api/wallet/rescue');
  check('rescue rejected with balance', r.status === 400);

  console.log('Slots');
  r = await api('POST', '/api/games/slots/spin', { bet: 100_00 });
  check('spin', r.status === 200 && r.data.grid?.length === 5 && typeof r.data.balance === 'number', JSON.stringify(r.data));
  r = await api('POST', '/api/games/slots/spin', { bet: 10 });
  check('bet below minimum rejected', r.status === 400);
  r = await api('POST', '/api/games/slots/spin', { bet: 999_999_999_99 });
  check('bet above balance rejected', r.status === 400);

  console.log('Roulette');
  r = await api('POST', '/api/games/roulette/spin', { bets: [{ type: 'red', amount: 500 }, { type: 'straight', value: 17, amount: 100 }] });
  check('spin', r.status === 200 && r.data.number >= 0 && r.data.number <= 36 && r.data.bets.length === 2, JSON.stringify(r.data));
  r = await api('POST', '/api/games/roulette/spin', { bets: [{ type: 'straight', value: 40, amount: 500 }] });
  check('invalid number rejected', r.status === 400);

  console.log('Blackjack');
  r = await api('POST', '/api/games/blackjack/start', { bet: 1000 });
  check('start', r.status === 200 && r.data.game.player.length === 2, JSON.stringify(r.data));
  if (r.data.game.status === 'player') {
    check('hole card hidden', r.data.game.dealer[1].hidden === true);
    r = await api('POST', '/api/games/blackjack/stand');
    check('stand', r.status === 200 && r.data.game.status === 'finished' && r.data.game.dealer[1].r != null, JSON.stringify(r.data));
  }
  r = await api('POST', '/api/games/blackjack/hit');
  check('hit without game rejected', r.status === 400);

  console.log('Video Poker');
  r = await api('POST', '/api/games/videopoker/deal', { bet: 1000 });
  check('deal', r.status === 200 && r.data.game.hand.length === 5);
  r = await api('POST', '/api/games/videopoker/draw', { hold: [true, false, true, false, false] });
  check('draw', r.status === 200 && r.data.game.status === 'finished' && r.data.game.replaced.length === 3, JSON.stringify(r.data));

  console.log('Baccarat');
  r = await api('POST', '/api/games/baccarat/play', { bets: { player: 500, banker: 500, tie: 100 } });
  check('play', r.status === 200 && ['player', 'banker', 'tie'].includes(r.data.winner), JSON.stringify(r.data));

  console.log('Dice');
  r = await api('POST', '/api/games/dice/roll', { bets: [{ type: 'big', amount: 500 }, { type: 'total', value: 10, amount: 100 }] });
  check('roll', r.status === 200 && r.data.dice.length === 3, JSON.stringify(r.data));

  console.log('Plinko');
  r = await api('POST', '/api/games/plinko/drop', { bet: 500, rows: 12, risk: 'high' });
  check('drop', r.status === 200 && r.data.path.length === 12 && r.data.multiplier != null, JSON.stringify(r.data));

  console.log('Crash');
  r = await api('POST', '/api/games/crash/start', { bet: 500 });
  check('start', r.status === 200 && r.data.roundId, JSON.stringify(r.data));
  await new Promise((res) => setTimeout(res, 300));
  r = await api('POST', '/api/games/crash/cashout');
  check('cashout', r.status === 200 && ['cashed', 'crashed'].includes(r.data.status), JSON.stringify(r.data));
  r = await api('POST', '/api/games/crash/start', { bet: 500, autoCashout: 1.01 });
  await new Promise((res) => setTimeout(res, 200));
  r = await api('GET', '/api/games/crash/state');
  check('auto cashout resolves via state', r.status === 200 && r.data.status !== 'running', JSON.stringify(r.data));

  console.log('Mines');
  r = await api('POST', '/api/games/mines/start', { bet: 500, mines: 3 });
  check('start', r.status === 200 && r.data.game.status === 'active');
  r = await api('POST', '/api/games/mines/reveal', { index: 7 });
  check('reveal', r.status === 200 && ['active', 'lost'].includes(r.data.game.status), JSON.stringify(r.data));
  if (r.data.game.status === 'active') {
    r = await api('POST', '/api/games/mines/cashout');
    check('cashout', r.status === 200 && r.data.game.status === 'won' && r.data.game.payout > 500, JSON.stringify(r.data));
  }

  console.log('Coinflip');
  r = await api('POST', '/api/games/coinflip/flip', { bet: 500, choice: 'heads' });
  check('flip', r.status === 200 && ['heads', 'tails'].includes(r.data.outcome));

  console.log('Wheel');
  r = await api('POST', '/api/games/wheel/spin', { bet: 500 });
  check('spin', r.status === 200 && r.data.index >= 0 && r.data.index < 24);

  console.log('Hi-Lo');
  r = await api('POST', '/api/games/hilo/start', { bet: 500 });
  check('start', r.status === 200 && r.data.game.card.r >= 1);
  r = await api('POST', '/api/games/hilo/skip');
  check('skip', r.status === 200);
  r = await api('POST', '/api/games/hilo/guess', { choice: 'higher' });
  check('guess', r.status === 200 && ['active', 'lost'].includes(r.data.game.status), JSON.stringify(r.data));
  if (r.data.game.status === 'active') {
    r = await api('POST', '/api/games/hilo/cashout');
    check('cashout', r.status === 200 && r.data.game.status === 'won');
  }

  console.log('Belohnungen');
  await new Promise((res) => setTimeout(res, 200)); // Ereignisse aus den Runden verarbeiten lassen
  r = await api('GET', '/api/rewards');
  check('Erfolg "Erste Runde" freigeschaltet', r.data.achievements.find((a) => a.key === 'first_round')?.unlocked === true);
  check('Missionsfortschritt gezählt', r.data.missions.some((m) => m.progress > 0), JSON.stringify(r.data.missions));
  const done = r.data.missions.find((m) => m.done && !m.claimed);
  if (done) {
    r = await api('POST', `/api/rewards/missions/${done.key}/claim`);
    check('Mission abholen', r.status === 200 && r.data.amount === done.reward, JSON.stringify(r.data));
    r = await api('POST', `/api/rewards/missions/${done.key}/claim`);
    check('Mission doppelt abholen abgelehnt', r.status === 400);
  }
  r = await api('GET', '/api/wallet/history?limit=200');
  check('Erfolgs-Gutschrift im Verlauf', r.data.history.some((t) => t.type === 'achievement'));

  console.log('Verlauf & Rangliste');
  r = await api('GET', '/api/wallet/history?limit=10');
  check('history', r.status === 200 && r.data.history.length > 0);
  r = await api('GET', '/api/wallet/leaderboard');
  check('leaderboard', r.status === 200 && r.data.leaderboard[0].username === 'tester' && r.data.myRank === 1);

  // Kontostand-Konsistenz: Summe aller Buchungen == Kontostand
  r = await api('GET', '/api/wallet/history?limit=200');
  const sum = r.data.history.reduce((s, t) => s + t.amount, 0);
  const me = await api('GET', '/api/wallet');
  const active = await api('GET', '/api/games/active');
  check('ledger consistent (no active games)', active.data.active.length === 0 && sum === me.data.user.balance, `sum=${sum} balance=${me.data.user.balance} active=${active.data.active}`);
} catch (err) {
  failures++;
  console.error('FEHLER', err);
} finally {
  await new Promise((resolve) => { server.once('exit', resolve); server.kill(); });
  fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  console.log(failures ? `\n${failures} Fehler` : '\nAlle Tests bestanden');
  process.exit(failures ? 1 : 0);
}
