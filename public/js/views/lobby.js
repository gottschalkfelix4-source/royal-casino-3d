import { Engine, THREE } from '../three/engine.js';
import { buildCasino, HALL } from '../three/casino.js';
import { createAvatar, floatText } from '../three/avatars.js';
import { GAMES } from '../games/registry.js';
import { store, subscribe } from '../state.js';
import { h, fmt } from '../ui.js';
import { sound } from '../sound.js';
import { rt } from '../realtime.js';
import { chatWidget } from '../chat.js';

const EYE = 1.62;
const gameName = (id) => GAMES.find((g) => g.id === id)?.name ?? id;

/**
 * Lobby: begehbare Casino-Halle (WASD/Pfeile + Maus), andere Spieler als Figuren mit Namen,
 * Tische/Automaten per Klick oder E betreten, Chat und Live-Ticker.
 */
export function renderLobby(root, { openAuth }) {
  root.innerHTML = '';
  root.className = 'view';
  const stage = h('div.lobby-stage');

  // ---------- HTML-Overlay ----------
  const welcome = h('div.lobby-welcome');
  const online = h('span.online-badge', {}, '● 0 online');
  const renderWelcome = (u) => {
    welcome.replaceChildren(...[
      h('div.lobby-title', {}, 'ROYAL CASINO'),
      h('div.lobby-sub', {}, u ? `${u.username} · 🪙 ${fmt(u.balance)} · ` : 'Zwölf Spiele · Virtuelles Spielgeld · ', online),
      u ? null : h('div.row', { style: { marginTop: '10px' } },
        h('button.btn.btn-gold', { onclick: () => openAuth('register') }, '🎁 Registrieren'),
        h('button.btn', { onclick: () => openAuth('login') }, 'Anmelden'),
      ),
    ].filter(Boolean));
  };
  renderWelcome(store.user);
  const unsubscribe = subscribe((s) => renderWelcome(s.user));

  const hint = h('div.lobby-hint', {}, h('span.kbd', {}, 'W A S D'), ' laufen · Maus ziehen: umsehen · ', h('span.kbd', {}, 'E'), ' / Klick: spielen · ', h('span.kbd', {}, 'Enter'), ' Chat');
  const prompt = h('div.lobby-prompt');
  const ticker = h('div.lobby-ticker');
  const crosshair = h('div.crosshair');
  const strip = h('div.lobby-strip', {}, GAMES.map((g) =>
    h('a.strip-item', { href: `#/game/${g.id}`, title: g.name, dataset: { id: g.id }, onmouseenter: () => highlightById(g.id), onmouseleave: () => highlightById(null) },
      h('span.strip-icon', {}, g.icon), h('span.strip-name', {}, g.name),
      store.activeGames.includes(g.id) ? h('span.strip-live', {}, '●') : null)
  ));
  const chat = store.user ? chatWidget({ compact: true }) : null;
  const chatBox = h('div.lobby-chat', {}, chat ? chat.el : h('div.panel-note', { style: { padding: '10px' } }, 'Melde dich an, um mit anderen zu chatten.'));
  const lobby = h('div.lobby', {}, stage, welcome, hint, prompt, ticker, crosshair, chatBox, strip);
  root.append(lobby);

  // ---------- 3D ----------
  const engine = new Engine(stage, {
    fov: 70, position: [0, EYE, 12], target: [0, EYE, 0], background: 0x05040a,
    shadows: true, exposure: 1.05, envIntensity: 0.35,
    bloom: { strength: 0.4, radius: 0.5, threshold: 0.86 },
  });
  engine.scene.fog = new THREE.FogExp2(0x0a0610, 0.024);
  engine.scene.add(new THREE.HemisphereLight(0xffe0c0, 0x2a0a10, 0.4));
  const key = new THREE.SpotLight(0xffe6c4, 900, 0, 0.9, 0.7, 2);
  key.position.set(0, 6.2, 2);
  key.target.position.set(0, 0, 0);
  key.castShadow = engine.quality.shadows;
  key.shadow.mapSize.set(engine.quality.shadowMap, engine.quality.shadowMap);
  key.shadow.bias = -0.0004;
  engine.scene.add(key, key.target);
  for (const [x, z, c] of [[-14, -6, 0xffb070], [14, -6, 0xc59bff], [-14, 8, 0xffd76a], [14, 8, 0x4d9cff], [0, -11, 0xff2d6f]]) {
    const s = new THREE.SpotLight(c, 350, 0, 1.0, 0.8, 2);
    s.position.set(x, 6.2, z);
    s.target.position.set(x, 0, z);
    engine.scene.add(s, s.target);
  }
  const casino = buildCasino(engine);
  const hitboxes = casino.stations.map((s) => s.hitbox);
  const stationById = (id) => casino.stations.find((s) => s.id === id);

  // ---------- Spieler (Ich) ----------
  const me = { pos: new THREE.Vector3((Math.random() - 0.5) * 2, 0, 12.5), yaw: 0, pitch: -0.05, moving: false };
  const keys = new Set();
  let dragging = false; let dragMoved = 0; let lastX = 0; let lastY = 0;
  let hovered = null; let nearStation = null;
  let lastSent = 0; let lastSentState = '';

  const canvas = engine.renderer.domElement;
  const onKeyDown = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Enter' && chat) { chat.el.querySelector('input')?.focus(); e.preventDefault(); return; }
    if (e.key.toLowerCase() === 'e' && nearStation) { enter(nearStation); return; }
    keys.add(e.key.toLowerCase());
    if ([' ', 'arrowup', 'arrowdown'].includes(e.key.toLowerCase())) e.preventDefault();
  };
  const onKeyUp = (e) => keys.delete(e.key.toLowerCase());
  const onDown = (e) => { dragging = true; dragMoved = 0; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture?.(e.pointerId); };
  const onUp = (e) => {
    dragging = false;
    if (dragMoved < 6) {
      const hit = engine.pick(e, hitboxes, false)[0];
      if (hit) enter(casino.stations.find((s) => s.hitbox === hit.object));
    }
  };
  const onMove = (e) => {
    if (dragging) {
      const dx = e.clientX - lastX; const dy = e.clientY - lastY;
      dragMoved += Math.abs(dx) + Math.abs(dy);
      me.yaw -= dx * 0.0042;
      me.pitch = Math.max(-1.1, Math.min(0.9, me.pitch - dy * 0.0032));
    }
    lastX = e.clientX; lastY = e.clientY;
    const hit = engine.pick(e, hitboxes, false)[0];
    setHover(hit ? casino.stations.find((s) => s.hitbox === hit.object) : null);
  };
  const enter = (station) => {
    if (!station) return;
    sound.play('click');
    location.hash = `#/game/${station.id}`;
  };
  const setHover = (station) => {
    if (hovered === station) return;
    hovered = station;
    canvas.style.cursor = station ? 'pointer' : 'grab';
    strip.querySelectorAll('.strip-item').forEach((el) => el.classList.toggle('active', el.dataset.id === station?.id));
  };
  const highlightById = (id) => setHover(stationById(id) ?? null);
  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', () => { dragging = false; setHover(null); });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // Kollision: Hallenwände + Stationen (als Kreise)
  const resolveCollisions = (p) => {
    p.x = Math.max(-HALL.w / 2 + 0.8, Math.min(HALL.w / 2 - 0.8, p.x));
    p.z = Math.max(-HALL.d / 2 + 0.8, Math.min(HALL.d / 2 - 0.8, p.z));
    for (const s of casino.stations) {
      const r = s.radius + 0.55;
      const dx = p.x - s.position.x; const dz = p.z - s.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < r && dist > 0.001) { p.x = s.position.x + (dx / dist) * r; p.z = s.position.z + (dz / dist) * r; }
    }
    // Bar
    if (p.z < -10.6 && p.x < -8.2 && p.x > -17.8) p.z = -10.6;
  };

  // ---------- Andere Spieler ----------
  const avatars = new Map(); // id -> { av, target: Vector3, ry, anim, game }
  const ensureAvatar = (p) => {
    if (p.id === rt.me) return null;
    let a = avatars.get(p.id);
    if (!a) {
      const av = createAvatar({ name: p.name, bot: p.bot });
      engine.scene.add(av);
      a = { av, target: new THREE.Vector3(p.x, 0, p.z), ry: p.ry ?? 0, anim: p.anim, game: p.game, seat: null };
      av.position.copy(a.target);
      avatars.set(p.id, a);
    }
    return a;
  };
  const removeAvatar = (id) => {
    const a = avatars.get(id);
    if (!a) return;
    engine.scene.remove(a.av);
    a.av.traverse((o) => { o.material?.map?.dispose?.(); if (o.isSprite) o.material.dispose(); });
    avatars.delete(id);
  };
  const assignSeats = () => {
    for (const s of casino.stations) {
      const here = [...rt.players.values()].filter((p) => p.game === s.id && p.id !== rt.me).sort((a, b) => a.id - b.id);
      here.forEach((p, i) => { const a = ensureAvatar(p); if (a) a.seat = { ...s.seats[i % s.seats.length], station: s }; });
    }
    for (const [id, a] of avatars) { const p = rt.players.get(id); if (!p?.game) a.seat = null; }
  };
  for (const p of rt.players.values()) ensureAvatar(p);
  assignSeats();
  const offs = [
    rt.on('join', (p) => { ensureAvatar(p); updateOnline(); }),
    rt.on('leave', (p) => { removeAvatar(p.id); updateOnline(); }),
    rt.on('welcome', () => { for (const id of [...avatars.keys()]) removeAvatar(id); for (const p of rt.players.values()) ensureAvatar(p); assignSeats(); updateOnline(); }),
    rt.on('pos', (p) => { const a = ensureAvatar(p); if (a) { a.target.set(p.x, 0, p.z); a.ry = p.ry; a.anim = p.anim; } }),
    rt.on('game', () => assignSeats()),
    rt.on('round', (r) => {
      const net = r.payout - r.bet;
      const st = stationById(r.game);
      const text = `${r.name} ${net >= 0 ? 'gewinnt' : 'verliert'} 🪙 ${fmt(Math.abs(net))} · ${gameName(r.game)}`;
      pushTicker(text, net >= 0 ? 'win' : 'lose');
      const a = avatars.get(r.id);
      const pos = a ? a.av.position.clone() : st?.position.clone();
      if (pos) floatText(engine, pos, `${net >= 0 ? '+' : '−'}🪙 ${fmt(Math.abs(net))}`, net >= 0 ? '#7cf0ae' : '#ff8a7a');
    }),
    rt.on('chat', (m) => { const a = avatars.get(m.id); if (a) floatText(engine, a.av.position.clone(), `💬 ${m.text.slice(0, 40)}`, '#ffffff'); }),
  ];
  const updateOnline = () => { online.textContent = `● ${[...rt.players.values()].filter((p) => !p.bot).length || (store.user ? 1 : 0)} online`; };
  updateOnline();
  const pushTicker = (text, cls) => {
    ticker.prepend(h('div.ticker-item', { class: `ticker-item ${cls}` }, text));
    while (ticker.children.length > 4) ticker.lastChild.remove();
    setTimeout(() => ticker.lastChild?.classList.add('fade'), 7000);
  };

  // ---------- Frame ----------
  const fwd = new THREE.Vector3(); const right = new THREE.Vector3(); const look = new THREE.Vector3();
  let hoverTime = 0;
  engine.onUpdate((dt, t) => {
    for (const fn of casino.animated) fn(dt, t);
    // Bewegung
    const speed = (keys.has('shift') ? 5.5 : 3.2) * dt;
    fwd.set(-Math.sin(me.yaw), 0, -Math.cos(me.yaw));
    right.set(Math.cos(me.yaw), 0, -Math.sin(me.yaw));
    const mv = new THREE.Vector3();
    if (keys.has('w') || keys.has('arrowup')) mv.add(fwd);
    if (keys.has('s') || keys.has('arrowdown')) mv.sub(fwd);
    if (keys.has('d') || keys.has('arrowright')) mv.add(right);
    if (keys.has('a') || keys.has('arrowleft')) mv.sub(right);
    if (keys.has('q')) me.yaw += dt * 1.8;
    if (keys.has('e') && !nearStation) me.yaw -= dt * 1.8;
    me.moving = mv.lengthSq() > 0;
    if (me.moving) { mv.normalize().multiplyScalar(speed); me.pos.add(mv); resolveCollisions(me.pos); }
    const bob = me.moving ? Math.sin(t * 9) * 0.035 : 0;
    engine.camera.position.set(me.pos.x, EYE + bob, me.pos.z);
    look.set(me.pos.x - Math.sin(me.yaw) * Math.cos(me.pitch), EYE + bob + Math.sin(me.pitch), me.pos.z - Math.cos(me.yaw) * Math.cos(me.pitch));
    engine.camera.lookAt(look);
    // Position senden (10 Hz, nur bei Änderung)
    const now = performance.now();
    const state = `${me.pos.x.toFixed(2)}|${me.pos.z.toFixed(2)}|${me.yaw.toFixed(2)}|${me.moving}`;
    if (now - lastSent > 100 && state !== lastSentState && rt.connected) { lastSent = now; lastSentState = state; rt.sendPos(me.pos.x, me.pos.z, me.yaw, me.moving ? 'walk' : 'idle'); }
    // Nächste Station
    let best = null; let bestD = 3.2;
    for (const s of casino.stations) {
      const d = Math.hypot(s.position.x - me.pos.x, s.position.z - me.pos.z) - s.radius;
      if (d < bestD) { bestD = d; best = s; }
    }
    if (best !== nearStation) {
      nearStation = best;
      prompt.classList.toggle('show', !!best);
      if (best) prompt.replaceChildren(h('span.kbd', {}, 'E'), ` ${best.name} spielen`, h('span.prompt-sub', {}, `${rt.playersAt(best.id).length} Mitspieler am Tisch`));
    }
    // Hover-Ringe
    hoverTime += dt;
    for (const s of casino.stations) {
      const active = s === hovered || s === nearStation;
      s.ring.material.opacity += ((active ? 0.6 + Math.sin(hoverTime * 5) * 0.25 : 0) - s.ring.material.opacity) * 0.15;
    }
    // Andere Figuren
    for (const [id, a] of avatars) {
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
  });
  engine.start();

  return {
    destroy() {
      unsubscribe();
      offs.forEach((f) => f());
      chat?.destroy();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      engine.dispose();
    },
  };
}
