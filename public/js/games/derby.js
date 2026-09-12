import { GameBase } from './base.js';
import { THREE, Easing } from '../three/engine.js';
import { api } from '../api.js';
import { h, fmt, fmtMult } from '../ui.js';
import { sound } from '../sound.js';
import { betControl, section, bigButton, statBox, historyStrip } from '../widgets.js';
import { buildTable, burst } from '../three/assets.js';
import { DERBY_TRACK, trackPoint, buildHorse } from '../three/stations/derby.js';

export default class Derby extends GameBase {
  engineOptions() { return { fov: 48, position: [0, 3.0, 3.6], target: [0, 1.0, 0], background: 0x0c1a0f }; }

  buildScene() {
    const { engine } = this;
    this.racers = [];
    if (engine.embedded) {
      this.horsesGroup = new THREE.Group();
      engine.scene.add(this.horsesGroup);
      return;
    }
    engine.addLights({ key: [3, 8, 5], keyIntensity: 2.2, hemi: 0.55, fill: 0.7, shadowSize: 10 });
    engine.addSpot({ position: [0, 7, 4], target: [0, 1, 0], intensity: 500, angle: 0.7, color: 0xfff0c8 });
    buildTable(engine.scene, { width: 5.5, depth: 5, felt: '#123a1c' });
    engine.setFit(4, 4);
    this.horsesGroup = new THREE.Group();
    engine.scene.add(this.horsesGroup);
  }

  buildPanel() {
    this.bet = betControl({ balance: () => this.balance, value: 100_00 });
    this.horseButtons = new Map();
    this.horseGrid = h('div.derby-horses');
    this.raceBtn = bigButton('🏇 RENNEN STARTEN', () => this.race());
    this.status = statBox('Letztes Rennen', '–');
    this.history = historyStrip(10);
    this.panel.append(
      section('Pferd wählen', this.horseGrid),
      section('Einsatz', this.bet.el),
      this.raceBtn,
      section('Ergebnis', this.status.el, this.history.el),
      section('Hinweis', h('div.panel-note', {}, 'Dezimalquote inkl. Einsatz · fester RTP von ≈ 92 % über alle Pferde.')),
    );
  }

  async ready() {
    const cfg = await api.get('/games/derby/config');
    if (this.destroyed) return;
    this.config = cfg;
    this.selectedHorse = cfg.horses[0].id;
    this.horsesGroup.clear();
    this.racers = [];
    cfg.horses.forEach((horse, i) => {
      const mesh = buildHorse(horse.color);
      const { pos, tan } = trackPoint(i, 0);
      mesh.position.copy(pos);
      mesh.rotation.y = Math.atan2(-tan.z, tan.x);
      this.horsesGroup.add(mesh);
      this.racers.push({ horse, lane: i, mesh });
    });
    this.horseGrid.replaceChildren(...cfg.horses.map((horse) => {
      const b = h('button.derby-horse', {
        type: 'button',
        style: { borderColor: horse.color },
        onclick: () => this.select(horse.id),
      }, h('span.name', {}, horse.name), h('span.odds', {}, fmtMult(horse.odds)));
      this.horseButtons.set(horse.id, b);
      return b;
    }));
    this.select(this.selectedHorse);
    this.setBusy(false);
    this.hint('Pferd wählen und Rennen starten');
  }

  setBusy(b) {
    this.bet.disabled = b;
    this.raceBtn.disabled = b;
    this.horseButtons.forEach((x) => { x.disabled = b; });
  }

  select(id) {
    if (this.busy) return;
    this.selectedHorse = id;
    for (const [hid, b] of this.horseButtons) b.classList.toggle('selected', hid === id);
    sound.play('click');
  }

  race() {
    return this.run(async () => {
      this.hideBanner();
      await this.resetRace();
      const bet = this.bet.value;
      const res = await api.post('/games/derby/race', { bet, horse: this.selectedHorse });
      if (this.destroyed) return;
      this.setBalance(res.balance - res.payout);
      await this.animate(res.order);
      if (this.destroyed) return;
      this.finish(res, bet);
    });
  }

  async resetRace() {
    for (const r of this.racers) {
      const { pos, tan } = trackPoint(r.lane, 0);
      r.mesh.position.copy(pos);
      r.mesh.rotation.y = Math.atan2(-tan.z, tan.x);
    }
  }

  async animate(order) {
    sound.play('rocket');
    const startRank = new Map();
    order.forEach((id, rank) => startRank.set(id, rank));
    await Promise.all(this.racers.map(async (r, idx) => {
      const rank = startRank.get(r.horse.id) ?? idx;
      const dur = 3400 + rank * 560 + Math.random() * 160;
      await this.engine.tween(dur, (k) => {
        const { pos, tan } = trackPoint(r.lane, k);
        r.mesh.position.copy(pos);
        r.mesh.position.y += Math.abs(Math.sin(k * Math.PI * 9 + idx)) * 0.012;
        r.mesh.rotation.y = Math.atan2(-tan.z, tan.x);
      }, Easing.outQuad);
      const { pos, tan } = trackPoint(r.lane, 1);
      r.mesh.position.copy(pos);
      r.mesh.rotation.y = Math.atan2(-tan.z, tan.x);
      sound.play('tick');
    }));
    sound.play('stop');
  }

  finish(res, bet) {
    const name = (id) => this.config.horses.find((x) => x.id === id)?.name ?? id;
    const orderNames = res.order.map((id) => name(id));
    this.history.push(name(res.winner), res.won ? 'win' : 'lose');
    if (res.won) {
      const net = res.payout - bet;
      sound.play(res.odds >= 8 ? 'bigwin' : 'win');
      this.status.set(`${name(res.winner)} · +🪙 ${fmt(net)}`, 'win');
      this.banner('🏆 SIEG!', `${name(res.winner)} · ${fmtMult(res.odds)} · +🪙 ${fmt(net)}`, 'win', 3600);
      burst(this.engine, new THREE.Vector3(0, 1.4, 0), { count: res.odds >= 8 ? 120 : 60, colors: [0xffd76a, 0xffffff, 0x7cf0ae], speed: 5, size: 0.07 });
    } else {
      sound.play('lose');
      this.status.set(`${name(res.winner)} gewinnt · −🪙 ${fmt(bet)}`, 'lose');
      this.banner('VERLOREN', `Sieger: ${name(res.winner)} · −🪙 ${fmt(bet)}`, 'lose', 2600);
    }
    this.setBalance(res.balance);
    this.hint(`Zieleinlauf: ${orderNames.join(' · ')}`);
  }
}
