import { GameBase } from './base.js';
import { THREE, Easing } from '../three/engine.js';
import { api } from '../api.js';
import { h, fmt } from '../ui.js';
import { sound } from '../sound.js';
import { section, statBox, historyStrip, chipSelector } from '../widgets.js';
import { burst, createChip, CHIP, CHIP_STYLES } from '../three/assets.js';
import { buildRouletteWheel, ORDER, colorOf, POCKET, R_TRACK, R_POCKET, Y_TRACK, Y_POCKET } from '../three/roulettewheel.js';
import { layoutCell, layoutToLocal } from '../three/roulettelayout.js';
import { dolly } from '../three/furniture.js';

const OUTSIDE = [
  { key: 'low', label: '1–18' }, { key: 'even', label: 'GERADE' }, { key: 'red', label: 'ROT' },
  { key: 'black', label: 'SCHWARZ' }, { key: 'odd', label: 'UNGERADE' }, { key: 'high', label: '19–36' },
];
const CHIP_SCALE = 0.19; // Chip-Durchmesser ≈ 13,7 cm auf dem Hallentisch

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

    if (engine.embedded) {
      // In der Halle: der große Kessel im Tisch gehört der Halle, das Spiel dreht seinen Rotor und die Kugel;
      // Einsätze liegen als 3D-Chips auf dem echten Tableau.
      const ex = engine.mount.extra;
      this.rotor = ex.wheel.rotor; this.ball = ex.wheel.ball; this.wheelGroup = ex.wheel.wheelGroup;
      this.layoutDecal = ex.layout; this.chipY = ex.chipY;
      this.chipRoot = new THREE.Group();
      scene.add(this.chipRoot); // scene = Wurzel am Tisch (Weltmaßstab, Tischkoordinaten)
      this.dollyMesh = dolly(); this.dollyMesh.visible = false;
      scene.add(this.dollyMesh);
      this.chipMeshes = new Map();
    } else {
      const floor = new THREE.Mesh(new THREE.CircleGeometry(7, 64), new THREE.MeshStandardMaterial({ color: 0x0d1a14, roughness: 0.9 }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = -0.01; floor.receiveShadow = true;
      scene.add(floor);
      engine.setFit(11, 12);
      const { group, rotor, ball } = buildRouletteWheel({ ball: true });
      scene.add(group); group.add(ball);
      this.rotor = rotor; this.ball = ball; this.wheelGroup = group;
    }
    this.ballPhi = Math.PI / 3;
    this.ballR = R_POCKET;
    this.ballY = Y_POCKET;
    this.lockedIndex = 0;
    this.placeBall();

    engine.onUpdate((dt) => {
      if (!this.spinning) {
        this.rotor.rotation.y += dt * 0.12;
        this.ballPhi = this.rotor.rotation.y + this.lockedIndex * POCKET;
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
    this.renderChips3D();
  }

  /** Position eines Wettfelds in Tischkoordinaten (Wurzel = Tisch) */
  cellPosition(key) {
    const p = layoutToLocal(layoutCell(key));
    return new THREE.Vector3(this.layoutDecal.position.x + p.x, this.chipY, this.layoutDecal.position.z + p.z);
  }

  /** Gesetzte Beträge als Chip-Stapel auf dem echten Tableau (nur in der Halle) */
  renderChips3D() {
    if (!this.chipRoot) return;
    for (const [key, group] of this.chipMeshes) {
      if (!this.bets.has(key)) { this.chipRoot.remove(group); this.chipMeshes.delete(key); }
    }
    for (const [key, amount] of this.bets) {
      // Stückelung wie ein Dealer: große Werte unten, max. 8 Chips sichtbar
      const chips = [];
      let rest = amount;
      for (const st of [...CHIP_STYLES].reverse()) while (rest >= st.value && chips.length < 8) { chips.push(st.value); rest -= st.value; }
      if (chips.length === 0) chips.push(amount);
      chips.reverse();
      let group = this.chipMeshes.get(key);
      const sig = chips.join(',');
      if (group && group.userData.sig === sig) continue;
      if (group) this.chipRoot.remove(group);
      group = new THREE.Group();
      group.userData.sig = sig;
      const base = this.cellPosition(key);
      const jitter = (i) => (Math.sin(i * 12.9898 + key.length) * 0.5) * 0.008;
      chips.forEach((v, i) => {
        const c = createChip(v);
        c.scale.setScalar(CHIP_SCALE);
        c.position.set(jitter(i), CHIP.h * CHIP_SCALE * (i + 0.5), jitter(i + 7));
        c.rotation.y = i * 1.3;
        group.add(c);
      });
      group.position.copy(base);
      this.chipRoot.add(group);
      this.chipMeshes.set(key, group);
      // neuer Stapel fällt kurz aufs Tuch
      const y0 = base.y;
      this.engine.tween(220, (k) => { group.position.y = y0 + (1 - k) * 0.06; }, Easing.outQuad);
    }
  }

  setBusy(b) {
    this.spinBtn.disabled = b;
    this.chip.disabled = b;
  }

  spin() {
    return this.run(async () => {
      if (this.bets.size === 0) { this.banner('Bitte zuerst setzen', 'Klicke auf den Tisch', 'info', 1600); return; }
      this.cells.forEach((el) => el.classList.remove('winner'));
      if (this.dollyMesh) this.dollyMesh.visible = false;
      const bets = [...this.bets.entries()].map(([key, amount]) => ({ ...this.parseKey(key), amount }));
      const res = await api.post('/games/roulette/spin', { bets });
      if (this.destroyed) return;
      this.setBalance(res.balance - res.payout);
      await this.animateSpin(ORDER.indexOf(res.number));
      if (this.destroyed) return;
      this.showResult(res);
    });
  }

  /** Blick zum Kessel (Halle): näher heran und Bildwinkel enger, damit der Kessel groß im Bild steht */
  focusWheel(on) {
    if (!this.engine.embedded) return;
    if (!on) { this.engine.clearFocus(); return; }
    const cam = this.engine.camera.position.clone();
    const target = this.wheelGroup.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3().subVectors(target, cam); dir.y = 0;
    const dist = dir.length(); dir.normalize();
    const pos = cam.clone().addScaledVector(dir, Math.max(0, dist - 1.8));
    pos.y = 1.85;
    this.engine.focus({ pos, look: target.clone().setY(1.0), fov: 46 });
  }

  async animateSpin(index) {
    const { engine } = this;
    this.spinning = true;
    sound.play('spin');
    const camPos = engine.camera.position.clone();
    const camTarget = engine.cameraTarget.clone();
    if (engine.embedded) this.focusWheel(true);
    else engine.moveCamera([camPos.x, camPos.y * 0.8, camPos.z * 0.8], [0, 0.5, 2.2], 1400);
    const T = 6500;
    const w0 = this.rotor.rotation.y;
    const wDelta = Math.PI * 2 * 2.2;
    const wEnd = w0 + wDelta;
    const alpha = index * POCKET;
    const finalPhi = wEnd + alpha;
    const b0 = this.ballPhi;
    const need = (((b0 - finalPhi) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const bDelta = need + Math.PI * 2 * 9;
    let lastTick = 0;
    await engine.tween(T, (k) => {
      this.rotor.rotation.y = w0 + wDelta * Easing.outCubic(k);
      const kb = Easing.outQuart(k);
      this.ballPhi = b0 - bDelta * kb;
      const drop = k < 0.6 ? 0 : Easing.inOutQuad((k - 0.6) / 0.4);
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
    if (engine.embedded) { clearTimeout(this.focusTimer); this.focusTimer = setTimeout(() => this.focusWheel(false), 2600); }
    else engine.moveCamera(camPos.toArray(), camTarget.toArray(), 2500);
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
    // Dolly auf die Gewinnzahl, verlorene Chips werden eingezogen, gewonnene bleiben kurz liegen
    if (this.dollyMesh) {
      this.dollyMesh.position.copy(this.cellPosition(`straight:${number}`)).add(new THREE.Vector3(0.03, 0, -0.03));
      this.dollyMesh.visible = true;
      const won = new Set(bets.filter((b) => b.won).map((b) => (b.value == null ? b.type : `${b.type}:${b.value}`)));
      const done = (key, g) => { this.chipRoot.remove(g); if (this.chipMeshes.get(key) === g) this.chipMeshes.delete(key); };
      for (const [key, group] of this.chipMeshes) {
        const g = group; const y0 = g.position.y; const z0 = g.position.z;
        if (won.has(key)) this.engine.tween(2200, (k) => { g.position.y = y0 + Math.sin(k * Math.PI) * 0.02; }).then(() => done(key, g));
        else this.engine.tween(900, (k) => { g.position.z = z0 - k * 0.9; g.position.y = y0 + k * 0.05; g.scale.setScalar(1 - k * 0.6); }, Easing.inQuad).then(() => done(key, g));
      }
      // Einsätze bleiben für die nächste Runde stehen: Chips nach der Animation wieder auflegen
      clearTimeout(this.relayTimer);
      this.relayTimer = setTimeout(() => { if (!this.destroyed) this.renderChips3D(); }, 2400);
    }
    const total = bets.reduce((s, b) => s + b.amount, 0);
    if (payout > 0) {
      const net = payout - total;
      sound.play(net > total ? 'bigwin' : 'win');
      this.banner(`${number} ${label}`, `Auszahlung 🪙 ${fmt(payout)} (${net >= 0 ? '+' : ''}${fmt(net)})`, 'win', 3500);
      this.lastBox.set(`🪙 ${fmt(payout)}`, net >= 0 ? 'win' : 'lose');
      const at = this.engine.embedded ? this.wheelGroup.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.3, 0)) : new THREE.Vector3(0, 2.2, 0);
      burst(this.engine, at, { count: 70, colors: [0xffd76a, 0xffffff, 0xff7a7a], speed: this.engine.embedded ? 1.2 : 5, size: this.engine.embedded ? 0.02 : 0.07, gravity: this.engine.embedded ? 2.5 : 9 });
    } else {
      sound.play('lose');
      this.banner(`${number} ${label}`, `Verloren: 🪙 ${fmt(total)}`, 'lose', 3000);
      this.lastBox.set('🪙 0,00', 'lose');
    }
    this.setBalance(res.balance);
    this.undoStack = [];
  }

  destroy() {
    clearTimeout(this.focusTimer);
    clearTimeout(this.relayTimer);
    if (this.engine?.embedded) this.engine.clearFocus();
    super.destroy();
  }
}
