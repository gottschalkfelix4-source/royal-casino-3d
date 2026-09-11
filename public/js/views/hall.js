import { Engine, THREE } from '../three/engine.js';
import { buildCasino, HALL } from '../three/casino.js';
import { createAvatar, floatText } from '../three/avatars.js';
import { GAMES } from '../games/registry.js';
import { fmt } from '../ui.js';
import { sound } from '../sound.js';
import { rt } from '../realtime.js';

const EYE = 1.62;
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
      shadows: true, exposure: 1.05, envIntensity: 0.35,
      bloom: { strength: 0.4, radius: 0.5, threshold: 0.86 },
    });
    this.engine = engine;
    engine.scene.fog = new THREE.FogExp2(0x0a0610, 0.024);
    engine.scene.add(new THREE.HemisphereLight(0xffe0c0, 0x2a0a10, 0.4));
    const key = new THREE.SpotLight(0xffe6c4, 900, 0, 0.9, 0.7, 2);
    key.position.set(0, 6.2, 2);
    key.target.position.set(0, 0, 0);
    key.castShadow = engine.quality.shadows;
    key.shadow.mapSize.set(engine.quality.shadowMap, engine.quality.shadowMap);
    key.shadow.bias = -0.0004;
    engine.scene.add(key, key.target);
    // Wenige Akzentlichter: jedes Licht kostet in jedem Pixel Rechenzeit
    for (const [x, z, c] of [[-14, 0, 0xffb070], [14, 0, 0xc59bff], [0, -11, 0xff2d6f]]) {
      const s = new THREE.SpotLight(c, 380, 0, 1.0, 0.8, 2);
      s.position.set(x, 6.2, z);
      s.target.position.set(x, 0, z);
      engine.scene.add(s, s.target);
    }
    // Schatten der Halle nur alle 3 Frames neu berechnen (Figuren bewegen sich langsam genug)
    engine.renderer.shadowMap.autoUpdate = false;
    engine.renderer.shadowMap.needsUpdate = true;
    this.frame = 0;
    this.casino = buildCasino(engine);
    this.hitboxes = this.casino.stations.map((s) => s.hitbox);

    // Eingaben (nur im Modus 'walk' wirksam)
    const canvas = engine.renderer.domElement;
    this.canvas = canvas;
    this.dragging = false; this.dragMoved = 0; this.lastX = 0; this.lastY = 0;
    canvas.addEventListener('pointerdown', (e) => { if (this.mode !== 'walk') return; this.dragging = true; this.dragMoved = 0; this.lastX = e.clientX; this.lastY = e.clientY; canvas.setPointerCapture?.(e.pointerId); });
    canvas.addEventListener('pointerup', (e) => {
      if (this.mode !== 'walk') return;
      this.dragging = false;
      if (this.dragMoved < 6) { const hit = engine.pick(e, this.hitboxes, false)[0]; if (hit) this.enter(this.stationOf(hit.object)); }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.mode !== 'walk') return;
      if (this.dragging) {
        const dx = e.clientX - this.lastX; const dy = e.clientY - this.lastY;
        this.dragMoved += Math.abs(dx) + Math.abs(dy);
        this.me.yaw -= dx * 0.0042;
        this.me.pitch = Math.max(-1.1, Math.min(0.9, this.me.pitch - dy * 0.0032));
      }
      this.lastX = e.clientX; this.lastY = e.clientY;
      const hit = engine.pick(e, this.hitboxes, false)[0];
      this.setHover(hit ? this.stationOf(hit.object) : null);
    });
    canvas.addEventListener('pointerleave', () => { this.dragging = false; this.setHover(null); });
    window.addEventListener('keydown', (e) => {
      if (this.mode !== 'walk') return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'Enter') { this.emit('chatfocus'); e.preventDefault(); return; }
      if (e.key.toLowerCase() === 'e' && this.nearStation) { this.enter(this.nearStation); return; }
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
      rt.on('game', () => this.assignSeats()),
      rt.on('round', (r) => {
        const net = r.payout - r.bet;
        const a = this.avatars.get(r.id);
        const pos = a ? a.av.position.clone() : this.stationById(r.game)?.position.clone();
        if (pos) floatText(engine, pos, `${net >= 0 ? '+' : '−'}🪙 ${fmt(Math.abs(net))}`, net >= 0 ? '#7cf0ae' : '#ff8a7a');
        this.emit('ticker', { text: `${r.name} ${net >= 0 ? 'gewinnt' : 'verliert'} 🪙 ${fmt(Math.abs(net))} · ${gameName(r.game)}`, cls: net >= 0 ? 'win' : 'lose' });
      }),
      rt.on('chat', (m) => { const a = this.avatars.get(m.id); if (a) floatText(engine, a.av.position.clone(), `💬 ${m.text.slice(0, 40)}`, '#ffffff'); }),
    ];

    this.hoverTime = 0;
    engine.onUpdate((dt, t) => this.update(dt, t));
    engine.start();
  }

  stationOf(hitbox) { return this.casino.stations.find((s) => s.hitbox === hitbox); }
  stationById(id) { return this.casino?.stations.find((s) => s.id === id); }

  enter(station) {
    if (!station) return;
    sound.play('click');
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
    this.keys.clear();
    this.dragging = false;
    this.setHover(null);
    this.layer.classList.toggle('interactive', mode === 'walk');
    this.canvas.style.cursor = mode === 'walk' ? 'grab' : '';
    // Im Hintergrund sparsamer rendern
    // Bloom + große Halle: Pixeldichte in der Lobby auf 1,5 begrenzen, im Hintergrund auf 1
    this.engine.setPixelRatioCap(mode === 'walk' ? 1.5 : 1);
    if (mode === 'spectate' && this.spectateStation) {
      const st = this.spectateStation;
      // Kamera an einen freien Platz, leicht zurück und über Augenhöhe
      const seat = st.seats[0];
      const dir = new THREE.Vector3(seat.x - st.position.x, 0, seat.z - st.position.z).normalize();
      this.spectateCam = { pos: new THREE.Vector3(seat.x + dir.x * 1.4, EYE + 0.25, seat.z + dir.z * 1.4), look: st.position.clone().setY(1.0) };
    }
  }

  // ---------- Figuren ----------
  ensureAvatar(p) {
    if (p.id === rt.me) return null;
    let a = this.avatars.get(p.id);
    if (!a) {
      const av = createAvatar({ name: p.name, bot: p.bot });
      this.engine.scene.add(av);
      a = { av, target: new THREE.Vector3(p.x, 0, p.z), ry: p.ry ?? 0, anim: p.anim, seat: null };
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
      here.forEach((p, i) => { const a = this.ensureAvatar(p); if (a) a.seat = { ...s.seats[i % s.seats.length] }; });
    }
    for (const [id, a] of this.avatars) { const p = rt.players.get(id); if (!p?.game) a.seat = null; }
  }

  resolveCollisions(p) {
    p.x = Math.max(-HALL.w / 2 + 0.8, Math.min(HALL.w / 2 - 0.8, p.x));
    p.z = Math.max(-HALL.d / 2 + 0.8, Math.min(HALL.d / 2 - 0.8, p.z));
    for (const s of this.casino.stations) {
      const r = s.radius + 0.55;
      const dx = p.x - s.position.x; const dz = p.z - s.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < r && dist > 0.001) { p.x = s.position.x + (dx / dist) * r; p.z = s.position.z + (dz / dist) * r; }
    }
    if (p.z < -10.6 && p.x < -8.2 && p.x > -17.8) p.z = -10.6;
  }

  update(dt, t) {
    const { engine, me, keys } = this;
    for (const fn of this.casino.animated) fn(dt, t);
    if ((this.frame++ % 3) === 0) engine.renderer.shadowMap.needsUpdate = true;

    if (this.mode === 'walk') {
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
      if (best !== this.nearStation) { this.nearStation = best; this.emit('near', best); }
    } else if (this.mode === 'spectate' && this.spectateCam) {
      // Kamera sanft zum Tisch, leichtes Schwenken
      const c = this.spectateCam;
      engine.camera.position.lerp(c.pos, Math.min(1, dt * 2));
      const look = c.look.clone();
      look.x += Math.sin(t * 0.3) * 0.6;
      engine.camera.lookAt(look);
    }

    this.hoverTime += dt;
    for (const s of this.casino.stations) {
      const active = this.mode === 'walk' && (s === this.hovered || s === this.nearStation);
      s.ring.material.opacity += ((active ? 0.6 + Math.sin(this.hoverTime * 5) * 0.25 : 0) - s.ring.material.opacity) * 0.15;
    }

    for (const [id, a] of this.avatars) {
      const p = rt.players.get(id);
      if (!p) continue;
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
