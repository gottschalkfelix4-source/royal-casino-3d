import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCanvas, canvasTexture, roundRect, goldMaterial, woodTexture, woodNormal, feltTexture, feltNormal, createChip, CHIP, chipStyle, createCard } from './assets.js';
import { marbleTexture, neonTexture, leatherNormal, brushedNormal } from './textures.js';

/**
 * Möbel und Einrichtung der Halle: Stühle, Spieltische mit Chip-Racks und Kartenschlitten, Säulen, Bar,
 * Kronleuchter, Arcade-Automaten, Info-Tafeln, Samtkordeln. Alle Objekte in realer Größe (Meter).
 */

// ---------- Gemeinsame Materialien ----------
const M = {};
export function mat() {
  if (M.brass) return M;
  M.brass = goldMaterial({ roughness: 0.3 });
  M.brassDull = goldMaterial({ roughness: 0.45, color: 0xb8952f });
  M.chrome = new THREE.MeshStandardMaterial({ color: 0xe4e5ea, metalness: 1, roughness: 0.16, normalMap: brushedNormal(), normalScale: new THREE.Vector2(0.15, 0.15) });
  M.darkWood = new THREE.MeshPhysicalMaterial({ map: woodTexture(), normalMap: woodNormal(), normalScale: new THREE.Vector2(0.45, 0.45), color: 0x8a6a4a, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  M.mahogany = new THREE.MeshPhysicalMaterial({ map: woodTexture(), normalMap: woodNormal(), normalScale: new THREE.Vector2(0.4, 0.4), color: 0x9a5a3a, roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.15 });
  M.velvet = new THREE.MeshPhysicalMaterial({ color: 0x4a0d1a, roughness: 0.85, sheen: 0.9, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xa0304d), normalMap: leatherNormal(), normalScale: new THREE.Vector2(0.3, 0.3) });
  M.leather = new THREE.MeshPhysicalMaterial({ color: 0x2c0a12, roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.3, normalMap: leatherNormal(), normalScale: new THREE.Vector2(0.55, 0.55), sheen: 0.3, sheenColor: new THREE.Color(0x8a2a44) });
  M.piano = new THREE.MeshPhysicalMaterial({ color: 0x0a0a0c, metalness: 0.3, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
  M.bodyRed = new THREE.MeshPhysicalMaterial({ color: 0x7a0f22, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
  M.glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.03, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.15, depthWrite: false, envMapIntensity: 2 });
  M.acrylic = new THREE.MeshPhysicalMaterial({ color: 0xdfe8ee, roughness: 0.05, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
  M.matteBlack = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.7, metalness: 0.2 });
  return M;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const rbox = (w, h, d, r = 0.01, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, r);
/** Mehrere Geometrien mit einem Material zu einem Mesh zusammenfassen */
export function merged(parts, material) {
  const geos = parts.map(({ geo, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] }) => {
    const g = geo.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s)));
    return g;
  });
  const m = new THREE.Mesh(mergeGeometries(geos, false), material);
  geos.forEach((g) => g.dispose());
  return m;
}

/** Weicher Kontaktschatten unter Möbeln (ersetzt teure Ambient Occlusion) */
let shadowTex = null;
export function contactShadow(w, d, opacity = 0.55) {
  if (!shadowTex) {
    const { canvas, ctx } = makeCanvas(256, 256);
    const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.6, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    shadowTex = new THREE.CanvasTexture(canvas);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02; // über Teppich (0,012) und Bordüre (0,014)
  m.renderOrder = 1;
  return m;
}

// ---------- Stühle ----------
/** Casino-Stuhl: gepolsterter Sitz mit gebogener Rückenlehne, Chromsäule mit Fußring und Tellerfuß */
export function casinoChair({ seatY = 0.68, color = null } = {}) {
  const m = mat();
  let velvet = m.velvet;
  if (color) { velvet = m.velvet.clone(); velvet.color = new THREE.Color(color); }
  const g = new THREE.Group();
  const seat = new THREE.Mesh(rbox(0.46, 0.09, 0.44, 0.035), velvet);
  seat.position.y = seatY; seat.castShadow = true;
  // Rückenlehne: gebogene Schale (Innenseite sichtbar), Chromrand
  const backMat = velvet.clone(); backMat.side = THREE.DoubleSide;
  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.3, 24, 1, true, Math.PI * 0.6, Math.PI * 0.8), backMat);
  back.position.set(0, seatY + 0.24, 0.02); back.rotation.y = Math.PI; back.castShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.016, 8, 32, Math.PI * 0.8), m.chrome);
  rim.rotation.x = Math.PI / 2; rim.rotation.z = Math.PI * 0.6 - Math.PI; rim.position.set(0, seatY + 0.4, 0.02);
  const rim2 = rim.clone(); rim2.position.y = seatY + 0.09;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, seatY - 0.02, 12), m.chrome);
  pole.position.y = (seatY - 0.02) / 2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.012, 8, 32), m.chrome);
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.2;
  const spokes = merged([0, 1, 2].map((i) => ({ geo: box(0.38, 0.012, 0.012), p: [0, 0.2, 0], r: [0, (i * Math.PI) / 3, 0] })), m.chrome);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.025, 32), m.chrome);
  foot.position.y = 0.0125;
  g.add(seat, back, rim, rim2, pole, ring, spokes, foot);
  return g;
}

// ---------- Tisch-Zubehör ----------
/** Chip-Rack (Dealer): Holztray mit Reihen liegender Chips (Instanzen) */
export function chipRack() {
  const m = mat();
  const g = new THREE.Group();
  const tray = new THREE.Mesh(rbox(1.0, 0.07, 0.3, 0.015), m.darkWood);
  tray.position.y = 0.035;
  g.add(tray);
  const dividers = merged([0, 1, 2, 3, 4, 5].map((i) => ({ geo: box(0.94, 0.03, 0.006), p: [0, 0.075, -0.125 + i * 0.05] })), m.acrylic);
  g.add(dividers);
  const values = [1000_00, 500_00, 100_00, 25_00, 5_00];
  values.forEach((v, row) => {
    const proto = createChip(v);
    const count = 18 - row * 2;
    const inst = new THREE.InstancedMesh(proto.geometry, proto.material, count);
    const mtx = new THREE.Matrix4(); const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
    for (let k = 0; k < count; k++) {
      mtx.compose(new THREE.Vector3(-0.42 + k * CHIP.h * 0.22 * 1.06 + 0.02, 0.07 + CHIP.r * 0.22, -0.1 + row * 0.05), q, new THREE.Vector3(0.22, 0.22, 0.22));
      inst.setMatrixAt(k, mtx);
    }
    inst.castShadow = true;
    g.add(inst);
  });
  return g;
}

/** Kartenschlitten (Shoe) mit Kartenstapel und Ausgabeschlitz */
export function cardShoe() {
  const m = mat();
  const g = new THREE.Group();
  const body = new THREE.Mesh(box(0.14, 0.1, 0.32), m.piano);
  body.position.y = 0.05; body.castShadow = true;
  const lid = new THREE.Mesh(box(0.13, 0.008, 0.28), m.acrylic);
  lid.position.set(0, 0.104, -0.02);
  const cards = new THREE.Mesh(box(0.105, 0.07, 0.24), new THREE.MeshStandardMaterial({ color: 0xf4f4f6, roughness: 0.6 }));
  cards.position.set(0, 0.05, -0.03);
  const lip = new THREE.Mesh(box(0.14, 0.03, 0.03), m.brass);
  lip.position.set(0, 0.015, 0.165);
  g.add(body, cards, lid, lip);
  const top = createCard(null, { faceUp: false }); top.scale.setScalar(0.11); top.rotation.x = -Math.PI / 2 + 0.25; top.position.set(0, 0.09, 0.09);
  g.add(top);
  return g;
}

/** Ablage für gespielte Karten (Discard Tray) */
export function discardTray() {
  const m = mat();
  const g = new THREE.Group();
  const base = new THREE.Mesh(box(0.11, 0.01, 0.15), m.piano);
  const wall = new THREE.Mesh(box(0.11, 0.09, 0.01), m.acrylic);
  wall.position.set(0, 0.05, -0.07);
  const stack = new THREE.Mesh(box(0.098, 0.04, 0.135), new THREE.MeshStandardMaterial({ color: 0xf1f1f3, roughness: 0.6 }));
  stack.position.y = 0.025;
  g.add(base, wall, stack);
  return g;
}

/** Tischschild mit Limits (Acryl-Aufsteller) */
export function limitSign(text1, text2) {
  const { canvas, ctx } = makeCanvas(256, 160);
  ctx.fillStyle = '#12100e'; roundRect(ctx, 0, 0, 256, 160, 14); ctx.fill();
  ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 4; roundRect(ctx, 6, 6, 244, 148, 10); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f5d97a'; ctx.font = '700 30px Cinzel, Georgia, serif'; ctx.fillText(text1, 128, 52);
  ctx.fillStyle = '#ffffff'; ctx.font = '600 26px Inter, Arial'; ctx.fillText(text2, 128, 108);
  const tex = canvasTexture(canvas);
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 }));
  face.position.set(0, 0.075, 0.006); face.rotation.x = -0.25;
  const plate = new THREE.Mesh(box(0.17, 0.11, 0.008), mat().acrylic);
  plate.position.set(0, 0.075, 0); plate.rotation.x = -0.25;
  const foot = new THREE.Mesh(box(0.1, 0.01, 0.06), mat().piano);
  foot.position.y = 0.005;
  g.add(face, plate, foot);
  return g;
}

// ---------- Spieltisch ----------
/** Aufdruck auf dem Filz je Spiel (Wettfelder, Texte) – transparente Deko-Ebene über dem Tisch */
export function layoutTexture(kind, W = 1024, H = 512) {
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(245,225,150,0.9)'; ctx.fillStyle = 'rgba(245,225,150,0.9)'; ctx.lineWidth = 4;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (kind === 'blackjack') {
    ctx.font = '700 44px Cinzel, Georgia, serif'; ctx.fillText('BLACKJACK ZAHLT 3 ZU 2', W / 2, 150);
    ctx.font = '600 26px Inter, Arial'; ctx.fillText('DEALER MUSS BEI 17 STEHEN · VERSICHERUNG ZAHLT 2 ZU 1', W / 2, 200);
    ctx.beginPath(); ctx.arc(W / 2, -260, 560, Math.PI * 0.28, Math.PI * 0.72); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, -260, 590, Math.PI * 0.29, Math.PI * 0.71); ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 4;
    for (let i = 0; i < 5; i++) { const a = Math.PI * (0.33 + i * 0.085); ctx.beginPath(); ctx.arc(W / 2 + Math.cos(a) * 470, -260 + Math.sin(a) * 470, 34, 0, Math.PI * 2); ctx.stroke(); }
    ctx.strokeRect(W / 2 - 110, 40, 220, 60); ctx.font = '600 22px Inter, Arial'; ctx.fillText('DEALER', W / 2, 70);
  } else if (kind === 'baccarat') {
    ctx.font = '700 40px Cinzel, Georgia, serif';
    [['PLAYER', '1 : 1'], ['TIE', '8 : 1'], ['BANKER', '0,95 : 1']].forEach(([t, o], i) => {
      const x = 200 + i * 312;
      roundRect(ctx, x - 120, 300, 240, 130, 18); ctx.stroke();
      ctx.fillText(t, x, 345); ctx.font = '600 26px Inter, Arial'; ctx.fillText(o, x, 395); ctx.font = '700 40px Cinzel, Georgia, serif';
    });
    ctx.font = '600 24px Inter, Arial'; ctx.fillText('PUNTO BANCO', W / 2, 120);
    ctx.strokeRect(W / 2 - 200, 150, 180, 110); ctx.strokeRect(W / 2 + 20, 150, 180, 110);
    ctx.font = '600 20px Inter, Arial'; ctx.fillText('PLAYER', W / 2 - 110, 205); ctx.fillText('BANKER', W / 2 + 110, 205);
  } else if (kind === 'dice') {
    ctx.font = '700 34px Cinzel, Georgia, serif';
    roundRect(ctx, 60, 300, 260, 120, 14); ctx.stroke(); ctx.fillText('KLEIN 4–10', 190, 360);
    roundRect(ctx, W - 320, 300, 260, 120, 14); ctx.stroke(); ctx.fillText('GROSS 11–17', W - 190, 360);
    ctx.font = '600 22px Inter, Arial';
    for (let i = 0; i < 14; i++) { const x = 60 + i * 65; ctx.strokeRect(x, 120, 60, 70); ctx.fillText(String(4 + i), x + 30, 145); ctx.fillText(['60', '30', '17', '12', '8', '6', '6', '6', '6', '8', '12', '17', '30', '60'][i] + ':1', x + 30, 172); }
    ctx.font = '700 30px Cinzel, Georgia, serif'; ctx.fillText('SIC BO', W / 2, 60);
    roundRect(ctx, 360, 300, 300, 120, 14); ctx.stroke(); ctx.font = '600 24px Inter, Arial'; ctx.fillText('DREIERPASCH 30 : 1', W / 2, 360);
  } else if (kind === 'hilo') {
    ctx.font = '700 40px Cinzel, Georgia, serif'; ctx.fillText('HI · LO', W / 2, 90);
    ctx.font = '600 22px Inter, Arial'; ctx.fillText('HÖHER ODER NIEDRIGER · KETTE FÜR MULTIPLIKATOR', W / 2, 135);
    roundRect(ctx, W / 2 - 90, 190, 180, 250, 16); ctx.stroke();
  }
  return canvasTexture(canvas);
}

/**
 * Spieltisch: shape 'rect' | 'oval' | 'half' (Halbkreis wie Blackjack); layout = Filzaufdruck oder eigene Textur.
 * Höhe der Filzfläche: 0,95 m. Liefert Gruppe mit userData { felt, decal }.
 */
export function gameTable({ shape = 'rect', w = 3, d = 1.8, felt = '#0f5a3a', rail = true, layout = null, layoutTex = null, layoutSize = null, rack = true, shoe = false, sign = null } = {}) {
  const m = mat();
  const g = new THREE.Group();
  const feltMat = new THREE.MeshStandardMaterial({ map: feltTexture(felt), normalMap: feltNormal(), normalScale: new THREE.Vector2(0.45, 0.45), roughness: 0.96 });
  let topGeo;
  if (shape === 'oval') topGeo = new THREE.CylinderGeometry(1, 1, 0.1, 72).scale(w / 2, 1, d / 2);
  else if (shape === 'half') topGeo = new THREE.CylinderGeometry(1, 1, 0.1, 72, 1, false, 0, Math.PI).scale(w / 2, 1, d);
  else topGeo = rbox(w, 0.1, d, 0.03, 2);
  const top = new THREE.Mesh(topGeo, feltMat);
  top.position.y = 0.9; top.castShadow = true; top.receiveShadow = true;
  if (shape === 'half') top.rotation.y = -Math.PI / 2; // runde Seite zu den Spielern (+z)
  g.add(top);
  // Holzzarge unter der Platte, Sockel und Messingfuß
  let apron; let base; let plinth;
  if (shape === 'rect') {
    apron = new THREE.Mesh(rbox(w - 0.06, 0.16, d - 0.06, 0.02, 2), m.mahogany);
    base = new THREE.Mesh(rbox(w * 0.82, 0.68, d * 0.78, 0.03, 2), m.darkWood);
    plinth = new THREE.Mesh(box(w * 0.86, 0.06, d * 0.82), m.brass);
  } else {
    const sx = shape === 'half' ? w / 2 : w / 2; const sz = shape === 'half' ? d : d / 2;
    apron = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.97, 0.16, 72, 1, false, 0, shape === 'half' ? Math.PI : Math.PI * 2).scale(sx - 0.03, 1, sz - 0.03), m.mahogany);
    if (shape === 'half') apron.rotation.y = -Math.PI / 2;
    base = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w, d) * 0.3, Math.min(w, d) * 0.38, 0.68, 40), m.darkWood);
    plinth = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w, d) * 0.42, Math.min(w, d) * 0.44, 0.06, 40), m.brass);
    if (shape === 'half') { base.position.z = d * 0.35; plinth.position.z = d * 0.35; }
  }
  apron.position.y = 0.8; apron.castShadow = true;
  base.position.y = 0.4; base.castShadow = true;
  plinth.position.y = 0.03;
  g.add(apron, base, plinth);
  // Fußstütze (Messingrohr) auf der Spielerseite
  if (shape === 'rect') {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, w * 0.8, 10), m.brass);
    bar.rotation.z = Math.PI / 2; bar.position.set(0, 0.24, d / 2 + 0.16);
    const holders = merged([-1, 1].map((s) => ({ geo: box(0.03, 0.03, 0.2), p: [s * w * 0.38, 0.24, d / 2 + 0.06] })), m.brass);
    g.add(bar, holders);
  } else {
    const rTor = shape === 'half' ? 1 : 1;
    const bar = new THREE.Mesh(new THREE.TorusGeometry(rTor, 0.02, 8, 64, Math.PI).scale(w / 2 + 0.14, shape === 'half' ? d + 0.14 : d / 2 + 0.14, 1), m.brass);
    bar.rotation.x = Math.PI / 2; bar.rotation.z = Math.PI; bar.position.y = 0.24;
    if (shape === 'half') bar.position.z = 0; else bar.position.z = 0;
    g.add(bar);
  }
  // Goldene Zierlinie am Filzrand
  if (shape !== 'rect') {
    const pin = new THREE.Mesh(new THREE.RingGeometry(0.93, 0.945, 96, 1, 0, shape === 'half' ? Math.PI : Math.PI * 2), new THREE.MeshStandardMaterial({ color: 0xe6c26a, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide }));
    pin.rotation.x = -Math.PI / 2; pin.rotation.z = shape === 'half' ? Math.PI : 0; pin.scale.set(w / 2, shape === 'half' ? d : d / 2, 1); pin.position.y = 0.952; g.add(pin);
  } else {
    const edge = new THREE.Mesh(box(w - 0.3, 0.004, d - 0.3), new THREE.MeshStandardMaterial({ color: 0xe6c26a, metalness: 0.7, roughness: 0.35 }));
    const inner = new THREE.Mesh(box(w - 0.34, 0.006, d - 0.34), feltMat);
    edge.position.y = 0.951; inner.position.y = 0.952;
    g.add(edge, inner);
  }
  // Layout-Aufdruck
  let decal = null;
  if (layout || layoutTex) {
    const size = layoutSize ?? [shape === 'half' ? w * 0.9 : w - 0.4, shape === 'half' ? d * 0.9 : d - 0.4];
    decal = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), new THREE.MeshStandardMaterial({ map: layoutTex ?? layoutTexture(layout), transparent: true, roughness: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    decal.rotation.x = -Math.PI / 2; decal.position.set(0, 0.956, shape === 'half' ? d * 0.42 : 0);
    g.add(decal);
  }
  // Gepolsterte Lederarmauflage
  if (rail) {
    let railMesh;
    if (shape === 'rect') {
      railMesh = new THREE.Group();
      const mk = (len, x, z, rot) => { const mm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, len, 6, 16), m.leather); mm.rotation.z = Math.PI / 2; mm.rotation.y = rot; mm.position.set(x, 0.99, z); mm.castShadow = true; railMesh.add(mm); };
      mk(w, 0, d / 2, 0); mk(w, 0, -d / 2, 0); mk(d, w / 2, 0, Math.PI / 2); mk(d, -w / 2, 0, Math.PI / 2);
    } else if (shape === 'oval') {
      railMesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.09, 14, 96).scale(w / 2, d / 2, 1), m.leather);
      railMesh.rotation.x = Math.PI / 2; railMesh.position.y = 0.99;
    } else {
      railMesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.09, 14, 72, Math.PI).scale(w / 2, d, 1), m.leather);
      railMesh.rotation.x = Math.PI / 2; railMesh.position.y = 0.99;
      // gerade Rückkante (Dealer-Seite)
      const backRail = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, w, 6, 16), m.leather);
      backRail.rotation.z = Math.PI / 2; backRail.position.set(0, 0.98, 0.02);
      railMesh = new THREE.Group().add(railMesh, backRail);
    }
    railMesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.add(railMesh);
  }
  if (rack && layout && layout !== 'roulette') {
    const r = chipRack();
    r.position.set(shape === 'half' ? 0 : 0, 0.95, shape === 'half' ? 0.28 : -d / 2 + 0.32);
    g.add(r);
  }
  if (shoe) {
    const s = cardShoe(); s.position.set(shape === 'half' ? -0.9 : -1.2, 0.95, shape === 'half' ? 0.35 : -d / 2 + 0.4); s.rotation.y = -0.4;
    const t = discardTray(); t.position.set(shape === 'half' ? 0.9 : 1.2, 0.95, shape === 'half' ? 0.35 : -d / 2 + 0.4); t.rotation.y = 0.4;
    g.add(s, t);
  }
  if (sign) {
    const s = limitSign(sign[0], sign[1]);
    s.position.set(shape === 'half' ? -1.3 : -w / 2 + 0.45, 0.95, shape === 'half' ? 0.7 : d / 2 - 0.3); s.rotation.y = 0.3;
    g.add(s);
  }
  g.userData.decal = decal;
  g.userData.felt = top;
  return g;
}

// ---------- Raum-Elemente ----------
export function column(x, z, height) {
  const m = mat();
  const g = new THREE.Group();
  const marble = marbleTexture().map.clone(); marble.repeat.set(0.6, 1.2); marble.needsUpdate = true;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, height - 0.6, 40), new THREE.MeshPhysicalMaterial({ map: marble, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.08 }));
  shaft.position.y = height / 2; shaft.castShadow = true; shaft.receiveShadow = true;
  // Kanneluren als schmale Messingstäbe
  const flutes = merged(Array.from({ length: 12 }, (_, i) => ({ geo: box(0.02, height - 0.8, 0.02), p: [Math.cos((i / 12) * Math.PI * 2) * 0.43, height / 2, Math.sin((i / 12) * Math.PI * 2) * 0.43], r: [0, -(i / 12) * Math.PI * 2, 0] })), m.brassDull);
  g.add(shaft, flutes);
  const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.46, 0.36, 32), m.brass);
  capTop.position.y = height - 0.2;
  const capRing = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 10, 40), m.brass);
  capRing.rotation.x = Math.PI / 2; capRing.position.y = height - 0.42;
  const capBot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.68, 0.3, 32), m.brass);
  capBot.position.y = 0.15;
  const baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 10, 40), m.brass);
  baseRing.rotation.x = Math.PI / 2; baseRing.position.y = 0.33;
  g.add(capTop, capRing, capBot, baseRing);
  g.position.set(x, 0, z);
  return g;
}

export function bar(x, z) {
  const m = mat();
  const g = new THREE.Group();
  const counter = new THREE.Mesh(rbox(8, 1.1, 1.2, 0.03, 2), m.mahogany);
  counter.position.y = 0.55; counter.castShadow = true;
  const panels = merged(Array.from({ length: 8 }, (_, i) => ({ geo: box(0.8, 0.7, 0.03), p: [-3.5 + i * 1.0, 0.55, 0.61] })), m.darkWood);
  g.add(counter, panels);
  const top = new THREE.Mesh(rbox(8.3, 0.08, 1.4, 0.02, 2), new THREE.MeshPhysicalMaterial({ color: 0x151515, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 }));
  top.position.y = 1.14;
  const topTrim = new THREE.Mesh(box(8.34, 0.03, 1.44), m.brass);
  topTrim.position.y = 1.095;
  g.add(top, topTrim);
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 8, 10), m.brass);
  rail.rotation.z = Math.PI / 2; rail.position.set(0, 0.25, 0.75);
  const railHold = merged([-3, -1, 1, 3].map((k) => ({ geo: box(0.03, 0.03, 0.2), p: [k, 0.25, 0.65] })), m.brass);
  g.add(rail, railHold);
  // Rückbar: Regal mit Spiegel und Flaschen, Beleuchtung
  const shelf = new THREE.Mesh(box(8, 3.2, 0.4), m.mahogany);
  shelf.position.set(0, 1.6, -1.6);
  g.add(shelf);
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 2.4), new THREE.MeshStandardMaterial({ color: 0xc8d6e2, metalness: 1, roughness: 0.04 }));
  mirror.position.set(0, 2.0, -1.39);
  g.add(mirror);
  const shelves = merged([1.25, 1.95, 2.65].map((y) => ({ geo: box(7.6, 0.03, 0.3), p: [0, y, -1.28] })), m.acrylic);
  g.add(shelves);
  const colors = [0x35c7ff, 0xff4d6d, 0x7cf0ae, 0xffd76a, 0xc59bff, 0xff8c42, 0x8fd3ff, 0xd4af37];
  for (let i = 0; i < 24; i++) {
    const c = colors[i % colors.length];
    const hgt = 0.3 + (i % 3) * 0.08;
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, hgt, 12), new THREE.MeshPhysicalMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, roughness: 0.08, clearcoat: 1, transparent: true, opacity: 0.8 }));
    const row = i % 3;
    bottle.position.set(-3.5 + (i % 8) * 1.0 + row * 0.12, 1.265 + row * 0.7 + hgt / 2, -1.3);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.1, 8), bottle.material);
    neck.position.set(bottle.position.x, bottle.position.y + hgt / 2 + 0.05, -1.3);
    g.add(bottle, neck);
  }
  const ledStrips = merged([1.2, 1.9, 2.6].map((y) => ({ geo: box(7.6, 0.02, 0.04), p: [0, y, -1.15] })), new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffc070, emissiveIntensity: 2.2 }));
  g.add(ledStrips);
  const ledStrip = new THREE.Mesh(box(7.8, 0.03, 0.05), new THREE.MeshStandardMaterial({ color: 0x35c7ff, emissive: 0x35c7ff, emissiveIntensity: 2.5 }));
  ledStrip.position.set(0, 1.0, 0.63);
  g.add(ledStrip);
  for (let i = 0; i < 4; i++) { const c = casinoChair({ seatY: 0.76 }); c.position.set(-2.4 + i * 1.6, 0, 1.25); c.rotation.y = Math.PI; g.add(c); }
  g.position.set(x, 0, z);
  return g;
}

export function chandelier(x, z, y = 5.4) {
  const m = mat();
  const g = new THREE.Group();
  for (const [r, yy] of [[0.9, 0], [0.62, 0.32], [0.34, 0.6]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 10, 48), m.brass);
    ring.rotation.x = Math.PI / 2; ring.position.y = yy;
    g.add(ring);
  }
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 10, 32), m.brass);
  ring2.rotation.x = Math.PI / 2; ring2.position.y = 0.35;
  g.add(ring2);
  const chain = merged(Array.from({ length: 8 }, (_, i) => ({ geo: new THREE.TorusGeometry(0.05, 0.012, 6, 12), p: [0, 0.35 + i * 0.12, 0], r: [0, (i % 2) * Math.PI / 2, 0] })), m.brass);
  chain.position.y = 0.3;
  g.add(chain);
  const arms = merged(Array.from({ length: 6 }, (_, i) => ({ geo: box(0.9, 0.025, 0.025), p: [Math.cos((i / 6) * Math.PI * 2) * 0.45, 0.06, Math.sin((i / 6) * Math.PI * 2) * 0.45], r: [0, -(i / 6) * Math.PI * 2, 0] })), m.brass);
  g.add(arms);
  // Kristalle als Instanz-Wolke, kein transmission (zu teuer)
  const crystalMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0.1, clearcoat: 1, emissive: 0xfff2cc, emissiveIntensity: 0.4, transparent: true, opacity: 0.85, envMapIntensity: 2 });
  const crystalGeo = new THREE.OctahedronGeometry(0.07, 0);
  const crystals = new THREE.Group();
  const inst = new THREE.InstancedMesh(crystalGeo, crystalMat, 72);
  const mm = new THREE.Matrix4();
  for (let i = 0; i < 72; i++) {
    const tier = i % 3;
    const a = (Math.floor(i / 3) / 24) * Math.PI * 2 + tier * 0.12;
    const r = [0.9, 0.62, 0.34][tier];
    mm.makeScale(1, 2.2, 1);
    mm.setPosition(Math.cos(a) * r, [0, 0.32, 0.6][tier] - 0.28 - ((i * 7) % 3) * 0.08, Math.sin(a) * r);
    inst.setMatrixAt(i, mm);
  }
  crystals.add(inst);
  // Kristallketten nach unten (Tropfen)
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 6, 6), crystalMat, 36);
  for (let i = 0; i < 36; i++) { const a = (i / 12) * Math.PI * 2; const k = Math.floor(i / 12); mm.makeScale(1, 1.6, 1); mm.setPosition(Math.cos(a) * (0.9 - k * 0.28), -0.45 - k * 0.12, Math.sin(a) * (0.9 - k * 0.28)); drops.setMatrixAt(i, mm); }
  crystals.add(drops);
  g.add(crystals);
  const bulbs = new THREE.Group();
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffe0a0, emissiveIntensity: 3 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), bulbMat);
    b.position.set(Math.cos(a) * 0.9, 0.12, Math.sin(a) * 0.9);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.08, 10), m.brass);
    cup.position.set(Math.cos(a) * 0.9, 0.03, Math.sin(a) * 0.9);
    bulbs.add(b, cup);
  }
  g.add(bulbs);
  g.position.set(x, y, z);
  g.userData.crystals = crystals;
  return g;
}

export function pedestal() {
  const m = mat();
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.75, 1.0, 40), new THREE.MeshPhysicalMaterial({ color: 0x2a1f4a, roughness: 0.25, clearcoat: 1 }));
  base.position.y = 0.5; base.castShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.04, 10, 48), m.brass);
  ring.rotation.x = Math.PI / 2; ring.position.y = 1.0;
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.04, 10, 48), m.brass);
  ring2.rotation.x = Math.PI / 2; ring2.position.y = 0.04;
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 48), goldMaterial({ roughness: 0.22 }));
  coin.position.y = 1.5;
  coin.rotation.x = Math.PI / 2;
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.3, 40, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xcfe6ff, roughness: 0.03, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 2 }));
  glass.position.y = 1.65;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.04, 40), m.brass);
  lid.position.y = 2.32;
  g.add(base, ring, ring2, coin, glass, lid);
  g.userData.spin = coin;
  return g;
}

export function fortuneWheel() {
  const m = mat();
  const g = new THREE.Group();
  const { canvas, ctx } = makeCanvas(1024, 1024);
  const cols = ['#2a2f3a', '#2f6fd6', '#2a2f3a', '#22a35a', '#2a2f3a', '#7d3ab0', '#2a2f3a', '#d4af37'];
  for (let i = 0; i < 24; i++) {
    ctx.beginPath(); ctx.moveTo(512, 512);
    ctx.arc(512, 512, 512, (i / 24) * Math.PI * 2, ((i + 1) / 24) * Math.PI * 2); ctx.closePath();
    ctx.fillStyle = cols[i % cols.length]; ctx.fill();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 3; ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(512, 512, 90, 0, Math.PI * 2); ctx.fillStyle = '#1a1305'; ctx.fill();
  const face = new THREE.Mesh(new THREE.CircleGeometry(1.5, 64), new THREE.MeshStandardMaterial({ map: canvasTexture(canvas), roughness: 0.5 }));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.08, 12, 64), m.brass);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.3, 24), m.brass);
  hub.rotation.x = Math.PI / 2; hub.position.z = 0.1;
  const pegs = merged(Array.from({ length: 24 }, (_, i) => ({ geo: new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), p: [Math.cos((i / 24) * Math.PI * 2) * 1.45, Math.sin((i / 24) * Math.PI * 2) * 1.45, 0.06], r: [Math.PI / 2, 0, 0] })), m.brass);
  const wheelGroup = new THREE.Group();
  wheelGroup.add(face, rim, hub, pegs);
  wheelGroup.position.y = 2.2;
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffd76a, emissive: 0xffd76a, emissiveIntensity: 2 });
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), lampMat);
    l.position.set(Math.cos(a) * 1.72, 2.2 + Math.sin(a) * 1.72, 0.05);
    g.add(l);
  }
  const backplate = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 1.85, 0.1, 64), m.piano);
  backplate.rotation.x = Math.PI / 2; backplate.position.set(0, 2.2, -0.12);
  const stand = new THREE.Mesh(rbox(0.6, 0.9, 0.6, 0.03), m.piano);
  stand.position.y = 0.45;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.4, 16), m.chrome);
  post.position.set(0, 1.5, -0.1);
  const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 3), new THREE.MeshStandardMaterial({ color: 0xe74c3c, metalness: 0.3, roughness: 0.3 }));
  pointer.rotation.x = Math.PI; pointer.position.set(0, 3.95, 0.12);
  g.add(wheelGroup, backplate, stand, post, pointer);
  g.userData.spin = wheelGroup;
  return g;
}

/** Arcade-Automat: Hochglanzgehäuse mit Chromrahmen, Bildschirm hinter Glas, Leuchtmarquee, Tastenfeld, LED-Sockel.
 *  userData: screen (Attrappe), glass, bezel – Spiel blendet screen+glass aus. */
export function cabinet(screenTex, title, color) {
  const m = mat();
  const g = new THREE.Group();
  const body = new THREE.Mesh(rbox(1.1, 2.1, 0.9, 0.05, 4), m.piano);
  body.position.y = 1.05; body.castShadow = true;
  g.add(body);
  const sides = merged([-1, 1].map((s) => ({ geo: box(0.02, 1.9, 0.86), p: [s * 0.55, 1.05, -0.02] })), m.bodyRed);
  g.add(sides);
  const bezel = new THREE.Mesh(rbox(0.98, 0.98, 0.05, 0.03), m.piano);
  bezel.position.set(0, 1.35, 0.45);
  g.add(bezel);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), new THREE.MeshStandardMaterial({ map: screenTex, emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: 1.4, roughness: 0.3 }));
  screen.position.set(0, 1.35, 0.478);
  g.add(screen);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.92), m.glass);
  glass.position.set(0, 1.35, 0.49); glass.renderOrder = 2;
  g.add(glass);
  g.add(merged([
    { geo: box(1.02, 0.03, 0.02), p: [0, 1.85, 0.46] }, { geo: box(1.02, 0.03, 0.02), p: [0, 0.85, 0.46] },
    { geo: box(0.03, 1.0, 0.02), p: [-0.5, 1.35, 0.46] }, { geo: box(0.03, 1.0, 0.02), p: [0.5, 1.35, 0.46] },
    { geo: box(1.16, 0.05, 0.96), p: [0, 0.025, 0] },
  ], m.chrome));
  const mq = neonTexture(title, color);
  const marquee = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.3), new THREE.MeshStandardMaterial({ map: mq, emissive: 0xffffff, emissiveMap: mq, emissiveIntensity: 1.7, roughness: 0.3 }));
  marquee.position.set(0, 1.95, 0.46);
  g.add(marquee);
  const deck = new THREE.Mesh(rbox(1.0, 0.1, 0.35, 0.03), m.bodyRed);
  deck.position.set(0, 0.82, 0.55); deck.rotation.x = -0.3;
  g.add(deck);
  [0x2ecc71, 0xf1c40f, 0xff2d2d].forEach((c, i) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.037, 0.03, 20), new THREE.MeshPhysicalMaterial({ color: c, emissive: c, emissiveIntensity: 0.6, roughness: 0.3, clearcoat: 1 }));
    b.position.set(-0.2 + i * 0.2, 0.88, 0.56); b.rotation.x = -0.3;
    g.add(b);
  });
  // Lautsprechergitter
  const grille = merged([-0.3, 0.3].map((x) => ({ geo: new THREE.CylinderGeometry(0.06, 0.06, 0.01, 20), p: [x, 0.55, 0.455], r: [Math.PI / 2, 0, 0] })), m.matteBlack);
  g.add(grille);
  const stripe = new THREE.Mesh(box(1.14, 0.04, 0.94), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6 }));
  stripe.position.y = 0.3;
  g.add(stripe);
  g.userData.screen = screen; g.userData.glass = glass; g.userData.bezel = bezel;
  return g;
}

/** Info-Tafel: "So verdienst du Coins" */
function rewardsBoardTexture() {
  const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  const W = 1024; const H = 1280;
  const { canvas, ctx } = makeCanvas(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1a1410'); g.addColorStop(1, '#0d0a08');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 10; ctx.strokeRect(28, 28, W - 56, H - 56);
  ctx.strokeStyle = 'rgba(212,175,55,0.45)'; ctx.lineWidth = 3; ctx.strokeRect(48, 48, W - 96, H - 96);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f5d97a'; ctx.font = '900 66px Cinzel, Georgia, serif';
  ctx.shadowColor = '#d4af37'; ctx.shadowBlur = 24;
  ctx.fillText('SO VERDIENST DU', W / 2, 130);
  ctx.fillText('COINS', W / 2, 205);
  ctx.shadowBlur = 0;
  const rows = [
    ['📅', 'Tagesbonus', '500 Coins pro Tag, +100 je Tag in Folge', 'bis zu 1.500 – Serie nicht reißen lassen!'],
    ['📋', 'Tagesaufgaben', 'Jeden Tag 3 neue Aufgaben, z. B. „3× Blackjack“', '100–400 Coins pro erfüllter Aufgabe'],
    ['🪙', 'Chips in der Halle', 'Leuchtende Chips liegen herum – einfach', 'drüberlaufen: 10–50 Coins, bis 500 am Tag'],
    ['🏆', 'Erfolge', '13 einmalige Boni: 100 Runden, 10×-Gewinn,', 'alle Spiele, 5 Siege in Folge … bis 2.500'],
  ];
  rows.forEach(([icon, title, l1, l2], i) => {
    const y = 300 + i * 225;
    ctx.fillStyle = 'rgba(212,175,55,0.08)'; roundRect(ctx, 70, y - 20, W - 140, 195, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(212,175,55,0.35)'; ctx.lineWidth = 2; roundRect(ctx, 70, y - 20, W - 140, 195, 18); ctx.stroke();
    ctx.textAlign = 'left';
    ctx.font = `86px ${EMOJI_FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(icon, 100, y + 78);
    ctx.fillStyle = '#f5d97a'; ctx.font = '800 48px Inter, Arial'; ctx.fillText(title, 230, y + 30);
    ctx.fillStyle = '#e8e2d2'; ctx.font = '500 34px Inter, Arial'; ctx.fillText(l1, 230, y + 92); ctx.fillText(l2, 230, y + 140);
  });
  ctx.textAlign = 'center'; ctx.fillStyle = '#8fb3ff'; ctx.font = '600 32px Inter, Arial';
  ctx.fillText('Tafel anklicken oder oben rechts „🎁 Belohnungen“ öffnen', W / 2, H - 90);
  return canvasTexture(canvas);
}

/** Höhe der Tafelmitte über dem Boden bei der stehenden Variante */
export const STAND_CENTER_Y = 1.9;
export function rewardsBoard({ standing = false } = {}) {
  const m = mat();
  const g = new THREE.Group();
  const w = standing ? 1.5 : 2.2; const hgt = w * 1.25;
  const tex = rewardsBoardTexture();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.5 }));
  const frame = new THREE.Mesh(box(w + 0.12, hgt + 0.12, 0.06), m.brass);
  frame.position.z = -0.035;
  const back = new THREE.Mesh(box(w + 0.14, hgt + 0.14, 0.04), m.piano);
  back.position.z = -0.06;
  g.add(back, frame, face);
  if (standing) {
    // Staffelei: zwei Beine HINTER der Tafel vom Boden bis zur Oberkante, ein schräges Stützbein nach hinten,
    // vorne nur eine flache Ablageleiste – nichts ragt durch die Tafel.
    const floorY = -STAND_CENTER_Y;
    const topY = hgt / 2 + 0.05;
    const legLen = topY - floorY;
    for (const lx of [-w / 2 + 0.12, w / 2 - 0.12]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, legLen, 10), m.brass);
      leg.position.set(lx, (topY + floorY) / 2, -0.12);
      g.add(leg);
    }
    const backZ = -0.95;
    const rearLen = Math.hypot(legLen, backZ + 0.12);
    const rear = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, rearLen, 10), m.brass);
    rear.position.set(0, (topY + floorY) / 2, (backZ - 0.12) / 2);
    rear.rotation.x = Math.atan2(-(backZ + 0.12), legLen);
    g.add(rear);
    const crossbar = new THREE.Mesh(box(w - 0.1, 0.05, 0.05), m.brass);
    crossbar.position.set(0, floorY + 0.6, -0.12);
    g.add(crossbar);
    const ledge = new THREE.Mesh(box(w + 0.16, 0.05, 0.14), m.brass);
    ledge.position.set(0, -hgt / 2 - 0.09, 0.04);
    g.add(ledge);
  }
  return g;
}

/** Dolly: Markierung des Croupiers für die Gewinnzahl (Messingfuß, Acrylsäule) */
export function dolly() {
  const m = mat();
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.01, 16), m.brass);
  base.position.y = 0.005;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.07, 12), m.acrylic);
  body.position.y = 0.045;
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.015, 12, 10), m.brass);
  top.position.y = 0.085;
  g.add(base, body, top);
  return g;
}

/** Samtkordel-Pfosten (Messing) mit Kugelknauf */
export function ropePost() {
  const m = mat();
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.95, 14), m.brass);
  post.position.y = 0.5;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.05, 24), m.brass);
  foot.position.y = 0.025;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.04, 14), m.brass);
  collar.position.y = 0.98;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 12), m.brass);
  knob.position.y = 1.04;
  g.add(post, foot, collar, knob);
  return g;
}

/** Wandleuchte: Messinghalter mit zwei Kerzenlampen und Stoffschirm */
export function sconce() {
  const m = mat();
  const g = new THREE.Group();
  const plate = new THREE.Mesh(box(0.14, 0.3, 0.03), m.brass);
  const arm = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 8, 20, Math.PI), m.brass);
  arm.rotation.z = Math.PI; arm.position.set(0, 0.05, 0.1); arm.rotation.x = Math.PI / 2;
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0xffe3b8, emissive: 0xffc070, emissiveIntensity: 1.6, side: THREE.DoubleSide });
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 0.18, 16, 1, true), shadeMat);
  shade.position.set(0, 0.16, 0.16);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 10), new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffe0a0, emissiveIntensity: 3 }));
  bulb.position.set(0, 0.12, 0.16);
  g.add(plate, arm, shade, bulb);
  return g;
}

/** Gerahmtes Wandbild (Kunstdruck aus Farbverläufen) */
export function painting(w = 1.2, h = 0.9, seed = 0) {
  const m = mat();
  const g = new THREE.Group();
  const { canvas, ctx } = makeCanvas(512, 384);
  const palettes = [['#1c2b52', '#c9a24a', '#7a1a30'], ['#0f3d2e', '#d4af37', '#2f6b66'], ['#3a1e10', '#e6c26a', '#8e1a27'], ['#2a1f4a', '#ffd76a', '#35c7ff']];
  const pal = palettes[seed % palettes.length];
  const bg = ctx.createLinearGradient(0, 0, 512, 384); bg.addColorStop(0, pal[0]); bg.addColorStop(1, '#0a0a0c');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 384);
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = pal[(i + seed) % 3]; ctx.globalAlpha = 0.25 + Math.random() * 0.5;
    ctx.beginPath(); ctx.ellipse(Math.random() * 512, Math.random() * 384, 30 + Math.random() * 120, 20 + Math.random() * 80, Math.random() * Math.PI, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 6; ctx.strokeRect(20, 20, 472, 344);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: canvasTexture(canvas), roughness: 0.6 }));
  face.position.z = 0.04;
  const frame = merged([
    { geo: box(w + 0.16, 0.08, 0.06), p: [0, h / 2 + 0.04, 0.03] }, { geo: box(w + 0.16, 0.08, 0.06), p: [0, -h / 2 - 0.04, 0.03] },
    { geo: box(0.08, h, 0.06), p: [-w / 2 - 0.04, 0, 0.03] }, { geo: box(0.08, h, 0.06), p: [w / 2 + 0.04, 0, 0.03] },
  ], m.brass);
  g.add(frame, face);
  return g;
}
