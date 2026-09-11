import { store } from './state.js';

/**
 * WebSocket-Client für Präsenz, Chat und Live-Ergebnisse.
 * Ereignisse: welcome, join, leave, pos, game, chat, round, players, connect, disconnect
 */
const listeners = new Map();

export const rt = {
  ws: null,
  players: new Map(),
  me: null,
  connected: false,
  currentGame: null,
  retryTimer: null,

  on(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
    return () => listeners.get(type)?.delete(fn);
  },
  emit(type, data) {
    for (const fn of listeners.get(type) ?? []) { try { fn(data); } catch (e) { console.error(e); } }
  },

  connect() {
    if (this.ws || !store.user) return;
    clearTimeout(this.retryTimer);
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      if (this.currentGame) this.send({ t: 'game', game: this.currentGame });
      this.emit('connect');
    };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      switch (msg.t) {
        case 'welcome':
          this.me = msg.id;
          this.players.clear();
          this.coins = msg.coins ?? [];
          for (const p of msg.players) this.players.set(p.id, p);
          this.emit('welcome', msg);
          this.emit('players');
          break;
        case 'join':
          this.players.set(msg.player.id, msg.player);
          this.emit('join', msg.player);
          this.emit('players');
          break;
        case 'leave': {
          const p = this.players.get(msg.id);
          this.players.delete(msg.id);
          this.emit('leave', p ?? { id: msg.id });
          this.emit('players');
          break;
        }
        case 'pos': {
          const p = this.players.get(msg.id);
          if (p) { p.x = msg.x; p.z = msg.z; p.ry = msg.ry; p.anim = msg.anim; this.emit('pos', p); }
          break;
        }
        case 'game': {
          const p = this.players.get(msg.id);
          if (p) { p.game = msg.game; this.emit('game', p); this.emit('players'); }
          break;
        }
        case 'coin':
          this.coins = [...(this.coins ?? []), msg.coin];
          this.emit('coin', msg);
          break;
        case 'coin_taken':
          this.coins = (this.coins ?? []).filter((c) => c.id !== msg.id);
          this.emit('coin_taken', msg);
          break;
        default:
          this.emit(msg.t, msg);
      }
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.connected = false;
      this.players.clear();
      this.emit('disconnect');
      this.emit('players');
      if (ev.code === 4001) { this.emit('replaced'); return; } // in anderem Tab angemeldet – nicht neu verbinden
      if (ev.code === 4002) { this.emit('revoked'); return; } // Sitzung wurde im Profil beendet
      if (store.user) this.retryTimer = setTimeout(() => this.connect(), 3000);
    };
    ws.onerror = () => ws.close();
  },

  disconnect() {
    clearTimeout(this.retryTimer);
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.players.clear();
    this.connected = false;
  },

  send(obj) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj));
  },
  sendPos(x, z, ry, anim) { this.send({ t: 'pos', x, z, ry, anim }); },
  sendGame(game) {
    this.currentGame = game;
    this.send({ t: 'game', game });
  },
  sendChat(text) { this.send({ t: 'chat', text }); },

  /** Mitspieler (ohne mich) an einer Station */
  playersAt(game) {
    return [...this.players.values()].filter((p) => p.game === game && p.id !== this.me);
  },
};
