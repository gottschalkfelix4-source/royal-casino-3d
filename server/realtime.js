import { WebSocketServer } from 'ws';
import { db } from './db.js';
import { parseCookies } from './util.js';
import { bus } from './events.js';
import { GAME_IDS, STATION_POS, HALL_BOUNDS } from './stations.js';
import { pickup } from './rewards.js';

/**
 * Echtzeit-Präsenz per WebSocket: Spielerpositionen in der Halle, wer an welchem
 * Tisch sitzt, Chat und Live-Ergebnisse aller Spielrunden.
 */
export function attachRealtime(server, { bots = 3 } = {}) {
  const wss = new WebSocketServer({ noServer: true });
  const players = new Map(); // id -> Spieler
  const selectUser = db.prepare('SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?');

  const pub = (p) => ({ id: p.id, name: p.name, x: r2(p.x), z: r2(p.z), ry: r2(p.ry), anim: p.anim, game: p.game, bot: !!p.bot, mic: !!p.mic });
  const r2 = (n) => Math.round(n * 100) / 100;
  const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
  const broadcast = (msg, except = null) => {
    const data = JSON.stringify(msg);
    for (const p of players.values()) if (p.ws && p.id !== except && p.ws.readyState === 1) p.ws.send(data);
  };

  server.on('upgrade', (req, socket, head) => {
    if (!req.url.startsWith('/ws')) { socket.destroy(); return; }
    const token = parseCookies(req.headers.cookie)['sid'];
    const user = token ? selectUser.get(token, Date.now()) : null;
    if (!user) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, user));
  });

  wss.on('connection', (ws, user) => {
    const prev = players.get(user.id);
    // Gleicher Account in zweitem Tab: alte Verbindung sauber schließen (Code 4001 = ersetzt, kein Reconnect)
    if (prev?.ws) { try { prev.ws.close(4001, 'replaced'); } catch { prev.ws.terminate(); } }
    const p = {
      ws, id: user.id, name: user.username, x: (Math.random() - 0.5) * 4, z: 12 + Math.random(), ry: 0,
      anim: 'idle', game: prev?.game ?? null, lastChat: 0, alive: true,
    };
    players.set(p.id, p);
    send(ws, { t: 'welcome', id: p.id, players: [...players.values()].map(pub), coins: [...coins.values()] });
    broadcast({ t: 'join', player: pub(p) }, p.id);

    ws.on('pong', () => { p.alive = true; });
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'pos') {
        const x = Number(msg.x); const z = Number(msg.z); const ry = Number(msg.ry);
        if (![x, z, ry].every(Number.isFinite)) return;
        p.x = Math.max(-HALL_BOUNDS.x, Math.min(HALL_BOUNDS.x, x));
        p.z = Math.max(-HALL_BOUNDS.z, Math.min(HALL_BOUNDS.z, z));
        p.ry = ry;
        p.anim = msg.anim === 'walk' ? 'walk' : 'idle';
        broadcast({ t: 'pos', id: p.id, x: r2(p.x), z: r2(p.z), ry: r2(p.ry), anim: p.anim }, p.id);
      } else if (msg.t === 'game') {
        const game = GAME_IDS.includes(msg.game) ? msg.game : null;
        if (game === p.game) return;
        p.game = game;
        broadcast({ t: 'game', id: p.id, game });
      } else if (msg.t === 'rtc') {
        // WebRTC-Signalisierung (Sprachchat) 1:1 weiterleiten
        const target = players.get(Number(msg.to));
        if (target?.ws && msg.data && typeof msg.data === 'object') send(target.ws, { t: 'rtc', from: p.id, data: msg.data });
      } else if (msg.t === 'mic') {
        p.mic = !!msg.on;
        broadcast({ t: 'mic', id: p.id, on: p.mic });
      } else if (msg.t === 'chat') {
        const text = String(msg.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
        const now = Date.now();
        if (!text || now - p.lastChat < 800) return;
        p.lastChat = now;
        broadcast({ t: 'chat', id: p.id, name: p.name, text, game: p.game, ts: now });
        bus.emit('chat', { userId: p.id });
      } else if (msg.t === 'pickup') {
        // Chip in der Halle einsammeln: muss existieren und in Reichweite der zuletzt gemeldeten Position liegen
        const coin = coins.get(String(msg.id));
        if (!coin || p.game) return;
        if (Math.hypot(coin.x - p.x, coin.z - p.z) > 3.2) return;
        coins.delete(coin.id);
        const result = pickup(p.id, coin.value);
        broadcast({ t: 'coin_taken', id: coin.id, by: p.id, name: p.name, value: result ? result.amount : 0 });
        if (result) send(ws, { t: 'reward', kind: 'pickup', amount: result.amount, balance: result.balance, today: result.today });
        else send(ws, { t: 'reward', kind: 'pickup_cap', amount: 0 });
      }
    });
    ws.on('close', () => {
      if (players.get(p.id)?.ws !== ws) return; // bereits durch neue Verbindung ersetzt
      players.delete(p.id);
      broadcast({ t: 'leave', id: p.id });
    });
    ws.on('error', () => {});
  });

  // Verbindungen prüfen
  const ping = setInterval(() => {
    for (const p of players.values()) {
      if (!p.ws) continue;
      if (!p.alive) { p.ws.terminate(); continue; }
      p.alive = false;
      p.ws.ping();
    }
  }, 30_000);
  wss.on('close', () => clearInterval(ping));

  // Belohnungs-Benachrichtigungen an den betreffenden Spieler
  bus.on('notify', ({ userId, msg }) => { const p = players.get(userId); if (p?.ws) send(p.ws, msg); });

  // ---------- Chips zum Einsammeln in der Halle ----------
  const coins = new Map();
  let coinSeq = 1;
  // Nur auf frei begehbarer Fläche: Abstand zu Tischen (inkl. Kollisionsradius), nicht an den Wänden, nicht in der Bar
  const nearStation = (x, z) => Object.entries(STATION_POS).some(([id, [sx, sz]]) => Math.hypot(sx - x, sz - z) < (id === 'slots' ? 5.2 : 3.8));
  const spawnCoin = () => {
    if (coins.size >= 6) return;
    for (let tries = 0; tries < 40; tries++) {
      const x = (Math.random() - 0.5) * 2 * 12.5;
      const z = (Math.random() - 0.5) * 2 * 11;
      if (nearStation(x, z) || (z < -9.5 && x < -7.5) || (z > 8 && Math.abs(x) < 3.2 && x > 2)) continue;
      const coin = { id: String(coinSeq++), x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, value: [10_00, 10_00, 20_00, 25_00, 50_00][Math.floor(Math.random() * 5)] };
      coins.set(coin.id, coin);
      broadcast({ t: 'coin', coin });
      return;
    }
  };
  for (let i = 0; i < 3; i++) spawnCoin();
  setInterval(spawnCoin, 15_000);

  // Spielrunden live an alle
  bus.on('round', (r) => {
    const p = players.get(r.userId);
    const name = p?.name ?? db.prepare('SELECT username FROM users WHERE id = ?').get(r.userId)?.username ?? '?';
    broadcast({ t: 'round', id: r.userId, name, game: r.game, bet: r.bet, payout: r.payout, multiplier: r.meta?.multiplier ?? null, ts: Date.now() });
  });

  // ---------- Bots, damit die Halle nicht leer ist ----------
  const BOT_NAMES = ['Lucky_Lou', 'Vegas_Vicky', 'Ace_Anna', 'Dealer_Dan', 'Jackpot_Jim', 'Roulette_Rosa'];
  const botList = [];
  for (let i = 0; i < Math.min(bots, BOT_NAMES.length); i++) {
    const b = {
      ws: null, bot: true, id: -(i + 1), name: BOT_NAMES[i], x: (Math.random() - 0.5) * 20, z: (Math.random() - 0.5) * 16, ry: 0,
      anim: 'idle', game: null, target: null, until: Date.now() + 3000 + Math.random() * 5000,
    };
    players.set(b.id, b);
    botList.push(b);
  }
  if (botList.length) {
    setInterval(() => {
      const now = Date.now();
      for (const b of botList) {
        if (b.game) {
          // Am Tisch sitzen, danach wieder losgehen
          if (now > b.until) { b.game = null; b.until = now + 8000 + Math.random() * 12000; b.target = null; b.wantGame = null; broadcast({ t: 'game', id: b.id, game: null }); }
          continue;
        }
        if (!b.wantGame && now > b.until) {
          // Nächstes Ziel: zu einer Station laufen und dort Platz nehmen (kein Teleport)
          b.wantGame = GAME_IDS[Math.floor(Math.random() * GAME_IDS.length)];
          const [sx, sz] = STATION_POS[b.wantGame];
          b.target = [sx, sz + 2.2];
        }
        if (!b.target || Math.hypot(b.target[0] - b.x, b.target[1] - b.z) < 0.3) {
          if (b.wantGame) {
            b.game = b.wantGame; b.wantGame = null; b.anim = 'idle';
            b.until = now + 20000 + Math.random() * 30000;
            broadcast({ t: 'pos', id: b.id, x: r2(b.x), z: r2(b.z), ry: r2(b.ry), anim: 'idle' });
            broadcast({ t: 'game', id: b.id, game: b.game });
            continue;
          }
          b.target = [(Math.random() - 0.5) * 2 * (HALL_BOUNDS.x - 3), (Math.random() - 0.5) * 2 * (HALL_BOUNDS.z - 3)];
        }
        const dx = b.target[0] - b.x; const dz = b.target[1] - b.z;
        const len = Math.hypot(dx, dz) || 1;
        const step = Math.min(len, 1.1 * 0.1);
        b.x += (dx / len) * step; b.z += (dz / len) * step;
        b.ry = Math.atan2(-dx, -dz);
        b.anim = 'walk';
        broadcast({ t: 'pos', id: b.id, x: r2(b.x), z: r2(b.z), ry: r2(b.ry), anim: 'walk' });
      }
    }, 100);
  }

  return { players, broadcast };
}
