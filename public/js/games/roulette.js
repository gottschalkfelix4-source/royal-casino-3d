import { GameBase } from './base.js';
import { THREE, Easing } from '../three/engine.js';
import { api } from '../api.js';
import { h, fmt } from '../ui.js';
import { sound } from '../sound.js';
import { section, statBox, historyStrip, chipSelector } from '../widgets.js';
import { makeCanvas, canvasTexture, goldMaterial, woodTexture, glossyMaterial, burst } from '../three/assets.js';

const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const colorOf = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');
const POCKET = (Math.PI * 2) / ORDER.length;
const R_TRACK = 4.2;
const R_POCKET = 3.1;
const Y_TRACK = 1.02;
const Y_POCKET = 0.74;

const OUTSIDE = [
  { key: 'low', label: '1–18' }, { key: 'even', label: 'GERADE' }, { key: 'red', label: 'ROT' },
  { key: 'black', label: 'SCHWARZ' }, { key: 'odd', label: 'UNGERADE' }, { key: 'high', label: '19–36' },
];

function numberRingTexture() {
  const S = 1024;
  const { canvas, ctx } = makeCanvas(S, S);
  const c = S / 2;
  const scale = c / 3.7; // Außenradius des Rings = 3.7 Welt-Einheiten
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(0.42 * scale)}px Inter, Arial`;
  ORDER.forEach((n, i) => {
    const a = i * POCKET;
    const r = 3.32 * scale;
    ctx.save();
    ctx.translate(c + r * Math.cos(a), c - r * Math.sin(a));
    ctx.rotate(Math.PI / 2 - a);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 6;
    ctx.fillText(String(n), 0, 0);
    ctx.restore();
  });
  return canvasTexture(canvas);
}

export default class Roulette extends GameBase {
  engineOptions() {
    // Ziel liegt vor dem Kessel, damit er im oberen Bildbereich über dem Setztisch sitzt
    return { fov: 40, position: [0, 12, 12], target: [0, 0.4, 3.2], background: 0x07090d, exposure: 1.0 };
  }

  buildScene() {
    const { engine } = this;
    const { scene } = engine;
    engine.addLights({ key: [5, 12, 6], keyIntensity: 2.4, hemi: 0.5, fill: 0.7, shadowSize: 8 });
    engine.addSpot({ position: [0, 12, 3], target: [0, 0, 0], intensity: 700, angle: 0.55, color: 0xffe6c0 });

    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: 0x0d1a14, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.01; floor.receiveShadow = true;
    scene.add(floor);
    engine.setFit(11, 12);

    const wheel = new THREE.Group();
    scene.add(wheel);
    this.wheel = wheel;
    const woodMat = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.4, metalness: 0.05 });
    const gold = goldMaterial();

    // Außenkranz (Kugelbahn)
    const outerWall = new THREE.Mesh(new THREE.CylinderGeometry(4.75, 4.95, 0.95, 96, 1, true), woodMat);
    outerWall.position.y = 0.475; outerWall.castShadow = true;
    wheel.add(outerWall);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(4.95, 96), woodMat);
    bottom.rotation.x = -Math.PI / 2; bottom.position.y = 0.001;
    wheel.add(bottom);
    const track = new THREE.Mesh(new THREE.RingGeometry(3.7, 4.75, 96), new THREE.MeshStandardMaterial({ color: 0x2b1a0e, roughness: 0.25, metalness: 0.2 }));
    track.rotation.x = -Math.PI / 2; track.position.y = 0.9; track.receiveShadow = true;
    wheel.add(track);
    const innerWall = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.7, 0.32, 96, 1, true), new THREE.MeshStandardMaterial({ color: 0x1c110a, roughness: 0.4, side: THREE.DoubleSide }));
    innerWall.position.y = 0.74;
    wheel.add(innerWall);
    const rimTrim = new THREE.Mesh(new THREE.TorusGeometry(4.75, 0.06, 12, 128), gold);
    rimTrim.rotation.x = Math.PI / 2; rimTrim.position.y = 0.95;
    wheel.add(rimTrim);

    // Fächer
    const mats = { red: glossyMaterial(0xb3261e), black: glossyMaterial(0x15161a), green: glossyMaterial(0x1e8f4e) };
    ORDER.forEach((n, i) => {
      const a = i * POCKET;
      const wedge = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.7, 0.6, 4, 1, false, a + Math.PI / 2 - POCKET / 2, POCKET), mats[colorOf(n)]);
      wedge.position.y = 0.3; wedge.receiveShadow = true;
      wheel.add(wedge);
      const fret = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.14, 0.05), gold);
      const fa = a + POCKET / 2;
      fret.position.set(3.08 * Math.cos(fa), 0.66, -3.08 * Math.sin(fa));
      fret.rotation.y = fa;
      fret.castShadow = true;
      wheel.add(fret);
    });
    const numbers = new THREE.Mesh(new THREE.RingGeometry(2.45, 3.7, 96), new THREE.MeshBasicMaterial({ map: numberRingTexture(), transparent: true }));
    numbers.rotation.x = -Math.PI / 2; numbers.position.y = 0.605;
    wheel.add(numbers);

    // Kegel & Nabe
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.45, 0.7, 96), new THREE.MeshStandardMaterial({ color: 0x3a2413, roughness: 0.35, metalness: 0.2 }));
    cone.position.y = 0.6 + 0.35; cone.castShadow = true;
    wheel.add(cone);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 1.1, 32), gold);
    hub.position.y = 1.4; hub.castShadow = true;
    wheel.add(hub);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 32), gold);
    knob.position.y = 2.05;
    wheel.add(knob);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 1.4, 6, 12), gold);
      arm.rotation.z = Math.PI / 2; arm.rotation.y = (i * Math.PI) / 2;
      arm.position.y = 1.75;
      wheel.add(arm);
    }

    // Kugel
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 32, 32), new THREE.MeshPhysicalMaterial({ color: 0xf5f5f5, roughness: 0.12, clearcoat: 1 }));
    this.ball.castShadow = true;
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
