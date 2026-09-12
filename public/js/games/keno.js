import { GameBase } from './base.js';
import { THREE } from '../three/engine.js';
import { api } from '../api.js';
import { h, fmt, fmtMult } from '../ui.js';
import { sound } from '../sound.js';
import { betControl, section, bigButton, statBox, historyStrip } from '../widgets.js';
import { makeCanvas, canvasTexture, buildTable, burst } from '../three/assets.js';

const COLS = 10;
const ROWS = 8;
const POOL = COLS * ROWS;
const CELL = 0.24;
const BOARD_W = COLS * CELL;
const BOARD_D = ROWS * CELL;

function randomPicks(n) {
  const all = Array.from({ length: POOL }, (_, i) => i + 1);
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return all.slice(0, n);
}

export default class Keno extends GameBase {
  engineOptions() { return { fov: 46, position: [0, 3.4, 3.2], target: [0, 0.3, 0], background: 0x04140d }; }

  buildScene() {
    const { engine } = this;
    if (engine.embedded) {
      engine.addLights?.();
      this.selected = new Set();
      this.drawn = new Set();
      this.hit = new Set();
      this.buildBoard();
      return;
    }
    engine.addLights({ key: [3, 8, 5], keyIntensity: 2.2, hemi: 0.55, fill: 0.7, shadowSize: 10 });
    engine.addSpot({ position: [0, 7, 4], target: [0, 0.9, 0], intensity: 500, angle: 0.7, color: 0x9fffd0 });
    buildTable(engine.scene, { width: BOARD_W + 1.2, depth: BOARD_D + 1.0, felt: '#07281c' });
    engine.setFit(BOARD_W + 1.5, BOARD_D + 1.5);
    this.selected = new Set();
    this.drawn = new Set();
    this.hit = new Set();
    this.buildBoard();
  }

  buildBoard() {
    const { canvas, ctx } = makeCanvas(COLS * 64, ROWS * 64);
    this.canvas = canvas;
    this.ctx = ctx;
    this.texture = canvasTexture(canvas);
    this.paint();
    const mat = new THREE.MeshStandardMaterial({ map: this.texture, emissive: 0xffffff, emissiveMap: this.texture, emissiveIntensity: 0.35, roughness: 0.5 });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, BOARD_D), mat);
    board.rotation.x = -Math.PI / 2;
    board.position.set(0, 0.965, 0);
    this.engine.scene.add(board);
    this.board = board;
  }

  paint() {
    const { ctx, canvas } = this;
    const cw = canvas.width / COLS;
    const ch = canvas.height / ROWS;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#04140d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const n = r * COLS + c + 1;
        const sel = this.selected.has(n);
        const dr = this.drawn.has(n);
        const win = this.hit.has(n);
        let fill = '#0b2a1d'; let stroke = 'rgba(124,240,174,0.35)'; let text = '#9fe8c4';
        if (dr && sel) { fill = win ? '#f5d97a' : '#22c55e'; text = '#06210f'; stroke = '#fff3c4'; }
        else if (dr) { fill = '#123a6b'; text = '#bcd8ff'; stroke = '#4d9cff'; }
        else if (sel) { fill = '#6b5312'; text = '#ffe9a3'; stroke = '#f5d97a'; }
        ctx.fillStyle = fill;
        ctx.fillRect(c * cw + 3, r * ch + 3, cw - 6, ch - 6);
        ctx.strokeStyle = stroke; ctx.lineWidth = sel || dr ? 5 : 2;
        ctx.strokeRect(c * cw + 3, r * ch + 3, cw - 6, ch - 6);
        ctx.fillStyle = text;
        ctx.font = `700 ${Math.round(cw * 0.42)}px Inter, Arial`;
        ctx.fillText(String(n), c * cw + cw / 2, r * ch + ch / 2 + 1);
      }
    }
    this.texture.needsUpdate = true;
  }

  buildPanel() {
    this.bet = betControl({ balance: () => this.balance, value: 100_00 });
    this.buttons = new Map();
    const grid = h('div.keno-grid');
    for (let n = 1; n <= POOL; n++) {
      const b = h('button.keno-num', { type: 'button', onclick: () => this.toggle(n) }, String(n));
      this.buttons.set(n, b);
      grid.append(b);
    }
    this.countBox = statBox('Getippt', '0 / 10');
    this.resultBox = statBox('Letzte Ziehung', '–');
    this.history = historyStrip(12);
    this.playBtn = bigButton('🎱 SPIELEN', () => this.play());
    this.randomBtn = h('button.btn.btn-sm', { type: 'button', onclick: () => this.random() }, 'Zufall');
    this.clearBtn = h('button.btn.btn-sm', { type: 'button', onclick: () => this.clear() }, 'Löschen');
    this.payoutEl = h('div.keno-payout');
    this.panel.append(
      section('Zahlen tippen (1–10)', grid),
      h('div.row', {}, this.randomBtn, this.clearBtn),
      section('Einsatz', this.bet.el),
      this.playBtn,
      section('Ergebnis', this.countBox.el, this.resultBox.el, this.history.el),
      section('Auszahlung (× Einsatz)', this.payoutEl),
    );
  }

  async ready() {
    const cfg = await api.get('/games/keno/config');
    if (this.destroyed) return;
    this.config = cfg;
    this.payoutEl.replaceChildren(...Object.entries(cfg.paytable).map(([spots, row]) =>
      h('div.prow', {}, h('span.sym', {}, `${spots} Zahlen`), h('span.pays', {}, Object.entries(row).map(([hit, m]) => `${hit} Treffer ${fmtMult(m)}`).join(' · ')))
    ));
    this.setBusy(false);
    this.hint('Tippe bis zu 10 Zahlen und spiele');
  }

  setBusy(b) {
    this.bet.disabled = b;
    this.playBtn.disabled = b;
    this.randomBtn.disabled = b;
    this.clearBtn.disabled = b;
    this.buttons.forEach((x) => { x.disabled = b; });
  }

  toggle(n) {
    if (this.busy) return;
    if (this.selected.has(n)) this.selected.delete(n);
    else {
      if (this.selected.size >= (this.config?.maxSpots ?? 10)) { this.banner(`Höchstens ${this.config?.maxSpots ?? 10} Zahlen`, '', 'info', 1200); return; }
      this.selected.add(n);
    }
    sound.play('click');
    this.sync();
  }

  random() {
    if (this.busy) return;
    this.selected = new Set(randomPicks(this.config?.maxSpots ?? 10));
    sound.play('click');
    this.sync();
  }

  clear() {
    if (this.busy) return;
    this.selected.clear();
    sound.play('click');
    this.sync();
  }

  sync() {
    for (const [n, b] of this.buttons) b.classList.toggle('selected', this.selected.has(n));
    this.countBox.set(`${this.selected.size} / ${this.config?.maxSpots ?? 10}`);
    this.paint();
  }

  play() {
    return this.run(async () => {
      if (this.selected.size === 0) { this.banner('Bitte Zahlen tippen', '', 'info', 1500); return; }
      this.hideBanner();
      this.drawn.clear(); this.hit.clear();
      this.sync();
      const numbers = [...this.selected];
      const bet = this.bet.value;
      const res = await api.post('/games/keno/play', { bet, numbers });
      if (this.destroyed) return;
      this.setBalance(res.balance - res.payout);
      await this.reveal(res);
      if (this.destroyed) return;
      this.finish(res, bet);
    });
  }

  async reveal(res) {
    for (const n of res.drawn) {
      if (this.destroyed) return;
      this.drawn.add(n);
      if (this.selected.has(n)) this.hit.add(n);
      this.paint();
      sound.play('tick');
      await this.engine.delay(110);
    }
    this.drawn = new Set(res.drawn);
    await this.engine.delay(250);
  }

  finish(res, bet) {
    const net = res.payout - bet;
    this.history.push(`${res.hits} Treffer`, res.payout > 0 ? 'win' : 'lose');
    this.resultBox.set(`${res.hits} Treffer · ${res.payout > 0 ? `+🪙 ${fmt(net)}` : `−🪙 ${fmt(bet)}`}`, res.payout > 0 ? 'win' : 'lose');
    if (res.payout > 0) {
      const mult = res.payout / bet;
      sound.play(mult >= 10 ? 'bigwin' : 'win');
      this.banner(`${res.hits} TREFFER`, `${fmtMult(mult)} · +🪙 ${fmt(net)}`, 'win', 3200);
      burst(this.engine, new THREE.Vector3(0, 1.0, 0), { count: mult >= 10 ? 120 : 60, colors: [0xffd76a, 0xffffff, 0x7cf0ae], speed: 5, size: 0.07 });
    } else {
      sound.play('lose');
      this.banner('KEIN TREFFER', `−🪙 ${fmt(bet)}`, 'lose', 2200);
    }
    this.setBalance(res.balance);
    this.sync();
  }
}
