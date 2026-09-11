import * as THREE from 'three';
import { makeCanvas, canvasTexture, normalMapFromCanvas } from './assets.js';

/**
 * Prozedurale Pflanzen mit echten Blatt-Texturen (Alpha-Ausschnitt), Adern, Glanz und Windbewegung:
 * Palme (Wedel aus gebogenen Blattstreifen) und Ficus/Busch (Blattkrone als InstancedMesh).
 */

const cache = {};

/** Palmwedel: Mittelrippe mit gefiederten Blättchen, transparenter Hintergrund */
function frondTexture() {
  if (cache.frond) return cache.frond;
  const W = 256; const H = 1024;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.clearRect(0, 0, W, H);
  // Rippe
  const rib = ctx.createLinearGradient(0, 0, 0, H);
  rib.addColorStop(0, '#6d8a2a'); rib.addColorStop(1, '#3f5a16');
  ctx.strokeStyle = rib; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(W / 2, 20); ctx.lineTo(W / 2, H - 10); ctx.stroke();
  // Dicht gefiederte Blättchen beidseitig (überlappend), unten länger, oben kürzer, leicht unterschiedlich getönt
  const n = 58;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const y = 50 + t * (H - 80);
    const len = 124 * (0.3 + 0.7 * Math.sin(Math.PI * (0.12 + 0.88 * t)));
    for (const s of [-1, 1]) {
      const tone = 0.85 + ((i * 7 + (s + 1)) % 5) * 0.06;
      const g = ctx.createLinearGradient(W / 2, y, W / 2 + s * len, y - len * 0.45);
      g.addColorStop(0, `rgb(${Math.round(110 * tone)},${Math.round(150 * tone)},${Math.round(48 * tone)})`);
      g.addColorStop(0.55, `rgb(${Math.round(66 * tone)},${Math.round(125 * tone)},${Math.round(34 * tone)})`);
      g.addColorStop(1, `rgb(${Math.round(40 * tone)},${Math.round(88 * tone)},${Math.round(22 * tone)})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(W / 2, y - 7);
      ctx.quadraticCurveTo(W / 2 + s * len * 0.5, y - len * 0.52, W / 2 + s * len, y - len * 0.4);
      ctx.quadraticCurveTo(W / 2 + s * len * 0.55, y - len * 0.16, W / 2, y + 14);
      ctx.closePath();
      ctx.fill();
      // Blattader
      ctx.strokeStyle = 'rgba(210,235,130,0.3)'; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(W / 2, y + 3); ctx.quadraticCurveTo(W / 2 + s * len * 0.5, y - len * 0.3, W / 2 + s * len * 0.95, y - len * 0.38); ctx.stroke();
    }
  }
  // Rippe erneut oben drauf, damit sie sichtbar bleibt
  ctx.strokeStyle = rib; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(W / 2, 20); ctx.lineTo(W / 2, H - 10); ctx.stroke();
  const tex = canvasTexture(canvas);
  tex.anisotropy = 8;
  cache.frond = tex;
  return tex;
}

/** Einzelnes ovales Blatt mit Mittelrippe und Seitenadern */
function leafTexture() {
  if (cache.leaf) return cache.leaf;
  const S = 256;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.clearRect(0, 0, S, S);
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#5f9a34'); g.addColorStop(0.5, '#3f7d22'); g.addColorStop(1, '#2a5a16');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(S / 2, 8);
  ctx.bezierCurveTo(S * 0.98, S * 0.25, S * 0.9, S * 0.8, S / 2, S - 6);
  ctx.bezierCurveTo(S * 0.1, S * 0.8, S * 0.02, S * 0.25, S / 2, 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(210,235,140,0.55)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(S / 2, 14); ctx.lineTo(S / 2, S - 12); ctx.stroke();
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 9; i++) {
    const y = 40 + i * 22;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(S / 2, y); ctx.quadraticCurveTo(S / 2 + s * 40, y + 10, S / 2 + s * 78, y + 34); ctx.stroke(); }
  }
  // leichte Glanzpunkte
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.ellipse(S * 0.38, S * 0.35, 30, 60, -0.6, 0, Math.PI * 2); ctx.fill();
  const tex = canvasTexture(canvas);
  tex.anisotropy = 8;
  cache.leaf = tex;
  return tex;
}

function barkTexture() {
  if (cache.bark) return cache.bark;
  const { canvas, ctx } = makeCanvas(256, 512);
  ctx.fillStyle = '#6b4a2c'; ctx.fillRect(0, 0, 256, 512);
  for (let y = 0; y < 512; y += 14) {
    ctx.fillStyle = `rgba(${40 + Math.random() * 30},${25 + Math.random() * 20},10,${0.35 + Math.random() * 0.3})`;
    ctx.beginPath(); ctx.ellipse(128, y, 150, 6 + Math.random() * 4, 0, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 300; i++) { ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`; ctx.fillRect(Math.random() * 256, Math.random() * 512, 2, 6); }
  const tex = canvasTexture(canvas, { repeat: [1, 2] });
  cache.bark = { map: tex, normal: normalMapFromCanvas(canvas, { strength: 2.5, repeat: [1, 2] }) };
  return cache.bark;
}

function potMesh(radius = 0.34) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.78, 0.62, 24), new THREE.MeshPhysicalMaterial({ color: 0x8a5a3a, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 }));
  pot.position.y = 0.31; pot.castShadow = true; pot.receiveShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.03, 10, 32), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1, roughness: 0.3 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.62;
  const soil = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.95, 24), new THREE.MeshStandardMaterial({ color: 0x2b1d12, roughness: 1 }));
  soil.rotation.x = -Math.PI / 2; soil.position.y = 0.6;
  g.add(pot, rim, soil);
  return g;
}

/** Palme im Topf; userData.sway(t) bewegt die Wedel */
export function createPalm({ height = 2.4, fronds = 13, seed = Math.random() } = {}) {
  const g = new THREE.Group();
  g.add(potMesh(0.36));
  const bark = barkTexture();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.13, height, 10, 6), new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normal, roughness: 0.9 }));
  // leichte Krümmung
  const pos = trunk.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); const k = (y + height / 2) / height; pos.setX(i, pos.getX(i) + Math.sin(k * 1.6) * 0.12 * k); }
  pos.needsUpdate = true; trunk.geometry.computeVertexNormals();
  trunk.position.y = 0.6 + height / 2; trunk.castShadow = true;
  g.add(trunk);
  const topY = 0.6 + height;
  const topX = Math.sin(1.6) * 0.12;
  const frondTex = frondTexture();
  const frondMat = new THREE.MeshStandardMaterial({ map: frondTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.65, metalness: 0 });
  const list = [];
  for (let i = 0; i < fronds; i++) {
    const len = 1.9 + ((i * 5) % 4) * 0.12;
    const geo = new THREE.PlaneGeometry(0.62, len, 2, 14);
    const p = geo.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const y = p.getY(v) + len / 2;         // 0..len vom Ansatz
      const k = y / len;
      const x = p.getX(v);
      p.setY(v, y);
      // Wedel hängt nach außen/unten durch, Blättchen fallen seitlich leicht ab (V-Profil)
      p.setZ(v, -Math.pow(k, 2) * 0.95 - Math.abs(x) * 0.25);
      p.setX(v, x * (1 - k * 0.35));         // zur Spitze schmaler
    }
    p.needsUpdate = true; geo.computeVertexNormals();
    const frond = new THREE.Mesh(geo, frondMat);
    const a = (i / fronds) * Math.PI * 2 + seed * 6;
    const tilt = -0.55 - ((i * 7) % 5) * 0.12;
    frond.position.set(topX, topY, 0);
    frond.rotation.set(tilt, a, 0, 'YXZ');
    frond.castShadow = true;
    frond.userData.base = tilt;
    frond.userData.phase = i * 0.7 + seed * 10;
    g.add(frond);
    list.push(frond);
  }
  // Kokos-/Blattansatz
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshStandardMaterial({ color: 0x4a3a1c, roughness: 0.9 }));
  crown.position.set(topX, topY, 0);
  g.add(crown);
  g.userData.sway = (t) => { for (const f of list) f.rotation.x = f.userData.base + Math.sin(t * 1.1 + f.userData.phase) * 0.035; };
  return g;
}

/** Ficus/Busch: Stamm mit Ästen, Blattkrone als eine Instanz-Wolke; userData.sway(t) wiegt die Krone */
export function createFicus({ height = 1.7, leaves = 160, seed = Math.random() } = {}) {
  const g = new THREE.Group();
  g.add(potMesh(0.34));
  const bark = barkTexture();
  const trunkMat = new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normal, roughness: 0.9 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.07, height * 0.7, 8), trunkMat);
  trunk.position.y = 0.6 + height * 0.35; trunk.castShadow = true;
  g.add(trunk);
  for (let i = 0; i < 4; i++) {
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.03, 0.6, 6), trunkMat);
    const a = (i / 4) * Math.PI * 2 + seed;
    br.position.set(Math.cos(a) * 0.18, 0.6 + height * 0.62, Math.sin(a) * 0.18);
    br.rotation.set(Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8);
    g.add(br);
  }
  const crown = new THREE.Group();
  crown.position.y = 0.6 + height * 0.72;
  const leafGeo = new THREE.PlaneGeometry(0.2, 0.3);
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
  const inst = new THREE.InstancedMesh(leafGeo, leafMat, leaves);
  const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const p = new THREE.Vector3(); const s = new THREE.Vector3();
  let rs = seed * 1000;
  const rnd = () => { rs = (rs * 9301 + 49297) % 233280; return rs / 233280; };
  for (let i = 0; i < leaves; i++) {
    // Punkte auf/in einer abgeflachten Kugel
    const u = rnd() * Math.PI * 2; const v = Math.acos(2 * rnd() - 1);
    const r = 0.45 + rnd() * 0.25;
    p.set(Math.sin(v) * Math.cos(u) * r, Math.cos(v) * r * 0.85, Math.sin(v) * Math.sin(u) * r);
    // Blatt zeigt nach außen, leicht zufällig gedreht
    const normal = p.clone().normalize();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    const twist = new THREE.Quaternion().setFromAxisAngle(normal, rnd() * Math.PI * 2);
    q.premultiply(twist);
    s.setScalar(0.8 + rnd() * 0.5);
    m.compose(p, q, s);
    inst.setMatrixAt(i, m);
  }
  inst.castShadow = true;
  crown.add(inst);
  g.add(crown);
  g.userData.sway = (t) => { crown.rotation.z = Math.sin(t * 0.9 + seed * 7) * 0.02; crown.rotation.x = Math.cos(t * 0.7 + seed * 3) * 0.015; };
  return g;
}
