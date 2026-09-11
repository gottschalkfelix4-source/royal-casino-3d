import { GameBase } from './base.js';
import { THREE, Easing } from '../three/engine.js';
import { api } from '../api.js';
import { h, fmt, fmtMult } from '../ui.js';
import { sound } from '../sound.js';
import { betControl, section, bigButton, statBox, historyStrip } from '../widgets.js';
import { burst, disposeObject } from '../three/assets.js';

const GROWTH = 0.1;
const multAt = (ms) => Math.floor(Math.exp((GROWTH * ms) / 1000) * 100) / 100;
const fmtX = (m) => `${m.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;

function buildRocket() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 1.3, 24), new THREE.MeshStandardMaterial({ color: 0xf4f4f8, metalness: 0.4, roughness: 0.3 }));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 24), new THREE.MeshStandardMaterial({ color: 0xe74c3c, metalness: 0.3, roughness: 0.3 }));
  nose.position.y = 0.95;
  const window1 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), new THREE.MeshStandardMaterial({ color: 0x3b82f6, emissive: 0x1d4ed8, emissiveIntensity: 0.6 }));
  window1.position.set(0, 0.25, 0.26);
  g.add(body, nose, window1);
  const finMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, metalness: 0.3, roughness: 0.4 });
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.45), finMat);
    const a = (i / 3) * Math.PI * 2;
    fin.position.set(Math.sin(a) * 0.36, -0.5, Math.cos(a) * 0.36);
    fin.rotation.y = a;
    g.add(fin);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 16), new THREE.MeshBasicMaterial({ color: 0xffa726, transparent: true, opacity: 0.9 }));
  flame.rotation.x = Math.PI;
  flame.position.y = -1.05;
  g.add(flame);
  g.userData.flame = flame;
  return g;
}

export default class Crash extends GameBase {
  engineOptions() { return { fov: 42, position: [0, 1.5, 13], target: [0, 1.2, 0], background: 0x05070f, shadows: false }; }

  buildScene() {
    const { engine } = this;
    engine.addLights({ key: [4, 8, 8], keyIntensity: 1.8, hemi: 0.5, fill: 0.6 });
    // Sterne
    const N = 900;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 60; pos[i * 3 + 1] = (Math.random() - 0.5) * 40; pos[i * 3 + 2] = -5 - Math.random() * 30; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.8 }));
    engine.scene.add(this.stars);
    engine.setFit(13.5, 11);
    // Planet / Boden
    const planet = new THREE.Mesh(new THREE.SphereGeometry(30, 64, 64), new THREE.MeshStandardMaterial({ color: 0x1d2a4a, roughness: 0.9 }));
    planet.position.set(0, -34.5, -4);
    engine.scene.add(planet);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(30.6, 64, 64), new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.12, side: THREE.BackSide }));
    glow.position.copy(planet.position);
    engine.scene.add(glow);

    this.rocket = buildRocket();
    engine.scene.add(this.rocket);
    this.trailGeo = new THREE.BufferGeometry();
    this.trailPos = new Float32Array(400 * 3);
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    this.trailGeo.setDrawRange(0, 0);
    this.trail = new THREE.Line(this.trailGeo, new THREE.LineBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.8 }));
    engine.scene.add(this.trail);
    this.trailCount = 0;
    this.resetRocket();

    engine.onUpdate((dt, t) => {
      this.stars.position.y = -((t * 0.4) % 40);
      const flame = this.rocket.userData.flame;
      flame.scale.set(1 + Math.sin(t * 40) * 0.15, this.running ? 1.3 + Math.sin(t * 30) * 0.3 : 0.5, 1);
      if (this.running) this.tick();
    });
    this.multEl = h('div.crash-mult', {}, '1,00×');
    this.statusEl = h('div.crash-status', {}, 'Bereit zum Start');
    this.addHud(this.multEl, this.statusEl);
    this.bannerEl.style.top = '48%'; // Banner nicht über dem Multiplikator-HUD
  }

  resetRocket() {
    this.rocket.visible = true;
    this.rocket.position.set(-5.5, -2.5, 0);
    this.rocket.rotation.z = -0.9;
    this.trailCount = 0;
    this.trailGeo.setDrawRange(0, 0);
  }

  rocketPose(m) {
    const p = Math.min(1, Math.log(m) / Math.log(60));
    const x = -5.5 + 11 * p;
    const y = -2.5 + 7.5 * Math.pow(p, 0.85);
    return { x, y, p };
  }

  buildPanel() {
    this.bet = betControl({ balance: () => this.balance, value: 50_00 });
    this.autoInput = h('input.input', { type: 'number', step: '0.01', min: '1.01', placeholder: 'z. B. 2.00 (optional)' });
    this.startBtn = bigButton('🚀 STARTEN', () => this.start());
    this.cashBtn = bigButton('💰 AUSZAHLEN', () => this.cashout(), 'btn-green');
    this.cashBtn.classList.add('hidden');
    this.lastBox = statBox('Letzte Runde', '–');
    this.history = historyStrip(16);
    this.panel.append(
      section('Einsatz', this.bet.el),
      section('Auto-Cashout bei', this.autoInput, h('div.panel-note', {}, 'Der Server zahlt automatisch aus, sobald der Multiplikator erreicht ist – auch bei Verbindungsproblemen.')),
      this.startBtn, this.cashBtn,
      section('Ergebnis', this.lastBox.el, this.history.el),
      section('Regeln', h('div.panel-note', {}, 'Der Multiplikator wächst exponentiell. Zahle aus, bevor die Rakete explodiert – sonst ist der Einsatz weg. 2 % Hausvorteil.')),
    );
  }

  async ready() {
    const { round } = await api.get('/games/crash/current');
    if (this.destroyed) return;
    if (round && round.status === 'running') {
      this.bet.value = round.bet;
      this.beginRound(round, round.serverNow - round.startedAt);
    } else if (round) {
      this.setBalance(round.balance);
    }
    if (!this.running) this.hint('Setze deinen Einsatz und starte die Rakete');
  }

  setBusy(b) {
    this.bet.disabled = b || this.running;
    this.startBtn.disabled = b || this.running;
    this.autoInput.disabled = b || this.running;
    this.cashBtn.disabled = b || !this.running;
  }

  beginRound(round, elapsedAtResponse) {
    this.running = true;
    this.t0 = performance.now() - elapsedAtResponse;
    this.roundBet = round.bet;
    this.autoCashout = round.autoCashout;
    this.resetRocket();
    this.multEl.className = 'crash-mult';
    this.statusEl.textContent = round.autoCashout ? `Auto-Cashout bei ${fmtX(round.autoCashout)}` : 'Fliegt…';
    this.startBtn.classList.add('hidden');
    this.cashBtn.classList.remove('hidden');
    this.hint('');
    this.setBusy(false);
    sound.play('rocket');
    this.pollTimer = setInterval(() => this.poll(), 220);
  }

  tick() {
    const elapsed = performance.now() - this.t0;
    const m = multAt(elapsed);
    this.multEl.textContent = fmtX(m);
    this.cashBtn.textContent = `💰 AUSZAHLEN 🪙 ${fmt(Math.floor(this.roundBet * m))}`;
    const { x, y, p } = this.rocketPose(m);
    this.rocket.position.set(x, y, 0);
    this.rocket.rotation.z = -0.9 + 0.75 * p;
    if (this.trailCount < 400 && (this.trailCount === 0 || Math.hypot(this.trailPos[(this.trailCount - 1) * 3] - x, this.trailPos[(this.trailCount - 1) * 3 + 1] - y) > 0.08)) {
      this.trailPos[this.trailCount * 3] = x - 0.2;
      this.trailPos[this.trailCount * 3 + 1] = y - 0.6;
      this.trailPos[this.trailCount * 3 + 2] = -0.1;
      this.trailCount++;
      this.trailGeo.attributes.position.needsUpdate = true;
      this.trailGeo.setDrawRange(0, this.trailCount);
    }
  }

  async poll() {
    if (!this.running || this.polling) return;
    this.polling = true;
    try {
      const st = await api.get('/games/crash/state');
      if (st.status !== 'running') this.endRound(st);
    } catch (e) {
      if (e.status === 400) this.stopRound();
    } finally {
      this.polling = false;
    }
  }

  stopRound() {
    this.running = false;
    clearInterval(this.pollTimer);
    this.startBtn.classList.remove('hidden');
    this.cashBtn.classList.add('hidden');
    this.setBusy(false);
  }

  endRound(st) {
    if (!this.running) return;
    this.stopRound();
    if (st.status === 'cashed') {
      const m = st.multiplier;
      this.multEl.textContent = fmtX(m);
      this.multEl.className = 'crash-mult cashed';
      this.statusEl.textContent = `Ausgezahlt bei ${fmtX(m)} · Crash bei ${fmtX(st.crashPoint)}`;
      sound.play(m >= 5 ? 'bigwin' : 'cashout');
      this.banner('AUSGEZAHLT', `🪙 ${fmt(st.payout)} (${fmtX(m)})`, 'win', 3000);
      this.lastBox.set(`${fmtX(m)} · +🪙 ${fmt(st.payout - this.roundBet)}`, 'win');
      this.history.push(fmtX(st.crashPoint), st.crashPoint >= 2 ? 'win' : 'lose');
      burst(this.engine, this.rocket.position.clone(), { count: 50, colors: [0x7cf0ae, 0xffffff, 0xffd76a], speed: 4, size: 0.07, gravity: 3 });
      // Rakete fliegt weiter davon
      const p0 = this.rocket.position.clone();
      this.engine.tween(1600, (k) => { this.rocket.position.set(p0.x + k * 8, p0.y + k * 8, 0); }, Easing.inQuad);
    } else {
      this.multEl.textContent = fmtX(st.crashPoint);
      this.multEl.className = 'crash-mult crashed';
      this.statusEl.textContent = `Abgestürzt bei ${fmtX(st.crashPoint)}`;
      sound.play('boom');
      this.engine.shake(0.5);
      burst(this.engine, this.rocket.position.clone(), { count: 120, colors: [0xff5722, 0xffc107, 0xff1744, 0xffffff], speed: 7, size: 0.12, gravity: 6 });
      this.rocket.visible = false;
      this.banner('CRASH!', `bei ${fmtX(st.crashPoint)} · −🪙 ${fmt(this.roundBet)}`, 'lose', 3000);
      this.lastBox.set(`Crash ${fmtX(st.crashPoint)} · −🪙 ${fmt(this.roundBet)}`, 'lose');
      this.history.push(fmtX(st.crashPoint), st.crashPoint >= 2 ? 'win' : 'lose');
    }
    if (typeof st.balance === 'number') this.setBalance(st.balance);
    this.hint('Neue Runde? Klicke STARTEN');
  }

  start() {
    return this.run(async () => {
      this.hideBanner();
      const autoCashout = this.autoInput.value ? Number(this.autoInput.value) : null;
      const res = await api.post('/games/crash/start', { bet: this.bet.value, autoCashout });
      if (this.destroyed) return;
      this.setBalance(res.balance);
      this.beginRound(res, res.serverNow - res.startedAt);
    });
  }

  cashout() {
    return this.run(async () => {
      clearInterval(this.pollTimer); // kein Polling während der Auszahlung
      try {
        const st = await api.post('/games/crash/cashout');
        if (this.destroyed) return;
        this.endRound(st);
      } catch (e) {
        if (this.running && !this.destroyed) this.pollTimer = setInterval(() => this.poll(), 220);
        throw e;
      }
    });
  }

  destroy() {
    clearInterval(this.pollTimer);
    super.destroy();
  }
}
