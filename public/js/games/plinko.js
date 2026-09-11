import { GameBase } from './base.js';
import { THREE, Easing } from '../three/engine.js';
import { api } from '../api.js';
import { h, fmt, fmtMult } from '../ui.js';
import { sound } from '../sound.js';
import { betControl, segmented, section, bigButton, statBox, historyStrip } from '../widgets.js';
import { textSprite, disposeObject } from '../three/assets.js';

const BOARD_W = 12.5;
const BALL_R = 0.19;

function bucketColor(mult, max) {
  const t = Math.min(1, Math.log(mult + 1) / Math.log(max + 1));
  const c = new THREE.Color();
  c.setHSL(0.36 - t * 0.36, 0.85, 0.5); // grün -> gelb -> rot
  return c;
}

export default class Plinko extends GameBase {
  engineOptions() { return { fov: 40, position: [0, -0.2, 16.5], target: [0, -0.4, 0], background: 0x0a0812, shadows: false }; }

  buildScene() {
    const { engine } = this;
    engine.addLights({ key: [3, 8, 10], keyIntensity: 1.8, hemi: 0.5, fill: 0.6 });
    engine.addSpot({ position: [0, 6, 10], target: [0, -2, 0], intensity: 500, angle: 0.9, color: 0xe6d0ff });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshStandardMaterial({ color: 0x120e1f, roughness: 0.9 }));
    back.position.z = -1.2;
    engine.scene.add(back);
    engine.setFit(14, 13);
    this.board = new THREE.Group();
    engine.scene.add(this.board);
    this.pegGeo = new THREE.SphereGeometry(0.11, 14, 14);
    this.pegMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f5, metalness: 0.7, roughness: 0.25 });
    this.ballGeo = new THREE.SphereGeometry(BALL_R, 24, 24);
    this.balls = 0;
  }

  buildPanel() {
    this.bet = betControl({ balance: () => this.balance, value: 10_00 });
    this.rowsSel = segmented([{ value: 8, label: '8 Reihen' }, { value: 12, label: '12' }, { value: 16, label: '16' }], 12, () => this.rebuild());
    this.riskSel = segmented([{ value: 'low', label: 'Niedrig' }, { value: 'medium', label: 'Mittel' }, { value: 'high', label: 'Hoch' }], 'medium', () => this.rebuild());
    this.dropBtn = bigButton('🔮 FALLEN LASSEN', () => this.drop());
    this.lastBox = statBox('Letzter Treffer', '–');
    this.history = historyStrip(16);
    this.panel.append(
      section('Einsatz', this.bet.el),
      section('Reihen', this.rowsSel.el),
      section('Risiko', this.riskSel.el),
      this.dropBtn,
      section('Ergebnis', this.lastBox.el, this.history.el),
      section('Hinweis', h('div.panel-note', {}, 'Mehrere Kugeln gleichzeitig möglich – einfach mehrfach klicken. Auszahlung = Einsatz × Multiplikator des Fachs.')),
    );
  }

  async ready() {
    const { multipliers } = await api.get('/games/plinko/config');
    if (this.destroyed) return;
    this.multipliers = multipliers;
    this.rebuild();
    this.hint('Klicke FALLEN LASSEN – auch mehrmals hintereinander');
  }

  setBusy() { /* Mehrere Kugeln gleichzeitig erlaubt */ }

  layout() {
    const rows = this.rowsSel.value;
    const s = BOARD_W / (rows + 2);
    const sv = s * 0.86;
    const top = (rows * sv) / 2 + 0.6;
    return { rows, s, sv, top };
  }

  pegPos(row, j) {
    const { s, sv, top } = this.layout();
    return new THREE.Vector3((j - (row + 2) / 2) * s, top - row * sv, 0);
  }

  rebuild() {
    if (!this.multipliers) return;
    while (this.board.children.length) disposeObject(this.board.children[0]);
    const { rows, s, sv, top } = this.layout();
    const risk = this.riskSel.value;
    const mults = this.multipliers[rows][risk];
    const max = Math.max(...mults);
    for (let r = 0; r < rows; r++) {
      for (let j = 0; j < r + 3; j++) {
        const peg = new THREE.Mesh(this.pegGeo, this.pegMat);
        peg.position.copy(this.pegPos(r, j));
        this.board.add(peg);
      }
    }
    this.buckets = mults.map((m, k) => {
      const x = (k - rows / 2) * s;
      const color = bucketColor(m, max);
      const box = new THREE.Mesh(new THREE.BoxGeometry(s * 0.86, 0.55, 0.5), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, roughness: 0.4 }));
      box.position.set(x, top - rows * sv - 0.65, 0);
      this.board.add(box);
      const label = textSprite(m < 10 ? `${m}×` : `${Math.round(m)}×`, { size: 56, color: '#0b0b0b', height: Math.min(0.42, s * 0.5) });
      label.position.set(x, box.position.y, 0.32);
      this.board.add(label);
      return { box, color, mult: m };
    });
  }

  drop() {
    if (this.balls >= 12) return;
    const bet = this.bet.value;
    const rows = this.rowsSel.value;
    const risk = this.riskSel.value;
    if (bet > this.balance) return this.banner('Nicht genug Guthaben', '', 'lose', 1500);
    this.rowsSel.disabled = true;
    this.riskSel.disabled = true;
    this.balls++;
    (async () => {
      try {
        const res = await api.post('/games/plinko/drop', { bet, rows, risk });
        if (this.destroyed) return;
        this.setBalance(this.balance - bet);
        await this.animateBall(res);
        if (this.destroyed) return;
        this.finish(res, bet);
      } catch (e) {
        if (!this.destroyed) this.banner('Fehler', e.message, 'lose', 2000);
      } finally {
        this.balls--;
        if (this.balls === 0 && !this.destroyed) { this.rowsSel.disabled = false; this.riskSel.disabled = false; }
      }
    })();
  }

  async animateBall(res) {
    const { engine } = this;
    const { s, sv, top } = this.layout();
    const ball = new THREE.Mesh(this.ballGeo, new THREE.MeshPhysicalMaterial({ color: 0xffd76a, metalness: 0.6, roughness: 0.2, clearcoat: 1 }));
    ball.position.set(0, top + 1.6, 0.15);
    engine.scene.add(ball);
    // Startfall bis zur ersten Reihe
    let x = 0;
    let y = top + 1.6;
    const fall = async (toX, toY, ms, ease = Easing.inQuad) => {
      const fx = x; const fy = y;
      await engine.tween(ms, (k) => { ball.position.x = fx + (toX - fx) * k; ball.position.y = fy + (toY - fy) * k; }, ease);
      x = toX; y = toY;
    };
    await fall(0, top + BALL_R + 0.12, 260);
    for (let r = 0; r < res.path.length; r++) {
      const dir = res.path[r] ? 1 : -1;
      const nx = x + (dir * s) / 2;
      const ny = top - (r + 1) * sv + BALL_R + 0.12;
      const fx = x; const fy = y;
      sound.play('tick');
      await engine.tween(150, (k) => {
        ball.position.x = fx + (nx - fx) * k;
        ball.position.y = fy + (ny - fy) * k + Math.sin(Math.PI * k) * 0.22;
      }, Easing.inQuad);
      x = nx; y = ny;
    }
    const bucket = this.buckets[res.bucket];
    await fall(x, bucket.box.position.y + 0.2, 180, Easing.inQuad);
    sound.play('bounce');
    // Fach aufleuchten
    const mat = bucket.box.material;
    const y0 = bucket.box.position.y;
    engine.tween(450, (k) => {
      mat.emissiveIntensity = 0.25 + (1 - k) * 1.6;
      bucket.box.position.y = y0 - Math.sin(k * Math.PI) * 0.18;
    });
    await engine.tween(320, (k) => { ball.material.opacity = 1 - k; ball.material.transparent = true; ball.position.y -= 0.01; });
    disposeObject(ball);
  }

  finish(res, bet) {
    const m = res.multiplier;
    const cls = m >= 10 ? 'gold' : m >= 1 ? 'win' : 'lose';
    this.history.push(fmtMult(m), cls);
    this.lastBox.set(`${fmtMult(m)} · 🪙 ${fmt(res.payout)}`, m >= 1 ? 'win' : 'lose');
    if (m >= 10) { sound.play('bigwin'); this.banner(`${fmtMult(m)}`, `+🪙 ${fmt(res.payout)}`, 'win', 2600); }
    else if (m > 1) sound.play('win');
    else if (m < 1) sound.play('lose');
    this.setBalance(this.balance + res.payout);
  }
}
