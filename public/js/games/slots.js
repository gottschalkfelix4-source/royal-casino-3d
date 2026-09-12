import { GameBase } from './base.js';
import { THREE, Easing } from '../three/engine.js';
import { api } from '../api.js';
import { h, fmt, fmtMult } from '../ui.js';
import { sound } from '../sound.js';
import { betControl, section, bigButton, statBox, historyStrip } from '../widgets.js';
import { makeCanvas, canvasTexture, roundRect, goldMaterial, burst } from '../three/assets.js';
import { CELLS, R, REEL_W, PITCH, ANGLE, stripTexture, buildReel, stopAngle } from '../three/slotmachine.js';

const SYMBOL_LABEL = {
  cherry: '🍒 Kirsche', lemon: '🍋 Zitrone', orange: '🍊 Orange', plum: '🍇 Trauben', bell: '🔔 Glocke',
  bar: '🟨 BAR', seven: '7️⃣ Sieben', diamond: '💎 Diamant', wild: '🌟 Wild',
};

export default class Slots extends GameBase {
  engineOptions() {
    return { fov: 38, position: [0, 0.4, R + 8.4], target: [0, 0.1, R], background: 0x06070b, shadows: false, exposure: 1.05 };
  }

  buildScene() {
    const { engine } = this;
    const { scene } = engine;
    engine.addLights({ key: [3, 6, R + 8], keyIntensity: 1.6, hemi: 0.5, fill: 0.6 });
    engine.addSpot({ position: [-5, 6, R + 6], target: [0, 0, R], intensity: 500, color: 0xffd28a, angle: 0.6 });
    engine.addSpot({ position: [5, 6, R + 6], target: [0, 0, R], intensity: 500, color: 0xa8c8ff, angle: 0.6 });

    // Walzen
    this.reels = [];
    this.reelGroup = new THREE.Group();
    scene.add(this.reelGroup);
    this.marks = new THREE.Group();
    this.reelGroup.add(this.marks);
    this.lamps = [];
    engine.onUpdate((dt, t) => {
      const speed = this.spinning ? 10 : 3;
      this.lamps.forEach((l, i) => {
        const on = Math.sin(t * speed + i * 0.6) > 0;
        l.material.color.setHex(on ? 0xffd76a : 0x4a3a10);
      });
      if (this.marks.children.length) {
        const k = 0.6 + 0.4 * Math.sin(t * 8);
        this.marks.traverse((o) => { if (o.material?.opacity !== undefined) o.material.opacity = k; });
      }
    });
    if (engine.embedded) {
      // In der Halle: Walzen sitzen im echten Automaten; Hebel und Anzeige gehören dem Automaten
      this.machine = engine.mount?.extra?.machine ?? null;
      this.machine?.userData.setDisplay(this.credits(this.balance), '0', 'BEREIT');
      return;
    }

    // Boden mit Reflexionen
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 10), new THREE.MeshStandardMaterial({ color: 0x0a0c11, roughness: 0.35, metalness: 0.7 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.6;
    scene.add(floor);

    // Gehäuse (hoch genug, um die großen Walzentrommeln zu verdecken)
    const cabinet = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x14171f, roughness: 0.55, metalness: 0.3 });
    const CAB_H = 9.5;
    const CAB_W = 7.4;
    const back = new THREE.Mesh(new THREE.BoxGeometry(CAB_W, CAB_H, 1.2), bodyMat);
    back.position.set(0, 0, -0.2);
    cabinet.add(back);
    const front = R + 0.14;
    const plate = (w, hgt, x, y) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, 0.25), bodyMat);
      m.position.set(x, y, front);
      cabinet.add(m);
    };
    const winW = 5 * PITCH + 0.2;
    const winH = 1.55;
    plate(CAB_W, CAB_H / 2 - winH, 0, winH + (CAB_H / 2 - winH) / 2);
    plate(CAB_W, CAB_H / 2 - winH, 0, -winH - (CAB_H / 2 - winH) / 2);
    plate((CAB_W - winW) / 2, CAB_H, -winW / 2 - (CAB_W - winW) / 4, 0);
    plate((CAB_W - winW) / 2, CAB_H, winW / 2 + (CAB_W - winW) / 4, 0);
    // Seitenwände, damit die Trommeln von schräg nicht sichtbar sind
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.3, CAB_H, R + 1), bodyMat);
    sideL.position.set(-CAB_W / 2 + 0.15, 0, (R + 1) / 2 - 0.6);
    const sideR = sideL.clone();
    sideR.position.x = CAB_W / 2 - 0.15;
    cabinet.add(sideL, sideR);
    engine.setFit(CAB_W - 0.2, 5.9);
    // Goldrahmen um das Fenster
    const gold = goldMaterial();
    const trim = (w, hgt, x, y) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, 0.12), gold);
      m.position.set(x, y, front + 0.16);
      cabinet.add(m);
    };
    trim(winW + 0.3, 0.12, 0, winH + 0.06);
    trim(winW + 0.3, 0.12, 0, -winH - 0.06);
    trim(0.12, winH * 2 + 0.24, -winW / 2 - 0.09, 0);
    trim(0.12, winH * 2 + 0.24, winW / 2 + 0.09, 0);
    for (let i = 1; i < 5; i++) {
      const div = new THREE.Mesh(new THREE.BoxGeometry(0.06, winH * 2, 0.1), new THREE.MeshStandardMaterial({ color: 0x0b0c10, metalness: 0.6, roughness: 0.5 }));
      div.position.set((i - 2.5) * PITCH, 0, front + 0.05);
      cabinet.add(div);
    }
    // Leuchtender Schriftzug
    const { canvas, ctx } = makeCanvas(1024, 192);
    ctx.fillStyle = '#0d0f14'; roundRect(ctx, 0, 0, 1024, 192, 30); ctx.fill();
    ctx.font = '900 110px Cinzel, Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#f5d97a'; ctx.shadowBlur = 40; ctx.fillStyle = '#f5d97a';
    ctx.fillText('ROYAL SLOTS', 512, 100);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.05), new THREE.MeshBasicMaterial({ map: canvasTexture(canvas) }));
    sign.position.set(0, 2.15, front + 0.2);
    cabinet.add(sign);
    scene.add(cabinet);

    // Lichter blinken
    const lampGeo = new THREE.SphereGeometry(0.07, 12, 12);
    for (let i = 0; i < 26; i++) {
      const lamp = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xffd76a }));
      const t = i / 26;
      const px = -3.55 + t * 7.1;
      lamp.position.set(px, 2.62, front + 0.2);
      cabinet.add(lamp);
      const lamp2 = lamp.clone();
      lamp2.material = lamp.material.clone();
      lamp2.position.y = -2.62;
      cabinet.add(lamp2);
      this.lamps.push(lamp, lamp2);
    }
  }

  buildReels(strips) {
    strips.forEach((strip, i) => {
      const reel = buildReel(i, stripTexture(strip));
      this.reelGroup.add(reel);
      this.reels.push(reel);
    });
  }

  credits(cents) { return Math.round(cents / 100).toLocaleString('de-DE'); }

  buildPanel() {
    this.bet = betControl({ balance: () => this.balance, value: 100_00 });
    this.spinBtn = bigButton('🎰 DREHEN', () => this.spin());
    this.autoBtn = h('button.btn', { onclick: () => this.toggleAuto() }, 'Auto-Spin: Aus');
    this.lastWin = statBox('Letzter Gewinn', '–');
    this.history = historyStrip(10);
    this.winList = h('div.paytable');
    this.paytableEl = h('div.paytable');
    this.panel.append(
      section('Einsatz', this.bet.el),
      this.spinBtn,
      h('div.row', {}, this.autoBtn),
      section('Ergebnis', this.lastWin.el, this.winList),
      section('Verlauf', this.history.el),
      section('Auszahlungstabelle (× Einsatz)', this.paytableEl, h('div.panel-note', {}, '9 Gewinnlinien · Gewinne zählen von links · 🌟 Wild ersetzt jedes Symbol')),
    );
  }

  async ready() {
    const cfg = await api.get('/games/slots/config');
    if (this.destroyed) return;
    this.config = cfg;
    this.buildReels(cfg.strips);
    this.paytableEl.replaceChildren(...Object.entries(cfg.paytable).reverse().map(([sym, pays]) =>
      h('div.prow', { dataset: { sym } }, h('span.sym', {}, SYMBOL_LABEL[sym]), h('span.pays', {}, pays.map((p) => `${p}×`).join(' / ')))
    ));
    this.hint('Wähle deinen Einsatz und drücke DREHEN');
  }

  setBusy(b) {
    this.bet.disabled = b;
    this.spinBtn.disabled = b;
  }

  destroy() {
    clearTimeout(this.exciteTimer);
    this.machine?.userData.setExcite(false);
    this.machine?.userData.setDisplay(this.credits(this.balance), '0', 'INSERT COIN');
    super.destroy();
  }

  toggleAuto() {
    this.auto = !this.auto;
    this.autoBtn.textContent = `Auto-Spin: ${this.auto ? 'An' : 'Aus'}`;
    this.autoBtn.classList.toggle('selected', this.auto);
    if (this.auto && !this.busy) this.spin();
  }

  spin() {
    return this.run(async () => {
      if (!this.reels.length) return;
      this.hint('');
      this.clearMarks();
      this.winList.replaceChildren();
      this.paytableEl.querySelectorAll('.hit').forEach((e) => e.classList.remove('hit'));
      const bet = this.bet.value;
      const res = await api.post('/games/slots/spin', { bet });
      if (this.destroyed) return;
      this.setBalance(res.balance - res.payout);
      this.spinning = true;
      if (this.machine) {
        // Einarmiger Bandit: erst den Hebel ziehen, die Walzen laufen an, sobald er unten ist
        this.machine.userData.setExcite(false);
        this.machine.userData.setDisplay(this.credits(res.balance - res.payout), '0', 'VIEL GLÜCK');
        this.machine.userData.pullLever();
        await this.engine.delay(260);
        if (this.destroyed) return;
      }
      sound.play('spin');
      await Promise.all(res.stops.map((stop, i) => this.spinReel(i, stop, i * 120)));
      this.spinning = false;
      if (this.destroyed) return;
      this.showResult(res, bet);
      if (this.auto) {
        await this.engine.delay(res.payout > 0 ? 1600 : 500);
        // Nächsten Spin erst starten, wenn run() die Sperre freigegeben hat (daher setTimeout statt Microtask)
        if (this.auto && !this.destroyed && this.balance >= this.bet.value) setTimeout(() => { if (this.auto && !this.busy) this.spin(); }, 30);
        else if (this.auto) this.toggleAuto();
      }
    });
  }

  async spinReel(i, stop, delayMs) {
    const reel = this.reels[i];
    const { engine } = this;
    await engine.delay(delayMs);
    const a0 = reel.rotation.x;
    await engine.tween(280, (k) => { reel.rotation.x = a0 + 0.9 * k; }, Easing.inQuad);
    const a1 = reel.rotation.x;
    const dur = 900 + i * 320;
    const travel = 17 * (dur / 1000);
    let lastTick = 0;
    await engine.tween(dur, (k) => {
      reel.rotation.x = a1 + travel * k;
      if (k - lastTick > 0.12) { lastTick = k; sound.play('tick'); }
    }, Easing.linear);
    const a2 = reel.rotation.x;
    const theta = stopAngle(stop);
    const target = theta + Math.PI * 2 * Math.ceil((a2 + 1.6 - theta) / (Math.PI * 2));
    await engine.tween(620, (k) => { reel.rotation.x = a2 + (target - a2) * k; }, Easing.outBack);
    reel.rotation.x = target % (Math.PI * 2);
    sound.play('stop');
  }

  cellPosition(reelIndex, row) {
    const a = ANGLE * (1 - row);
    return new THREE.Vector3((reelIndex - 2) * PITCH, R * Math.sin(a), R * Math.cos(a));
  }

  clearMarks() {
    for (const c of [...this.marks.children]) {
      this.marks.remove(c);
      c.geometry?.dispose();
      c.material?.dispose();
    }
  }

  showResult(res, bet) {
    const { payout, wins } = res;
    if (payout > 0) {
      const mult = payout / bet;
      const big = mult >= 10;
      sound.play(big ? 'bigwin' : 'win');
      this.banner(big ? 'MEGA GEWINN!' : 'GEWINN', `🪙 ${fmt(payout)} (${fmtMult(mult)})`, 'win', big ? 4200 : 2800);
      this.lastWin.set(`🪙 ${fmt(payout)}`, 'win');
      this.history.push(fmtMult(mult), mult >= 5 ? 'gold' : 'win');
      const lineMat = new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 1 });
      const frameMat = new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
      for (const w of wins) {
        const rows = this.config.lines[w.line];
        const pts = rows.map((row, reel) => this.cellPosition(reel, row).add(new THREE.Vector3(0, 0, 0.09)));
        const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.03, 8), lineMat);
        this.marks.add(tube);
        for (let reel = 0; reel < w.count; reel++) {
          const p = this.cellPosition(reel, rows[reel]);
          const ring = new THREE.Mesh(new THREE.RingGeometry(0.44, 0.5, 4, 1), frameMat);
          ring.position.copy(p).add(new THREE.Vector3(0, 0, 0.06));
          ring.rotation.z = Math.PI / 4;
          ring.rotation.x = -ANGLE * (1 - rows[reel]);
          ring.scale.set(1.35, 1.35, 1);
          this.marks.add(ring);
        }
        this.paytableEl.querySelector(`[data-sym="${w.symbol}"]`)?.classList.add('hit');
      }
      this.winList.replaceChildren(...wins.map((w) =>
        h('div.prow.hit', {}, h('span.sym', {}, `Linie ${w.line + 1}: ${w.count}× ${SYMBOL_LABEL[w.symbol]}`), h('span.pays', {}, `🪙 ${fmt(w.amount)}`))
      ));
      burst(this.engine, new THREE.Vector3(0, 0.5, R + 1), { count: big ? 140 : 60, colors: [0xffd76a, 0xffffff, 0xff7a7a, 0x7cf0ae], speed: big ? 8 : 5, size: 0.08 });
      if (big) this.engine.shake(0.12);
      if (this.machine) {
        this.machine.userData.setExcite(true);
        this.machine.userData.setDisplay(this.credits(res.balance), this.credits(payout), big ? 'MEGA GEWINN' : 'GEWINN');
        clearTimeout(this.exciteTimer);
        this.exciteTimer = setTimeout(() => this.machine?.userData.setExcite(false), big ? 4200 : 2800);
      }
    } else {
      this.lastWin.set('Kein Gewinn', 'lose');
      this.history.push('0×', 'lose');
      this.machine?.userData.setDisplay(this.credits(res.balance), '0', 'NOCHMAL?');
    }
    this.setBalance(res.balance);
  }
}
