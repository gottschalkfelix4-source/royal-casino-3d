import { GameBase } from './base.js';
import { THREE } from '../three/engine.js';
import { CardTable } from './cardtable.js';
import { api } from '../api.js';
import { h, fmt, fmtMult, cardText } from '../ui.js';
import { sound } from '../sound.js';
import { betControl, section, bigButton, statBox, historyStrip } from '../widgets.js';
import { textSprite, disposeObject, burst } from '../three/assets.js';

const MAIN = [0, 1.45, 0.4];
const HIST_Y = 0.85;
const HIST_Z = -1.6;

export default class HiLo extends GameBase {
  engineOptions() { return { fov: 42, position: [0, 2.7, 6.6], target: [0, 1.0, 0], background: 0x090612 }; }

  buildScene() {
    const { engine } = this;
    engine.addLights({ key: [3, 8, 6], keyIntensity: 2.2, hemi: 0.5, fill: 0.7, shadowSize: 8 });
    engine.addSpot({ position: [0, 6, 5], target: [0, 1, 0], intensity: 450, angle: 0.8, color: 0xe8d8ff });
    this.tableApi = new CardTable(engine, { shoe: [7, 1.5, 0.4], felt: '#3b1d5c', size: [12, 7], shoeVisible: false });
    engine.setFit(11, 6);
    this.current = null;
    this.histCards = [];
    this.marks = [];
  }

  buildPanel() {
    this.bet = betControl({ balance: () => this.balance, value: 50_00 });
    this.startBtn = bigButton('🔺 STARTEN', () => this.start());
    // Zweizeilig: Beschriftung oben, Quote und Chance klein darunter (passt in die Panelbreite)
    this.higherBtn = h('button.btn.btn-green.btn-big.btn-2line', { onclick: () => this.guess('higher') }, h('span.lbl', {}, '▲ Höher oder gleich'), h('span.sub', {}, ''));
    this.lowerBtn = h('button.btn.btn-red.btn-big.btn-2line', { onclick: () => this.guess('lower') }, h('span.lbl', {}, '▼ Niedriger oder gleich'), h('span.sub', {}, ''));
    this.skipBtn = h('button.btn', { onclick: () => this.skip() }, '⏭ Karte überspringen');
    this.cashBtn = h('button.btn.btn-gold.btn-big', { onclick: () => this.cashout() }, '💰 Auszahlen');
    this.actions = h('div.hidden', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, this.higherBtn, this.lowerBtn, this.skipBtn, this.cashBtn);
    this.multBox = statBox('Multiplikator', '1,00×');
    this.payBox = statBox('Möglicher Gewinn', '–');
    this.history = historyStrip(14);
    this.panel.append(
      section('Einsatz', this.bet.el),
      this.startBtn,
      this.actions,
      section('Runde', h('div.grid-2', {}, this.multBox.el, this.payBox.el)),
      section('Verlauf', this.history.el),
      section('Regeln', h('div.panel-note', {}, '„Höher“ gewinnt bei gleicher oder höherer Karte, „Niedriger“ bei gleicher oder niedrigerer. Ass ist die niedrigste, König die höchste Karte. Unendliches Deck, 2 % Hausvorteil.')),
    );
  }

  async ready() {
    const { game } = await api.get('/games/hilo/current');
    if (this.destroyed) return;
    if (game) {
      this.bet.value = game.bet;
      this.current = await this.tableApi.deal(game.card, { pos: MAIN, upright: true, scale: 1.5, duration: 1 });
      for (const [i, hst] of game.history.entries()) this.addHistoryCard(hst.card, hst.won, i, true);
      this.enterGame(game);
    } else this.hint('Setze deinen Einsatz und klicke STARTEN');
  }

  setBusy(b) {
    this.bet.disabled = b || !!this.game;
    this.startBtn.disabled = b || !!this.game;
    const g = this.game;
    this.higherBtn.disabled = b || !g;
    this.lowerBtn.disabled = b || !g;
    this.skipBtn.disabled = b || !g || g.history.length > 0;
    this.cashBtn.disabled = b || !g || !g.canCashout;
  }

  enterGame(game) {
    this.game = game.status === 'active' ? game : null;
    this.actions.classList.toggle('hidden', !this.game);
    this.startBtn.classList.toggle('hidden', !!this.game);
    if (this.game) {
      const o = game.odds;
      this.higherBtn.querySelector('.sub').textContent = `${fmtMult(o.higher.mult)} · Chance ${Math.round(o.higher.p * 100)} %`;
      this.lowerBtn.querySelector('.sub').textContent = `${fmtMult(o.lower.mult)} · Chance ${Math.round(o.lower.p * 100)} %`;
      this.cashBtn.textContent = `💰 Auszahlen 🪙 ${fmt(Math.floor(game.bet * game.multiplier))}`;
      this.multBox.set(fmtMult(game.multiplier), game.multiplier > 1 ? 'gold' : '');
      this.payBox.set(`🪙 ${fmt(Math.floor(game.bet * game.multiplier))}`, game.multiplier > 1 ? 'win' : '');
      this.hint(`Aktuelle Karte: ${cardText(game.card)} – höher oder niedriger?`);
    }
    this.setBusy(false);
  }

  async addHistoryCard(card, won, index, instant = false) {
    const pos = [-5 + (index % 12) * 0.85, HIST_Y + Math.floor(index / 12) * 0.02, HIST_Z - Math.floor(index / 12) * 0.9];
    let holder;
    if (this.current && !instant) {
      holder = this.current;
      await this.tableApi.move(holder, { pos, scale: 0.8 });
    } else {
      holder = await this.tableApi.deal(card, { pos, upright: true, scale: 0.8, duration: 1 });
    }
    this.histCards.push(holder);
    const mark = textSprite(won ? '✓' : '✗', { size: 60, color: won ? '#7cf0ae' : '#ff8a7a', bg: 'rgba(0,0,0,0.6)', height: 0.3 });
    mark.position.set(pos[0], pos[1] + 0.8, pos[2] + 0.2);
    this.engine.scene.add(mark);
    this.marks.push(mark);
  }

  async resetTable() {
    await this.tableApi.clear({ to: [-8, 1.5, 1] });
    this.marks.forEach((m) => disposeObject(m));
    this.marks = [];
    this.histCards = [];
    this.current = null;
  }

  start() {
    return this.run(async () => {
      this.hideBanner();
      await this.resetTable();
      const { game } = await api.post('/games/hilo/start', { bet: this.bet.value });
      if (this.destroyed) return;
      this.setBalance(game.balance);
      this.current = await this.tableApi.deal(game.card, { pos: MAIN, upright: true, scale: 1.5 });
      if (this.destroyed) return;
      this.enterGame(game);
    });
  }

  skip() {
    return this.run(async () => {
      const { game } = await api.post('/games/hilo/skip');
      if (this.destroyed) return;
      await this.tableApi.discard(this.current, { to: [-7, 1.5, 1] });
      this.current = await this.tableApi.deal(game.card, { pos: MAIN, upright: true, scale: 1.5 });
      if (this.destroyed) return;
      this.enterGame(game);
    });
  }

  guess(choice) {
    return this.run(async () => {
      const { game } = await api.post('/games/hilo/guess', { choice });
      if (this.destroyed) return;
      const last = game.history[game.history.length - 1];
      const idx = game.history.length - 1;
      const movePromise = this.addHistoryCard(last.card, last.won, idx);
      this.current = null;
      const dealPromise = this.tableApi.deal(last.next, { pos: MAIN, upright: true, scale: 1.5, faceUp: false });
      const [, holder] = await Promise.all([movePromise, dealPromise]);
      this.current = holder;
      await this.tableApi.flip(holder);
      if (this.destroyed) return;
      if (last.won) {
        sound.play('gem');
        this.banner('RICHTIG!', `${cardText(last.card)} → ${cardText(last.next)} · ${fmtMult(game.multiplier)}`, 'win', 1600);
      }
      this.enterGame(game);
      if (game.status !== 'active') this.finish(game, last);
    });
  }

  cashout() {
    return this.run(async () => {
      const { game } = await api.post('/games/hilo/cashout');
      if (this.destroyed) return;
      this.enterGame(game);
      this.finish(game);
    });
  }

  finish(game, last = null) {
    if (game.payout > 0) {
      sound.play(game.multiplier >= 5 ? 'bigwin' : 'cashout');
      this.banner('AUSGEZAHLT', `🪙 ${fmt(game.payout)} (${fmtMult(game.multiplier)})`, 'win', 3200);
      this.history.push(fmtMult(game.multiplier), game.multiplier >= 3 ? 'gold' : 'win');
      burst(this.engine, new THREE.Vector3(0, 2.2, 0.5), { count: 70, colors: [0xffd76a, 0xffffff, 0xc59bff], speed: 5, size: 0.07 });
    } else {
      sound.play('lose');
      this.banner('FALSCH', last ? `${cardText(last.card)} → ${cardText(last.next)}` : '', 'lose', 2600);
      this.history.push('✗', 'lose');
    }
    this.multBox.set('1,00×');
    this.payBox.set('–');
    if (typeof game.balance === 'number') this.setBalance(game.balance);
    this.hint('Neue Runde? Klicke STARTEN');
  }
}
