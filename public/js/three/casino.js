import * as THREE from 'three';
import { makeCanvas, canvasTexture, roundRect, goldMaterial, textSprite, createChip, createCard, createDie } from './assets.js';
import { createAvatar } from './avatars.js';
import { createPalm, createFicus } from './plants.js';
import { buildRouletteWheel, R_POCKET, Y_POCKET, BOWL_R } from './roulettewheel.js';
import { rouletteLayoutTexture, LAYOUT, layoutCell, layoutToLocal } from './roulettelayout.js';
import { marbleTexture, carpetTexture, runnerTexture, wallTexture, ceilingTexture, neonTexture } from './textures.js';
import { mat, merged, contactShadow, casinoChair, gameTable, chipRack, column, bar, chandelier, pedestal, fortuneWheel, cabinet, rewardsBoard, STAND_CENTER_Y, ropePost, sconce, painting, dolly } from './furniture.js';
import { buildSlotMachine } from './slotmachine.js';

/**
 * Prozedural gebaute Casino-Halle im Las-Vegas-Stil: Marmorboden mit Teppichinseln und roten Läufern
 * (überlappungsfrei, mit echter Dicke und Messingbordüre), Kassettendecke, Kronleuchter, Slot-Bank mit echten
 * Walzen und Hebeln, Spieltische, Bar. Jede Station ist anklickbar; Spiele werden direkt am Tisch gerendert.
 */

export const HALL = { w: 40, d: 30, h: 6.5 };
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

// ---------- Bildschirm-Attrappen der Arcade-Automaten ----------
function screenTexture(draw) {
  const { canvas, ctx } = makeCanvas(256, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#0b1730'); g.addColorStop(1, '#03060f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  draw(ctx);
  return canvasTexture(canvas);
}
const SCREENS = {
  videopoker: () => screenTexture((ctx) => {
    ctx.fillStyle = '#f5f0e0';
    for (let i = 0; i < 5; i++) { roundRect(ctx, 10 + i * 48, 90, 42, 64, 5); ctx.fill(); }
    ctx.fillStyle = '#c0392b'; ctx.font = '700 28px Inter, Arial';
    ['A', 'K', 'Q', 'J', '10'].forEach((r, i) => ctx.fillText(r, 31 + i * 48, 122));
    ctx.fillStyle = '#7cf0ae'; ctx.font = '900 26px Cinzel, serif'; ctx.fillText('VIDEO POKER', 128, 40);
    ctx.fillStyle = '#ffd76a'; ctx.font = '700 20px Inter, Arial'; ctx.fillText('ROYAL FLUSH 800×', 128, 210);
  }),
  crash: () => screenTexture((ctx) => {
    ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(20, 220); ctx.quadraticCurveTo(140, 210, 220, 60); ctx.stroke();
    ctx.font = `56px ${EMOJI_FONT}`; ctx.fillText('🚀', 210, 60);
    ctx.fillStyle = '#ffffff'; ctx.font = '900 44px Cinzel, serif'; ctx.fillText('2,47×', 100, 90);
  }),
  mines: () => screenTexture((ctx) => {
    for (let i = 0; i < 25; i++) {
      const x = 28 + (i % 5) * 42; const y = 40 + Math.floor(i / 5) * 42;
      ctx.fillStyle = [3, 8, 12, 17].includes(i) ? '#0f5a3a' : '#2b3a55';
      roundRect(ctx, x - 18, y - 18, 36, 36, 5); ctx.fill();
      if ([3, 8, 12, 17].includes(i)) { ctx.font = `22px ${EMOJI_FONT}`; ctx.fillText('💎', x, y + 2); }
    }
  }),
  plinko: () => screenTexture((ctx) => {
    ctx.fillStyle = '#e8e8f0';
    for (let r = 0; r < 7; r++) for (let j = 0; j <= r + 1; j++) { ctx.beginPath(); ctx.arc(128 + (j - (r + 1) / 2) * 26, 40 + r * 24, 4, 0, Math.PI * 2); ctx.fill(); }
    const cols = ['#e74c3c', '#f39c12', '#f1c40f', '#2ecc71', '#f1c40f', '#f39c12', '#e74c3c'];
    cols.forEach((c, i) => { ctx.fillStyle = c; roundRect(ctx, 30 + i * 28, 210, 24, 22, 4); ctx.fill(); });
    ctx.fillStyle = '#ffd76a'; ctx.beginPath(); ctx.arc(128, 18, 8, 0, Math.PI * 2); ctx.fill();
  }),
};

function emissivePlane(w, h, tex, intensity = 1.6) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: intensity, roughness: 0.3, transparent: true }));
}

/** Teppichstück mit echter Dicke (12 mm) und Messingbordüre. kind 'island' (Muster) | 'runner' (rot, Bordüre an den Längsseiten) */
function carpetPiece(scene, { x0, z0, x1, z1, kind }) {
  const m = mat();
  const w = x1 - x0; const d = z1 - z0; const cx = (x0 + x1) / 2; const cz = (z0 + z1) / 2;
  const T = 0.012;
  let geo; let material; let rotY = 0;
  if (kind === 'runner') {
    const along = d >= w; // Längsachse
    const width = along ? w : d; const length = along ? d : w;
    geo = new THREE.BoxGeometry(width, T, length);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (length / 2));
    const { map, normal } = runnerTexture(width);
    const n = normal.clone(); n.repeat.set(width / 1.2, length / 1.2); n.needsUpdate = true;
    material = new THREE.MeshStandardMaterial({ map, normalMap: n, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 1, metalness: 0 });
    rotY = along ? 0 : Math.PI / 2;
  } else {
    geo = new THREE.BoxGeometry(w, T, d);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) { uv.setX(i, uv.getX(i) * (w / 2)); uv.setY(i, uv.getY(i) * (d / 2)); }
    const { map, normal } = carpetTexture();
    const n = normal.clone(); n.repeat.set(w / 1.2, d / 1.2); n.needsUpdate = true;
    material = new THREE.MeshStandardMaterial({ map, normalMap: n, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 1, metalness: 0 });
  }
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(cx, T / 2, cz); mesh.rotation.y = rotY; mesh.receiveShadow = true;
  scene.add(mesh);
  // Bordüre: flache Messingschiene um den Rand
  const b = 0.05; const bh = 0.016;
  const frame = merged([
    { geo: new THREE.BoxGeometry(w + b, bh, b), p: [0, 0, -d / 2] }, { geo: new THREE.BoxGeometry(w + b, bh, b), p: [0, 0, d / 2] },
    { geo: new THREE.BoxGeometry(b, bh, d + b), p: [-w / 2, 0, 0] }, { geo: new THREE.BoxGeometry(b, bh, d + b), p: [w / 2, 0, 0] },
  ], m.brassDull);
  frame.position.set(cx, bh / 2, cz);
  scene.add(frame);
  return mesh;
}

// ---------- Halle ----------
export function buildCasino(engine) {
  const { scene } = engine;
  const { w, d, h } = HALL;
  const m = mat();
  const animated = [];
  const stations = [];

  // ---------- Boden: polierter Marmor, darauf Teppichinseln und Läufer (überlappungsfrei) ----------
  const marble = marbleTexture();
  const marbleFloor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshPhysicalMaterial({ map: marble.map, roughnessMap: marble.roughnessMap, roughness: 1, metalness: 0.04, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.1 }));
  marbleFloor.rotation.x = -Math.PI / 2; marbleFloor.receiveShadow = true;
  scene.add(marbleFloor);
  const ZONES = [
    { x0: -2.6, z0: -10, x1: 2.6, z1: 14.6, kind: 'runner' },      // Hauptläufer vom Eingang bis zur Rückwand-Zone
    { x0: -14, z0: -1.5, x1: -3, z1: 1.5, kind: 'runner' },        // Querläufer West
    { x0: 3, z0: -1.5, x1: 14, z1: 1.5, kind: 'runner' },          // Querläufer Ost
    { x0: -14, z0: 2, x1: -3, z1: 9, kind: 'island' },             // Roulette
    { x0: 3, z0: 2, x1: 14, z1: 9, kind: 'island' },               // Baccarat
    { x0: -14, z0: -9, x1: -3, z1: -2, kind: 'island' },           // Würfel
    { x0: 3, z0: -9, x1: 14, z1: -2, kind: 'island' },             // Hi-Lo
    { x0: -19.7, z0: -5.4, x1: -14.5, z1: 5.4, kind: 'island' },   // Slot-Bank
    { x0: 16.3, z0: -2.6, x1: 19.7, z1: 10.6, kind: 'island' },    // Automaten rechte Wand
    { x0: -8.6, z0: -14.7, x1: 8.6, z1: -10.5, kind: 'island' },   // Rückwand: Glücksrad, Crash, Plinko
  ];
  for (const z of ZONES) carpetPiece(scene, z);

  // ---------- Decke ----------
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: ceilingTexture(), roughness: 0.85 }));
  ceiling.rotation.x = Math.PI / 2; ceiling.position.y = h;
  scene.add(ceiling);
  const ribMat = goldMaterial({ roughness: 0.3 });
  const coveMat = new THREE.MeshStandardMaterial({ color: 0xffe0b0, emissive: 0xffc070, emissiveIntensity: 0.7 });
  const R = 160; const arc = w / R;
  for (let z = -12; z <= 12; z += 4) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(R, 0.14, 10, 96, arc), ribMat);
    rib.rotation.z = Math.PI / 2 - arc / 2;
    rib.position.set(0, h - 0.3 - R, z);
    scene.add(rib);
    const cove = new THREE.Mesh(new THREE.BoxGeometry(w - 1, 0.05, 0.1), coveMat);
    cove.position.set(0, h - 0.32, z + 0.32);
    scene.add(cove);
  }
  scene.add(merged([-14, -7, 7, 14].map((x) => ({ geo: new THREE.BoxGeometry(0.22, 0.3, d), p: [x, h - 0.15, 0] })), ribMat));
  const vault = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, d, 48, 1, true, Math.PI * 0.5, Math.PI), new THREE.MeshStandardMaterial({ color: 0xf3e8d2, roughness: 0.8, side: THREE.BackSide }));
  vault.rotation.x = Math.PI / 2; vault.position.set(0, h - 0.9, 0);
  scene.add(vault);
  scene.add(merged([-2.6, 2.6].map((x) => ({ geo: new THREE.BoxGeometry(0.16, 0.16, d), p: [x, h - 0.9, 0] })), ribMat));
  scene.add(merged([-2.6, 2.6].map((x) => ({ geo: new THREE.BoxGeometry(0.08, 0.05, d - 1), p: [x * 0.94, h - 0.95, 0] })), coveMat));
  scene.add(merged([[w - 2, 0, -d / 2 + 0.5, 0], [w - 2, 0, d / 2 - 0.5, 0], [d - 2, -w / 2 + 0.5, 0, Math.PI / 2], [d - 2, w / 2 - 0.5, 0, Math.PI / 2]].map(([len, x, z, rot]) => ({ geo: new THREE.BoxGeometry(len, 0.06, 0.12), p: [x, h - 0.12, z], r: [0, rot, 0] })), coveMat));

  // ---------- Wände mit Leisten, Bildern und Wandleuchten ----------
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.78 });
  const mkWall = (width, x, z, rotY) => {
    const wm = new THREE.Mesh(new THREE.PlaneGeometry(width, h), wallMat);
    wm.position.set(x, h / 2, z); wm.rotation.y = rotY; wm.receiveShadow = true;
    scene.add(wm);
  };
  mkWall(w, 0, -d / 2, 0); mkWall(w, 0, d / 2, Math.PI); mkWall(d, -w / 2, 0, Math.PI / 2); mkWall(d, w / 2, 0, -Math.PI / 2);
  scene.add(merged([
    ...[[w, 0, -d / 2], [w, 0, d / 2]].flatMap(([len, x, z]) => [0.08, h - 0.08].map((y) => ({ geo: new THREE.BoxGeometry(len, 0.16, 0.12), p: [x, y, z] }))),
    ...[[-w / 2, 0], [w / 2, 0]].flatMap(([x, z]) => [0.08, h - 0.08].map((y) => ({ geo: new THREE.BoxGeometry(0.12, 0.16, d), p: [x, y, z] }))),
  ], m.brass));
  // Gemälde an den Seitenwänden, Wandleuchten an allen Wänden
  let pSeed = 0;
  for (const [x, z, ry] of [[-w / 2 + 0.05, 8, Math.PI / 2], [-w / 2 + 0.05, -8, Math.PI / 2], [w / 2 - 0.05, -8, -Math.PI / 2], [w / 2 - 0.05, 13, -Math.PI / 2], [-11, d / 2 - 0.05, Math.PI], [11, d / 2 - 0.05, Math.PI], [11, -d / 2 + 0.05, 0]]) {
    const p = painting(1.4, 1.0, pSeed++); p.position.set(x, 3.3, z); p.rotation.y = ry; scene.add(p);
  }
  for (let x = -16; x <= 16; x += 8) {
    for (const [z, ry] of [[-d / 2 + 0.02, 0], [d / 2 - 0.02, Math.PI]]) { const s = sconce(); s.position.set(x, 3.1, z); s.rotation.y = ry; scene.add(s); }
  }
  for (let z = -10; z <= 10; z += 5) {
    for (const [x, ry] of [[-w / 2 + 0.02, Math.PI / 2], [w / 2 - 0.02, -Math.PI / 2]]) { const s = sconce(); s.position.set(x, 3.1, z); s.rotation.y = ry; scene.add(s); }
  }

  // ---------- Licht ----------
  const spotDisc = new THREE.CircleGeometry(0.16, 16);
  const spotMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1d6, emissiveIntensity: 1.1 });
  const spotPositions = [];
  for (let x = -18; x <= 18; x += 4) for (let z = -10; z <= 10; z += 4) if (Math.abs(x) >= 3) spotPositions.push([x, z]);
  const spots = new THREE.InstancedMesh(spotDisc, spotMat, spotPositions.length);
  const sm = new THREE.Matrix4(); const sq = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  spotPositions.forEach(([x, z], i) => { sm.compose(new THREE.Vector3(x, h - 0.02, z), sq, new THREE.Vector3(1, 1, 1)); spots.setMatrixAt(i, sm); });
  scene.add(spots);
  for (const [x, z] of [[-8, -4], [8, -4], [-8, 6], [8, 6], [0, 1]]) {
    const c = chandelier(x, z, x === 0 ? 5.6 : 5.3);
    if (x === 0) c.scale.setScalar(1.5);
    scene.add(c);
    animated.push((dt, t) => { c.userData.crystals.rotation.y = t * 0.15; });
  }
  for (const [x, z] of [[-8, 1], [8, 1], [0, -8]]) {
    const light = new THREE.PointLight(0xffd9a0, 40, 20, 2);
    light.position.set(x, 5.0, z);
    scene.add(light);
  }
  for (const [x, z] of [[-12, -9], [12, -9], [-12, 9], [12, 9], [-4, -9], [4, -9]]) {
    scene.add(column(x, z, h));
    const cs = contactShadow(2.2, 2.2, 0.6); cs.position.set(x, 0.02, z); scene.add(cs);
  }
  const barShadow = contactShadow(11, 5, 0.5); barShadow.position.set(-13, 0.02, -12.2); scene.add(barShadow);

  // Neon-Schriftzüge
  const neon = emissivePlane(12, 3, neonTexture('ROYAL CASINO', '#ff2d6f', '★ 24 STUNDEN GEÖFFNET ★'), 2.2);
  neon.position.set(0, 4.9, -d / 2 + 0.08);
  scene.add(neon);
  animated.push((dt, t) => { neon.material.emissiveIntensity = 2.0 + Math.sin(t * 9) * 0.15 + (Math.random() < 0.01 ? -0.8 : 0); });
  const neon2 = emissivePlane(6, 1.5, neonTexture('BAR', '#35c7ff'), 2);
  neon2.position.set(-13, 4.6, -d / 2 + 0.08);
  const neon3 = emissivePlane(8, 1.6, neonTexture('JACKPOT', '#ffd76a'), 2);
  neon3.position.set(-w / 2 + 0.08, 4.6, 0); neon3.rotation.y = Math.PI / 2;
  const neon4 = emissivePlane(8, 1.6, neonTexture('HIGH ROLLER', '#c59bff'), 2);
  neon4.position.set(w / 2 - 0.08, 4.6, 0); neon4.rotation.y = -Math.PI / 2;
  scene.add(neon2, neon3, neon4);
  scene.add(bar(-13, -12.4));

  /**
   * seats: lokale Sitz-/Stehplätze [[lx, lz], ...]; Figuren schauen zum lokalen Ursprung (bzw. `face`).
   */
  const addStation = (id, name, group, { x, z, rotY = 0, hit = [3, 2.6, 3], labelY = 2.9, seats = [[0, 1.5]], face = [0, 0], sit = true, chairs = false }) => {
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    scene.add(group);
    const cos = Math.cos(rotY); const sin = Math.sin(rotY);
    const worldSeats = seats.map(([lx, lz]) => {
      const [fx, fz] = typeof face === 'function' ? face(lx, lz) : face;
      const ry = Math.atan2(lx - fx, lz - fz);
      if (chairs) { const c = casinoChair({ seatY: 0.68 }); c.position.set(lx, 0, lz); c.rotation.y = ry; group.add(c); }
      return { x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos, ry: rotY + ry, sit };
    });
    const hitbox = new THREE.Mesh(new THREE.BoxGeometry(...hit), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hitbox.position.set(x, hit[1] / 2, z); hitbox.rotation.y = rotY;
    hitbox.userData.gameId = id;
    scene.add(hitbox);
    const label = textSprite(name, { size: 60, color: '#ffffff', bg: 'rgba(0,0,0,0.55)', height: 0.55 });
    label.position.set(x, labelY, z);
    scene.add(label);
    const ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(hit[0], hit[2]) * 0.55, Math.max(hit[0], hit[2]) * 0.55 + 0.12, 64), new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.03, z);
    scene.add(ring);
    const st = { id, name, group, hitbox, label, ring, position: new THREE.Vector3(x, 1, z), seats: worldSeats, radius: Math.max(hit[0], hit[2]) / 2, mount: null };
    stations.push(st);
    const cs = contactShadow(hit[0] * 1.5, hit[2] * 1.5, 0.5);
    cs.position.set(x, 0.02, z); cs.rotation.z = rotY;
    scene.add(cs);
    return st;
  };
  /**
   * Montagepunkt für die Spielszene:
   *  type 'table'  – auf der Platte, zum eigenen Platz gedreht (offset relativ zur Station, y = Höhe)
   *  type 'screen' – an einem Referenzobjekt (object(seatIndex)), +z zum Spieler
   *  type 'fixed'  – Weltkoordinaten der Station, keine Drehung zum Platz (Spiel arbeitet in Metern)
   * hide: Objekte oder Funktion(seatIndex) -> Objekte, die während des Spiels ausgeblendet werden
   * look(seatIndex): Blickziel (Weltkoordinaten); lookY: Höhe des Blickziels beim Sitzen; fov: Sitz-Blickwinkel
   * extra(seatIndex): Objekte, die das Spiel bekommt (z. B. Automat, Kessel, Layout)
   */
  const setMount = (st, { type, scale = 1, object = null, offset = [0, 0, 0], hide = [], rotX = 0, pull = 0.3, lookY = 0.55, look = null, fov = null, extra = null, cam = null }) => {
    st.mount = { type, scale, object, offset: new THREE.Vector3(...offset), hide, rotX, pull, lookY, look, fov, extra, cam };
  };

  // ---------- Slot-Bank an der linken Wand: sechs Automaten mit Walzen und Hebel ----------
  const slotsGroup = new THREE.Group();
  const SLOT_PITCH = 0.95;
  const machines = [];
  const NAMES = ['ROYAL 7s', 'DIAMOND RUSH', 'GOLDEN BELL', 'LUCKY FRUITS', 'ROYAL 7s', 'DIAMOND RUSH'];
  for (let i = 0; i < 6; i++) {
    const mc = buildSlotMachine({ variant: i, name: NAMES[i] });
    mc.position.z = (i - 2.5) * SLOT_PITCH;
    mc.rotation.y = Math.PI / 2; // Front zeigt nach +x in die Halle
    slotsGroup.add(mc);
    machines.push(mc);
  }
  // Sockelblende hinter der Bank (durchgehend) und Lichtleiste darüber
  const bankBack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.3, 6 * SLOT_PITCH + 0.4), m.piano);
  bankBack.position.set(-0.55, 1.15, 0);
  slotsGroup.add(bankBack);
  const bankLight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 6 * SLOT_PITCH + 0.2), new THREE.MeshStandardMaterial({ color: 0x35c7ff, emissive: 0x35c7ff, emissiveIntensity: 2.2 }));
  bankLight.position.set(-0.36, 2.34, 0);
  slotsGroup.add(bankLight);
  const slotsSt = addStation('slots', '🎰 Slots', slotsGroup, { x: -17.6, z: 0, hit: [2.6, 2.6, 6 * SLOT_PITCH + 0.4], labelY: 3.0, seats: [0, 1, 2, 3, 4, 5].map((i) => [0.92, (i - 2.5) * SLOT_PITCH]), face: (lx, lz) => [0, lz] });
  slotsSt.machines = machines;
  setMount(slotsSt, {
    type: 'screen', scale: 0.075,
    object: (i) => machines[i].userData.reelAnchor,
    look: (i) => machines[i].userData.lookTarget.getWorldPosition(new THREE.Vector3()),
    hide: (i) => [machines[i].userData.reelGroup],
    extra: (i) => ({ machine: machines[i] }),
    fov: 58,
  });
  animated.push((dt, t) => { for (const mc of machines) mc.userData.update(dt, t); });

  // ---------- Roulette: großer Kessel im Tisch, Tableau, Chip-Bank, Dolly ----------
  const rl = gameTable({ shape: 'rect', w: 4.6, d: 2.1, felt: '#0f5a3a', layoutTex: rouletteLayoutTexture(), layoutSize: [LAYOUT.w, LAYOUT.d], rack: false, sign: ['ROULETTE', 'Min 10 · Max 1.000'] });
  rl.userData.decal.position.x = 0.78;
  const WHEEL_S = 0.15; const WHEEL_X = -1.45;
  const { group: wheelGroup, rotor, ball } = buildRouletteWheel({ ball: true });
  wheelGroup.scale.setScalar(WHEEL_S); wheelGroup.position.set(WHEEL_X, 0.95, 0);
  wheelGroup.add(ball); // Kugel in Kesselkoordinaten (dreht nicht mit dem Rotor)
  rl.add(wheelGroup);
  const well = new THREE.Mesh(new THREE.LatheGeometry([[BOWL_R * WHEEL_S + 0.005, 0], [BOWL_R * WHEEL_S + 0.09, 0], [BOWL_R * WHEEL_S + 0.09, 0.05], [BOWL_R * WHEEL_S + 0.05, 0.075], [BOWL_R * WHEEL_S + 0.005, 0.075]].map(([r, y]) => new THREE.Vector2(r, y)), 96), m.mahogany);
  well.position.set(WHEEL_X, 0.95, 0);
  rl.add(well);
  const wheelState = { rotor, ball, wheelGroup, controlled: false, angle: 0, ballAngle: 0 };
  const rlRack = chipRack(); rlRack.position.set(0.85, 0.95, -0.85); rl.add(rlRack);
  // Deko: ein paar gesetzte Chips und der Dolly auf dem Tableau (beim Spielen ausgeblendet)
  const rlDeco = [];
  const placeDeco = (key, cents, n) => {
    const p = layoutToLocal(layoutCell(key));
    for (let k = 0; k < n; k++) { const c = createChip(cents); c.scale.setScalar(0.19); c.position.set(0.78 + p.x + (Math.random() - 0.5) * 0.01, 0.958 + 0.016 * k + 0.008, p.z + (Math.random() - 0.5) * 0.01); c.rotation.y = Math.random() * 6; rl.add(c); rlDeco.push(c); }
  };
  placeDeco('straight:17', 25_00, 3); placeDeco('red', 100_00, 2); placeDeco('dozen:2', 5_00, 4); placeDeco('straight:32', 10_00, 1);
  const dollyDeco = dolly();
  const dp = layoutToLocal(layoutCell('straight:23')); dollyDeco.position.set(0.78 + dp.x, 0.958, dp.z);
  rl.add(dollyDeco); rlDeco.push(dollyDeco);
  const rlSeats = [[-0.9, 1.55], [0.1, 1.55], [1.1, 1.55]];
  const rlSt = addStation('roulette', '🎡 Roulette', rl, { x: -8, z: 4.4, hit: [5.4, 2.4, 3.8], seats: rlSeats, face: (lx) => [lx, 0], chairs: true });
  setMount(rlSt, {
    type: 'fixed', scale: 1, pull: 0, hide: rlDeco, fov: 62,
    // Sitzkamera: leicht erhöht hinter dem eigenen Platz, Kessel (links) und Tableau (rechts) gemeinsam im Bild
    cam: (i) => ({
      pos: rl.localToWorld(new THREE.Vector3(-0.35 + rlSeats[i][0] * 0.45, 1.62, 2.25)),
      look: rl.localToWorld(new THREE.Vector3(-0.45, 0.9, -0.15)),
    }),
    extra: () => ({ wheel: wheelState, layout: rl.userData.decal, table: rl, chipY: 0.958 }),
  });
  animated.push((dt) => {
    if (wheelState.controlled) return;
    rotor.rotation.y += dt * 0.5;
    const a = rotor.rotation.y + 0.8;
    ball.position.set(Math.cos(a) * R_POCKET, Y_POCKET, -Math.sin(a) * R_POCKET);
  });

  // ---------- Blackjack ----------
  const bj = gameTable({ shape: 'half', w: 4, d: 2.2, felt: '#0f5a3a', layout: 'blackjack', shoe: true, sign: ['BLACKJACK', 'Min 10 · Max 1.000'] });
  const bjDeco = [];
  for (let i = 0; i < 3; i++) { const c = createCard({ r: [1, 13, 10][i], s: 'SHD'[i] }); c.rotation.x = -Math.PI / 2; c.rotation.z = (i - 1) * 0.3; c.position.set((i - 1) * 0.5, 0.965, 1.0); c.scale.setScalar(0.09); bj.add(c); bjDeco.push(c); }
  const bjSeats = [0, 1, 2, 3].map((i) => { const a = -0.6 + i * 0.4; return [Math.sin(a) * 2.6, Math.cos(a) * 2.6 * 1.1 - 0.4]; });
  const bjSt = addStation('blackjack', '🃏 Blackjack', bj, { x: 0, z: 5.5, rotY: 0, hit: [4.6, 2.4, 4], seats: bjSeats, face: [0, 0.3], chairs: true });
  setMount(bjSt, { type: 'table', scale: 0.16, offset: [0, 0.95, 0.1], hide: bjDeco, pull: 0.45 });

  // ---------- Baccarat ----------
  const bc = gameTable({ shape: 'oval', w: 4.4, d: 2.2, felt: '#5a1424', layout: 'baccarat', shoe: true, sign: ['BACCARAT', 'Min 10 · Max 2.000'] });
  const bcDeco = [];
  for (let i = 0; i < 4; i++) { const c = createCard({ r: 2 + i * 3, s: 'CDHS'[i] }); c.rotation.x = -Math.PI / 2; c.position.set(-0.6 + i * 0.4, 0.965, 0.1); c.scale.setScalar(0.09); bc.add(c); bcDeco.push(c); }
  const bcSt = addStation('baccarat', '🎴 Baccarat', bc, { x: 8, z: 4.4, hit: [5, 2.4, 3.8], seats: [[-1, 1.7], [0, 1.7], [1, 1.7]], face: (lx) => [lx * 0.5, 0], chairs: true });
  setMount(bcSt, { type: 'table', scale: 0.15, offset: [0, 0.95, 0], hide: bcDeco, pull: 0.35 });

  // ---------- Würfel (Sic Bo) ----------
  const dc = gameTable({ shape: 'rect', w: 4.4, d: 2.0, felt: '#7a1b1b', layout: 'dice', sign: ['SIC BO', 'Min 10 · Max 500'] });
  const dcDeco = [];
  for (let i = 0; i < 3; i++) { const die = createDie(0.05); die.position.set(-0.3 + i * 0.12, 0.985, 0.2 - i * 0.08); die.rotation.set(0, i * 0.7, 0); dc.add(die); dcDeco.push(die); }
  const shaker = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.16, 20, 1, true), m.acrylic); shaker.position.set(-1.0, 1.03, -0.3); dc.add(shaker);
  const dcSt = addStation('dice', '🎲 Würfel', dc, { x: -8, z: -5.4, hit: [5, 2.4, 3.6], seats: [[-1, 1.5], [0, 1.5], [1, 1.5]], face: (lx) => [lx, 0], chairs: true });
  setMount(dcSt, { type: 'table', scale: 0.14, offset: [0, 0.95, 0], hide: dcDeco });

  // ---------- Hi-Lo ----------
  const hl = gameTable({ shape: 'oval', w: 2.6, d: 1.8, felt: '#3b1d5c', layout: 'hilo', rack: false });
  const hlCard = createCard({ r: 7, s: 'H' }); hlCard.rotation.x = -Math.PI / 2; hlCard.position.set(0, 0.965, 0.1); hlCard.scale.setScalar(0.1); hl.add(hlCard);
  const hlSt = addStation('hilo', '🔺 Hi-Lo', hl, { x: 8, z: -5.4, hit: [3.2, 2.4, 3.2], seats: [[0, 1.4], [-1.2, 0.8], [1.2, 0.8]], chairs: true });
  setMount(hlSt, { type: 'table', scale: 0.16, offset: [0, 0.95, -0.1], hide: [hlCard], pull: 0.2, lookY: 0.95 });

  // ---------- Glücksrad ----------
  const fw = fortuneWheel();
  const fwSt = addStation('wheel', '🎯 Glücksrad', fw, { x: 0, z: -13.6, hit: [4, 4.3, 1.6], labelY: 4.5, seats: [[0, 2.2], [-1.2, 2.4], [1.2, 2.4]], sit: false });
  setMount(fwSt, { type: 'screen', scale: 0.34, object: () => fw.userData.spin, hide: [fw] });
  animated.push((dt) => { fw.userData.spin.rotation.z -= dt * 0.35; });

  // ---------- Arcade-Automaten ----------
  const cab = { hit: [1.6, 2.4, 1.6], labelY: 2.6, seats: [[0, 1.2], [-0.75, 1.25], [0.75, 1.25]], sit: false };
  const screenOf = (cg) => () => cg.userData.bezel;
  const hideOf = (cg) => [cg.userData.screen, cg.userData.glass];
  const crashCab = cabinet(SCREENS.crash(), 'CRASH', '#ff4d4d');
  setMount(addStation('crash', '🚀 Crash', crashCab, { x: -5.5, z: -13.9, ...cab }), { type: 'screen', scale: 0.07, object: screenOf(crashCab), offset: [0, -0.05, 0.03], hide: hideOf(crashCab) });
  const plinkoCab = cabinet(SCREENS.plinko(), 'PLINKO', '#ff7ad9');
  setMount(addStation('plinko', '🔮 Plinko', plinkoCab, { x: 5.5, z: -13.9, ...cab }), { type: 'screen', scale: 0.06, object: screenOf(plinkoCab), offset: [0, 0.03, 0.03], hide: hideOf(plinkoCab) });
  const vpCab = cabinet(SCREENS.videopoker(), 'POKER', '#4d9cff');
  setMount(addStation('videopoker', '♠️ Video Poker', vpCab, { x: 19.3, z: 8, rotY: -Math.PI / 2, ...cab }), { type: 'screen', scale: 0.11, object: screenOf(vpCab), offset: [0, -0.12, 0.04], hide: hideOf(vpCab) });
  const minesCab = cabinet(SCREENS.mines(), 'MINES', '#34e39a');
  setMount(addStation('mines', '💣 Mines', minesCab, { x: 19.3, z: 0, rotY: -Math.PI / 2, ...cab }), { type: 'screen', scale: 0.11, object: screenOf(minesCab), offset: [0, 0, 0.04], rotX: Math.PI / 2, hide: hideOf(minesCab) });

  // ---------- Münzwurf-Podest ----------
  const pd = pedestal();
  const pdSt = addStation('coinflip', '🪙 Münzwurf', pd, { x: 0, z: -3, hit: [1.8, 2.6, 1.8], labelY: 2.9, seats: [[0, 1.4], [-1.2, 0.7], [1.2, 0.7]], sit: false });
  setMount(pdSt, { type: 'table', scale: 0.14, offset: [0, 0.93, 0], hide: [pd.userData.spin], pull: 0 });
  animated.push((dt, t) => { pd.userData.spin.rotation.y += dt * 2; pd.userData.spin.position.y = 1.5 + Math.sin(t * 2) * 0.1; });

  // ---------- Samtkordeln, Pflanzen ----------
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x8a1030, roughness: 0.85 });
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const p = ropePost(); p.position.set(side * 3.1, 0, 13.8 - i * 2.2); scene.add(p);
      if (i < 3) {
        const rope = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.03, 8, 24, Math.PI * 0.55), ropeMat);
        rope.position.set(side * 3.1, 1.35, 12.7 - i * 2.2);
        rope.rotation.y = Math.PI / 2; rope.rotation.z = Math.PI + Math.PI * 0.225;
        scene.add(rope);
      }
    }
  }
  const plants = [];
  const placePlant = (plant, x, z) => { plant.position.set(x, 0, z); scene.add(plant); plants.push(plant); const cs = contactShadow(1.4, 1.4, 0.5); cs.position.set(x, 0.02, z); scene.add(cs); };
  let seed = 0.13;
  for (const [px, pz] of [[-18.5, 13], [18.5, 13], [-18.5, -13], [18.5, -13], [-6.2, 13.6], [6.2, 13.6]]) placePlant(createPalm({ height: 2.2 + (seed += 0.17) % 0.5, fronds: 11, seed }), px, pz);
  for (const [px, pz] of [[-12.9, -9.9], [12.9, -9.9], [-12.9, 9.9], [12.9, 9.9], [-3.1, -9.9], [3.1, -9.9]]) placePlant(createFicus({ height: 1.6 + (seed += 0.11) % 0.4, seed }), px, pz);
  animated.push((dt, t) => { for (const p of plants) p.userData.sway(t); });

  // ---------- Info-Tafeln ----------
  const interactives = [];
  const addBoard = (board, x, y, z, rotY, hit) => {
    board.position.set(x, y, z); board.rotation.y = rotY;
    scene.add(board);
    const hitbox = new THREE.Mesh(new THREE.BoxGeometry(...hit), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hitbox.position.set(x, y, z); hitbox.rotation.y = rotY;
    hitbox.userData.action = 'rewards';
    scene.add(hitbox);
    const label = textSprite('🎁 Coins verdienen', { size: 56, color: '#f5d97a', bg: 'rgba(0,0,0,0.6)', height: 0.42 });
    label.position.set(x, y + hit[1] / 2 + 0.35, z);
    scene.add(label);
    interactives.push({ id: `board-${interactives.length}`, action: 'rewards', name: '🎁 Coins verdienen', hitbox, position: new THREE.Vector3(x, y, z) });
  };
  addBoard(rewardsBoard({ standing: true }), 4.4, STAND_CENTER_Y, 10.6, Math.atan2(-4.4, 2.4), [1.7, 2.1, 0.4]);
  addBoard(rewardsBoard(), w / 2 - 0.1, 2.3, 13, -Math.PI / 2, [0.3, 2.9, 2.4]);
  const boardSpot = new THREE.SpotLight(0xffe6c4, 120, 8, 0.6, 0.8, 2);
  boardSpot.position.set(3.9, 4.5, 11.6); boardSpot.target.position.set(4.4, 1.9, 10.6);
  scene.add(boardSpot, boardSpot.target);

  // ---------- Croupiers ----------
  const DEALERS = [['blackjack', 'Croupier Max', 0, -0.5], ['baccarat', 'Croupier Lea', 0, -1.6], ['roulette', 'Croupier Tom', -0.2, -1.6], ['dice', 'Croupier Ana', 0, -1.5]];
  for (const [id, name, lx, lz] of DEALERS) {
    const st = stations.find((s) => s.id === id);
    if (!st) continue;
    const av = createAvatar({ name, dealer: true });
    av.position.set(st.group.position.x + lx, 0, st.group.position.z + lz);
    av.rotation.y = Math.PI;
    scene.add(av);
    animated.push((dt, t) => av.userData.dealerStep(dt, t));
  }

  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 2.3, 13.5), new THREE.Vector3(-9, 2.4, 10), new THREE.Vector3(-13.5, 2.2, 0),
    new THREE.Vector3(-9, 2.5, -9), new THREE.Vector3(0, 2.6, -8), new THREE.Vector3(9, 2.4, -9),
    new THREE.Vector3(14, 2.2, 0), new THREE.Vector3(9, 2.5, 10),
  ], true, 'centripetal', 0.6);

  return { stations, interactives, animated, path, center: new THREE.Vector3(0, 1.2, 0), machines };
}
