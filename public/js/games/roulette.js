import { GameBase } from './base.js';
import { THREE, Easing } from '../three/engine.js';
import { api } from '../api.js';
import { h, fmt } from '../ui.js';
import { sound } from '../sound.js';
import { section, statBox, historyStrip, chipSelector } from '../widgets.js';
import { burst } from '../three/assets.js';
import { buildRouletteWheel, ORDER, colorOf, POCKET, R_TRACK, R_POCKET, Y_TRACK, Y_POCKET } from '../three/roulettewheel.js';

const OUTSIDE = [
  { key: 'low', label: '1–18' }, { key: 'even', label: 'GERADE' }, { key: 'red', label: 'ROT' },
  { key: 'black', label: 'SCHWARZ' }, { key: 'odd', label: 'UNGERADE' }, { key: 'high', label: '19–36' },
];

export default class Roulette extends GameBase {
  engineOptions() {
    // Ziel liegt vor dem Kessel, damit er im oberen Bildbereich über dem Setztisch sitzt
    return { fov: 42, position: [0, 6.5, 11], target: [0, 0.4, 2.6], background: 0x07090d, exposure: 1.0 };
  }

  buildScene() {
    const { engine } = this;
    const { scene } = engine;
    engine.addLights({ key: [5, 12, 6], keyIntensity: 2.4, hemi: 0.5, fill: 0.7, shadowSize: 8 });
    engine.addSpot({ position: [0, 12, 3], target: [0, 0, 0], intensity: 700, angle: 0.55, color: 0xffe6c0 });

    if (!engine.embedded) {
      const floor = new THREE.Mesh(new THREE.CircleGeometry(7, 64), new THREE.MeshStandardMaterial({ color: 0x0d1a14, roughness: 0.9 }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = -0.01; floor.receiveShadow = true;
      scene.add(floor);
    }
    engine.setFit(11, 12);

    // Gemeinsames Kesselmodell (auch in der Halle verwendet)
    const { group: wheel, ball } = buildRouletteWheel({ ball: true });
    scene.add(wheel);
    this.wheel = wheel;
    this.ball = ball;
    scene.add(this.ball);
    this.ballPhi = Math.PI / 3;
    this.ballR = R_POCKET;
    this.ballY = Y_POCKET;
    this.lockedIndex = 0;
    this.placeBall();

    engine.onUpdate((dt) => {
      if (!this.spinning) {
        this.wheel.rotation.y += dt * 0.12;
        this.ballPhi = this.wheel.rotation.y + this.lockedIndex * POCKET;
        this.placeBall();
      }
    });
  }

  placeBall() {
    this.ball.position.set(this.ballR * Math.cos(this.ballPhi), this.ballY, -this.ballR * Math.sin(this.ballPhi));
  }

  buildPanel() {
    this.bets = new Map(); // key -> Cent
    this.undoStack = [];
    this.chip = chipSelector(() => {}, 10_00);
    this.totalBox = statBox('Gesamteinsatz', '🪙 0,00');
    this.lastBox = statBox('Letzte Auszahlung', '–');
    this.history = historyStrip(14);
    this.spinBtn = h('button.btn.btn-big.btn-gold', { onclick: () => this.spin() }, '🎡 DREHEN');
    this.panel.append(
      section('Chip wählen', this.chip.el, h('div.panel-note', {}, 'Klicke auf den Tisch, um Chips zu setzen. Rechtsklick entfernt einen Chip.')),
      section('Einsatz', this.totalBox.el, h('div.grid-2', {},
        h('button.btn', { onclick: () => this.undo() }, '↶ Rückgängig'),
        h('button.btn', { onclick: () => this.clearBets() }, '✕ Leeren'),
      )),
      this.spinBtn,
      section('Ergebnis', this.lastBox.el, this.history.el),
      section('Auszahlungen', h('div.panel-note', {}, 'Zahl 35:1 · Dutzend/Kolonne 2:1 · Rot/Schwarz, Gerade/Ungerade, 1–18/19–36 1:1')),
    );
    this.buildTable();
  }

  buildTable() {
    this.cells = new Map();
    const cell = (key, label, cls, style = {}) => {
      const el = h('div.rl-cell', {
        class: `rl-cell ${cls}`, style,
        onclick: () => this.addBet(key),
        oncontextmenu: (e) => { e.preventDefault(); this.removeBet(key); },
      }, label);
      this.cells.set(key, el);
      return el;
    };
    const items = [cell('straight:0', '0', 'green zero', { gridRow: '1 / span 3', gridColumn: '1' })];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 12; col++) {
        const n = col * 3 + (3 - row);
        items.push(cell(`straight:${n}`, String(n), colorOf(n)));
      }
      items.push(cell(`column:${3 - row}`, '2:1', 'outside col'));
    }
    [1, 2, 3].forEach((d, i) => items.push(cell(`dozen:${d}`, `${d}. DUTZEND`, 'outside dozen', { gridColumn: `${2 + i * 4} / span 4` })));
    OUTSIDE.forEach((o, i) => items.push(cell(o.key, o.label, 'outside half', { gridColumn: `${2 + i * 2} / span 2` })));
    this.tableEl = h('div.rl-table', {}, items);
    this.addDock(h('div.rl-dock', {}, this.tableEl));
  }

  parseKey(key) {
    const [type, value] = key.split(':');
    return { type, value: value == null ? null : Number(value) };
  }

  addBet(key) {
    if (this.busy) return;
    const amount = this.chip.value;
    const total = this.totalBet() + amount;
    if (total > this.balance) return this.banner('Nicht genug Guthaben', '', 'lose', 1500);
    this.bets.set(key, (this.bets.get(key) ?? 0) + amount);
    this.undoStack.push({ key, amount });
    sound.play('chip');
    this.renderBets();
  }

  removeBet(key) {
    if (this.busy || !this.bets.has(key)) return;
    const amount = Math.min(this.chip.value, this.bets.get(key));
    const rest = this.bets.get(key) - amount;
    if (rest > 0) this.bets.set(key, rest); else this.bets.delete(key);
    sound.play('click');
    this.renderBets();
  }

  undo() {
    const last = this.undoStack.pop();
    if (!last || this.busy) return;
    const rest = (this.bets.get(last.key) ?? 0) - last.amount;
    if (rest > 0) this.bets.set(last.key, rest); else this.bets.delete(last.key);
    sound.play('click');
    this.renderBets();
  }

  clearBets() {
    if (this.busy) return;
    this.bets.clear();
    this.undoStack = [];
    this.renderBets();
  }

  totalBet() { return [...this.bets.values()].reduce((a, b) => a + b, 0); }

  renderBets() {
    for (const [key, el] of this.cells) {
      el.querySelector('.rl-chip')?.remove();
      const amt = this.bets.get(key);
      if (amt) el.append(h('span.rl-chip', {}, fmt(amt).replace(',00', '')));
    }
    this.totalBox.set(`🪙 ${fmt(this.totalBet())}`);
  }

  setBusy(b) {
    this.spinBtn.disabled = b;
    this.chip.disabled = b;
  }

  spin() {
    return this.run(async () => {
      if (this.bets.size === 0) { this.banner('Bitte zuerst setzen', 'Klicke auf den Tisch', 'info', 1600); return; }
      this.cells.forEach((el) => el.classList.remove('winner'));
      const bets = [...this.bets.entries()].map(([key, amount]) => ({ ...this.parseKey(key), amount }));
      const res = await api.post('/games/roulette/spin', { bets });
      if (this.destroyed) return;
      this.setBalance(res.balance - res.payout);
      await this.animateSpin(ORDER.indexOf(res.number));
      if (this.destroyed) return;
      this.showResult(res);
    });
  }

  async animateSpin(index) {
    const { engine } = this;
    this.spinning = true;
    sound.play('spin');
    const camPos = engine.camera.position.clone();
    const camTarget = engine.cameraTarget.clone();
    engine.moveCamera([camPos.x, camPos.y * 0.8, camPos.z * 0.8], [0, 0.5, 2.2], 1400);
    const T = 6500;
    const w0 = this.wheel.rotation.y;
    const wDelta = Math.PI * 2 * 2.2;
    const wEnd = w0 + wDelta;
    const alpha = index * POCKET;
    const finalPhi = wEnd + alpha;
    const b0 = this.ballPhi;
    const need = (((b0 - finalPhi) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const bDelta = need + Math.PI * 2 * 9;
    let lastTick = 0;
    await engine.tween(T, (k) => {
      this.wheel.rotation.y = w0 + wDelta * Easing.outCubic(k);
      const kb = Easing.outQuart(k);
      this.ballPhi = b0 - bDelta * kb;
      let drop = k < 0.6 ? 0 : Easing.inOutQuad((k - 0.6) / 0.4);
      this.ballR = R_TRACK + (R_POCKET - R_TRACK) * drop;
      this.ballY = Y_TRACK + (Y_POCKET - Y_TRACK) * drop;
      if (k > 0.66 && k < 0.95) {
        const bounce = Math.abs(Math.sin((k - 0.66) * 70)) * 0.18 * (1 - (k - 0.66) / 0.29);
        this.ballY += bounce;
      }
      this.placeBall();
      if (k > 0.5 && k - lastTick > 0.06) { lastTick = k; sound.play('tick'); }
    }, Easing.linear);
    this.lockedIndex = index;
    sound.play('stop');
    this.spinning = false;
    engine.moveCamera(camPos.toArray(), camTarget.toArray(), 2500);
  }

  showResult(res) {
    const { number, payout, bets } = res;
    const color = colorOf(number);
    const label = { red: 'ROT', black: 'SCHWARZ', green: 'GRÜN' }[color];
    this.history.push(String(number), color);
    for (const b of bets) {
      if (b.won) {
        const key = b.value == null ? b.type : `${b.type}:${b.value}`;
        this.cells.get(key)?.classList.add('winner');
      }
    }
    this.cells.get(`straight:${number}`)?.classList.add('winner');
    const total = bets.reduce((s, b) => s + b.amount, 0);
    if (payout > 0) {
      const net = payout - total;
      sound.play(net > total ? 'bigwin' : 'win');
      this.banner(`${number} ${label}`, `Auszahlung 🪙 ${fmt(payout)} (${net >= 0 ? '+' : ''}${fmt(net)})`, 'win', 3500);
      this.lastBox.set(`🪙 ${fmt(payout)}`, net >= 0 ? 'win' : 'lose');
      burst(this.engine, new THREE.Vector3(0, 2.2, 0), { count: 70, colors: [0xffd76a, 0xffffff, 0xff7a7a], speed: 5, size: 0.07 });
    } else {
      sound.play('lose');
      this.banner(`${number} ${label}`, `Verloren: 🪙 ${fmt(total)}`, 'lose', 3000);
      this.lastBox.set('🪙 0,00', 'lose');
    }
    this.setBalance(res.balance);
    this.undoStack = [];
  }
}
