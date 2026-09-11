import { Engine, THREE } from '../three/engine.js';
import { buildCasino } from '../three/casino.js';
import { GAMES } from '../games/registry.js';
import { store, subscribe } from '../state.js';
import { h, fmt } from '../ui.js';
import { sound } from '../sound.js';

/**
 * Lobby: begehbare 3D-Casino-Halle. Die Kamera schwebt auf einem Rundweg durch die Halle,
 * Tische und Automaten sind anklickbar und führen direkt ins Spiel.
 */
export function renderLobby(root, { openAuth }) {
  root.innerHTML = '';
  root.className = 'view';
  const stage = h('div.lobby-stage');
  const user = store.user;

  // ---------- HTML-Overlay ----------
  const welcome = h('div.lobby-welcome');
  const renderWelcome = (u) => {
    welcome.replaceChildren(...[
      h('div.lobby-title', {}, 'ROYAL CASINO'),
      h('div.lobby-sub', {}, u
        ? `Willkommen zurück, ${u.username} · 🪙 ${fmt(u.balance)}`
        : 'Zwölf Spiele · Virtuelles Spielgeld · 🪙 10.000 Startguthaben'),
      u ? null : h('div.row', { style: { marginTop: '10px' } },
        h('button.btn.btn-gold', { onclick: () => openAuth('register') }, '🎁 Registrieren'),
        h('button.btn', { onclick: () => openAuth('login') }, 'Anmelden'),
      ),
    ].filter(Boolean));
  };
  renderWelcome(user);
  const unsubscribe = subscribe((s) => renderWelcome(s.user));

  const hint = h('div.lobby-hint', {}, '🖱️ Klicke auf einen Tisch oder Automaten · Maus bewegen zum Umsehen');
  const strip = h('div.lobby-strip', {}, GAMES.map((g) =>
    h('a.strip-item', { href: `#/game/${g.id}`, title: g.name, dataset: { id: g.id }, onmouseenter: () => highlightById(g.id), onmouseleave: () => highlightById(null) },
      h('span.strip-icon', {}, g.icon), h('span.strip-name', {}, g.name),
      store.activeGames.includes(g.id) ? h('span.strip-live', {}, '●') : null)
  ));
  const tooltip = h('div.lobby-tooltip');
  const lobby = h('div.lobby', {}, stage, welcome, hint, tooltip, strip);
  root.append(lobby);

  // ---------- 3D ----------
  const engine = new Engine(stage, {
    fov: 62, position: [0, 2.3, 13.5], target: [0, 1.2, 0], background: 0x05040a,
    shadows: true, exposure: 1.05, envIntensity: 0.35, fog: [14, 46],
    bloom: { strength: 0.42, radius: 0.55, threshold: 0.85 },
  });
  engine.scene.fog = new THREE.FogExp2(0x0a0610, 0.028);
  const hemi = new THREE.HemisphereLight(0xffe0c0, 0x2a0a10, 0.35);
  engine.scene.add(hemi);
  const key = new THREE.SpotLight(0xffe6c4, 900, 0, 0.9, 0.7, 2);
  key.position.set(0, 6.2, 2);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
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
  let hovered = null;
  let hoverTime = 0;
  let pathT = 0;
  let mx = 0; let my = 0;
  const lookTarget = casino.center.clone();
  const desired = new THREE.Vector3();
  const camPos = new THREE.Vector3();

  const setHover = (station) => {
    if (hovered === station) return;
    hovered = station;
    engine.renderer.domElement.style.cursor = station ? 'pointer' : '';
    strip.querySelectorAll('.strip-item').forEach((el) => el.classList.toggle('active', el.dataset.id === station?.id));
    if (station) { sound.play('tick'); tooltip.textContent = `${station.name} – klicken zum Spielen`; tooltip.classList.add('show'); }
    else tooltip.classList.remove('show');
  };
  const highlightById = (id) => setHover(casino.stations.find((s) => s.id === id) ?? null);

  const canvas = engine.renderer.domElement;
  const onMove = (e) => {
    const rect = canvas.getBoundingClientRect();
    mx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    my = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    tooltip.style.left = `${e.clientX - rect.left + 16}px`;
    tooltip.style.top = `${e.clientY - rect.top + 16}px`;
    const hit = engine.pick(e, hitboxes, false)[0];
    setHover(hit ? casino.stations.find((s) => s.hitbox === hit.object) : null);
  };
  const onClick = (e) => {
    const hit = engine.pick(e, hitboxes, false)[0];
    if (!hit) return;
    sound.play('click');
    location.hash = `#/game/${hit.object.userData.gameId}`;
  };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('pointerleave', () => setHover(null));

  engine.onUpdate((dt, t) => {
    for (const fn of casino.animated) fn(dt, t);
    // Kamera-Rundgang (langsamer, wenn etwas fokussiert ist)
    pathT = (pathT + dt * (hovered ? 0.0015 : 0.0055)) % 1;
    casino.path.getPointAt(pathT, camPos);
    engine.camera.position.lerp(camPos, 0.05);
    const ahead = casino.path.getPointAt((pathT + 0.06) % 1);
    desired.copy(ahead).lerp(casino.center, 0.55);
    if (hovered) desired.lerp(hovered.position, 0.6);
    desired.x += mx * 2.5;
    desired.y += -my * 1.2 + 0.2;
    lookTarget.lerp(desired, 0.04);
    engine.camera.lookAt(lookTarget);
    // Hover-Effekte
    hoverTime += dt;
    for (const s of casino.stations) {
      const active = s === hovered;
      s.ring.material.opacity += ((active ? 0.7 + Math.sin(hoverTime * 6) * 0.25 : 0) - s.ring.material.opacity) * 0.15;
      const target = active ? 1.35 : 1;
      s.label.scale.x += (s.label.userData.baseX * target - s.label.scale.x) * 0.15;
      s.label.scale.y += (s.label.userData.baseY * target - s.label.scale.y) * 0.15;
    }
  });
  for (const s of casino.stations) { s.label.userData.baseX = s.label.scale.x; s.label.userData.baseY = s.label.scale.y; }
  engine.start();

  return {
    destroy() {
      unsubscribe();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('click', onClick);
      engine.dispose();
    },
  };
}
