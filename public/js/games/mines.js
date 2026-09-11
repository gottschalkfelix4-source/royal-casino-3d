import { GameBase } from './base.js';
import { THREE, Easing } from '../three/engine.js';
import { api } from '../api.js';
import { h, fmt, fmtMult } from '../ui.js';
import { sound } from '../sound.js';
import { betControl, section, bigButton, statBox, historyStrip } from '../widgets.js';
import { burst, disposeObject } from '../three/assets.js';

const N = 5;
const PITCH = 1.25;
const TILE = 1.1;

export default class Mines extends GameBase {
  engineOptions() { return { fov: 42, position: [0, 6.5, 7.2], target: [0, 0, -0.4], background: 0x06090c }; }

  buildScene() {
    const { engine } = this;
    engine.addLights({ key: [4, 10, 4], keyIntensity: 2.2, hemi: 0.5, fill: 0.7, shadowSize: 8 });
    engine.addSpot({ position: [0, 9, 3], target: [0, 0, 0], intensity: 400, angle: 0.7, color: 0xd6fff0 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(N * PITCH + 0.8, 0.4, N * PITCH + 0.8), new THREE.MeshStandardMaterial({ color: 0x141a24, roughness: 0.6, metalness: 0.3 }));
    base.position.y = -0.2; base.receiveShadow = true;
    engine.scene.add(base);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: 0x0a0d12, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.41; floor.receiveShadow = true;
    engine.scene.add(floor);
    engine.setFit(8, 8.5);

    this.tileMat = new THREE.MeshPhysicalMaterial({ color: 0x2b3a55, roughness: 0.35, metalness: 0.2, clearcoat: 0.6 });
    this.hoverMat = this.tileMat.clone(); this.hoverMat.color.setHex(0x3f5680); this.hoverMat.emissive.setHex(0x1a2a44);
    this.safeMat = new THREE.MeshPhysicalMaterial({ color: 0x0f5a3a, roughness: 0.4, emissive: 0x0b3d28, emissiveIntensity: 0.5 });
    this.mineMat = new THREE.MeshPhysicalMaterial({ color: 0x5a1a1a, roughness: 0.5, emissive: 0x3d0b0b, emissiveIntensity: 0.6 });
    this.dimMineMat = new THREE.MeshPhysicalMaterial({ color: 0x3a2a2a, roughness: 0.6 });
    this.tiles = [];
    const geo = new THREE.BoxGeometry(TILE, 0.35, TILE);
    for (let i = 0; i < N * N; i++) {
      const tile = new THREE.Mesh(geo, this.tileMat);
      tile.position.set((i % N - 2) * PITCH, 0.175, (Math.floor(i / N) - 2) * PITCH);
      tile.castShadow = true; tile.receiveShadow = true;
      tile.userData.index = i;
      engine.scene.add(tile);
      this.tiles.push(tile);
    }
    this.gemGeo = new THREE.OctahedronGeometry(0.32, 0);
    this.gemMat = new THREE.MeshPhysicalMaterial({ color: 0x34e39a, emissive: 0x1ec27a, emissiveIntensity: 0.9, roughness: 0.1, metalness: 0.2, clearcoat: 1 });
    this.bombGeo = new THREE.SphereGeometry(0.3, 24, 24);
    this.bombMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.6 });
    this.decor = [];
    this.hovered = null;

    const canvas = engine.renderer.domElement;
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('click', (e) => this.onClick(e));
    engine.onUpdate((dt, t) => {
      for (const d of this.decor) if (d.userData.gem) { d.rotation.y += dt * 1.5; d.position.y = 0.75 + Math.sin(t * 3 + d.position.x) * 0.05; }
    });
  }

  buildPanel() {
    this.bet = betControl({ balance: () => this.balance, value: 50_00 });
    this.minesInput = h('input', { type: 'range', min: 1, max: 24, value: 3, oninput: () => this.updateMinesLabel() });
    this.minesLabel = h('span', {}, '3 Minen');
    this.startBtn = bigButton('💣 STARTEN', () => this.start());
    this.cashBtn = bigButton('💰 AUSZAHLEN', () => this.cashout(), 'btn-green');
    this.cashBtn.classList.add('hidden');
    this.multBox = statBox('Multiplikator', '–');
    this.nextBox = statBox('Nächstes Feld', '–');
    this.payBox = statBox('Auszahlung', '–');
    this.history = historyStrip(14);
    this.panel.append(
      section('Einsatz', this.bet.el),
      section('Minen', h('div.row', {}, this.minesInput, this.minesLabel)),
      this.startBtn, this.cashBtn,
      section('Runde', h('div.grid-2', {}, this.multBox.el, this.nextBox.el), this.payBox.el),
      section('Verlauf', this.history.el),
      section('Regeln', h('div.panel-note', {}, '25 Felder. Jedes sichere Feld erhöht den Multiplikator. Triffst du eine Mine, ist der Einsatz weg. Zahle jederzeit aus.')),
    );
  }

  updateMinesLabel() { this.minesLabel.textContent = `${this.minesInput.value} Minen`; }

  async ready() {
    const { game } = await api.get('/games/mines/current');
    if (this.destroyed) return;
    if (game) {
      this.bet.value = game.bet;
      this.minesInput.value = game.mines;
      this.updateMinesLabel();
      for (const i of game.revealed) this.revealTile(i, true, true);
      this.enterGame(game);
    } else this.hint('Wähle Einsatz und Minen, dann STARTEN');
  }

  setBusy(b) {
    const inGame = !!this.game;
    this.bet.disabled = b || inGame;
    this.minesInput.disabled = b || inGame;
    this.startBtn.disabled = b || inGame;
    this.cashBtn.disabled = b || !inGame || this.game.revealed.length === 0;
  }

  enterGame(game) {
    this.game = game.status === 'active' ? game : null;
    this.startBtn.classList.toggle('hidden', !!this.game);
    this.cashBtn.classList.toggle('hidden', !this.game);
    if (this.game) {
      this.multBox.set(fmtMult(game.multiplier), game.revealed.length ? 'gold' : '');
      this.nextBox.set(fmtMult(game.nextMultiplier));
      this.payBox.set(`🪙 ${fmt(Math.floor(game.bet * game.multiplier))}`, game.revealed.length ? 'win' : '');
      this.cashBtn.textContent = `💰 AUSZAHLEN 🪙 ${fmt(Math.floor(game.bet * game.multiplier))}`;
      this.hint(`Klicke ein Feld · ${game.safeLeft} sichere Felder übrig`);
    }
    this.setBusy(false);
  }

  onMove(e) {
    if (!this.game || this.busy) return;
    const hit = this.engine.pick(e, this.tiles.filter((t) => t.material === this.tileMat || t.material === this.hoverMat), false)[0];
    const tile = hit?.object ?? null;
    if (this.hovered && this.hovered !== tile && this.hovered.material === this.hoverMat) this.hovered.material = this.tileMat;
    if (tile && tile.material === this.tileMat) tile.material = this.hoverMat;
    this.hovered = tile;
    this.engine.renderer.domElement.style.cursor = tile ? 'pointer' : '';
  }

  onClick(e) {
    if (!this.game || this.busy) return;
    const hit = this.engine.pick(e, this.tiles.filter((t) => t.material === this.tileMat || t.material === this.hoverMat), false)[0];
    if (!hit) return;
    this.reveal(hit.object.userData.index);
  }

  async revealTile(index, safe, instant = false) {
    const tile = this.tiles[index];
    tile.material = safe ? this.safeMat : this.mineMat;
    const y0 = tile.position.y;
    if (!instant) {
      await this.engine.tween(260, (k) => { tile.position.y = y0 + Math.sin(k * Math.PI) * 0.35; tile.rotation.x = Math.sin(k * Math.PI) * 0.35; }, Easing.outQuad);
    }
    tile.position.y = y0; tile.rotation.x = 0;
    const decor = new THREE.Mesh(safe ? this.gemGeo : this.bombGeo, safe ? this.gemMat : this.bombMat);
    decor.position.set(tile.position.x, 0.75, tile.position.z);
    decor.castShadow = true;
    decor.userData.gem = safe;
    this.engine.scene.add(decor);
    this.decor.push(decor);
    if (!instant) {
      decor.scale.setScalar(0.01);
      await this.engine.tween(300, (k) => decor.scale.setScalar(k), Easing.outBack);
    }
  }

  resetBoard() {
    for (const t of this.tiles) { t.material = this.tileMat; t.position.y = 0.175; t.rotation.set(0, 0, 0); }
    for (const d of this.decor) disposeObject(d);
    this.decor = [];
  }

  start() {
    return this.run(async () => {
      this.hideBanner();
      this.resetBoard();
      const { game } = await api.post('/games/mines/start', { bet: this.bet.value, mines: Number(this.minesInput.value) });
      if (this.destroyed) return;
      this.setBalance(game.balance);
      sound.play('click');
      this.enterGame(game);
    });
  }

  reveal(index) {
    return this.run(async () => {
      const { game } = await api.post('/games/mines/reveal', { index });
      if (this.destroyed) return;
      if (game.status === 'lost') {
        await this.revealTile(index, false);
        sound.play('boom');
        this.engine.shake(0.45);
        burst(this.engine, this.tiles[index].position.clone().add(new THREE.Vector3(0, 0.6, 0)), { count: 90, colors: [0xff5722, 0xffc107, 0xff1744], speed: 6, size: 0.1 });
        this.banner('BOOM!', `Mine getroffen · −🪙 ${fmt(game.bet)}`, 'lose', 3000);
        this.history.push('💥', 'lose');
        await this.showAllMines(game.minePositions, index);
        this.enterGame(game);
        this.multBox.set('–'); this.nextBox.set('–'); this.payBox.set('–');
        this.setBalance(game.balance);
        this.hint('Neue Runde? Klicke STARTEN');
        return;
      }
      sound.play('gem');
      await this.revealTile(index, true);
      if (this.destroyed) return;
      this.enterGame(game);
      if (game.status === 'won') this.finish(game);
    });
  }

  async showAllMines(positions, hit) {
    for (const p of positions) {
      if (p === hit) continue;
      const tile = this.tiles[p];
      tile.material = this.dimMineMat;
      const bomb = new THREE.Mesh(this.bombGeo, this.bombMat);
      bomb.position.set(tile.position.x, 0.7, tile.position.z);
      bomb.scale.setScalar(0.7);
      this.engine.scene.add(bomb);
      this.decor.push(bomb);
      await this.engine.delay(40);
    }
  }

  cashout() {
    return this.run(async () => {
      const { game } = await api.post('/games/mines/cashout');
      if (this.destroyed) return;
      this.enterGame(game);
      this.finish(game);
    });
  }

  async finish(game) {
    sound.play(game.multiplier >= 5 ? 'bigwin' : 'cashout');
    this.banner('AUSGEZAHLT', `🪙 ${fmt(game.payout)} (${fmtMult(game.multiplier)})`, 'win', 3200);
    this.history.push(fmtMult(game.multiplier), game.multiplier >= 3 ? 'gold' : 'win');
    this.multBox.set(fmtMult(game.multiplier), 'gold');
    this.payBox.set(`🪙 ${fmt(game.payout)}`, 'win');
    burst(this.engine, new THREE.Vector3(0, 1.5, 0), { count: 80, colors: [0x34e39a, 0xffffff, 0xffd76a], speed: 5, size: 0.08 });
    this.setBalance(game.balance);
    await this.showAllMines(game.minePositions, -1);
    this.hint('Neue Runde? Klicke STARTEN');
  }
}
