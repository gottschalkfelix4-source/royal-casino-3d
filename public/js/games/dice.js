import { GameBase } from './base.js';
import { THREE, Easing } from '../three/engine.js';
import { api } from '../api.js';
import { h, fmt } from '../ui.js';
import { sound } from '../sound.js';
import { section, statBox, historyStrip, chipSelector } from '../widgets.js';
import { buildTable, createDie, dieQuaternion, goldMaterial, burst } from '../three/assets.js';

const TOTAL_PAYS = { 4: 60, 5: 30, 6: 17, 7: 12, 8: 8, 9: 6, 10: 6, 11: 6, 12: 6, 13: 8, 14: 12, 15: 17, 16: 30, 17: 60 };
const SIMPLE = [
  { key: 'small', label: 'KLEIN 4–10', odds: '1:1' }, { key: 'big', label: 'GROSS 11–17', odds: '1:1' },
  { key: 'odd', label: 'UNGERADE', odds: '1:1' }, { key: 'even', label: 'GERADE', odds: '1:1' },
  { key: 'triple', label: 'DREIERPASCH', odds: '30:1' },
];
const REST = [[-1.1, 0, -0.3], [0.9, 0, 0.5], [0.1, 0, -1.2]];

export default class Dice extends GameBase {
  engineOptions() { return { fov: 40, position: [0, 7.5, 6.5], target: [0, 0.3, 0], background: 0x07090d }; }

  buildScene() {
    const { engine } = this;
    engine.addLights({ key: [4, 10, 4], keyIntensity: 2.4, hemi: 0.5, fill: 0.7, shadowSize: 8 });
    engine.addSpot({ position: [0, 8, 3], target: [0, 0, 0], intensity: 450, angle: 0.7, color: 0xfff1d6 });
    buildTable(engine.scene, { width: 12, depth: 8, felt: '#7a1b1b' });
    engine.setFit(8.5, 7.5);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.08, 12, 96), goldMaterial());
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.02;
    engine.scene.add(ring);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(3.15, 96), new THREE.MeshStandardMaterial({ color: 0x5a1212, roughness: 0.95 }));
    inner.rotation.x = -Math.PI / 2; inner.position.y = 0.004; inner.receiveShadow = true;
    engine.scene.add(inner);

    this.dice = [1, 2, 3].map((i) => {
      const d = createDie(0.8);
      d.position.set(...REST[i - 1]);
      d.position.y = 0.4;
      d.quaternion.copy(dieQuaternion(i + 1, Math.random() * Math.PI));
      engine.scene.add(d);
      return d;
    });
  }

  buildPanel() {
    this.bets = new Map();
    this.chip = chipSelector(() => {}, 10_00);
    this.cells = new Map();
    const mk = (key, label, odds) => {
      const el = h('div.bet-cell', {
        onclick: () => this.addBet(key),
        oncontextmenu: (e) => { e.preventDefault(); this.removeBet(key); },
      }, label, h('span.odds', {}, odds));
      this.cells.set(key, el);
      return el;
    };
    const simple = h('div.bet-cells', {}, SIMPLE.map((s) => mk(s.key, s.label, s.odds)));
    const totals = h('div.grid-4', {}, Object.entries(TOTAL_PAYS).map(([t, p]) => mk(`total:${t}`, t, `${p}:1`)));
    this.totalBox = statBox('Gesamteinsatz', '🪙 0,00');
    this.resultBox = statBox('Letzter Wurf', '–');
    this.history = historyStrip(10);
    this.rollBtn = h('button.btn.btn-big.btn-gold', { onclick: () => this.roll() }, '🎲 WÜRFELN');
    this.panel.append(
      section('Chip wählen', this.chip.el),
      section('Wetten', simple, h('div.title', {}, 'Summe'), totals, this.totalBox.el, h('button.btn', { onclick: () => this.clearBets() }, '✕ Wetten leeren')),
      this.rollBtn,
      section('Ergebnis', this.resultBox.el, this.history.el),
      section('Hinweis', h('div.panel-note', {}, 'Bei einem Dreierpasch verlieren Klein/Groß/Gerade/Ungerade. Rechtsklick entfernt einen Chip.')),
    );
    this.hint('Wähle Wetten und würfle');
  }

  total() { return [...this.bets.values()].reduce((a, b) => a + b, 0); }

  addBet(key) {
    if (this.busy) return;
    if (this.total() + this.chip.value > this.balance) return this.banner('Nicht genug Guthaben', '', 'lose', 1500);
    this.bets.set(key, (this.bets.get(key) ?? 0) + this.chip.value);
    sound.play('chip');
    this.renderBets();
  }

  removeBet(key) {
    if (this.busy || !this.bets.has(key)) return;
    const rest = this.bets.get(key) - this.chip.value;
    if (rest > 0) this.bets.set(key, rest); else this.bets.delete(key);
    sound.play('click');
    this.renderBets();
  }

  clearBets() { if (!this.busy) { this.bets.clear(); this.renderBets(); } }

  renderBets() {
    for (const [key, el] of this.cells) {
      el.querySelector('.rl-chip')?.remove();
      el.classList.remove('winner', 'lost');
      if (this.bets.get(key)) el.append(h('span.rl-chip', {}, fmt(this.bets.get(key)).replace(',00', '')));
    }
    this.totalBox.set(`🪙 ${fmt(this.total())}`);
  }

  setBusy(b) { this.rollBtn.disabled = b; this.chip.disabled = b; }

  roll() {
    return this.run(async () => {
      if (this.bets.size === 0) { this.banner('Bitte zuerst setzen', '', 'info', 1500); return; }
      this.hideBanner();
      this.cells.forEach((el) => el.classList.remove('winner', 'lost'));
      const bets = [...this.bets.entries()].map(([key, amount]) => {
        const [type, value] = key.split(':');
        return { type, value: value == null ? null : Number(value), amount };
      });
      const res = await api.post('/games/dice/roll', { bets });
      if (this.destroyed) return;
      this.setBalance(res.balance - res.payout);
      await this.animate(res.dice);
      if (this.destroyed) return;
      this.finish(res);
    });
  }

  async animate(values) {
    const { engine } = this;
    sound.play('dice');
    await Promise.all(this.dice.map(async (die, i) => {
      const start = die.position.clone();
      const rest = new THREE.Vector3(REST[i][0] + (Math.random() - 0.5) * 0.6, 0.4, REST[i][2] + (Math.random() - 0.5) * 0.6);
      const q0 = die.quaternion.clone();
      const spin = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 12 + 6, Math.random() * 12 + 6, Math.random() * 6, 'XYZ'));
      const qTarget = dieQuaternion(values[i], Math.random() * Math.PI * 2);
      const top = new THREE.Vector3(start.x * 0.3 + (Math.random() - 0.5), 3.4 + Math.random(), start.z * 0.3 + (Math.random() - 0.5));
      // Hochwerfen
      await engine.tween(420 + i * 60, (k) => {
        die.position.lerpVectors(start, top, k);
        die.quaternion.slerpQuaternions(q0, spin, k * 0.5);
      }, Easing.outQuad);
      const qMid = die.quaternion.clone();
      // Fallen mit Rotation
      await engine.tween(380, (k) => {
        die.position.lerpVectors(top, rest, k);
        die.position.y = top.y + (rest.y - top.y) * k * k;
        die.quaternion.slerpQuaternions(qMid, spin, k);
      }, Easing.linear);
      sound.play('bounce');
      // Aufprall & ausrichten
      const qLand = die.quaternion.clone();
      await engine.tween(420, (k) => {
        die.position.y = rest.y + Math.abs(Math.sin(k * Math.PI * 2)) * 0.5 * (1 - k);
        die.quaternion.slerpQuaternions(qLand, qTarget, Easing.outCubic(k));
      }, Easing.linear);
      die.position.copy(rest);
      die.quaternion.copy(qTarget);
    }));
    engine.shake(0.05);
  }

  finish(res) {
    const total = res.bets.reduce((s, b) => s + b.amount, 0);
    const net = res.payout - total;
    for (const b of res.bets) {
      const key = b.value == null ? b.type : `${b.type}:${b.value}`;
      this.cells.get(key)?.classList.add(b.won ? 'winner' : 'lost');
    }
    const text = `${res.dice.join(' · ')} = ${res.sum}${res.triple ? ' (Dreierpasch!)' : ''}`;
    this.history.push(String(res.sum), net > 0 ? 'win' : 'lose');
    if (net > 0) {
      sound.play(net >= total * 5 ? 'bigwin' : 'win');
      this.banner(`SUMME ${res.sum}`, `${text} · +🪙 ${fmt(net)}`, 'win', 3200);
      this.resultBox.set(`${text} · +🪙 ${fmt(net)}`, 'win');
      burst(this.engine, new THREE.Vector3(0, 1.5, 0), { count: 70, colors: [0xffd76a, 0xffffff, 0xff8a7a], speed: 5, size: 0.07 });
    } else if (net === 0) {
      this.banner(`SUMME ${res.sum}`, text, 'info', 2400);
      this.resultBox.set(text, '');
    } else {
      sound.play('lose');
      this.banner(`SUMME ${res.sum}`, `${text} · −🪙 ${fmt(-net)}`, 'lose', 2600);
      this.resultBox.set(`${text} · −🪙 ${fmt(-net)}`, 'lose');
    }
    this.setBalance(res.balance);
  }
}
