import { GameBase } from './base.js';
import { THREE } from '../three/engine.js';
import { api } from '../api.js';
import { h, fmt, fmtMult } from '../ui.js';
import { sound } from '../sound.js';
import { section, bigButton, statBox, segmented, historyStrip } from '../widgets.js';
import { makeCanvas, canvasTexture, buildTable, burst } from '../three/assets.js';

const RES = 384;
const SYMBOL_LABEL = {};

export default class Scratch extends GameBase {
  engineOptions() { return { fov: 44, position: [0, 3.0, 4.2], target: [0, 0.6, 0], background: 0x120d04 }; }

  buildScene() {
    const { engine } = this;
    this.cardC = makeCanvas(RES, RES);
    this.foilC = makeCanvas(RES, RES);
    this.canvas = document.createElement('canvas');
    this.canvas.width = RES; this.canvas.height = RES;
    this.canvas.className = 'scratch-canvas';
    this.ctx = this.canvas.getContext('2d');
    this.revealed = false;
    this.scratching = false;
    this.fillFoil('LOS KAUFEN');

    if (engine.embedded) {
      this.texture = new THREE.CanvasTexture(this.canvas);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), new THREE.MeshStandardMaterial({ map: this.texture, emissive: 0xffffff, emissiveMap: this.texture, emissiveIntensity: 1.1, roughness: 0.4 }));
      plane.position.set(0, 0, 0.03);
      engine.scene.add(plane);
      this.composite();
      return;
    }
    engine.addLights({ key: [3, 8, 5], keyIntensity: 2.2, hemi: 0.55, fill: 0.7, shadowSize: 10 });
    engine.addSpot({ position: [0, 7, 4], target: [0, 0.6, 0], intensity: 500, angle: 0.7, color: 0xffe9b0 });
    buildTable(engine.scene, { width: 6, depth: 5, felt: '#3a2a0a' });
    this.texture = canvasTexture(this.canvas);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshStandardMaterial({ map: this.texture, emissive: 0xffffff, emissiveMap: this.texture, emissiveIntensity: 0.8, roughness: 0.5 }));
    plane.rotation.x = -Math.PI / 2; plane.position.y = 0.2;
    engine.scene.add(plane);
    engine.setFit(4, 4);
    this.composite();
  }

  buildPanel() {
    const wrap = h('div.scratch-wrap', {}, this.canvas);
    this.canvas.addEventListener('pointerdown', (e) => { this.startScratch(e); e.currentTarget.setPointerCapture?.(e.pointerId); });
    this.canvas.addEventListener('pointermove', (e) => this.moveScratch(e));
    this.canvas.addEventListener('pointerup', () => { this.scratching = false; });
    this.canvas.addEventListener('pointerleave', () => { this.scratching = false; });
    this.tier = segmented([], 'silber', (v) => this.selectTier(v));
    this.buyBtn = bigButton('🎫 LOS KAUFEN', () => this.buy());
    this.lastBox = statBox('Letztes Los', '–');
    this.history = historyStrip(12);
    this.prizeEl = h('div.paytable');
    this.panel.append(
      section('Losstufe', this.tier.el),
      wrap,
      this.buyBtn,
      section('Ergebnis', this.lastBox.el, this.history.el),
      section('Gewinne', this.prizeEl),
    );
    this.hint('Los kaufen und mit der Maus freirubbeln');
  }

  async ready() {
    const cfg = await api.get('/games/scratch/config');
    if (this.destroyed) return;
    this.config = cfg;
    this.symbols = Object.fromEntries(cfg.symbols.map((s) => [s.key, s]));
    const tiers = cfg.tiers.map((t) => ({ value: t.key, label: `${t.name} · 🪙 ${(t.price / 100).toLocaleString('de-DE')}` }));
    this.tierEl = segmented(tiers, tiers[0].value, (v) => this.selectTier(v));
    this.tier.el.replaceWith(this.tierEl.el);
    this.tier = this.tierEl;
    this.prizeEl.replaceChildren(...cfg.symbols.slice().reverse().map((s) =>
      h('div.prow', {}, h('span.sym', {}, `${s.label} ${s.multiplier}×`))
    ));
    this.hint('Los kaufen und freirubbeln');
  }

  selectTier(v) { this.tierKey = v; sound.play('click'); }

  fillFoil(text) {
    const { ctx, canvas } = this.foilC;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    g.addColorStop(0, '#c9a227'); g.addColorStop(0.5, '#f0d67a'); g.addColorStop(1, '#a07f1c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 3;
    for (let i = -canvas.height; i < canvas.width; i += 26) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + canvas.height, canvas.height); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(40,25,0,0.75)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 46px Cinzel, Georgia, serif';
    ctx.fillText('RUBBELLOS', canvas.width / 2, canvas.height / 2 - 30);
    ctx.font = `70px "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.fillText('🎫', canvas.width / 2, canvas.height / 2 + 35);
    if (text) { ctx.font = '700 22px Inter, Arial'; ctx.fillText(text, canvas.width / 2, canvas.height - 34); }
  }

  composite() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, RES, RES);
    ctx.drawImage(this.cardC.canvas, 0, 0);
    ctx.drawImage(this.foilC.canvas, 0, 0);
    if (this.texture) this.texture.needsUpdate = true;
  }

  canvasPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (RES / rect.width), y: (e.clientY - rect.top) * (RES / rect.height), r: 26 * (RES / rect.width) };
  }

  scratchAt(p) {
    const ctx = this.foilC.ctx;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  startScratch(e) {
    if (this.busy || this.revealed || !this.bought) return;
    this.scratching = true;
    this.scratchAt(this.canvasPoint(e));
    this.composite();
    sound.play('click');
  }

  moveScratch(e) {
    if (!this.scratching || this.revealed) return;
    // Zwischen letzter und aktueller Position interpolieren, damit schnelle Bewegungen durchgehen
    const p = this.canvasPoint(e);
    const last = this.lastPoint ?? p;
    const steps = Math.max(1, Math.ceil(Math.hypot(p.x - last.x, p.y - last.y) / (p.r * 0.5)));
    for (let i = 1; i <= steps; i++) this.scratchAt({ x: last.x + (p.x - last.x) * i / steps, y: last.y + (p.y - last.y) * i / steps, r: p.r });
    this.lastPoint = p;
    this.composite();
    if (this.scratchedFraction() > 0.5) this.reveal();
  }

  scratchedFraction() {
    const { ctx } = this.foilC;
    const size = RES;
    const data = ctx.getImageData(0, 0, size, size).data;
    let clear = 0; let total = 0;
    const step = 16;
    for (let y = 0; y < size; y += step) {
      for (let x = 0; x < size; x += step) {
        total++;
        if (data[(y * size + x) * 4 + 3] < 40) clear++;
      }
    }
    return clear / total;
  }

  drawCard(grid, winSymbol) {
    const { ctx } = this.cardC;
    ctx.fillStyle = '#101a12'; ctx.fillRect(0, 0, RES, RES);
    ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, RES - 12, RES - 12);
    const cell = (RES - 24) / 3;
    grid.forEach((key, i) => {
      const c = i % 3; const r = Math.floor(i / 3);
      const x = 12 + c * cell; const y = 12 + r * cell;
      const win = key === winSymbol;
      ctx.fillStyle = win ? 'rgba(245,217,122,0.28)' : 'rgba(255,255,255,0.06)';
      ctx.fillRect(x + 4, y + 4, cell - 8, cell - 8);
      ctx.strokeStyle = win ? '#f5d97a' : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = win ? 5 : 2;
      ctx.strokeRect(x + 4, y + 4, cell - 8, cell - 8);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(cell * 0.52)}px "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.fillText(this.symbols[key]?.label ?? '?', x + cell / 2, y + cell / 2 + 2);
    });
  }

  setBusy(b) { this.buyBtn.disabled = b; if (this.tier) this.tier.disabled = b; }

  buy() {
    return this.run(async () => {
      this.hideBanner();
      this.revealed = false;
      this.bought = false;
      this.lastPoint = null;
      const tier = this.tier?.value ?? 'silber';
      const res = await api.post('/games/scratch/buy', { tier });
      if (this.destroyed) return;
      this.setBalance(res.balance);
      this.drawCard(res.grid, res.winSymbol);
      this.fillFoil('FREIRUBBELN');
      this.composite();
      this.bought = true;
      this.lastRes = res;
      this.hint('Mit der Maus freirubbeln');
    });
  }

  reveal() {
    if (this.revealed) return;
    this.revealed = true;
    this.foilC.ctx.clearRect(0, 0, RES, RES);
    this.composite();
    this.finish(this.lastRes);
  }

  finish(res) {
    if (!res) return;
    const mult = res.multiplier;
    this.history.push(mult > 0 ? fmtMult(mult) : 'Niete', mult > 0 ? (mult >= 10 ? 'gold' : 'win') : 'lose');
    if (mult > 0) {
      const win = res.payout - res.bet;
      sound.play(mult >= 10 ? 'bigwin' : 'win');
      this.lastBox.set(`${mult}× · +🪙 ${fmt(win)}`, 'win');
      this.banner(mult >= 100 ? 'RIESEN-GEWINN!' : 'GEWINN!', `${fmtMult(mult)} · +🪙 ${fmt(win)}`, 'win', 3400);
      burst(this.engine, new THREE.Vector3(0, 1.0, 0), { count: mult >= 10 ? 120 : 60, colors: [0xffd76a, 0xffffff, 0x7cf0ae], speed: 5, size: 0.07 });
    } else {
      sound.play('lose');
      this.lastBox.set('Niete', 'lose');
      this.banner('NIETE', `−🪙 ${fmt(res.bet)}`, 'lose', 2200);
    }
    this.hint('Neues Los kaufen');
  }
}
