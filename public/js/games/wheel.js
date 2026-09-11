import { GameBase } from './base.js';
import { THREE, Easing } from '../three/engine.js';
import { api } from '../api.js';
import { h, fmt, fmtMult } from '../ui.js';
import { sound } from '../sound.js';
import { betControl, section, bigButton, statBox, historyStrip } from '../widgets.js';
import { makeCanvas, canvasTexture, goldMaterial, burst } from '../three/assets.js';

const COLORS = { 0: '#2a2f3a', 1.5: '#2f6fd6', 2: '#22a35a', 3: '#7d3ab0', 5: '#d4af37' };
const RADIUS = 4.4;

function wheelTexture(segments) {
  const S = 1024;
  const { canvas, ctx } = makeCanvas(S, S);
  const c = S / 2;
  const n = segments.length;
  const step = (Math.PI * 2) / n;
  segments.forEach((m, i) => {
    const a0 = i * step; const a1 = (i + 1) * step;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, c, -a1, -a0, false);
    ctx.closePath();
    ctx.fillStyle = COLORS[m] ?? '#444';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 3; ctx.stroke();
    const am = (a0 + a1) / 2;
    ctx.save();
    ctx.translate(c + Math.cos(am) * c * 0.72, c - Math.sin(am) * c * 0.72);
    ctx.rotate(-am);
    ctx.fillStyle = m === 0 ? '#8a94a6' : '#ffffff';
    ctx.font = `900 ${m === 0 ? 40 : 56}px Inter, Arial`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 8;
    ctx.fillText(m === 0 ? '0' : `${m.toLocaleString('de-DE')}×`, 0, 0);
    ctx.restore();
  });
  ctx.beginPath(); ctx.arc(c, c, c * 0.14, 0, Math.PI * 2); ctx.fillStyle = '#1a1305'; ctx.fill();
  return canvasTexture(canvas);
}

export default class Wheel extends GameBase {
  engineOptions() { return { fov: 40, position: [0, 0.2, 13.5], target: [0, 0.2, 0], background: 0x07090d, shadows: false }; }

  buildScene() {
    const { engine } = this;
    engine.addLights({ key: [4, 6, 10], keyIntensity: 1.8, hemi: 0.5, fill: 0.6 });
    engine.addSpot({ position: [0, 8, 9], target: [0, 0, 0], intensity: 700, angle: 0.6, color: 0xfff0d0 });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshStandardMaterial({ color: 0x0f1220, roughness: 0.9 }));
    back.position.z = -1.5;
    engine.scene.add(back);
    engine.setFit(10.5, 11);
    this.wheel = new THREE.Group();
    engine.scene.add(this.wheel);
    // Zeiger
    this.pointer = new THREE.Group();
    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 3), new THREE.MeshStandardMaterial({ color: 0xe74c3c, metalness: 0.4, roughness: 0.3 }));
    tri.rotation.x = Math.PI; tri.rotation.y = Math.PI / 6;
    tri.position.y = -0.45;
    this.pointer.add(tri);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.4, 16), goldMaterial());
    pin.rotation.x = Math.PI / 2;
    this.pointer.add(pin);
    this.pointer.position.set(0, RADIUS + 0.55, 0.45);
    engine.scene.add(this.pointer);
    this.pointerTilt = 0;
    this.lastPeg = -1;
    engine.onUpdate((dt) => {
      if (!this.spinning) this.wheel.rotation.z += dt * 0.08;
      // Zeiger flackert an den Stiften
      if (this.segments) {
        const n = this.segments.length;
        const local = ((Math.PI / 2 - this.wheel.rotation.z) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        const peg = Math.floor(local / ((Math.PI * 2) / n));
        if (peg !== this.lastPeg) { this.lastPeg = peg; this.pointerTilt = -0.5; if (this.spinning) sound.play('tick'); }
      }
      this.pointerTilt += (0 - this.pointerTilt) * Math.min(1, dt * 14);
      this.pointer.rotation.z = this.pointerTilt;
    });
  }

  buildWheel(segments) {
    this.segments = segments;
    const face = new THREE.Mesh(new THREE.CircleGeometry(RADIUS, 128), new THREE.MeshStandardMaterial({ map: wheelTexture(segments), roughness: 0.5 }));
    this.wheel.add(face);
    const backDisc = new THREE.Mesh(new THREE.CylinderGeometry(RADIUS + 0.15, RADIUS + 0.15, 0.3, 96), new THREE.MeshStandardMaterial({ color: 0x1a1305, roughness: 0.5 }));
    backDisc.rotation.x = Math.PI / 2; backDisc.position.z = -0.16;
    this.wheel.add(backDisc);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(RADIUS + 0.05, 0.16, 16, 128), goldMaterial());
    this.wheel.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.5, 32), goldMaterial());
    hub.rotation.x = Math.PI / 2; hub.position.z = 0.2;
    this.wheel.add(hub);
    const n = segments.length;
    const pegGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.35, 12);
    const pegMat = goldMaterial();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const peg = new THREE.Mesh(pegGeo, pegMat);
      peg.rotation.x = Math.PI / 2;
      peg.position.set(Math.cos(a) * (RADIUS - 0.12), Math.sin(a) * (RADIUS - 0.12), 0.15);
      this.wheel.add(peg);
    }
    // Leuchtende Lampen am Rand
    this.lamps = [];
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffd76a }));
      lamp.position.set(Math.cos(a) * (RADIUS + 0.45), Math.sin(a) * (RADIUS + 0.45), 0.1);
      this.engine.scene.add(lamp);
      this.lamps.push(lamp);
    }
    this.engine.onUpdate((dt, t) => this.lamps.forEach((l, i) => l.material.color.setHex(Math.sin(t * (this.spinning ? 12 : 3) + i * 0.5) > 0 ? 0xffd76a : 0x4a3a10)));
  }

  buildPanel() {
    this.bet = betControl({ balance: () => this.balance, value: 50_00 });
    this.spinBtn = bigButton('🎯 DREHEN', () => this.spin());
    this.lastBox = statBox('Letztes Ergebnis', '–');
    this.history = historyStrip(16);
    this.legend = h('div.mult-legend');
    this.panel.append(
      section('Einsatz', this.bet.el),
      this.spinBtn,
      section('Ergebnis', this.lastBox.el, this.history.el),
      section('Segmente', this.legend),
    );
  }

  async ready() {
    const { segments } = await api.get('/games/wheel/config');
    if (this.destroyed) return;
    this.buildWheel(segments);
    const counts = {};
    for (const s of segments) counts[s] = (counts[s] ?? 0) + 1;
    this.legend.replaceChildren(...Object.entries(counts).sort((a, b) => Number(a[0]) - Number(b[0])).map(([m, c]) =>
      h('span.pill', {}, h('span.dot', { style: { background: COLORS[m] } }), `${Number(m).toLocaleString('de-DE')}× · ${c}/${segments.length}`)
    ));
    this.hint('Setze und drehe das Rad');
  }

  setBusy(b) { this.bet.disabled = b; this.spinBtn.disabled = b; }

  spin() {
    return this.run(async () => {
      if (!this.segments) return;
      this.hideBanner();
      const bet = this.bet.value;
      const res = await api.post('/games/wheel/spin', { bet });
      if (this.destroyed) return;
      this.setBalance(res.balance - res.payout);
      await this.animate(res.index);
      if (this.destroyed) return;
      this.finish(res, bet);
    });
  }

  async animate(index) {
    const { engine, wheel } = this;
    this.spinning = true;
    sound.play('spin');
    const n = this.segments.length;
    const step = (Math.PI * 2) / n;
    const theta = (index + 0.5) * step + (Math.random() - 0.5) * step * 0.7;
    const r0 = wheel.rotation.z;
    const need = ((Math.PI / 2 - theta - r0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const delta = need + Math.PI * 2 * 6;
    await engine.tween(6000, (k) => { wheel.rotation.z = r0 + delta * k; }, Easing.outQuart);
    wheel.rotation.z = (r0 + delta) % (Math.PI * 2);
    sound.play('stop');
    this.spinning = false;
  }

  finish(res, bet) {
    const m = res.multiplier;
    this.history.push(m === 0 ? '0' : fmtMult(m), m === 0 ? 'lose' : m >= 3 ? 'gold' : 'win');
    if (m > 0) {
      sound.play(m >= 3 ? 'bigwin' : 'win');
      this.banner(fmtMult(m), `+🪙 ${fmt(res.payout - bet)}`, 'win', 3000);
      this.lastBox.set(`${fmtMult(m)} · 🪙 ${fmt(res.payout)}`, 'win');
      burst(this.engine, new THREE.Vector3(0, RADIUS + 0.5, 0.5), { count: m >= 3 ? 120 : 60, colors: [0xffd76a, 0xffffff, 0x7cf0ae], speed: 5, size: 0.08, gravity: 5 });
    } else {
      sound.play('lose');
      this.banner('NIETE', `−🪙 ${fmt(bet)}`, 'lose', 2200);
      this.lastBox.set(`0× · −🪙 ${fmt(bet)}`, 'lose');
    }
    this.setBalance(res.balance);
  }
}
