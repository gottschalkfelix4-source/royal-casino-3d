import { GameBase } from './base.js';
import { THREE } from '../three/engine.js';
import { CardTable } from './cardtable.js';
import { api } from '../api.js';
import { h, fmt } from '../ui.js';
import { sound } from '../sound.js';
import { section, statBox, historyStrip, chipSelector } from '../widgets.js';
import { textSprite, chipStack, disposeObject, makeCanvas, canvasTexture, burst } from '../three/assets.js';

const SPOTS = { player: { x: -2.6, label: 'PLAYER', odds: '1:1', color: '#3b82f6' }, tie: { x: 0, label: 'TIE', odds: '8:1', color: '#2ecc71' }, banker: { x: 2.6, label: 'BANKER', odds: '0,95:1', color: '#e74c3c' } };
const HAND_Z = -1.2;

export default class Baccarat extends GameBase {
  engineOptions() { return { fov: 42, position: [0, 3.6, 6.4], target: [0, 0.2, -0.8], background: 0x07090d }; }

  buildScene() {
    const { engine } = this;
    engine.addLights({ key: [4, 10, 5], keyIntensity: 2.4, hemi: 0.5, fill: 0.7, shadowSize: 10 });
    engine.addSpot({ position: [0, 9, 2], target: [0, 0, 0], intensity: 500, angle: 0.7, color: 0xfff1d6 });
    this.tableApi = new CardTable(engine, { shoe: [5.6, 0.5, -3.2], felt: '#5a1424', size: [14, 9] });
    engine.setFit(10.5, 8);

    // Wettfelder auf dem Filz
    for (const [key, s] of Object.entries(SPOTS)) {
      const { canvas, ctx } = makeCanvas(512, 256);
      ctx.strokeStyle = 'rgba(245,217,122,0.9)'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.roundRect(8, 8, 496, 240, 30); ctx.stroke();
      ctx.fillStyle = 'rgba(245,217,122,0.95)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '900 84px Cinzel, Georgia, serif'; ctx.fillText(s.label, 256, 105);
      ctx.font = '600 44px Inter, Arial'; ctx.fillText(s.odds, 256, 190);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshBasicMaterial({ map: canvasTexture(canvas), transparent: true }));
      m.rotation.x = -Math.PI / 2; m.position.set(s.x, 0.006, 2.3);
      engine.scene.add(m);
    }
    this.playerLabel = textSprite('PLAYER', { size: 48, color: '#8fb3ff', bg: 'rgba(0,0,0,0.55)', height: 0.5 });
    this.playerLabel.position.set(-2.6, 0.7, HAND_Z + 1.3);
    this.bankerLabel = textSprite('BANKER', { size: 48, color: '#ff8a7a', bg: 'rgba(0,0,0,0.55)', height: 0.5 });
    this.bankerLabel.position.set(2.6, 0.7, HAND_Z + 1.3);
    engine.scene.add(this.playerLabel, this.bankerLabel);
    this.chipMeshes = {};
  }

  buildPanel() {
    this.bets = { player: 0, banker: 0, tie: 0 };
    this.chip = chipSelector(() => {}, 10_00);
    this.cells = {};
    const cells = h('div.bet-cells', {}, Object.entries(SPOTS).map(([key, s]) => {
      const el = h('div.bet-cell', {
        style: { borderColor: s.color },
        onclick: () => this.addBet(key),
        oncontextmenu: (e) => { e.preventDefault(); this.removeBet(key); },
      }, s.label, h('span.odds', {}, s.odds));
      this.cells[key] = el;
      return el;
    }));
    this.totalBox = statBox('Gesamteinsatz', '🪙 0,00');
    this.resultBox = statBox('Ergebnis', '–');
    this.history = historyStrip(16);
    this.dealBtn = h('button.btn.btn-big.btn-gold', { onclick: () => this.play() }, '🎴 AUSTEILEN');
    this.panel.append(
      section('Chip wählen', this.chip.el),
      section('Wetten', cells, this.totalBox.el, h('button.btn', { onclick: () => this.clearBets() }, '✕ Wetten leeren')),
      this.dealBtn,
      section('Ergebnis', this.resultBox.el, this.history.el),
      section('Regeln', h('div.panel-note', {}, 'Punto Banco mit 8 Decks. Karten 10/J/Q/K zählen 0, Ass 1. Nur die letzte Ziffer zählt. Bei Tie werden Player/Banker-Wetten zurückgezahlt.')),
    );
    this.hint('Setze auf Player, Banker oder Tie');
  }

  total() { return this.bets.player + this.bets.banker + this.bets.tie; }

  addBet(key) {
    if (this.busy) return;
    if (this.total() + this.chip.value > this.balance) return this.banner('Nicht genug Guthaben', '', 'lose', 1500);
    this.bets[key] += this.chip.value;
    sound.play('chip');
    this.renderBets();
  }

  removeBet(key) {
    if (this.busy || !this.bets[key]) return;
    this.bets[key] = Math.max(0, this.bets[key] - this.chip.value);
    sound.play('click');
    this.renderBets();
  }

  clearBets() {
    if (this.busy) return;
    this.bets = { player: 0, banker: 0, tie: 0 };
    this.renderBets();
  }

  renderBets() {
    for (const key of Object.keys(SPOTS)) {
      const el = this.cells[key];
      el.querySelector('.rl-chip')?.remove();
      el.classList.remove('winner', 'lost');
      if (this.bets[key]) el.append(h('span.rl-chip', {}, fmt(this.bets[key]).replace(',00', '')));
      if (this.chipMeshes[key]) { disposeObject(this.chipMeshes[key]); this.chipMeshes[key] = null; }
      if (this.bets[key]) {
        const stack = chipStack(this.bets[key]);
        stack.position.set(SPOTS[key].x, 0, 2.3);
        this.engine.scene.add(stack);
        this.chipMeshes[key] = stack;
      }
    }
    this.totalBox.set(`🪙 ${fmt(this.total())}`);
  }

  setBusy(b) { this.dealBtn.disabled = b; this.chip.disabled = b; }

  play() {
    return this.run(async () => {
      if (this.total() <= 0) { this.banner('Bitte zuerst setzen', '', 'info', 1500); return; }
      this.hideBanner();
      Object.values(this.cells).forEach((c) => c.classList.remove('winner', 'lost'));
      await this.tableApi.clear();
      this.playerLabel.userData.setText('PLAYER');
      this.bankerLabel.userData.setText('BANKER');
      const res = await api.post('/games/baccarat/play', { bets: this.bets });
      if (this.destroyed) return;
      this.setBalance(res.balance - res.payout);
      await this.animateDeal(res);
      if (this.destroyed) return;
      this.finish(res);
    });
  }

  async animateDeal(res) {
    const dealCard = async (side, i) => {
      const x0 = side === 'player' ? -3.2 : 2.0;
      const c = (side === 'player' ? res.player : res.banker)[i];
      const third = i === 2;
      await this.tableApi.deal(c, { pos: [x0 + i * 0.75 + (third ? 0.35 : 0), 0.02 + i * 0.015, HAND_Z + (third ? 0.35 : 0)], yaw: third ? Math.PI / 2 : (Math.random() - 0.5) * 0.08 });
      await this.engine.delay(220);
    };
    await dealCard('player', 0); await dealCard('banker', 0);
    await dealCard('player', 1); await dealCard('banker', 1);
    this.playerLabel.userData.setText(`PLAYER ${res.player.length > 2 ? '' : res.playerTotal}`);
    this.bankerLabel.userData.setText(`BANKER ${res.banker.length > 2 ? '' : res.bankerTotal}`);
    if (res.player.length > 2) { await dealCard('player', 2); this.playerLabel.userData.setText(`PLAYER ${res.playerTotal}`); }
    if (res.banker.length > 2) { await dealCard('banker', 2); this.bankerLabel.userData.setText(`BANKER ${res.bankerTotal}`); }
    this.playerLabel.userData.setText(`PLAYER ${res.playerTotal}`);
    this.bankerLabel.userData.setText(`BANKER ${res.bankerTotal}`);
  }

  finish(res) {
    const total = this.total();
    const net = res.payout - total;
    const w = SPOTS[res.winner].label;
    for (const key of Object.keys(SPOTS)) {
      if (!this.bets[key]) continue;
      const won = key === res.winner || (res.winner === 'tie' && key !== 'tie');
      this.cells[key].classList.add(won ? 'winner' : 'lost');
    }
    this.history.push(w[0], res.winner === 'player' ? 'win' : res.winner === 'banker' ? 'lose' : 'green');
    const score = `${res.playerTotal} : ${res.bankerTotal}`;
    if (net > 0) {
      sound.play('win');
      this.banner(`${w} GEWINNT`, `${score} · +🪙 ${fmt(net)}`, 'win', 3200);
      this.resultBox.set(`${w} ${score} · +🪙 ${fmt(net)}`, 'win');
      burst(this.engine, new THREE.Vector3(SPOTS[res.winner].x, 1.5, HAND_Z), { count: 60, colors: [0xffd76a, 0xffffff], speed: 5, size: 0.07 });
    } else if (net === 0) {
      this.banner(res.winner === 'tie' ? 'TIE' : `${w} GEWINNT`, `${score} · Einsatz zurück`, 'info', 2600);
      this.resultBox.set(`${w} ${score} · ±0`, '');
    } else {
      sound.play('lose');
      this.banner(`${w} GEWINNT`, `${score} · −🪙 ${fmt(-net)}`, 'lose', 2800);
      this.resultBox.set(`${w} ${score} · −🪙 ${fmt(-net)}`, 'lose');
    }
    this.setBalance(res.balance);
  }
}
