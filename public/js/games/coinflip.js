import { GameBase } from './base.js';
import { THREE, Easing } from '../three/engine.js';
import { api } from '../api.js';
import { h, fmt } from '../ui.js';
import { sound } from '../sound.js';
import { betControl, section, bigButton, statBox, historyStrip } from '../widgets.js';
import { makeCanvas, canvasTexture, goldMaterial, burst } from '../three/assets.js';

function faceTexture(kind) {
  const { canvas, ctx } = makeCanvas(512, 512);
  const g = ctx.createRadialGradient(200, 180, 40, 256, 256, 260);
  g.addColorStop(0, '#ffe9a3'); g.addColorStop(0.7, '#d4af37'); g.addColorStop(1, '#9a7a1e');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(256, 256, 256, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(120,90,20,0.8)'; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(256, 256, 222, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([6, 10]); ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(256, 256, 240, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#5c4410'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (kind === 'heads') {
    ctx.font = '230px "Segoe UI Symbol", "Segoe UI Emoji", serif';
    ctx.fillText('♛', 256, 236);
    ctx.font = '900 54px Cinzel, Georgia, serif';
    ctx.fillText('KOPF', 256, 420);
  } else {
    ctx.font = '900 250px Cinzel, Georgia, serif';
    ctx.fillText('1', 256, 236);
    ctx.font = '900 54px Cinzel, Georgia, serif';
    ctx.fillText('ZAHL', 256, 420);
  }
  return canvasTexture(canvas);
}

export default class CoinFlip extends GameBase {
  engineOptions() { return { fov: 42, position: [0, 2.4, 6.2], target: [0, 0.9, 0], background: 0x0b0a12 }; }

  buildScene() {
    const { engine } = this;
    engine.addLights({ key: [3, 8, 5], keyIntensity: 2.4, hemi: 0.5, fill: 0.8, shadowSize: 8 });
    engine.addSpot({ position: [0, 7, 4], target: [0, 1, 0], intensity: 600, angle: 0.6, color: 0xfff0c8 });
    if (!engine.embedded) {
      const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.MeshStandardMaterial({ color: 0x1a1230, roughness: 0.6, metalness: 0.3 }));
      floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
      engine.scene.add(floor);
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.0, 0.5, 64), new THREE.MeshPhysicalMaterial({ color: 0x2a1f4a, roughness: 0.3, clearcoat: 1 }));
      pedestal.position.y = 0.25; pedestal.castShadow = true; pedestal.receiveShadow = true;
      engine.scene.add(pedestal);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.06, 12, 96), goldMaterial());
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.5;
      engine.scene.add(ring);
    }
    engine.setFit(5, 6);

    const side = goldMaterial({ roughness: 0.35 });
    this.coin = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.14, 64), [
      side,
      new THREE.MeshStandardMaterial({ map: faceTexture('heads'), metalness: 0.8, roughness: 0.3 }),
      new THREE.MeshStandardMaterial({ map: faceTexture('tails'), metalness: 0.8, roughness: 0.3 }),
    ]);
    this.coin.position.y = 0.57;
    this.coin.castShadow = true;
    engine.scene.add(this.coin);
    this.face = 'heads';
    engine.onUpdate((dt) => { if (!this.flipping) this.coin.rotation.y += dt * 0.4; });
  }

  buildPanel() {
    this.bet = betControl({ balance: () => this.balance, value: 50_00 });
    this.choice = 'heads';
    this.headsBtn = h('button.btn.btn-big.selected', { onclick: () => this.choose('heads') }, '♛ KOPF');
    this.tailsBtn = h('button.btn.btn-big', { onclick: () => this.choose('tails') }, '1 ZAHL');
    this.flipBtn = bigButton('🪙 WERFEN', () => this.flip());
    this.lastBox = statBox('Letzter Wurf', '–');
    this.streakBox = statBox('Serie', '0');
    this.history = historyStrip(16);
    this.streak = 0;
    this.panel.append(
      section('Deine Wahl', h('div.grid-2', {}, this.headsBtn, this.tailsBtn)),
      section('Einsatz', this.bet.el),
      this.flipBtn,
      section('Ergebnis', h('div.grid-2', {}, this.lastBox.el, this.streakBox.el), this.history.el),
      section('Auszahlung', h('div.panel-note', {}, 'Gewinn zahlt 1,96× den Einsatz (2 % Hausvorteil).')),
    );
    this.hint('Wähle Kopf oder Zahl und wirf die Münze');
  }

  choose(c) {
    this.choice = c;
    this.headsBtn.classList.toggle('selected', c === 'heads');
    this.tailsBtn.classList.toggle('selected', c === 'tails');
    sound.play('click');
  }

  setBusy(b) { this.bet.disabled = b; this.flipBtn.disabled = b; this.headsBtn.disabled = b; this.tailsBtn.disabled = b; }

  flip() {
    return this.run(async () => {
      this.hideBanner();
      const bet = this.bet.value;
      const res = await api.post('/games/coinflip/flip', { bet, choice: this.choice });
      if (this.destroyed) return;
      this.setBalance(res.balance - res.payout);
      await this.animate(res.outcome);
      if (this.destroyed) return;
      this.finish(res, bet);
    });
  }

  async animate(outcome) {
    const { engine, coin } = this;
    this.flipping = true;
    sound.play('coin');
    const base = this.face === 'heads' ? 0 : Math.PI;
    const target = base + Math.PI * 2 * 7 + (outcome === 'heads' ? 0 : Math.PI);
    const ry0 = coin.rotation.y;
    const y0 = 0.57;
    await engine.tween(1900, (k) => {
      coin.rotation.x = base + (target - base) * k;
      coin.position.y = y0 + Math.sin(Math.PI * k) * 3.2;
      coin.rotation.y = ry0 + k * 2;
    }, Easing.inOutQuad);
    coin.rotation.x = target % (Math.PI * 2);
    // Aufprall
    sound.play('bounce');
    await engine.tween(500, (k) => {
      coin.position.y = y0 + Math.abs(Math.sin(k * Math.PI * 2.5)) * 0.25 * (1 - k);
      coin.rotation.z = Math.sin(k * Math.PI * 4) * 0.08 * (1 - k);
    }, Easing.linear);
    coin.position.y = y0; coin.rotation.z = 0;
    this.face = outcome;
    this.flipping = false;
  }

  finish(res, bet) {
    const label = res.outcome === 'heads' ? 'KOPF' : 'ZAHL';
    this.history.push(res.outcome === 'heads' ? '♛' : '1', res.won ? 'win' : 'lose');
    if (res.won) {
      this.streak++;
      sound.play(this.streak >= 3 ? 'bigwin' : 'win');
      this.banner(label, `Gewonnen! +🪙 ${fmt(res.payout - bet)}`, 'win', 2600);
      this.lastBox.set(`${label} · +🪙 ${fmt(res.payout - bet)}`, 'win');
      burst(this.engine, new THREE.Vector3(0, 1.5, 0), { count: 60, colors: [0xffd76a, 0xffffff], speed: 5, size: 0.07 });
    } else {
      this.streak = 0;
      sound.play('lose');
      this.banner(label, `Verloren · −🪙 ${fmt(bet)}`, 'lose', 2200);
      this.lastBox.set(`${label} · −🪙 ${fmt(bet)}`, 'lose');
    }
    this.streakBox.set(String(this.streak), this.streak >= 3 ? 'gold' : '');
    this.setBalance(res.balance);
  }
}
