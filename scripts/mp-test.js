// Multiplayer-Test: mehrere echte Clients (HTTP-Login + WebSocket) gegen einen laufenden Server.
//   node scripts/mp-test.js            -> automatische Prüfungen gegen temporären Server (Port 3998)
//   node scripts/mp-test.js walk 3000  -> 2 Testspieler laufen 60 s lang im Server auf Port 3000 herum (zum Zuschauen)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws'; // ws-Client, weil er Cookie-Header beim Handshake erlaubt

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mode = process.argv[2] ?? 'test';
const PORT = Number(process.argv[3]) || (mode === 'walk' ? 3000 : 3998);
const BASE = `http://localhost:${PORT}`;
let failures = 0;
const check = (name, cond, extra = '') => { if (cond) console.log(`  ✔ ${name}`); else { failures++; console.log(`  ✘ ${name} ${extra}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ein simulierter Spieler: Login per HTTP, dann WebSocket mit Session-Cookie */
class Player {
  constructor(name) { this.name = name; this.events = []; this.players = new Map(); this.closeCode = null; }
  async login() {
    let res = await fetch(`${BASE}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: this.name, password: 'test1234' }) });
    if (res.status === 409) res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: this.name, password: 'test1234' }) });
    this.cookie = res.headers.get('set-cookie').split(';')[0];
    this.id = (await res.json()).user.id;
    return this;
  }
  api(pathname, body) { return fetch(BASE + pathname, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: this.cookie }, body: JSON.stringify(body ?? {}) }).then((r) => r.json()); }
  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${PORT}/ws`, { headers: { Cookie: this.cookie } });
      this.ws = ws;
      ws.onopen = () => resolve(this);
      ws.onerror = (e) => reject(new Error('WS-Fehler ' + (e.message ?? '')));
      ws.onclose = (ev) => { this.closeCode = ev.code; };
      ws.onmessage = (ev) => {
        const m = JSON.parse(String(ev.data));
        this.events.push(m);
        if (m.t === 'welcome') for (const p of m.players) this.players.set(p.id, p);
        if (m.t === 'join') this.players.set(m.player.id, m.player);
        if (m.t === 'leave') this.players.delete(m.id);
        if (m.t === 'pos' && this.players.has(m.id)) Object.assign(this.players.get(m.id), { x: m.x, z: m.z });
        if (m.t === 'game' && this.players.has(m.id)) this.players.get(m.id).game = m.game;
      };
    });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  waitFor(pred, ms = 3000) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => { const hit = this.events.find(pred); if (hit) return resolve(hit); if (Date.now() - t0 > ms) return resolve(null); setTimeout(tick, 50); };
      tick();
    });
  }
  close() { this.ws?.close(); }
}

async function walkDemo() {
  const a = await new Player('tester_a').login(); await a.connect();
  const b = await new Player('tester_b').login(); await b.connect();
  console.log(`tester_a (#${a.id}) und tester_b (#${b.id}) sind verbunden – 60 s Rundgang, dann spielt tester_b Blackjack.`);
  let t = 0;
  const timer = setInterval(() => {
    t += 0.1;
    a.send({ t: 'pos', x: Math.sin(t * 0.5) * 6, z: 4 + Math.cos(t * 0.5) * 6, ry: t * 0.5 + Math.PI / 2, anim: 'walk' });
    if (t < 20) b.send({ t: 'pos', x: -6 + t * 0.3, z: 9, ry: Math.PI / 2, anim: 'walk' });
  }, 100);
  await sleep(20000);
  b.send({ t: 'game', game: 'blackjack' });
  b.send({ t: 'chat', text: 'Ich setze mich mal an den Blackjack-Tisch 🙂' });
  await b.api('/api/games/blackjack/start', { bet: 1000 });
  await sleep(2000);
  await b.api('/api/games/blackjack/stand');
  await sleep(38000);
  clearInterval(timer);
  a.close(); b.close();
  console.log('Rundgang beendet.');
}

async function autoTest() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'casino-mp-'));
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], { env: { ...process.env, PORT: String(PORT), CASINO_DATA_DIR: dataDir, CASINO_BOTS: '2' }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/auth/me'); break; } catch { await sleep(100); } }
  try {
    console.log('Verbindung & Präsenz');
    const a = await new Player('alice').login(); await a.connect();
    const welcome = await a.waitFor((m) => m.t === 'welcome');
    check('welcome mit Bots', welcome && welcome.players.filter((p) => p.bot).length === 2, JSON.stringify(welcome?.players));
    const b = await new Player('bob').login(); await b.connect();
    check('alice sieht bob beitreten', !!(await a.waitFor((m) => m.t === 'join' && m.player.name === 'bob')));
    const wb = await b.waitFor((m) => m.t === 'welcome');
    check('bob sieht alice in welcome', wb?.players.some((p) => p.name === 'alice'));

    console.log('Bewegung');
    b.send({ t: 'pos', x: 3.5, z: -2, ry: 1, anim: 'walk' });
    const pos = await a.waitFor((m) => m.t === 'pos' && m.id === b.id);
    check('pos-Broadcast kommt an', pos && pos.x === 3.5 && pos.z === -2 && pos.anim === 'walk', JSON.stringify(pos));
    b.send({ t: 'pos', x: 999, z: -999, ry: 0, anim: 'walk' });
    const clamped = await a.waitFor((m) => m.t === 'pos' && m.id === b.id && m.x !== 3.5);
    check('Position wird auf Halle begrenzt', clamped && Math.abs(clamped.x) <= 19 && Math.abs(clamped.z) <= 14, JSON.stringify(clamped));
    check('eigene pos nicht zurückgespiegelt', !b.events.some((m) => m.t === 'pos' && m.id === b.id));

    console.log('Tische');
    b.send({ t: 'game', game: 'roulette' });
    const g = await a.waitFor((m) => m.t === 'game' && m.id === b.id);
    check('game-Wechsel kommt an', g?.game === 'roulette');
    b.send({ t: 'game', game: 'gibtsnicht' });
    const g2 = await a.waitFor((m) => m.t === 'game' && m.id === b.id && m.game !== 'roulette');
    check('unbekanntes Spiel -> null', g2 && g2.game === null, JSON.stringify(g2));
    const c = await new Player('carol').login(); await c.connect();
    const wc = await c.waitFor((m) => m.t === 'welcome');
    b.send({ t: 'game', game: 'blackjack' });
    await a.waitFor((m) => m.t === 'game' && m.id === b.id && m.game === 'blackjack');
    const d = await new Player('dave').login(); await d.connect();
    const wd = await d.waitFor((m) => m.t === 'welcome');
    check('Neuer Spieler sieht, wer wo sitzt', wd?.players.find((p) => p.name === 'bob')?.game === 'blackjack');
    check('welcome enthält alle (2 Bots + 4 Spieler)', wd?.players.length === 6, String(wd?.players.length));

    console.log('Spielrunden live');
    const round = a.waitFor((m) => m.t === 'round' && m.name === 'bob', 5000);
    await b.api('/api/games/coinflip/flip', { bet: 500, choice: 'heads' });
    const r = await round;
    check('round-Broadcast mit Namen/Spiel/Einsatz', r && r.game === 'coinflip' && r.bet === 500 && typeof r.payout === 'number', JSON.stringify(r));

    console.log('Chat');
    b.send({ t: 'chat', text: '  Hallo   Welt  ' });
    const chat = await a.waitFor((m) => m.t === 'chat' && m.id === b.id);
    check('chat normalisiert', chat?.text === 'Hallo Welt' && chat.name === 'bob' && chat.game === 'blackjack', JSON.stringify(chat));
    b.send({ t: 'chat', text: 'zu schnell' });
    await sleep(300);
    check('Chat-Rate-Limit', !a.events.some((m) => m.t === 'chat' && m.text === 'zu schnell'));
    await sleep(900); // Rate-Limit abwarten
    b.send({ t: 'chat', text: 'x'.repeat(500) });
    const long = await a.waitFor((m) => m.t === 'chat' && m.text.startsWith('xxx'), 2000);
    check('Chat auf 200 Zeichen gekürzt', long?.text.length === 200);

    console.log('Sprachchat-Signalisierung');
    b.send({ t: 'rtc', to: a.id, data: { sdp: { type: 'offer', sdp: 'v=0' } } });
    const sig = await a.waitFor((m) => m.t === 'rtc');
    check('rtc wird 1:1 zugestellt', sig?.from === b.id && sig.data.sdp.type === 'offer');
    check('rtc erreicht Dritte nicht', !c.events.some((m) => m.t === 'rtc'));
    b.send({ t: 'mic', on: true });
    const mic = await a.waitFor((m) => m.t === 'mic' && m.id === b.id);
    check('mic-Status wird verteilt', mic?.on === true);

    console.log('Zweiter Tab / Verbindungsabbruch');
    const b2 = new Player('bob'); b2.cookie = b.cookie; b2.id = b.id; await b2.connect();
    await b2.waitFor((m) => m.t === 'welcome');
    await sleep(300);
    check('alte Verbindung mit 4001 geschlossen', b.closeCode === 4001, String(b.closeCode));
    check('kein leave für ersetzten Spieler', !a.events.some((m) => m.t === 'leave' && m.id === b.id));
    check('alice sieht bob weiterhin', a.players.has(b.id));
    b2.close();
    const leave = await a.waitFor((m) => m.t === 'leave' && m.id === b.id);
    check('leave nach echtem Verbindungsende', !!leave);
    check('carol sieht leave ebenfalls', !!(await c.waitFor((m) => m.t === 'leave' && m.id === b.id)));

    console.log('Bots');
    await sleep(2500);
    const botPos = a.events.filter((m) => m.t === 'pos' && m.id < 0);
    check('Bots bewegen sich', botPos.length > 5, String(botPos.length));
    const jumps = [];
    const last = new Map();
    for (const m of botPos) { const l = last.get(m.id); if (l) jumps.push(Math.hypot(m.x - l.x, m.z - l.z)); last.set(m.id, m); }
    check('Bots teleportieren nicht (Schritte < 0.5 m)', jumps.every((j) => j < 0.5), `max ${Math.max(...jumps).toFixed(2)}`);

    console.log('Unautorisiert');
    let unauth = 'ok';
    try { await new Promise((res, rej) => { const ws = new WebSocket(`ws://localhost:${PORT}/ws`); ws.onopen = () => res('open'); ws.onerror = () => rej(new Error('rejected')); }); } catch { unauth = 'rejected'; }
    check('WebSocket ohne Session abgelehnt', unauth === 'rejected');

    a.close(); c.close(); d.close();
  } catch (e) { failures++; console.error('FEHLER', e); }
  finally {
    await new Promise((resolve) => { server.once('exit', resolve); server.kill(); });
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    console.log(failures ? `\n${failures} Fehler` : '\nAlle Multiplayer-Tests bestanden');
    process.exit(failures ? 1 : 0);
  }
}

if (mode === 'walk') walkDemo(); else autoTest();
