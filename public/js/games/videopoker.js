import { GameBase } from './base.js';
import { THREE } from '../three/engine.js';
import { CardTable } from './cardtable.js';
import { api } from '../api.js';
import { h, fmt } from '../ui.js';
import { sound } from '../sound.js';
import { betControl, section, bigButton, statBox, historyStrip } from '../widgets.js';
import { textSprite, disposeObject, burst } from '../three/assets.js';

const RANK_LABEL = {
  royal_flush: 'Royal Flush', straight_flush: 'Straight Flush', four_of_a_kind: 'Vierling', full_house: 'Full House',
  flush: 'Flush', straight: 'Straße', three_of_a_kind: 'Drilling', two_pair: 'Zwei Paare', jacks_or_better: 'Buben oder besser', high_card: 'Nichts',
};
const Y = 1.05;
const DX = 1.3;

export default class VideoPoker extends GameBase {
  engineOptions() { return { fov: 42, position: [0, 2.6, 6.8], target: [0, 0.9, 0], background: 0x06080f }; }

  buildScene() {
    const { engine } = this;
    engine.addLights({ key: [3, 8, 6], keyIntensity: 2.2, hemi: 0.5, fill: 0.7, shadowSize: 8 });
    engine.addSpot({ position: [0, 6, 5], target: [0, 1, 0], intensity: 450, angle: 0.8, color: 0xdde8ff });
    this.tableApi = new CardTable(engine, { shoe: [7, 1.2, -0.5], felt: '#12315a', size: [12, 7], shoeVisible: false });
    engine.setFit(8, 5.5);
    this.holders = [];
    this.held = [false, false, false, false, false];
    this.holdSprites = [];
    engine.renderer.domElement.addEventListener('click', (e) => this.onClick(e));
    this.keyHandler = (e) => { const n = Number(e.key); if (n >= 1 && n <= 5) this.toggleHold(n - 1); };
    window.addEventListener('keydown', this.keyHandler);
  }

  destroy() {
    window.removeEventListener('keydown', this.keyHandler);
    super.destroy();
  }

  buildPanel() {
    this.bet = betControl({ balance: () => this.balance, value: 50_00 });
    this.dealBtn = bigButton('♠ GEBEN', () => this.deal());
    this.drawBtn = bigButton('🔄 ZIEHEN', () => this.draw(), 'btn-green');
    this.drawBtn.classList.add('hidden');
    this.status = statBox('Ergebnis', '–');
    this.history = historyStrip(10);
    this.paytable = h('div.paytable');
    this.panel.append(
      section('Einsatz', this.bet.el),
      this.dealBtn, this.drawBtn,
      h('div.hold-hint', {}, 'Klicke Karten (oder Tasten 1–5), um sie zu halten. Dann ZIEHEN.'),
      section('Ergebnis', this.status.el, this.history.el),
      section('Auszahlungstabelle (× Einsatz)', this.paytable),
    );
  }

  async ready() {
    const [{ paytable }, { game }] = await Promise.all([api.get('/games/videopoker/config'), api.get('/games/videopoker/current')]);
    if (this.destroyed) return;
    this.paytable.replaceChildren(...Object.entries(paytable).filter(([, v]) => v > 0).map(([k, v]) =>
      h('div.prow', { dataset: { rank: k } }, h('span.sym', {}, RANK_LABEL[k]), h('span.pays', {}, `${v}×`))
    ));
    if (game) {
      this.bet.value = game.bet;
      await this.showHand(game.hand, true);
      this.enterHold(game);
    } else this.hint('Setze deinen Einsatz und klicke GEBEN');
  }

  setBusy(b) {
    this.bet.disabled = b || !!this.game;
    this.dealBtn.disabled = b || !!this.game;
    this.drawBtn.disabled = b || !this.game;
  }

  enterHold(game) {
    this.game = game;
    this.dealBtn.classList.add('hidden');
    this.drawBtn.classList.remove('hidden');
    this.setBusy(false);
    this.hint('Karten zum Halten anklicken, dann ZIEHEN');
  }

  cardPos(i) { return [(i - 2) * DX, Y, 0]; }

  async showHand(hand, instant = false) {
    for (let i = 0; i < 5; i++) {
      if (this.holders[i]) continue;
      const holder = await this.tableApi.deal(hand[i], { pos: this.cardPos(i), upright: true, duration: instant ? 1 : 380 });
      this.holders[i] = holder;
      if (!instant) await this.engine.delay(90);
    }
  }

  onClick(e) {
    if (!this.game || this.busy) return;
    const hit = this.engine.pick(e, this.holders.filter(Boolean));
    if (!hit.length) return;
    const holder = hit[0].object.parent;
    const idx = this.holders.indexOf(holder);
    if (idx >= 0) this.toggleHold(idx);
  }

  toggleHold(i) {
    if (!this.game || this.busy || !this.holders[i]) return;
    this.held[i] = !this.held[i];
    sound.play('click');
    const holder = this.holders[i];
    const y0 = holder.position.y;
    const y1 = this.held[i] ? Y + 0.35 : Y;
    this.engine.tween(200, (k) => { holder.position.y = y0 + (y1 - y0) * k; });
    if (this.held[i]) {
      const s = textSprite('HOLD', { size: 44, color: '#1a1305', bg: '#f5d97a', height: 0.32 });
      s.position.set((i - 2) * DX, Y + 1.25, 0.2);
      this.engine.scene.add(s);
      this.holdSprites[i] = s;
    } else if (this.holdSprites[i]) {
      disposeObject(this.holdSprites[i]);
      this.holdSprites[i] = null;
    }
  }

  clearHolds() {
    this.held = [false, false, false, false, false];
    this.holdSprites.forEach((s) => s && disposeObject(s));
    this.holdSprites = [];
  }

  deal() {
    return this.run(async () => {
      this.hideBanner();
      this.paytable.querySelectorAll('.hit').forEach((e) => e.classList.remove('hit'));
      this.clearHolds();
      await this.tableApi.clear({ to: [-8, 1.5, 1] });
      this.holders = [];
      const { game } = await api.post('/games/videopoker/deal', { bet: this.bet.value });
      if (this.destroyed) return;
      this.setBalance(game.balance);
      await this.showHand(game.hand);
      if (this.destroyed) return;
      this.enterHold(game);
    });
  }

  draw() {
    return this.run(async () => {
      const hold = [...this.held];
      const { game } = await api.post('/games/videopoker/draw', { hold });
      if (this.destroyed) return;
      const replaced = game.replaced;
      await Promise.all(replaced.map((i, n) => this.engine.delay(n * 60).then(() => this.tableApi.discard(this.holders[i], { to: [(i - 2) * DX, -1.5, 3] }))));
      for (const i of replaced) this.holders[i] = null;
      for (const i of replaced) {
        this.holders[i] = await this.tableApi.deal(game.hand[i], { pos: this.cardPos(i), upright: true, duration: 380 });
      }
      this.clearHolds();
      this.game = null;
      this.drawBtn.classList.add('hidden');
      this.dealBtn.classList.remove('hidden');
      this.finish(game);
    });
  }

  finish(game) {
    const label = RANK_LABEL[game.result];
    if (game.payout > 0) {
      const mult = game.payout / game.bet;
      sound.play(mult >= 25 ? 'bigwin' : 'win');
      this.banner(label.toUpperCase(), `+🪙 ${fmt(game.payout)}`, 'win', 3200);
      this.status.set(`${label} · 🪙 ${fmt(game.payout)}`, 'win');
      this.history.push(label, mult >= 9 ? 'gold' : 'win');
      this.paytable.querySelector(`[data-rank="${game.result}"]`)?.classList.add('hit');
      burst(this.engine, new THREE.Vector3(0, 2, 0.5), { count: mult >= 25 ? 140 : 60, colors: [0xffd76a, 0xffffff, 0x8fb3ff], speed: 5, size: 0.07 });
    } else {
      sound.play('lose');
      this.banner('KEIN GEWINN', label, 'lose', 2200);
      this.status.set(label, 'lose');
      this.history.push('–', 'lose');
    }
    this.setBalance(game.balance);
    this.setBusy(false);
    this.hint('Neue Runde? Klicke GEBEN');
  }
}
