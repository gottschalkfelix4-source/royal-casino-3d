import * as THREE from 'three';
import { makeCanvas, canvasTexture, goldMaterial, woodTexture, woodNormal } from './assets.js';

export const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const colorOf = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');
export const POCKET = (Math.PI * 2) / ORDER.length;
// Kugelbahn (außen, ruhend) und Fach (im Rotor) – Radius und Höhe des Kugelmittelpunkts
export const R_TRACK = 4.55;
export const Y_TRACK = 0.99;
export const R_POCKET = 3.0;
export const Y_POCKET = 0.65;
export const BALL_R = 0.13;
/** Radius der äußeren Schale (für Platzierung auf dem Tisch) */
export const BOWL_R = 5.05;

const POCKET_IN = 2.6; const POCKET_OUT = 3.4; const POCKET_Y = 0.52; const FRET_H = 0.15;
const RING_IN = 3.4; const RING_OUT = 3.72; const RING_Y_IN = 0.68; const RING_Y_OUT = 0.6;

/** Zahlenkranz als Streifen (zylindrische UV des Kegelbands): farbige Sektoren, weiße Zahlen, Goldstege */
function numberBandTexture() {
  const N = ORDER.length; const SW = 112; const W = N * SW; const H = 160;
  const { canvas, ctx } = makeCanvas(W, H);
  const fill = { red: '#b3261e', black: '#141418', green: '#1e8f4e' };
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ORDER.forEach((n, i) => {
    // Sektor i liegt bei u = (a_i + π/2) / 2π mit a_i = i·POCKET
    const u = (((i * POCKET + Math.PI / 2) / (Math.PI * 2)) % 1 + 1) % 1;
    const cx = u * W;
    const x0 = cx - SW / 2;
    const draw = (ox) => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      const c = fill[colorOf(n)];
      g.addColorStop(0, c); g.addColorStop(0.5, c); g.addColorStop(1, '#000000');
      ctx.fillStyle = g; ctx.fillRect(x0 + ox, 0, SW, H);
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x0 + ox, 0, SW, H * 0.45);
      ctx.fillStyle = '#d4af37'; ctx.fillRect(x0 + ox - 3, 0, 6, H);
      ctx.fillStyle = '#ffffff'; ctx.font = '700 84px Inter, Arial';
      ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 6;
      ctx.fillText(String(n), cx + ox, H * 0.52);
      ctx.shadowBlur = 0;
    };
    draw(0); if (x0 < 0) draw(W); if (x0 + SW > W) draw(-W);
  });
  const tex = canvasTexture(canvas, { anisotropy: 16 });
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function latheProfile(points, segments = 128) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

/**
 * Realistischer Roulette-Kessel (Außenradius ≈ 5 Einheiten, 1 Einheit ≈ 15 cm bei Tischmaßstab 0,15):
 * ruhende Mahagonischale mit Kugelbahn, Schräge und 8 Rauten-Hindernissen; drehbarer Rotor mit 37 farbigen
 * Fächern, Messingstegen, Zahlenkranz, Kegel und Turm. Liefert { group, rotor, ball } – nur `rotor` dreht sich.
 */
export function buildRouletteWheel({ ball = true } = {}) {
  const group = new THREE.Group();
  const woodMat = new THREE.MeshPhysicalMaterial({ map: woodTexture(), normalMap: woodNormal(), normalScale: new THREE.Vector2(0.4, 0.4), color: 0xa06a3c, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.12 });
  const woodDark = new THREE.MeshPhysicalMaterial({ map: woodTexture(), normalMap: woodNormal(), normalScale: new THREE.Vector2(0.3, 0.3), color: 0x5a3418, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
  const trackMat = new THREE.MeshPhysicalMaterial({ color: 0x2c1a0e, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.1 });
  const gold = goldMaterial({ roughness: 0.24 });
  const goldDull = goldMaterial({ roughness: 0.4, color: 0xb8952f });

  // ---------- Schale (ruhend) ----------
  const bowl = new THREE.Mesh(latheProfile([
    [3.6, 0.0], [4.4, 0.0], [4.95, 0.02], [5.05, 0.2], [5.05, 0.9], [5.0, 0.98], [4.9, 1.0], [4.86, 0.98], [4.85, 0.92],
  ]), woodMat);
  bowl.castShadow = true; bowl.receiveShadow = true;
  group.add(bowl);
  // Kugelbahn (sanft geneigt) und Schräge (Apron) zum Rotor hinunter
  const track = new THREE.Mesh(latheProfile([[4.85, 0.92], [4.3, 0.84]]), trackMat);
  track.receiveShadow = true;
  const apron = new THREE.Mesh(latheProfile([[4.3, 0.84], [3.78, 0.62], [3.74, 0.55]]), trackMat);
  apron.receiveShadow = true;
  group.add(track, apron);
  // Rand-Zierring
  const rimTrim = new THREE.Mesh(new THREE.TorusGeometry(4.93, 0.05, 12, 160), gold);
  rimTrim.rotation.x = Math.PI / 2; rimTrim.position.y = 0.995;
  const trackTrim = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.03, 8, 160), goldDull);
  trackTrim.rotation.x = Math.PI / 2; trackTrim.position.y = 0.845;
  group.add(rimTrim, trackTrim);
  // Rauten-Hindernisse (abwechselnd radial und tangential), auf der Schräge liegend
  const slope = Math.atan2(0.84 - 0.62, 4.3 - 3.78);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 16;
    const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), gold);
    diamond.scale.set(i % 2 ? 1.7 : 1, 0.55, i % 2 ? 1 : 1.7);
    const r = 4.06; const y = 0.84 - (4.3 - r) * Math.tan(slope) + 0.04;
    diamond.position.set(r * Math.cos(a), y, -r * Math.sin(a));
    diamond.rotation.y = a;
    diamond.rotateZ(-slope * 0.9);
    diamond.castShadow = true;
    group.add(diamond);
  }
  // Nullpunkt-Markierung außen (kleine Messingplakette)
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.02), gold);
  plate.position.set(0, 0.6, 5.06);
  group.add(plate);

  // ---------- Rotor (dreht sich) ----------
  const rotor = new THREE.Group();
  group.add(rotor);
  const pocketMats = {
    red: new THREE.MeshPhysicalMaterial({ color: 0xb3261e, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }),
    black: new THREE.MeshPhysicalMaterial({ color: 0x141418, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }),
    green: new THREE.MeshPhysicalMaterial({ color: 0x1e8f4e, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }),
  };
  // Fächer: farbige Ringsektoren (Boden) – je Farbe ein Mesh
  const sectors = { red: [], black: [], green: [] };
  ORDER.forEach((n, i) => {
    const a = i * POCKET;
    const geo = new THREE.RingGeometry(POCKET_IN, POCKET_OUT, 3, 1, a - POCKET / 2, POCKET);
    sectors[colorOf(n)].push(geo);
  });
  for (const [c, geos] of Object.entries(sectors)) {
    const merged = geos.length === 1 ? geos[0] : mergeRings(geos);
    const mesh = new THREE.Mesh(merged, pocketMats[c]);
    mesh.rotation.x = -Math.PI / 2; mesh.position.y = POCKET_Y; mesh.receiveShadow = true;
    rotor.add(mesh);
  }
  // Fachwand außen (dunkel) und Messingstege
  const pocketWall = new THREE.Mesh(new THREE.CylinderGeometry(POCKET_OUT, POCKET_OUT, FRET_H, 128, 1, true), new THREE.MeshStandardMaterial({ color: 0x1a1008, roughness: 0.5, side: THREE.DoubleSide }));
  pocketWall.position.y = POCKET_Y + FRET_H / 2;
  rotor.add(pocketWall);
  const fretGeo = new THREE.BoxGeometry(POCKET_OUT - POCKET_IN + 0.02, FRET_H, 0.06);
  const frets = new THREE.InstancedMesh(fretGeo, gold, ORDER.length);
  const fm = new THREE.Matrix4(); const fq = new THREE.Quaternion();
  ORDER.forEach((n, i) => {
    const fa = i * POCKET + POCKET / 2;
    fq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), fa);
    fm.compose(new THREE.Vector3(((POCKET_IN + POCKET_OUT) / 2) * Math.cos(fa), POCKET_Y + FRET_H / 2, -((POCKET_IN + POCKET_OUT) / 2) * Math.sin(fa)), fq, new THREE.Vector3(1, 1, 1));
    frets.setMatrixAt(i, fm);
  });
  frets.castShadow = true;
  rotor.add(frets);
  // Zahlenkranz: Kegelband mit Streifentextur
  const band = new THREE.Mesh(new THREE.CylinderGeometry(RING_IN, RING_OUT, RING_Y_IN - RING_Y_OUT, 148, 1, true), new THREE.MeshPhysicalMaterial({ map: numberBandTexture(), roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 }));
  band.position.y = (RING_Y_IN + RING_Y_OUT) / 2;
  rotor.add(band);
  const bandLip = new THREE.Mesh(new THREE.TorusGeometry(RING_OUT, 0.035, 8, 148), gold);
  bandLip.rotation.x = Math.PI / 2; bandLip.position.y = RING_Y_OUT;
  const bandTop = new THREE.Mesh(new THREE.TorusGeometry(RING_IN, 0.03, 8, 148), gold);
  bandTop.rotation.x = Math.PI / 2; bandTop.position.y = RING_Y_IN;
  rotor.add(bandLip, bandTop);
  // Kegel mit Messingring, Turm mit vier Armen und Knauf
  const cone = new THREE.Mesh(latheProfile([[POCKET_IN + 0.05, POCKET_Y + 0.02], [POCKET_IN, POCKET_Y + 0.14], [1.9, 0.62], [1.1, 0.82], [0.55, 1.0], [0.4, 1.02]], 96), woodDark);
  cone.castShadow = true;
  rotor.add(cone);
  const coneRing = new THREE.Mesh(new THREE.TorusGeometry(POCKET_IN + 0.02, 0.04, 8, 128), gold);
  coneRing.rotation.x = Math.PI / 2; coneRing.position.y = POCKET_Y + 0.14;
  rotor.add(coneRing);
  const hub = new THREE.Mesh(latheProfile([[0.42, 1.0], [0.5, 1.05], [0.42, 1.25], [0.34, 1.6], [0.3, 1.75], [0.14, 1.85], [0.0, 1.86]], 40), gold);
  hub.castShadow = true;
  rotor.add(hub);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 20), gold);
  knob.position.y = 2.05;
  rotor.add(knob);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 1.5, 6, 12), gold);
    arm.rotation.z = Math.PI / 2; arm.rotation.y = (i * Math.PI) / 2;
    arm.position.y = 1.72;
    rotor.add(arm);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), gold);
    tip.position.set(Math.cos((i * Math.PI) / 2) * 0.8, 1.72, Math.sin((i * Math.PI) / 2) * 0.8);
    rotor.add(tip);
  }

  let ballMesh = null;
  if (ball) {
    ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 32), new THREE.MeshPhysicalMaterial({ color: 0xf7f3ea, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 }));
    ballMesh.castShadow = true;
  }
  return { group, rotor, ball: ballMesh };
}

/** Mehrere RingGeometry-Sektoren zu einer Geometrie verbinden (gleiche Attribute) */
function mergeRings(geos) {
  const positions = []; const normals = []; const uvs = []; const indices = [];
  let offset = 0;
  for (const g of geos) {
    positions.push(...g.attributes.position.array);
    normals.push(...g.attributes.normal.array);
    uvs.push(...g.attributes.uv.array);
    for (const idx of g.index.array) indices.push(idx + offset);
    offset += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  out.setIndex(indices);
  return out;
}
