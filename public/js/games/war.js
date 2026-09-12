import { GameBase } from './base.js';
import { THREE } from '../three/engine.js';
import { CardTable } from './cardtable.js';
import { api } from '../api.js';
import { h, fmt } from '../ui.js';
import { sound } from '../sound.js';
import { betControl, section, bigButton, statBox, historyStrip } from '../widgets.js';
import { textSprite, chipStack, disposeObject, burst } from '../three/assets.js';

const DEALER_Z = -1.6;
const PLAYER_Z = 1.35;
const DX = 0.85;

const RESULT = {
  win: ['GEWONNEN', 'win'], lose: ['VERLOREN', 'lose'], surrender: ['AUFGEGEBEN', 'info'],
  war_win: ['KRIEG GEWONNEN', 'win'], war_lose: ['KRIEG VERLOREN', 'lose'], war_tie: ['DOPPEL-GLEICHSTAND!', 'win'],
};

export default class War extends GameBase {
  engineOptions() { return { fov: 44, position: [0, 3.3, 5.6], target: [0, 0.2, -0.8], background: 0x120a06 }; }

  buildScene() {
    const { engine } = this;
    engine.addLights?.({ key: [4, 9, 5], keyIntensity: 2.4, hemi: 0.55, fill: 0.7 });
    this.tableApi = new CardTable(engine, { shoe: [4.2, 0.5, -2.8], felt: '#4a2410', size: [12, 8], shoeVisible: !engine.embedded });
    if (!engine.embedded) engine.setFit(9, 7);

    this.playerCards = [];
    this.dealerCards = [];
    this.burned = [];
    this.dealerLabel = textSprite('DEALER', { size: 46, color: '#f5d97a', bg: 'rgba(0,0,0,0.55)', height: 0.45 });
    this.dealerLabel.position.set(-2.9, 0.7, DEALER_Z);
    this.playerLabel = textSprite('SPIELER', { size: 46, color: '#ffffff', bg: 'rgba(0,0,0,0.55)', height: 0.45 });
    this.playerLabel.position.set(-2.9, 0.7, PLAYER_Z);
    engine.scene.add(this.dealerLabel, this.playerLabel);
    this.chips = null;
  }

  buildPanel() {
    this.bet = betControl({ balance: () => this.balance, value: 100_00 });
    this.dealBtn = bigButton('⚔️ AUSTEILEN', () => this.start());
    this.warBtn = h('button.btn.btn-gold', { onclick: () => this.war() }, '⚔️ KRIEG (Einsatz ×2)');
    this.surrenderBtn = h('button.btn.btn-red', { onclick: () => this.surrender() }, '🏳 AUFGEBEN (½ zurück)');
    this.actions = h('div.grid-2.hidden', {}, this.warBtn, this.surrenderBtn);
    this.status = statBox('Status', 'Bereit');
    this.history = historyStrip(12);
    this.panel.append(
      section('Ante', this.bet.el),
      this.dealBtn,
      this.actions,
      section('Runde', this.status.el),
      section('Verlauf', this.history.el),
      section('Regeln', h('div.panel-note', {}, 'Höhere Karte gewinnt (1:1). Bei Gleichstand: KRIEG – doppelter Einsatz, drei Karten verbrennen, neue Karten; Gleichstand zahlt 2:1 Bonus. Oder aufgeben und die halbe Ante zurücknehmen.')),
    );
  }

  async ready() {
    const { game } = await api.get('/games/war/current');
    if (this.destroyed) return;
    if (game) {
      this.bet.value = game.ante;
      this.status.set('Gleichstand – Krieg oder aufgeben?');
      await this.syncHands(game, true);
      this.enterGame(game);
    } else {
      this.hint('Ante setzen und AUSTEILEN');
    }
  }

  setBusy(b) {
    const inGame = !!this.game && this.game.status === 'tie';
    this.bet.disabled = b || inGame || (!!this.game && this.game.status === 'tie');
    this.dealBtn.disabled = b || !!this.game;
    this.warBtn.disabled = b || !inGame || this.balance < this.game.ante;
    this.surrenderBtn.disabled = b || !inGame;
  }

  enterGame(game) {
    this.game = game.status === 'tie' ? game : null;
    this.actions.classList.toggle('hidden', !this.game);
    this.dealBtn.classList.toggle('hidden', !!this.game);
    this.setBusy(false);
    this.hint(this.game ? 'KRIEG wagen oder aufgeben?' : '');
  }

  updateLabels(game) {
    const last = (arr) => (arr?.length ? arr[arr.length - 1] : null);
    const p = last(game.player); const d = last(game.dealer);
    const v = (c) => (c ? ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[c.r] ?? String(c.r)) : '');
    this.playerLabel.userData.setText(`SPIELER ${v(p)}`);
    this.dealerLabel.userData.setText(`DEALER ${d ? v(d) : ''}`);
  }

  async dealCard(list, card, z, i, faceUp, instant) {
    const holder = await this.tableApi.deal(card, { pos: [i * DX, 0.02 + i * 0.014, z], faceUp, yaw: (Math.random() - 0.5) * 0.08, duration: instant ? 1 : 430 });
    list.push(holder);
    return holder;
  }

  async syncHands(game, instant = false) {
    const gap = instant ? 0 : 240;
    let i = this.playerCards.length;
    if (i === 0) {
      await this.dealCard(this.playerCards, game.player[0], PLAYER_Z, 0, true, instant);
      if (!instant) await this.engine.delay(gap);
      await this.dealCard(this.dealerCards, game.dealer[0], DEALER_Z, 0, true, instant);
    }
    // Verbrannte Karten aus dem letzten Krieg nachlegen
    while (this.burned.length < game.burned) {
      const holder = await this.tableApi.deal({ hidden: true }, { pos: [-2.6 + this.burned.length * 0.28, 0.02, -0.1], faceUp: false, duration: instant ? 1 : 260 });
      this.burned.push(holder);
    }
    // Neue Karten des Kriegs
    while (this.playerCards.length < game.player.length) {
      const k = this.playerCards.length;
      await this.dealCard(this.playerCards, game.player[k], PLAYER_Z, k, true, instant);
      if (!instant) await this.engine.delay(gap);
      await this.dealCard(this.dealerCards, game.dealer[k], DEALER_Z, k, true, instant);
    }
    if (this.chips == null && game.ante > 0) this.showChips(game.bet);
    this.updateLabels(game);
  }

  showChips(bet) {
    if (this.chips) disposeObject(this.chips);
    this.chips = chipStack(bet);
    this.chips.position.set(2.3, 0, PLAYER_Z);
    this.engine.scene.add(this.chips);
    sound.play('chip');
  }

  async resetTable() {
    await this.tableApi.clear();
    this.playerCards = [];
    this.dealerCards = [];
    this.burned = [];
    if (this.chips) { disposeObject(this.chips); this.chips = null; }
    this.playerLabel.userData.setText('SPIELER');
    this.dealerLabel.userData.setText('DEALER');
  }

  start() {
    return this.run(async () => {
      this.hideBanner();
      await this.resetTable();
      const { game } = await api.post('/games/war/start', { bet: this.bet.value });
      if (this.destroyed) return;
      this.setBalance(this.balance - game.bet);
      this.status.set(game.status === 'tie' ? 'Gleichstand!' : 'Läuft…');
      await this.syncHands(game);
      if (this.destroyed) return;
      this.enterGame(game);
      if (game.status === 'finished') this.finish(game);
    });
  }

  war() {
    return this.run(async () => {
      const { game } = await api.post('/games/war/war');
      if (this.destroyed) return;
      this.setBalance(this.balance - game.ante);
      await this.syncHands(game);
      if (this.destroyed) return;
      this.enterGame(game);
      this.finish(game);
    });
  }

  surrender() {
    return this.run(async () => {
      const { game } = await api.post('/games/war/surrender');
      if (this.destroyed) return;
      await this.syncHands(game);
      if (this.destroyed) return;
      this.enterGame(game);
      this.finish(game);
    });
  }

  finish(game) {
    this.updateLabels(game);
    const [label, kind] = RESULT[game.result] ?? [game.result, 'info'];
    const net = game.payout - game.bet;
    if (kind === 'win') {
      sound.play(game.result === 'war_tie' ? 'bigwin' : 'win');
      burst(this.engine, new THREE.Vector3(0, 1.3, PLAYER_Z), { count: game.result === 'war_tie' ? 100 : 60, colors: [0xffd76a, 0xffffff, 0x7cf0ae], speed: 5, size: 0.07 });
    } else if (kind === 'lose') sound.play('lose');
    this.banner(label, net > 0 ? `+🪙 ${fmt(net)}` : `−🪙 ${fmt(-net)}`, kind, 3200);
    this.status.set(label, kind);
    this.history.push(label, kind === 'win' ? 'win' : kind === 'lose' ? 'lose' : '');
    if (typeof game.balance === 'number') this.setBalance(game.balance);
    this.hint('Neue Runde? AUSTEILEN');
  }
}
