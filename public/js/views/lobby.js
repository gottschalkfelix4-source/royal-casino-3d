import { Engine, THREE } from '../three/engine.js';
import { createChip, createCard, createDie, goldMaterial, CHIP_STYLES } from '../three/assets.js';
import { GAMES } from '../games/registry.js';
import { store, subscribe } from '../state.js';
import { h, fmt } from '../ui.js';
import { sound } from '../sound.js';

const heroText = (user) => (user
  ? `Willkommen zurück, ${user.username}! Dein Guthaben: 🪙 ${fmt(user.balance)}`
  : 'Zwölf Spiele in 3D, virtuelles Spielgeld, kein Risiko. Registriere dich und erhalte 🪙 10.000 Startguthaben.');

/** Lobby: 3D-Hintergrund mit schwebenden Chips, Karten, Würfeln + Spielauswahl. */
export function renderLobby(root, { openAuth }) {
  root.innerHTML = '';
  root.className = 'view';
  const bg = h('div.lobby-bg');
  const user = store.user;

  const heroP = h('p', {}, heroText(user));
  const unsubscribe = subscribe((s) => { heroP.textContent = heroText(s.user); });
  const hero = h('div.hero', {},
    h('h1', {}, 'ROYAL CASINO'),
    heroP,
    user ? null : h('div.hero-actions', {},
      h('button.btn.btn-gold.btn-big', { style: { width: 'auto' }, onclick: () => openAuth('register') }, '🎁 Kostenlos registrieren'),
      h('button.btn.btn-big', { style: { width: 'auto' }, onclick: () => openAuth('login') }, 'Anmelden'),
    ),
  );

  const grid = h('div.game-grid', {}, GAMES.map((g) => {
    const live = store.activeGames.includes(g.id);
    const card = h('a.game-card', { href: `#/game/${g.id}`, style: { '--accent': g.accent } },
      h('div.icon', {}, g.icon),
      h('h3', {}, g.name),
      h('p', {}, g.tagline),
      live ? h('span.tag.live', {}, '● LÄUFT') : h('span.tag', {}, '3D'),
    );
    card.style.setProperty('--accent', g.accent);
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(700px) rotateY(${x * 12}deg) rotateX(${-y * 12}deg) translateY(-4px)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; });
    card.addEventListener('mouseenter', () => sound.play('click'));
    return card;
  }));

  const content = h('div.lobby-content', {}, hero, grid);
  const lobby = h('div.lobby', {}, bg, content);
  root.append(lobby);

  // ---------- 3D-Hintergrund ----------
  const engine = new Engine(bg, { fov: 50, position: [0, 0, 14], target: [0, 0, 0], background: 0x07090d, shadows: false, exposure: 0.9, fog: [10, 40] });
  engine.addLights({ keyIntensity: 1.6, hemi: 0.4, fill: 0.5 });
  engine.addSpot({ position: [0, 12, 8], target: [0, 0, 0], intensity: 600, angle: 0.7, color: 0xffe2a8 });

  const floaters = [];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const place = (obj, scale = 1) => {
    obj.position.set(rnd(-16, 16), rnd(-9, 9), rnd(-18, -3));
    obj.rotation.set(rnd(0, Math.PI * 2), rnd(0, Math.PI * 2), rnd(0, Math.PI * 2));
    obj.scale.setScalar(scale);
    floaters.push({ obj, spin: new THREE.Vector3(rnd(-0.4, 0.4), rnd(-0.4, 0.4), rnd(-0.4, 0.4)), bob: rnd(0, Math.PI * 2), drift: rnd(0.2, 0.6) });
    engine.scene.add(obj);
  };
  for (let i = 0; i < 14; i++) place(createChip(CHIP_STYLES[i % CHIP_STYLES.length].value), rnd(1.2, 2.0));
  const suits = ['S', 'H', 'D', 'C'];
  for (let i = 0; i < 8; i++) place(createCard({ r: 1 + Math.floor(Math.random() * 13), s: suits[i % 4] }), rnd(1.0, 1.5));
  for (let i = 0; i < 5; i++) place(createDie(0.8), rnd(0.9, 1.4));
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.12, 48), goldMaterial());
  place(coin, 1.2);

  // Funkelnde Partikel
  const starGeo = new THREE.BufferGeometry();
  const N = 400;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = rnd(-30, 30); pos[i * 3 + 1] = rnd(-15, 15); pos[i * 3 + 2] = rnd(-30, 5); }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xd4af37, size: 0.08, transparent: true, opacity: 0.7 }));
  engine.scene.add(stars);

  let mx = 0; let my = 0;
  const onMove = (e) => { mx = (e.clientX / window.innerWidth - 0.5) * 2; my = (e.clientY / window.innerHeight - 0.5) * 2; };
  window.addEventListener('mousemove', onMove);

  engine.onUpdate((dt, t) => {
    for (const f of floaters) {
      f.obj.rotation.x += f.spin.x * dt;
      f.obj.rotation.y += f.spin.y * dt;
      f.obj.rotation.z += f.spin.z * dt;
      f.obj.position.y += Math.sin(t * f.drift + f.bob) * 0.004;
      f.obj.position.x += Math.cos(t * f.drift * 0.7 + f.bob) * 0.003;
    }
    stars.rotation.y = t * 0.01;
    engine.camera.position.x += (mx * 1.2 - engine.camera.position.x) * 0.03;
    engine.camera.position.y += (-my * 0.8 - engine.camera.position.y) * 0.03;
    engine.camera.lookAt(0, 0, 0);
  });
  engine.start();

  return {
    destroy() {
      unsubscribe();
      window.removeEventListener('mousemove', onMove);
      engine.dispose();
    },
  };
}
