import { GameBase } from './base.js';
import { THREE } from '../three/engine.js';
import { CardTable } from './cardtable.js';
import { api } from '../api.js';
import { h, fmt } from '../ui.js';
import { sound } from '../sound.js';
import { betControl, section, bigButton, statBox, historyStrip } from '../widgets.js';
import { textSprite, chipStack, disposeObject, makeCanvas, canvasTexture, burst } from '../three/assets.js';

const RESULT = {
  blackjack: ['BLACKJACK!', 'win'], win: ['GEWONNEN', 'win'], dealer_bust: ['DEALER ÜBERKAUFT', 'win'],
  push: ['UNENTSCHIEDEN', 'info'], lose: ['VERLOREN', 'lose'], bust: ['ÜBERKAUFT', 'lose'], dealer_blackjack: ['DEALER BLACKJACK', 'lose'],
};
const DEALER_Z = -2.4;
const PLAYER_Z = 1.7;
const X0 = -1.3;
const DX = 0.62;

export default class Blackjack extends GameBase {
  engineOptions() { return { fov: 38, position: [0, 8.2, 7.4], target: [0, 0, -0.5], background: 0x07090d }; }

  buildScene() {
    const { engine } = this;
    engine.addLights({ key: [4, 10, 5], keyIntensity: 2.4, hemi: 0.5, fill: 0.7, shadowSize: 10 });
    engine.addSpot({ position: [0, 9, 2], target: [0, 0, 0], intensity: 500, angle: 0.7, color: 0xfff1d6 });
    this.tableApi = new CardTable(engine, { shoe: [5.4, 0.5, -3.2], felt: '#0f5a3a', size: [14, 9] });
    engine.setFit(10, 8);

    // Aufdruck auf dem Filz
    const { canvas, ctx } = makeCanvas(2048, 256);
    ctx.font = '700 92px Cinzel, Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(245,217,122,0.85)';
    ctx.fillText('BLACKJACK ZAHLT 3 ZU 2', 1024, 90);
    ctx.font = '600 56px Inter, Arial'; ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('DEALER MUSS BEI 17 STEHEN · VERSICHERUNG ZAHLT 2 ZU 1', 1024, 190);
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.125), new THREE.MeshBasicMaterial({ map: canvasTexture(canvas), transparent: true }));
    decal.rotation.x = -Math.PI / 2; decal.position.set(0, 0.006, -0.4);
    engine.scene.add(decal);
    const arc = new THREE.Mesh(new THREE.RingGeometry(4.9, 5.0, 96, 1, Math.PI * 1.15, Math.PI * 0.7), new THREE.MeshBasicMaterial({ color: 0xf5d97a, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    arc.rotation.x = -Math.PI / 2; arc.position.set(0, 0.005, -3.4);
    engine.scene.add(arc);

    this.dealerLabel = textSprite('DEALER', { size: 48, color: '#f5d97a', bg: 'rgba(0,0,0,0.55)', height: 0.5 });
    this.dealerLabel.position.set(-2.9, 0.6, DEALER_Z);
    this.playerLabel = textSprite('SPIELER', { size: 48, color: '#ffffff', bg: 'rgba(0,0,0,0.55)', height: 0.5 });
    this.playerLabel.position.set(-2.9, 0.6, PLAYER_Z);
    engine.scene.add(this.dealerLabel, this.playerLabel);
    this.playerCards = [];
    this.dealerCards = [];
    this.chips = null;
  }

  buildPanel() {
    this.bet = betControl({ balance: () => this.balance, value: 100_00 });
    this.dealBtn = bigButton('🃏 AUSTEILEN', () => this.start());
    this.hitBtn = h('button.btn.btn-green', { onclick: () => this.action('hit') }, '➕ Karte');
    this.standBtn = h('button.btn.btn-red', { onclick: () => this.action('stand') }, '✋ Halten');
    this.doubleBtn = h('button.btn.btn-gold', { onclick: () => this.action('double') }, '2× Verdoppeln');
    this.actions = h('div.grid-3.hidden', {}, this.hitBtn, this.standBtn, this.doubleBtn);
    this.status = statBox('Status', 'Bereit');
    this.history = historyStrip(12);
    this.panel.append(
      section('Einsatz', this.bet.el),
      this.dealBtn,
      this.actions,
      section('Runde', this.status.el),
      section('Verlauf', this.history.el),
      section('Regeln', h('div.panel-note', {}, '6 Decks · Blackjack zahlt 3:2 · Dealer steht bei 17 (auch soft) · Verdoppeln mit den ersten zwei Karten · Unentschieden = Einsatz zurück')),
    );
  }

  async ready() {
    const { game } = await api.get('/games/blackjack/current');
    if (this.destroyed) return;
    if (game) {
      this.bet.value = game.bet;
      await this.syncHands(game, true);
      this.enterGame(game);
    } else {
      this.hint('Setze deinen Einsatz und klicke AUSTEILEN');
    }
  }

  setBusy(b) {
    this.bet.disabled = b || !!this.game;
    this.dealBtn.disabled = b || !!this.game;
    const inGame = !!this.game && this.game.status === 'player';
    this.hitBtn.disabled = b || !inGame;
    this.standBtn.disabled = b || !inGame;
    this.doubleBtn.disabled = b || !inGame || !this.game.canDouble || this.balance < this.game.bet;
  }

  enterGame(game) {
    this.game = game.status === 'player' ? game : null;
    this.actions.classList.toggle('hidden', !this.game);
    this.dealBtn.classList.toggle('hidden', !!this.game);
    this.setBusy(false);
    this.hint(this.game ? 'Karte, Halten oder Verdoppeln?' : '');
  }

  updateLabels(game) {
    this.playerLabel.userData.setText(`SPIELER ${game.playerValue}`);
    this.dealerLabel.userData.setText(`DEALER ${game.dealerValue}`);
  }

  /** Bringt die 3D-Karten auf den Stand des Server-Zustands. */
  async syncHands(game, instant = false) {
    const dur = instant ? 1 : 480;
    const gap = instant ? 0 : 260;
    const deal = async (list, cards, z, i) => {
      const c = cards[i];
      const holder = await this.tableApi.deal(c, { pos: [X0 + i * DX, 0.02 + i * 0.015, z + i * 0.04], faceUp: !c.hidden, yaw: (Math.random() - 0.5) * 0.08, duration: dur });
      list.push(holder);
    };
    // Erstausteilung im Wechsel
    if (this.playerCards.length === 0 && this.dealerCards.length === 0) {
      for (let i = 0; i < 2; i++) {
        await deal(this.playerCards, game.player, PLAYER_Z, i);
        if (!instant) await this.engine.delay(gap);
        await deal(this.dealerCards, game.dealer, DEALER_Z, i);
        if (!instant) await this.engine.delay(gap);
      }
    }
    while (this.playerCards.length < game.player.length) {
      await deal(this.playerCards, game.player, PLAYER_Z, this.playerCards.length);
      this.updateLabels(game);
    }
    if (this.chips == null) this.showChips(game.bet);
    if (game.status !== 'player') {
      // Hole Card aufdecken
      const hole = this.dealerCards[1];
      if (hole && !hole.userData.faceUp) {
        if (!instant) await this.engine.delay(300);
        await this.tableApi.flip(hole, game.dealer[1], instant ? 1 : 420);
      }
      while (this.dealerCards.length < game.dealer.length) {
        if (!instant) await this.engine.delay(gap);
        await deal(this.dealerCards, game.dealer, DEALER_Z, this.dealerCards.length);
      }
    }
    this.updateLabels(game);
  }

  showChips(bet) {
    if (this.chips) disposeObject(this.chips);
    this.chips = chipStack(bet);
    this.chips.position.set(2.6, 0, PLAYER_Z);
    this.engine.scene.add(this.chips);
    sound.play('chip');
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
      const { game } = await api.post('/games/blackjack/start', { bet: this.bet.value });
      if (this.destroyed) return;
      this.setBalance(this.balance - game.bet);
      this.status.set('Läuft…');
      await this.syncHands(game);
      if (this.destroyed) return;
      this.enterGame(game);
      if (game.status === 'finished') this.finish(game);
    });
  }

  action(kind) {
    return this.run(async () => {
      const { game } = await api.post(`/games/blackjack/${kind}`);
      if (this.destroyed) return;
      if (kind === 'double') { this.setBalance(this.balance - game.bet / 2); this.showChips(game.bet); }
      await this.syncHands(game);
      if (this.destroyed) return;
      this.enterGame(game);
      if (game.status === 'finished') this.finish(game);
    });
  }

  finish(game) {
    this.updateLabels(game);
    const [label, kind] = RESULT[game.result] ?? [game.result, 'info'];
    const net = game.payout - game.bet;
    if (kind === 'win') {
      sound.play(game.result === 'blackjack' ? 'bigwin' : 'win');
      burst(this.engine, new THREE.Vector3(0, 1.5, PLAYER_Z), { count: 60, colors: [0xffd76a, 0xffffff, 0x7cf0ae], speed: 5, size: 0.07 });
    } else if (kind === 'lose') sound.play('lose');
    this.banner(label, net > 0 ? `+🪙 ${fmt(net)}` : net === 0 ? 'Einsatz zurück' : `−🪙 ${fmt(-net)}`, kind, 3200);
    this.status.set(`${label} (${game.playerValue} : ${game.dealerValue})`, kind === 'info' ? '' : kind);
    this.history.push(label, kind === 'win' ? 'win' : kind === 'lose' ? 'lose' : '');
    if (typeof game.balance === 'number') this.setBalance(game.balance);
    this.hint('Neue Runde? Klicke AUSTEILEN');
  }
}
