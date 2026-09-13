import { Engine, THREE } from '../three/engine.js';
import { buildCasino, HALL } from '../three/casino.js';
import { batchStatic } from '../three/batch.js';
import { PlanarReflection, applyFloorReflection } from '../three/reflection.js';
import { createAvatar, floatText } from '../three/avatars.js';
import { createChip, textSprite } from '../three/assets.js';
import { GAMES } from '../games/registry.js';
import { fmt } from '../ui.js';
import { sound } from '../sound.js';
import { rt } from '../realtime.js';
import { voice } from '../voice.js';
import { openRewards } from '../rewards.js';

const EYE = 1.62;
const LABEL_POS = new THREE.Vector3(); // Zwischenpuffer für die Entfernung der Croupier-Schilder
const gameName = (id) => GAMES.find((g) => g.id === id)?.name ?? id;

/**
 * Dauerhafte Casino-Halle als Hintergrundebene hinter der ganzen App.
 * Modi: 'walk' (Lobby, First-Person-Steuerung), 'spectate' (im Spiel: Kamera am Tisch, Halle läuft weiter),
 * 'idle' (Profilseiten: Kamera bleibt stehen).
 */
class Hall {
  constructor() {
    this.mode = 'idle';
    this.listeners = new Map();
    this.avatars = new Map();
    this.keys = new Set();
    this.me = { pos: new THREE.Vector3((Math.random() - 0.5) * 2, 0, 12.5), yaw: 0, pitch: -0.05, moving: false };
    this.hovered = null;
    this.nearStation = null;
    this.spectateStation = null;
    this.zoom = 1; // Mausrad: >1 = weiter weg (größerer Blickwinkel), <1 = näher heran
  }

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.listeners.get(type)?.delete(fn);
  }
  emit(type, data) { for (const fn of this.listeners.get(type) ?? []) fn(data); }

  ensure() {
    if (this.engine) return;
    this.layer = document.createElement('div');
    this.layer.id = 'hall-layer';
    document.body.prepend(this.layer);
    const engine = new Engine(this.layer, {
      fov: 70, position: [0, EYE, 12], target: [0, EYE, 0], background: 0x05040a,
      shadows: true, exposure: 1.15, envIntensity: 0.45,
      post: { bloom: { strength: 0.18, radius: 0.5, threshold: 1.0 } },
    });
    this.engine = engine;
    engine.camera.layers.enable(1); // Ebene 1: Beschriftungen/Sprites (nicht in der Bodenspiegelung)
    engine.scene.fog = new THREE.FogExp2(0x1e150e, 0.009);
    engine.scene.add(new THREE.HemisphereLight(0xfff0dc, 0x5a3f26, 0.42)); // warmes Raumlicht von der hellen Decke
    const key = new THREE.SpotLight(0xffe6c4, 650, 0, 0.9, 0.7, 2);
    key.position.set(0, 6.2, 2);
    key.target.position.set(0, 0, 0);
    key.castShadow = engine.quality.shadows;
    key.shadow.mapSize.set(engine.quality.shadowMap, engine.quality.shadowMap);
    key.shadow.bias = -0.0004;
    engine.scene.add(key, key.target);
    // Wenige Akzentlichter: jedes Licht kostet in jedem Pixel Rechenzeit
    const accents = [];
    for (const [x, z, c] of [[-14, 0, 0xffb070], [14, 0, 0xc59bff], [0, -11, 0xff2d6f]]) {
      const s = new THREE.SpotLight(c, 380, 0, 1.0, 0.8, 2);
      s.position.set(x, 6.2, z);
      s.target.position.set(x, 0, z);
      engine.scene.add(s, s.target);
      accents.push(s);
    }
    // Zusätzliche schattenwerfende Akzentlichter (Qualitätsstufe); nur so viele wie erlaubt
    const extraShadows = engine.quality.shadows ? Math.min(engine.quality.extraShadows, accents.length) : 0;
    accents.forEach((s, i) => {
      if (i >= extraShadows) return;
      s.castShadow = true;
      s.shadow.mapSize.set(1024, 1024);
      s.shadow.bias = -0.0006;
      s.shadow.camera.near = 1; s.shadow.camera.far = 16;
    });
    // Schatten der Halle nur alle 3 Frames neu berechnen (Figuren bewegen sich langsam genug)
    engine.renderer.shadowMap.autoUpdate = false;
    engine.renderer.shadowMap.needsUpdate = true;
    this.frame = 0;
    this.casino = buildCasino(engine);
    this.baseHitboxes = [...this.casino.stations.map((s) => s.hitbox), ...this.casino.interactives.map((i) => i.hitbox)];
    this.hitboxes = this.baseHitboxes;
    // Statische Einrichtung zu wenigen Draw-Calls zusammenfassen (Voraussetzung für Spiegelung + GTAO)
    const batched = batchStatic(engine.scene);
    console.debug(`Halle: ${batched.removed} statische Meshes in ${batched.meshes} Batches zusammengefasst`);
    // Planare Spiegelung im Marmorboden
    if (engine.quality.reflection > 0 && this.casino.floor) {
      this.reflection = new PlanarReflection(engine.renderer, engine.scene, { y: 0, scale: engine.quality.reflection, layers: 1 });
      this.reflection.everyNth = engine.quality.reflectionEvery ?? 1;
      this.reflection.hidden.add(this.casino.floor);
      applyFloorReflection(this.casino.floor.material, this.reflection, { strength: 0.9, blur: 5 });
      engine.onResize = (w, h) => this.reflection.setSize(w, h);
      engine.preRender = () => { if (this.mode !== 'idle') this.reflection.update(engine.camera); };
      this.reflection.setSize(engine.renderer.domElement.width, engine.renderer.domElement.height);
    }
    // Echte Spiegelung: die fertige Halle einmal als Cubemap aufnehmen und als Umgebung für Marmor/Gold/Chrom nutzen
    setTimeout(() => this.captureEnvironment(), 300);

    // Eingaben (nur im Modus 'walk' wirksam)
    const canvas = engine.renderer.domElement;
    this.canvas = canvas;
    this.dragging = false; this.dragMoved = 0; this.lastX = 0; this.lastY = 0;
    this.lookOffset = { yaw: 0, pitch: 0 }; // Umsehen im Sitzen
    canvas.addEventListener('pointerdown', (e) => {
      if (this.mode === 'idle' || e.button !== 0) return;
      this.dragging = true; this.dragMoved = 0; this.lastX = e.clientX; this.lastY = e.clientY;
      canvas.setPointerCapture?.(e.pointerId);
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
    });
    canvas.addEventListener('pointercancel', () => { this.dragging = false; });
    canvas.addEventListener('pointerup', (e) => {
      if (this.mode === 'idle') return;
      this.dragging = false;
      canvas.style.cursor = this.mode === 'walk' ? (this.hovered ? 'pointer' : 'grab') : '';
      if (this.mode === 'walk' && this.dragMoved < 6) { const hit = engine.pick(e, this.hitboxes, false)[0]; if (hit) this.enter(this.stationOf(hit.object)); }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.mode === 'idle') return;
      if (this.dragging) {
        const dx = e.clientX - this.lastX; const dy = e.clientY - this.lastY;
        this.dragMoved += Math.abs(dx) + Math.abs(dy);
        if (this.mode === 'walk') {
          this.me.yaw -= dx * 0.0042;
          this.me.pitch = Math.max(-1.1, Math.min(0.9, this.me.pitch - dy * 0.0032));
        } else {
          this.lookOffset.yaw = Math.max(-1.6, Math.min(1.6, this.lookOffset.yaw - dx * 0.0042));
          this.lookOffset.pitch = Math.max(-0.7, Math.min(0.6, this.lookOffset.pitch - dy * 0.0032));
        }
      }
      this.lastX = e.clientX; this.lastY = e.clientY;
      if (this.mode === 'walk') {
        const hit = engine.pick(e, this.hitboxes, false)[0];
        this.setHover(hit ? this.stationOf(hit.object) : null);
      }
    });
    canvas.addEventListener('pointerleave', () => { this.dragging = false; this.setHover(null); });
    // Mausrad: raus-/hereinzoomen (Blickwinkel). Über dem Spielpanel wird nicht gefangen, dort scrollt es normal.
    canvas.addEventListener('wheel', (e) => {
      if (this.mode === 'idle') return;
      e.preventDefault();
      this.zoom = Math.max(0.6, Math.min(2.2, this.zoom * Math.exp(e.deltaY * 0.0012)));
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (this.mode !== 'walk') return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'Enter') { this.emit('chatfocus'); e.preventDefault(); return; }
      if (e.key.toLowerCase() === 'e') {
        // E: erst Chip in Reichweite, sonst Tisch/Tafel
        const coin = this.nearestCoin(4.5);
        if (coin) { this.pickupCoin(coin); return; }
        if (this.nearStation) { this.enter(this.nearStation); return; }
      }
      this.keys.add(e.key.toLowerCase());
      if (['arrowup', 'arrowdown', ' '].includes(e.key.toLowerCase())) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());

    // Präsenz
    for (const p of rt.players.values()) this.ensureAvatar(p);
    this.assignSeats();
    this.rtOffs = [
      rt.on('join', (p) => this.ensureAvatar(p)),
      rt.on('leave', (p) => this.removeAvatar(p.id)),
      rt.on('welcome', () => { for (const id of [...this.avatars.keys()]) this.removeAvatar(id); for (const p of rt.players.values()) this.ensureAvatar(p); this.assignSeats(); }),
      rt.on('disconnect', () => { for (const id of [...this.avatars.keys()]) this.removeAvatar(id); }),
      rt.on('pos', (p) => { const a = this.ensureAvatar(p); if (a) { a.target.set(p.x, 0, p.z); a.ry = p.ry; a.anim = p.anim; } }),
      rt.on('game', () => { this.assignSeats(); }),
      rt.on('round', (r) => {
        const net = r.payout - r.bet;
        const a = this.avatars.get(r.id);
        const pos = a ? a.av.position.clone() : this.stationById(r.game)?.position.clone();
        if (pos) floatText(engine, pos, `${net >= 0 ? '+' : '−'}🪙 ${fmt(Math.abs(net))}`, net >= 0 ? '#7cf0ae' : '#ff8a7a');
        this.emit('ticker', { text: `${r.name} ${net >= 0 ? 'gewinnt' : 'verliert'} 🪙 ${fmt(Math.abs(net))} · ${gameName(r.game)}`, cls: net >= 0 ? 'win' : 'lose' });
      }),
      rt.on('chat', (m) => { const a = this.avatars.get(m.id); if (a) floatText(engine, a.av.position.clone(), `💬 ${m.text.slice(0, 40)}`, '#ffffff'); }),
      rt.on('mic', (m) => { const p = rt.players.get(m.id); const a = this.avatars.get(m.id); if (p && a) a.av.userData.label.userData.setText(`${p.name}${m.on ? ' 🎤' : ''}`); }),
      // Chips zum Einsammeln
      rt.on('welcome', (m) => { for (const id of [...this.coins.keys()]) this.removeCoin(id); for (const c of m.coins ?? []) this.addCoin(c); }),
      rt.on('coin', (m) => this.addCoin(m.coin)),
      rt.on('coin_taken', (m) => {
        const c = this.coins.get(m.id);
        if (c && m.by !== rt.me && m.value) floatText(engine, c.mesh.position.clone(), `${m.name} +🪙 ${fmt(m.value)}`, '#ffd76a');
        this.removeCoin(m.id, { fly: m.by === rt.me });
      }),
    ];
    this.coins = new Map();
    this.pendingPickup = new Set();
    for (const c of rt.coins ?? []) this.addCoin(c); // falls welcome vor dem Hallenaufbau kam

    this.hoverTime = 0;
    engine.onUpdate((dt, t) => this.update(dt, t));
    engine.start();
  }

  captureEnvironment() {
    if (!this.engine || this.engine.disposed) return;
    try {
      const { renderer, scene } = this.engine;
      const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
      const cam = new THREE.CubeCamera(0.2, 80, rt);
      cam.position.set(0, 2.2, 2);
      const hidden = [...this.avatars.values()].map((a) => a.av);
      hidden.forEach((o) => { o.visible = false; });
      cam.update(renderer, scene);
      hidden.forEach((o) => { o.visible = true; });
      const pmrem = new THREE.PMREMGenerator(renderer);
      const env = pmrem.fromCubemap(rt.texture).texture;
      scene.environment?.dispose?.();
      scene.environment = env;
      scene.environmentIntensity = 0.7;
      pmrem.dispose();
      rt.dispose();
    } catch (e) { console.warn('Environment-Capture', e); }
  }

  stationOf(hitbox) {
    if (hitbox.userData.coinId) { const c = this.coins.get(hitbox.userData.coinId); return c ? this.coinTarget(c) : null; }
    return this.casino.stations.find((s) => s.hitbox === hitbox) ?? this.casino.interactives.find((i) => i.hitbox === hitbox);
  }
  coinTarget(c) { return { id: `coin-${c.id}`, action: 'coin', coin: c, name: `Chip aufheben (🪙 ${Math.round(c.value / 100)})` }; }
  stationById(id) { return this.casino?.stations.find((s) => s.id === id); }

  enter(station) {
    if (!station) return;
    sound.play('click');
    if (station.action === 'rewards') { openRewards(); return; }
    if (station.action === 'coin') { this.pickupCoin(station.coin); return; }
    location.hash = `#/game/${station.id}`;
  }

  setHover(station) {
    if (this.hovered === station) return;
    this.hovered = station;
    if (this.canvas) this.canvas.style.cursor = this.mode === 'walk' ? (station ? 'pointer' : 'grab') : '';
    this.emit('hover', station);
  }

  /** Modus wechseln: 'walk' | 'spectate' (stationId) | 'idle' */
  setMode(mode, stationId = null) {
    this.ensure();
    this.mode = mode;
    this.spectateStation = mode === 'spectate' ? this.stationById(stationId) : null;
    if (mode !== 'spectate' || this.mySeatChoice?.station !== stationId) this.mySeatChoice = null;
    this.keys.clear();
    this.dragging = false;
    this.setHover(null);
    this.layer.classList.toggle('interactive', mode !== 'idle');
    document.body.classList.toggle('walk', mode === 'walk');
    document.body.classList.toggle('hall', mode !== 'idle');
    this.canvas.style.cursor = mode === 'walk' ? 'grab' : '';
    this.lookOffset = { yaw: 0, pitch: 0 };
    // Hinter Profilseiten (idle) sparsamer rendern; beim Laufen und Spielen volle Qualität
    this.engine.setPixelRatioCap(mode === 'idle' ? 1 : this.engine.quality.dpr);
    this.updateSpectateCam();
  }

  /**
   * Eigener Sitzplatz: beim Betreten einmal gewählt (erster freier Platz) und danach fest –
   * Mitspieler, die später kommen, bekommen die übrigen Plätze und verschieben mich nicht.
   */
  mySeat(st) {
    if (this.mySeatChoice?.station === st.id) return { seat: st.seats[this.mySeatChoice.index], index: this.mySeatChoice.index };
    const others = [...rt.players.values()].filter((p) => p.game === st.id && p.id !== rt.me).length;
    const index = others % st.seats.length;
    this.mySeatChoice = { station: st.id, index };
    return { seat: st.seats[index], index };
  }

  /** Kamera in Sitz-Augenhöhe auf dem eigenen Platz, Blick auf Tisch bzw. Bildschirm */
  updateSpectateCam() {
    const st = this.spectateStation;
    if (this.mode !== 'spectate' || !st) return;
    const { seat } = this.mySeat(st);
    const isTable = !this.mounted || st.mount?.type !== 'screen';
    const look = this.mounted?.lookAt?.clone() ?? st.position.clone().setY(0.95);
    // Richtung vom Blickziel (Tischfläche/Bildschirm) zum Platz – nicht vom Stationsmittelpunkt (Slot-Bank!)
    const dir = new THREE.Vector3(seat.x - look.x, 0, seat.z - look.z).normalize();
    const fov = this.mounted?.fov ?? 70;
    const custom = this.mounted && st.mount?.cam ? st.mount.cam(this.mounted.index) : null;
    if (custom) {
      // Station legt die Sitzkamera selbst fest (z. B. Roulette: Kessel und Tableau gemeinsam im Bild)
      this.spectateCam = { pos: custom.pos.clone(), look: custom.look.clone(), fov };
    } else if (seat.sit && isTable) {
      // Sitzend am Tisch: etwas zur Tischkante gelehnt, Blick nach unten auf die Platte
      this.spectateCam = { pos: new THREE.Vector3(seat.x - dir.x * 0.35, 1.4, seat.z - dir.z * 0.35), look: look.setY(st.mount?.lookY ?? 0.55), fov };
    } else {
      // Vor einem Bildschirm (Automat, Glücksrad): auf dem Platz bleiben, Bildschirm auf Augenhöhe anschauen
      this.spectateCam = { pos: new THREE.Vector3(seat.x, seat.sit ? 1.3 : EYE, seat.z), look, fov };
    }
  }

  /**
   * Im Spiel liegt rechts das Bedienpanel über der Halle: Blick so weit nach rechts drehen, dass die Spielszene
   * in der Mitte des sichtbaren Bühnenbereichs steht (Yaw-Korrektur in rad).
   */
  viewBias() {
    const stage = document.querySelector('.game-stage');
    const cw = this.canvas?.clientWidth || 1;
    const sw = stage?.clientWidth ?? cw;
    const offset = (cw - sw) / 2;
    if (offset <= 0) return 0;
    const cam = this.engine.camera;
    const halfW = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect;
    return Math.atan((halfW * offset) / (cw / 2));
  }

  /** Kamera vorübergehend auf ein Ziel richten (z. B. Kessel beim Drehen): pos/look in Weltkoordinaten, fov optional */
  setFocus({ pos = null, look = null, fov = null } = {}) { this.focus = { pos, look, fov }; }
  clearFocus() { this.focus = null; }

  /** Mausrad-Zoom auf einen Basis-Blickwinkel anwenden, auf sinnvolle Grenzen begrenzt */
  fovFor(base) { return Math.max(25, Math.min(105, base * this.zoom)); }

  /**
   * Spielszene direkt in die Halle einbauen (auf die Tischplatte bzw. in den Automaten).
   * Liefert die Wurzelgruppe und eine dispose()-Funktion.
   */
  mountGame(id) {
    this.ensure();
    const st = this.stationById(id);
    if (!st?.mount) return null;
    const m = st.mount;
    const { seat, index } = this.mySeat(st);
    const root = new THREE.Group();
    const hidden = [...(typeof m.hide === 'function' ? m.hide(index) : m.hide)];
    let lookAt;
    if (m.type === 'table') {
      // Spielfläche etwas zum eigenen Platz rücken, damit die eigenen Karten/Chips nah liegen
      const toSeat = new THREE.Vector3(seat.x - st.position.x, 0, seat.z - st.position.z).normalize().multiplyScalar(m.pull ?? 0.3);
      root.position.set(st.position.x + m.offset.x + toSeat.x, m.offset.y, st.position.z + m.offset.z + toSeat.z);
      root.rotation.y = seat.ry;
      lookAt = root.position.clone();
    } else if (m.type === 'fixed') {
      // Weltkoordinaten der Station: das Spiel arbeitet in Metern direkt auf dem Hallentisch
      root.position.copy(st.group.position).add(m.offset);
      root.rotation.copy(st.group.rotation);
      lookAt = root.position.clone().setY(0.95);
    } else {
      const obj = typeof m.object === 'function' ? m.object(index) : m.object;
      obj.updateWorldMatrix(true, false);
      const q = obj.getWorldQuaternion(new THREE.Quaternion());
      root.position.copy(obj.getWorldPosition(new THREE.Vector3())).add(m.offset.clone().applyQuaternion(q));
      root.quaternion.copy(q);
      if (m.rotX) root.rotateX(m.rotX);
      if (obj.isMesh) hidden.push(obj); // Bildschirm-Attrappe ausblenden
      lookAt = obj.getWorldPosition(new THREE.Vector3());
    }
    if (m.look) lookAt = m.look(index);
    root.scale.setScalar(m.scale);
    for (const o of hidden) o.visible = false;
    this.engine.scene.add(root);
    const extra = m.extra ? m.extra(index) : {};
    if (extra.wheel) extra.wheel.controlled = true;
    this.mounted = { root, lookAt, fov: m.fov ?? 70, station: st, index, extra };
    this.focus = null;
    this.updateSpectateCam();
    return {
      root, station: st, index, extra,
      dispose: () => {
        this.engine.scene.remove(root);
        for (const o of hidden) o.visible = true;
        if (extra.wheel) extra.wheel.controlled = false;
        if (this.mounted?.root === root) { this.mounted = null; this.focus = null; }
      },
    };
  }

  // ---------- Chips in der Halle ----------
  addCoin(c) {
    if (this.coins.has(c.id)) return;
    // Aufrecht stehender, langsam drehender Chip, der über dem Boden schwebt – mit Lichtsäule und Bodenring
    const mesh = new THREE.Group();
    const chip = createChip(c.value);
    chip.scale.setScalar(1.1);
    chip.rotation.x = Math.PI / 2;
    mesh.add(chip);
    mesh.position.set(c.x, 0.75, c.z);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 2.6, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.position.set(c.x, 1.3, c.z);
    const glow = textSprite(`🪙 ${Math.round(c.value / 100)} · aufheben`, { size: 44, color: '#ffd76a', bg: 'rgba(0,0,0,0.6)', height: 0.28 });
    glow.position.set(c.x, 1.5, c.z);
    glow.layers.set(1); beam.layers.set(1);
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.6, 32), new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2; halo.position.set(c.x, 0.02, c.z);
    // Großzügige Klickfläche (anklicken sammelt ebenfalls ein)
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.4, 12), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.position.set(c.x, 1.2, c.z);
    hit.userData.coinId = c.id;
    this.engine.scene.add(mesh, beam, glow, halo, hit);
    this.coins.set(c.id, { ...c, mesh, beam, glow, halo, hit, phase: Math.random() * 6 });
    this.hitboxes = [...this.baseHitboxes, ...[...this.coins.values()].map((k) => k.hit)];
  }
  removeCoin(id, { fly = false } = {}) {
    const c = this.coins.get(id);
    if (!c) return;
    this.coins.delete(id);
    this.pendingPickup.delete(id);
    this.hitboxes = [...this.baseHitboxes, ...[...this.coins.values()].map((k) => k.hit)];
    const dispose = () => {
      for (const o of [c.mesh, c.beam, c.glow, c.halo, c.hit]) {
        this.engine.scene.remove(o);
        if (o.isSprite) { o.material.map?.dispose(); o.material.dispose(); }
        else if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
      }
    };
    if (!fly) { dispose(); return; }
    // Chip fliegt zur Kamera und verschwindet
    for (const o of [c.beam, c.glow, c.halo, c.hit]) this.engine.scene.remove(o);
    const from = c.mesh.position.clone();
    this.engine.tween(450, (k) => {
      c.mesh.position.lerpVectors(from, this.engine.camera.position, k);
      c.mesh.scale.setScalar(1 - k * 0.8);
      c.mesh.rotation.y += 0.4;
    }).then(dispose);
  }
  /** Chip aufheben (Server prüft Entfernung, max. 6 m) */
  pickupCoin(c) {
    if (!c || this.pendingPickup.has(c.id) || !rt.connected) return;
    this.pendingPickup.add(c.id);
    rt.sendPos(this.me.pos.x, this.me.pos.z, this.me.yaw, this.me.moving ? 'walk' : 'idle'); // Server kennt die aktuelle Position
    rt.send({ t: 'pickup', id: c.id });
    sound.play('chip');
    setTimeout(() => this.pendingPickup.delete(c.id), 2500); // falls der Server ablehnt, erneut möglich
  }
  nearestCoin(maxDist) {
    let best = null; let bestD = maxDist;
    for (const c of this.coins.values()) {
      const d = Math.hypot(c.x - this.me.pos.x, c.z - this.me.pos.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  /** Weltposition eines Spielers (für Sprachchat-Entfernung) */
  positionOf(id) { return this.avatars.get(id)?.av.position ?? null; }
  myPosition() { return this.mode === 'spectate' && this.spectateCam ? this.spectateCam.pos : this.me.pos; }

  // ---------- Figuren ----------
  ensureAvatar(p) {
    if (p.id === rt.me) return null;
    let a = this.avatars.get(p.id);
    if (!a) {
      const av = createAvatar({ name: p.name, bot: p.bot });
      this.engine.scene.add(av);
      // Materialien der Figur (je Figur eigene Instanzen) für weiches Ausblenden vor der Sitzkamera
      const materials = new Map();
      av.traverse((o) => { if (o.material && !materials.has(o.material)) materials.set(o.material, o.material.depthWrite); });
      const label = av.userData.label;
      label.userData.baseScale = label.scale.clone();
      label.layers.set(1);
      a = { av, target: new THREE.Vector3(p.x, 0, p.z), ry: p.ry ?? 0, anim: p.anim, seat: null, materials: [...materials.entries()], opacity: 1 };
      av.position.copy(a.target);
      this.avatars.set(p.id, a);
    }
    return a;
  }
  removeAvatar(id) {
    const a = this.avatars.get(id);
    if (!a) return;
    this.engine.scene.remove(a.av);
    a.av.traverse((o) => { if (o.isSprite) { o.material.map?.dispose(); o.material.dispose(); } });
    this.avatars.delete(id);
  }
  assignSeats() {
    for (const s of this.casino.stations) {
      const here = [...rt.players.values()].filter((p) => p.game === s.id && p.id !== rt.me).sort((a, b) => a.id - b.id);
      // Meinen Platz an dieser Station für andere sperren
      const mine = this.mode === 'spectate' && this.mySeatChoice?.station === s.id ? this.mySeatChoice.index : -1;
      const free = s.seats.map((_, i) => i).filter((i) => i !== mine);
      const used = new Set(mine >= 0 ? [mine] : []);
      here.forEach((p, i) => { const a = this.ensureAvatar(p); const idx = free[i % free.length]; used.add(idx); if (a) a.seat = { ...s.seats[idx] }; });
      // Automaten mit Spieler drehen ihre Walzen von selbst
      s.machines?.forEach((mc, i) => { mc.userData.occupied = used.has(i) && i !== mine; });
    }
    for (const [id, a] of this.avatars) { const p = rt.players.get(id); if (!p?.game) a.seat = null; }
  }

  resolveCollisions(p) {
    p.x = Math.max(-HALL.w / 2 + 0.8, Math.min(HALL.w / 2 - 0.8, p.x));
    p.z = Math.max(-HALL.d / 2 + 0.8, Math.min(HALL.d / 2 - 0.8, p.z));
    // Stationen als gedrehte Rechtecke (Hitbox + Abstand), damit man nah an Tische und Automaten herankommt
    for (const s of this.casino.stations) {
      const hw = s.hit[0] / 2 + 0.45; const hd = s.hit[2] / 2 + 0.45;
      const c = Math.cos(s.rotY); const sn = Math.sin(s.rotY);
      const dx = p.x - s.position.x; const dz = p.z - s.position.z;
      const lx = dx * c - dz * sn; const lz = dx * sn + dz * c;
      if (Math.abs(lx) < hw && Math.abs(lz) < hd) {
        let nx = lx; let nz = lz;
        if (hw - Math.abs(lx) < hd - Math.abs(lz)) nx = (lx < 0 ? -1 : 1) * hw; else nz = (lz < 0 ? -1 : 1) * hd;
        p.x = s.position.x + nx * c + nz * sn; p.z = s.position.z - nx * sn + nz * c;
      }
    }
    if (p.z < -10.6 && p.x < -8.2 && p.x > -17.8) p.z = -10.6;
  }

  update(dt, t) {
    const { engine, me, keys } = this;
    for (const fn of this.casino.animated) fn(dt, t);
    if ((this.frame++ % 2) === 0) engine.renderer.shadowMap.needsUpdate = true;

    if (this.mode === 'walk') {
      const walkFov = this.fovFor(70);
      if (Math.abs(engine.camera.fov - walkFov) > 0.05) { engine.camera.fov += (walkFov - engine.camera.fov) * Math.min(1, dt * 4); engine.camera.updateProjectionMatrix(); }
      const speed = (keys.has('shift') ? 5.5 : 3.2) * dt;
      const fwd = new THREE.Vector3(-Math.sin(me.yaw), 0, -Math.cos(me.yaw));
      const right = new THREE.Vector3(Math.cos(me.yaw), 0, -Math.sin(me.yaw));
      const mv = new THREE.Vector3();
      if (keys.has('w') || keys.has('arrowup')) mv.add(fwd);
      if (keys.has('s') || keys.has('arrowdown')) mv.sub(fwd);
      if (keys.has('d') || keys.has('arrowright')) mv.add(right);
      if (keys.has('a') || keys.has('arrowleft')) mv.sub(right);
      if (keys.has('q')) me.yaw += dt * 1.8;
      if (keys.has('e') && !this.nearStation) me.yaw -= dt * 1.8;
      me.moving = mv.lengthSq() > 0;
      if (me.moving) { mv.normalize().multiplyScalar(speed); me.pos.add(mv); this.resolveCollisions(me.pos); }
      const bob = me.moving ? Math.sin(t * 9) * 0.035 : 0;
      engine.camera.position.set(me.pos.x, EYE + bob, me.pos.z);
      engine.camera.lookAt(me.pos.x - Math.sin(me.yaw) * Math.cos(me.pitch), EYE + bob + Math.sin(me.pitch), me.pos.z - Math.cos(me.yaw) * Math.cos(me.pitch));
      // Position senden (10 Hz, nur bei Änderung)
      const now = performance.now();
      const state = `${me.pos.x.toFixed(2)}|${me.pos.z.toFixed(2)}|${me.yaw.toFixed(2)}|${me.moving}`;
      if (now - (this.lastSent ?? 0) > 100 && state !== this.lastSentState && rt.connected) { this.lastSent = now; this.lastSentState = state; rt.sendPos(me.pos.x, me.pos.z, me.yaw, me.moving ? 'walk' : 'idle'); }
      // Nächste Station
      let best = null; let bestD = 3.2;
      for (const s of this.casino.stations) {
        const d = Math.hypot(s.position.x - me.pos.x, s.position.z - me.pos.z) - s.radius;
        if (d < bestD) { bestD = d; best = s; }
      }
      for (const i of this.casino.interactives) {
        const d = Math.hypot(i.position.x - me.pos.x, i.position.z - me.pos.z) - 1.0;
        if (d < bestD) { bestD = d; best = i; }
      }
      // Chips: drüberlaufen (2,2 m) sammelt automatisch ein; im Umkreis von 4,5 m hat der Chip Vorrang beim E-Prompt
      const coin = this.nearestCoin(4.5);
      if (coin) {
        const d = Math.hypot(coin.x - me.pos.x, coin.z - me.pos.z);
        if (d < 2.2) this.pickupCoin(coin);
        best = this.coinTarget(coin);
      }
      if ((best?.id ?? null) !== (this.nearStation?.id ?? null)) { this.nearStation = best; this.emit('near', best); }
    } else if (this.mode === 'spectate' && this.spectateCam) {
      // Sitzend am Tisch: Kamera auf dem eigenen Platz, leichtes Atmen; Maus-Drag zum Umsehen; optionaler Fokus (z. B. Kessel)
      const c = this.spectateCam;
      const f = this.focus;
      const basePos = f?.pos ?? c.pos; const baseLook = f?.look ?? c.look;
      const target = basePos.clone();
      target.y += Math.sin(t * 1.4) * 0.012;
      engine.camera.position.lerp(target, Math.min(1, dt * 2.5));
      const wantFov = this.fovFor(f?.fov ?? c.fov ?? 70);
      if (Math.abs(engine.camera.fov - wantFov) > 0.05) { engine.camera.fov += (wantFov - engine.camera.fov) * Math.min(1, dt * 3); engine.camera.updateProjectionMatrix(); }
      const d = baseLook.clone().sub(basePos);
      const baseYaw = Math.atan2(-d.x, -d.z);
      const basePitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
      const yaw = baseYaw + this.lookOffset.yaw - this.viewBias(); const pitch = basePitch + this.lookOffset.pitch;
      engine.camera.lookAt(
        engine.camera.position.x - Math.sin(yaw) * Math.cos(pitch),
        engine.camera.position.y + Math.sin(pitch),
        engine.camera.position.z - Math.cos(yaw) * Math.cos(pitch),
      );
    }
    if ((this.frame % 10) === 0) voice.updateVolumes((id) => this.positionOf(id), this.myPosition());

    for (const c of this.coins.values()) {
      c.mesh.rotation.y += dt * 2.2;
      c.mesh.position.y = 0.75 + Math.sin(t * 2.5 + c.phase) * 0.1;
      c.halo.material.opacity = 0.35 + Math.sin(t * 3 + c.phase) * 0.15;
      c.beam.material.opacity = 0.12 + Math.sin(t * 2 + c.phase) * 0.05;
    }
    this.hoverTime += dt;
    for (const s of this.casino.stations) {
      const active = this.mode === 'walk' && (s === this.hovered || s === this.nearStation);
      s.ring.material.opacity += ((active ? 0.6 + Math.sin(this.hoverTime * 5) * 0.25 : 0) - s.ring.material.opacity) * 0.15;
      // Schwebende Beschriftungen nur in der Nähe bzw. bei Hover – aus der Ferne stört nichts den Raumeindruck
      const dist = s.label.position.distanceTo(engine.camera.position);
      const want = this.mode !== 'walk' ? 0 : active ? 1 : Math.max(0, Math.min(1, (13 - dist) / 6)) * 0.85;
      const m = s.label.material;
      if (Math.abs(m.opacity - want) > 0.004) { m.opacity += (want - m.opacity) * Math.min(1, dt * 5); s.label.visible = m.opacity > 0.01; }
    }
    // Croupier-Namen genauso: sie blendeten bisher gar nicht aus und schwebten quer durch die Halle vor
    // Wänden und Neonschriftzügen. Engerer Radius als bei den Stationen – der Name zählt erst am Tisch.
    for (const label of this.casino.dealerLabels) {
      const dist = label.getWorldPosition(LABEL_POS).distanceTo(engine.camera.position);
      const want = Math.max(0, Math.min(1, (7 - dist) / 3)) * 0.9;
      const m = label.material;
      if (Math.abs(m.opacity - want) > 0.004) { m.opacity += (want - m.opacity) * Math.min(1, dt * 5); label.visible = m.opacity > 0.01; }
    }
    // Kollision mit den Info-Tafeln
    if (this.mode === 'walk') {
      for (const i of this.casino.interactives) {
        const dx = me.pos.x - i.position.x; const dz = me.pos.z - i.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 1.1 && dist > 0.001) { me.pos.x = i.position.x + (dx / dist) * 1.1; me.pos.z = i.position.z + (dz / dist) * 1.1; }
      }
    }

    const camPos = engine.camera.position;
    // Blickachse im Sitzen: Figuren, die nah davor stehen (Nachbarn, Croupier), werden durchsichtig
    const lookDir = this.mode === 'spectate' && this.spectateCam ? (this.focus?.look ?? this.spectateCam.look).clone().sub(camPos).normalize() : null;
    const toAv = new THREE.Vector3();
    for (const [id, a] of this.avatars) {
      const p = rt.players.get(id);
      if (!p) continue;
      // Figuren in der Nähe schauen den Betrachter an; wer direkt vor der Sitzkamera steht, wird ausgeblendet
      const dist = a.av.position.distanceTo(camPos);
      const near = dist < 4.5;
      a.av.userData.lookAt(near ? camPos : null);
      a.av.visible = !(this.mode === 'spectate' && dist < 0.9);
      let wantOpacity = 1;
      if (lookDir) {
        toAv.copy(a.av.position).setY(a.av.position.y + 1.2).sub(camPos);
        const d = toAv.length();
        const cosA = toAv.normalize().dot(lookDir);
        // Näher als 3,4 m und innerhalb ≈ 45° um die Blickachse: je zentraler, desto durchsichtiger (bis 14 %)
        if (d < 3.4 && cosA > 0.7) wantOpacity = 1 - 0.86 * Math.min(1, (cosA - 0.7) / 0.18);
      }
      if (Math.abs(a.opacity - wantOpacity) > 0.005) {
        a.opacity += (wantOpacity - a.opacity) * Math.min(1, dt * 6);
        const tr = a.opacity < 0.995;
        for (const [m, dw] of a.materials) { m.transparent = tr || m.isSpriteMaterial; m.opacity = a.opacity; m.depthWrite = tr ? false : dw; }
      }
      // Namensschild: aus der Nähe kleiner, damit es nicht das halbe Bild füllt
      const label = a.av.userData.label;
      const base = label.userData.baseScale;
      if (base) { const f = Math.max(0.4, Math.min(1, dist / 5)); label.scale.set(base.x * f, base.y * f, 1); }
      if (a.seat) {
        a.av.position.lerp(new THREE.Vector3(a.seat.x, 0, a.seat.z), 0.2);
        a.av.rotation.y += (a.seat.ry - a.av.rotation.y) * 0.2;
        a.av.userData.setPose(a.seat.sit ? 'sit' : 'idle');
        a.av.userData.step(dt, false);
      } else {
        a.av.userData.setPose('idle');
        const before = a.av.position.clone();
        a.av.position.lerp(a.target, Math.min(1, dt * 8));
        const moved = before.distanceTo(a.av.position) > 0.002;
        let dr = a.ry - a.av.rotation.y;
        dr = Math.atan2(Math.sin(dr), Math.cos(dr));
        a.av.rotation.y += dr * Math.min(1, dt * 10);
        a.av.userData.step(dt, moved || a.anim === 'walk');
      }
    }
  }

  /** Halle komplett neu aufbauen (z. B. nach Qualitätswechsel) */
  rebuild() {
    if (!this.engine) return;
    const mode = this.mode; const st = this.spectateStation?.id ?? null;
    this.rtOffs?.forEach((f) => f());
    this.engine.dispose();
    this.layer.remove();
    this.engine = null;
    this.avatars.clear();
    this.setMode(mode, st);
  }
}

export const hall = new Hall();
