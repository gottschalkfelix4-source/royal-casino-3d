import * as THREE from 'three';
import { makeCanvas, canvasTexture, goldMaterial, woodTexture, woodNormal, glossyMaterial } from './assets.js';

export const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const colorOf = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');
export const POCKET = (Math.PI * 2) / ORDER.length;
export const R_TRACK = 4.2;
export const R_POCKET = 3.1;
export const Y_TRACK = 1.02;
export const Y_POCKET = 0.74;

function numberRingTexture() {
  const S = 1024;
  const { canvas, ctx } = makeCanvas(S, S);
  const c = S / 2;
  const scale = c / 3.7;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(0.42 * scale)}px Inter, Arial`;
  ORDER.forEach((n, i) => {
    const a = i * POCKET;
    const r = 3.32 * scale;
    ctx.save();
    ctx.translate(c + r * Math.cos(a), c - r * Math.sin(a));
    ctx.rotate(Math.PI / 2 - a);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 6;
    ctx.fillText(String(n), 0, 0);
    ctx.restore();
  });
  return canvasTexture(canvas);
}

/**
 * Realistischer Roulette-Kessel (Radius ≈ 5 Einheiten): Holzschale, Kugelbahn mit Rautenhindernissen,
 * 37 Fächer mit Messingstegen, Zahlenkranz, Kegel und Turm. Liefert { group, ball } – group rotiert um Y.
 */
export function buildRouletteWheel({ ball = true } = {}) {
  const group = new THREE.Group();
  const woodMat = new THREE.MeshPhysicalMaterial({ map: woodTexture(), normalMap: woodNormal(), normalScale: new THREE.Vector2(0.5, 0.5), color: 0x9a7048, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const gold = goldMaterial({ roughness: 0.28 });

  const outerWall = new THREE.Mesh(new THREE.CylinderGeometry(4.75, 4.95, 0.95, 96, 1, true), woodMat);
  outerWall.position.y = 0.475; outerWall.castShadow = true;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(4.95, 96), woodMat);
  bottom.rotation.x = -Math.PI / 2; bottom.position.y = 0.001;
  const track = new THREE.Mesh(new THREE.RingGeometry(3.7, 4.75, 96), new THREE.MeshPhysicalMaterial({ color: 0x3a2412, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.15 }));
  track.rotation.x = -Math.PI / 2; track.position.y = 0.9; track.receiveShadow = true;
  const innerWall = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.7, 0.32, 96, 1, true), new THREE.MeshStandardMaterial({ color: 0x1c110a, roughness: 0.4, side: THREE.DoubleSide }));
  innerWall.position.y = 0.74;
  const rimTrim = new THREE.Mesh(new THREE.TorusGeometry(4.75, 0.06, 12, 128), gold);
  rimTrim.rotation.x = Math.PI / 2; rimTrim.position.y = 0.95;
  group.add(outerWall, bottom, track, innerWall, rimTrim);
  // Rautenförmige Hindernisse auf der Kugelbahn
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 16;
    const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), gold);
    diamond.scale.set(1, 0.5, 1.6);
    diamond.position.set(4.2 * Math.cos(a), 0.94, -4.2 * Math.sin(a));
    diamond.rotation.y = a;
    group.add(diamond);
  }

  const mats = { red: glossyMaterial(0xb3261e), black: glossyMaterial(0x15161a), green: glossyMaterial(0x1e8f4e) };
  ORDER.forEach((n, i) => {
    const a = i * POCKET;
    const wedge = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.7, 0.6, 4, 1, false, a + Math.PI / 2 - POCKET / 2, POCKET), mats[colorOf(n)]);
    wedge.position.y = 0.3; wedge.receiveShadow = true;
    group.add(wedge);
    const fret = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.14, 0.05), gold);
    const fa = a + POCKET / 2;
    fret.position.set(3.08 * Math.cos(fa), 0.66, -3.08 * Math.sin(fa));
    fret.rotation.y = fa;
    fret.castShadow = true;
    group.add(fret);
  });
  const numbers = new THREE.Mesh(new THREE.RingGeometry(2.45, 3.7, 96), new THREE.MeshBasicMaterial({ map: numberRingTexture(), transparent: true }));
  numbers.rotation.x = -Math.PI / 2; numbers.position.y = 0.605;
  group.add(numbers);

  const cone = new THREE.Mesh(new THREE.ConeGeometry(2.45, 0.7, 96), new THREE.MeshPhysicalMaterial({ color: 0x4a2c16, roughness: 0.3, clearcoat: 0.8 }));
  cone.position.y = 0.95; cone.castShadow = true;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 1.1, 32), gold);
  hub.position.y = 1.4; hub.castShadow = true;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 32), gold);
  knob.position.y = 2.05;
  group.add(cone, hub, knob);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 1.4, 6, 12), gold);
    arm.rotation.z = Math.PI / 2; arm.rotation.y = (i * Math.PI) / 2;
    arm.position.y = 1.75;
    group.add(arm);
  }

  let ballMesh = null;
  if (ball) {
    ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 32, 32), new THREE.MeshPhysicalMaterial({ color: 0xf5f5f5, roughness: 0.1, clearcoat: 1 }));
    ballMesh.castShadow = true;
  }
  return { group, ball: ballMesh };
}
