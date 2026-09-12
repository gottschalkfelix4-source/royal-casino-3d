import { GameBase } from './base.js';
import { THREE } from '../three/engine.js';
import { CardTable } from './cardtable.js';
import { api } from '../api.js';
import { h, fmt } from '../ui.js';
import { sound } from '../sound.js';
import { betControl, section, bigButton, statBox, historyStrip } from '../widgets.js';
import { textSprite, chipStack, disposeObject, burst } from '../three/assets.js';

const DEALER_Z = -1.7;
const PLAYER_Z = 1.25;
const X0 = -0.72;
const DX = 0.72;

const RESULT = {
  win: ['GEWONNEN', 'win'], lose: ['VERLOREN', 'lose'], push: ['UNENTSCHIEDEN', 'info'],
  no_qualify: ['DEALER QUALIFIZIERT NICHT', 'win'], fold: ['GEPASST', 'info'],
};

export default class Poker3 extends GameBase {
  engineOptions() { return { fov: 42, position: [0, 3.4, 5.8], target: [0, 0.2, -1.0], background: 0x07090d }; }

  buildScene() {
    const { engine } = this;
    engine.addLights?.({ key: [4, 9, 5], keyIntensity: 2.4, hemi: 0.55, fill: 0.7 });
    this.tableApi = new CardTable(engine, { shoe: [4.4, 0.5, -3.0], felt: '#0c4a33', size: [12, 8], shoeVisible: !engine.embedded });
    if (!engine.embedded) engine.setFit(9, 7);

    this.playerCards = [];
    this.dealerCards = [];
    this.dealerLabel = textSprite('DEALER', { size: 46, color: '#f5d97a', bg: 'rgba(0,0,0,0.55)', height: 0.45 });
    this.dealerLabel.position.set(-3.0, 0.7, DEALER_Z);
    this.playerLabel = textSprite('SPIELER', { size: 46, color: '#ffffff', bg: 'rgba(0,0,0,0.55)', height: 0.45 });
    this.playerLabel.position.set(-3.0, 0.7, PLAYER_Z);
    engine.scene.add(this.dealerLabel, this.playerLabel);
    this.chips = null;
  }

  buildPanel() {
    this.ante = betControl({ balance: () => this.balance, value: 100_00 });
    this.pp = betControl({ balance: () => this.balance, value: 0, min: 0 });
    this.dealBtn = bigButton('♣️ AUSTEILEN', () => this.start());
    this.playBtn = h('button.btn.btn-green', { onclick: () => this.action('play') }, '▶ SPIELEN');
    this.foldBtn = h('button.btn.btn-red', { onclick: () => this.action('fold') }, '✕ PASSEN');
    this.actions = h('div.grid-2.hidden', {}, this.playBtn, this.foldBtn);
    this.status = statBox('Status', 'Bereit');
    this.history = historyStrip(12);
    this.panel.append(
      section('Ante', this.ante.el),
      section('Pair Plus (optional, max. 5× Ante)', this.pp.el),
      this.dealBtn,
      this.actions,
      section('Runde', this.status.el),
      section('Verlauf', this.history.el),
      section('Regeln', h('div.panel-note', {}, 'Ante + optional Pair Plus. SPIELEN setzt die Ante erneut. Dealer qualifiziert sich ab Dame – sonst zahlt die Ante 1:1. Ante-Bonus bis 5:1, Pair Plus bis 40:1.')),
    );
  }

  async ready() {
    const { game } = await api.get('/games/poker3/current');
    if (this.destroyed) return;
    if (game) {
      this.ante.value = game.ante;
      this.pp.value = game.pairplus;
      this.status.set('Läuft…');
      await this.syncHands(game, true);
      this.enterGame(game);
    } else {
      this.hint('Ante setzen und AUSTEILEN');
    }
  }

  setBusy(b) {
    const inGame = !!this.game && this.game.status === 'decide';
    this.ante.disabled = b || inGame;
    this.pp.disabled = b || inGame;
    this.dealBtn.disabled = b || inGame;
    this.playBtn.disabled = b || !inGame || this.balance < this.ante.value;
    this.foldBtn.disabled = b || !inGame;
  }

  enterGame(game) {
    this.game = game.status === 'decide' ? game : null;
    this.actions.classList.toggle('hidden', !this.game);
    this.dealBtn.classList.toggle('hidden', !!this.game);
    this.setBusy(false);
    this.hint(this.game ? 'SPIELEN oder PASSEN?' : '');
  }

  async dealCard(list, card, z, i, faceUp, instant) {
    const holder = await this.tableApi.deal(card, { pos: [X0 + i * DX, 0.02 + i * 0.014, z + i * 0.035], faceUp, yaw: (Math.random() - 0.5) * 0.08, duration: instant ? 1 : 430 });
    list.push(holder);
    return holder;
  }

  async syncHands(game, instant = false) {
    const gap = instant ? 0 : 220;
    if (this.playerCards.length === 0 && this.dealerCards.length === 0) {
      for (let i = 0; i < game.player.length; i++) {
        await this.dealCard(this.playerCards, game.player[i], PLAYER_Z, i, true, instant);
        if (!instant) await this.engine.delay(gap);
        await this.dealCard(this.dealerCards, game.dealer[i], DEALER_Z, i, false, instant);
        if (!instant) await this.engine.delay(gap);
      }
    }
    if (this.chips == null && game.ante > 0) this.showChips(game.ante, game.pairplus);
    if (game.status === 'finished') {
      for (let i = 0; i < this.dealerCards.length; i++) {
        const holder = this.dealerCards[i];
        if (holder && !holder.userData.faceUp) {
          if (!instant) await this.engine.delay(160);
          await this.tableApi.flip(holder, game.dealer[i], instant ? 1 : 400);
        }
      }
    }
    if (game.status === 'finished') this.updateLabels(game);
  }

  showChips(ante, pairplus) {
    if (this.chips) disposeObject(this.chips);
    this.chips = new THREE.Group();
    const a = chipStack(ante);
    a.position.set(2.4, 0, PLAYER_Z);
    this.chips.add(a);
    if (pairplus > 0) {
      const p = chipStack(pairplus);
      p.position.set(2.4, 0, PLAYER_Z - 0.7);
      this.chips.add(p);
    }
    this.engine.scene.add(this.chips);
    sound.play('chip');
  }

  updateLabels(game) {
    if (game.playerRank) this.playerLabel.userData.setText(`SPIELER · ${game.playerRank.name}`);
    if (game.dealerRank) this.dealerLabel.userData.setText(`DEALER · ${game.dealerRank.name}`);
  }

  async resetTable() {
    await this.tableApi.clear();
    this.playerCards = [];
    this.dealerCards = [];
    if (this.chips) { disposeObject(this.chips); this.chips = null; }
    this.playerLabel.userData.setText('SPIELER');
    this.dealerLabel.userData.setText('DEALER');
  }

  start() {
    return this.run(async () => {
      this.hideBanner();
      await this.resetTable();
      const { game } = await api.post('/games/poker3/start', { bet: this.ante.value, pairplus: this.pp.value });
      if (this.destroyed) return;
      this.setBalance(this.balance - game.bet);
      this.status.set('Läuft…');
      await this.syncHands(game);
      if (this.destroyed) return;
      this.enterGame(game);
    });
  }

  action(kind) {
    return this.run(async () => {
      const { game } = await api.post(`/games/poker3/${kind}`);
      if (this.destroyed) return;
      if (kind === 'play') this.setBalance(this.balance - game.ante);
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
    const parts = [];
    if (game.anteBonus > 0) parts.push(`Ante-Bonus 🪙 ${fmt(game.anteBonus)}`);
    if (game.pairPlusWin > 0) parts.push(`Pair Plus 🪙 ${fmt(game.pairPlusWin)}`);
    const sub = net > 0 ? `+🪙 ${fmt(net)}` : net === 0 ? (game.bet > 0 && game.result === 'fold' ? `−🪙 ${fmt(-net)}` : 'Einsatz zurück') : `−🪙 ${fmt(-net)}`;
    if (kind === 'win') {
      sound.play(game.payout >= game.bet * 5 ? 'bigwin' : 'win');
      burst(this.engine, new THREE.Vector3(0, 1.3, PLAYER_Z), { count: 60, colors: [0xffd76a, 0xffffff, 0x7cf0ae], speed: 5, size: 0.07 });
    } else if (kind === 'lose') sound.play('lose');
    this.banner(label, `${sub}${parts.length ? ` · ${parts.join(' · ')}` : ''}`, kind, 3400);
    this.status.set(`${game.playerRank?.name ?? ''} : ${game.dealerRank?.name ?? ''}`, kind);
    this.history.push(label, kind === 'win' ? 'win' : kind === 'lose' ? 'lose' : '');
    if (typeof game.balance === 'number') this.setBalance(game.balance);
    this.hint('Neue Runde? AUSTEILEN');
  }
}
