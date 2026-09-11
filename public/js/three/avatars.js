import * as THREE from 'three';
import { textSprite, makeCanvas, canvasTexture, normalMapFromCanvas } from './assets.js';

/** Deterministischer Hash aus dem Namen -> Zufallszahlen für Aussehen */
export function hueFor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
function rngFor(name) {
  let s = 2166136261;
  for (const c of name) { s ^= c.charCodeAt(0); s = Math.imul(s, 16777619) >>> 0; }
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

const SKIN = [0xf6d3b8, 0xefc3a0, 0xd9a877, 0xc68642, 0xa06a3c, 0x7a4a2a, 0x5b3a21];
const HAIR = [0x1a1210, 0x0b0b0b, 0x5a3a1c, 0x8a5a2a, 0xd8b06a, 0xe8d8b0, 0x8a1b1b, 0x6a6a72];
const CLOTH = [0xc0392b, 0x2e86de, 0x27ae60, 0x8e44ad, 0xe67e22, 0x16a085, 0x2c3e50, 0xf1c40f, 0xe84393, 0x1abc9c, 0x34495e, 0xd35400];
const PANTS = [0x1f2a44, 0x2c2c34, 0x3b2f2f, 0x1a1a1a, 0x4a4a52, 0x2f3b2f];

const geoCache = new Map();
const geo = (key, make) => { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); };
const texCache = {};

/**
 * Rotationskörper aus einem Profil [[y, radius], ...] (von unten nach oben), weich interpoliert –
 * ergibt Rumpf, Kopf und Gliedmaßen mit natürlicher Silhouette statt Kapseln/Zylindern.
 */
function lathe(key, profile, segs = 20) {
  return geo(key, () => {
    const curve = new THREE.CatmullRomCurve3(profile.map(([y, r]) => new THREE.Vector3(r, y, 0)), false, 'centripetal');
    const pts = curve.getPoints(profile.length * 5).map((p) => new THREE.Vector2(Math.max(0.0005, p.x), p.y));
    const g = new THREE.LatheGeometry(pts, segs);
    g.computeVertexNormals();
    return g;
  });
}
/** Feine Hautstruktur (Poren) als Normal-Map */
function skinNormal() {
  if (texCache.skin) return texCache.skin;
  const { canvas, ctx } = makeCanvas(128, 128);
  const img = ctx.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 26;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  texCache.skin = normalMapFromCanvas(canvas, { strength: 0.6, repeat: [4, 4] });
  return texCache.skin;
}

/** Feine Stoffstruktur (Normal-Map), einmal für alle Figuren */
function fabricNormal() {
  if (texCache.fabric) return texCache.fabric;
  const { canvas, ctx } = makeCanvas(128, 128);
  const img = ctx.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const i = (y * 128 + x) * 4;
    const v = 128 + ((x % 4 < 2) !== (y % 4 < 2) ? 14 : -14) + (Math.random() - 0.5) * 18;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  texCache.fabric = normalMapFromCanvas(canvas, { strength: 0.9, repeat: [6, 6] });
  return texCache.fabric;
}
/** Jeansstruktur */
function denimNormal() {
  if (texCache.denim) return texCache.denim;
  const { canvas, ctx } = makeCanvas(128, 128);
  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#9a9a9a'; ctx.lineWidth = 1.5;
  for (let i = -128; i < 256; i += 5) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 128, 128); ctx.stroke(); }
  texCache.denim = normalMapFromCanvas(canvas, { strength: 1.2, repeat: [5, 5] });
  return texCache.denim;
}
/** Shirt-Muster: uni, Streifen oder Logo */
function shirtMap(color, variant, rnd) {
  const { canvas, ctx } = makeCanvas(256, 256);
  const c = '#' + color.toString(16).padStart(6, '0');
  ctx.fillStyle = c; ctx.fillRect(0, 0, 256, 256);
  if (variant === 'stripes') {
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    for (let y = 0; y < 256; y += 32) ctx.fillRect(0, y, 256, 12);
  } else if (variant === 'logo') {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '900 64px Cinzel, Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(pick(rnd, ['RC', '777', 'ACE', 'VIP', '21']), 128, 96);
  }
  const tex = canvasTexture(canvas);
  return tex;
}

const cloth = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.92, sheen: 0.55, sheenRoughness: 0.8, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.3), normalMap: fabricNormal(), normalScale: new THREE.Vector2(0.35, 0.35), ...o });
const shadow = (m) => { m.castShadow = true; return m; };

/**
 * Detaillierte Spielfigur mit Gelenken (Blickrichtung -Z, Höhe ≈ 1,78).
 * userData: setPose('idle'|'walk'|'sit'), step(dt, moving), dealerStep(dt, t), lookAt(worldPos|null), label
 */
export function createAvatar({ name, bot = false, dealer = false }) {
  const rnd = rngFor(name);
  const g = new THREE.Group();
  const root = new THREE.Group();
  g.add(root);

  // ---------- Aussehen ----------
  const skinColor = pick(rnd, SKIN);
  const hairColor = pick(rnd, HAIR);
  const outfit = dealer ? 'dealer' : pick(rnd, ['tshirt', 'tshirt', 'shirt', 'hoodie', 'dress', 'suit']);
  const hairStyle = dealer ? pick(rnd, ['short', 'bun']) : pick(rnd, ['short', 'short', 'long', 'ponytail', 'bald', 'curly', 'bun']);
  const accessory = dealer ? 'none' : pick(rnd, ['none', 'none', 'none', 'glasses', 'cap', 'hat', 'glasses']);
  const shirtColor = dealer ? 0x15151a : pick(rnd, CLOTH);
  const shirtVariant = outfit === 'tshirt' ? pick(rnd, ['plain', 'stripes', 'logo']) : 'plain';
  const pantsColor = dealer ? 0x101014 : outfit === 'suit' ? 0x1a1a22 : pick(rnd, PANTS);
  const heightScale = 0.94 + rnd() * 0.12;
  const build = 0.92 + rnd() * 0.18;

  const skin = new THREE.MeshPhysicalMaterial({ color: skinColor, roughness: 0.52, clearcoat: 0.15, clearcoatRoughness: 0.5, sheen: 0.35, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xffd0b0), normalMap: skinNormal(), normalScale: new THREE.Vector2(0.25, 0.25) });
  const skinDark = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(skinColor).multiplyScalar(0.82), roughness: 0.6 });
  const hair = new THREE.MeshPhysicalMaterial({ color: hairColor, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35, sheen: 0.4, sheenColor: new THREE.Color(hairColor).lerp(new THREE.Color(0xffffff), 0.4) });
  const shirt = outfit === 'suit' ? new THREE.MeshPhysicalMaterial({ color: shirtColor, roughness: 0.55, normalMap: fabricNormal(), normalScale: new THREE.Vector2(0.2, 0.2) })
    : cloth(shirtColor, shirtVariant !== 'plain' ? { map: shirtMap(shirtColor, shirtVariant, rnd), color: 0xffffff } : {});
  const pants = cloth(pantsColor, { sheen: 0.25, normalMap: outfit === 'suit' || dealer ? fabricNormal() : denimNormal() });
  const shoes = new THREE.MeshPhysicalMaterial({ color: dealer || outfit === 'suit' ? 0x0d0d0d : pick(rnd, [0xffffff, 0x111111, 0x8a5a2a, 0xe74c3c]), roughness: 0.32, clearcoat: 0.75, clearcoatRoughness: 0.25 });
  const sole = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 });
  const sleeveMat = outfit === 'tshirt' || outfit === 'dress' ? skin : shirt;

  // ---------- Beine (Hüfte -> Knie -> Fuß) ----------
  const HIP_Y = 0.92;
  const mkLeg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.11, HIP_Y, 0);
    // Oberschenkel: oben kräftig, zum Knie schmaler
    const thigh = shadow(new THREE.Mesh(lathe('thigh', [[0.04, 0], [0.02, 0.07], [-0.02, 0.088], [-0.16, 0.082], [-0.3, 0.07], [-0.42, 0.06], [-0.47, 0]]), outfit === 'dress' ? skin : pants));
    const kneeBall = new THREE.Mesh(geo('kneeBall', () => new THREE.SphereGeometry(0.062, 12, 10)), outfit === 'dress' ? skin : pants);
    kneeBall.position.y = -0.44;
    const knee = new THREE.Group();
    knee.position.y = -0.44;
    // Unterschenkel mit Wade
    const shin = shadow(new THREE.Mesh(lathe('shin', [[0.03, 0], [0.01, 0.055], [-0.06, 0.064], [-0.14, 0.066], [-0.26, 0.05], [-0.38, 0.04], [-0.44, 0]]), outfit === 'dress' ? skin : pants));
    const foot = new THREE.Group();
    foot.position.set(0, -0.42, 0);
    const shoe = shadow(new THREE.Mesh(geo('shoe', () => new THREE.BoxGeometry(0.11, 0.06, 0.22)), shoes));
    shoe.position.set(0, -0.03, -0.05);
    const toe = shadow(new THREE.Mesh(geo('toe', () => new THREE.SphereGeometry(0.055, 12, 8)), shoes));
    toe.scale.set(1, 0.55, 1.2); toe.position.set(0, -0.03, -0.15);
    const soleMesh = new THREE.Mesh(geo('sole', () => new THREE.BoxGeometry(0.115, 0.02, 0.26)), sole);
    soleMesh.position.set(0, -0.065, -0.07);
    foot.add(shoe, toe, soleMesh);
    knee.add(shin, foot);
    hip.add(thigh, kneeBall, knee);
    return { hip, knee, foot };
  };
  const legL = mkLeg(-1); const legR = mkLeg(1);
  root.add(legL.hip, legR.hip);

  // ---------- Rumpf ----------
  const torso = new THREE.Group();
  torso.position.y = HIP_Y;
  // Becken und Oberkörper als Rotationskörper: Hüfte, Taille, Brustkorb, Schultern
  const pelvis = shadow(new THREE.Mesh(lathe('pelvis', [[-0.1, 0], [-0.07, 0.15], [-0.02, 0.185], [0.06, 0.18], [0.14, 0.165], [0.17, 0]], 24), outfit === 'dress' ? shirt : pants));
  pelvis.scale.set(1.02 * build, 1, 0.7);
  const chest = shadow(new THREE.Mesh(lathe('chest', [[0.1, 0], [0.12, 0.155], [0.2, 0.15], [0.3, 0.17], [0.4, 0.195], [0.48, 0.215], [0.54, 0.19], [0.58, 0.11], [0.61, 0.06], [0.62, 0]], 28), shirt));
  chest.scale.set(1.0 * build, 1, 0.66);
  torso.add(pelvis, chest);
  if (outfit !== 'dress') {
    const belt = new THREE.Mesh(geo('belt', () => new THREE.TorusGeometry(0.2, 0.022, 8, 28)), new THREE.MeshStandardMaterial({ color: 0x2a1a0e, roughness: 0.5 }));
    belt.rotation.x = Math.PI / 2; belt.scale.set(1.0, 0.78, 1); belt.position.y = 0.12;
    const buckle = new THREE.Mesh(geo('buckle', () => new THREE.BoxGeometry(0.05, 0.04, 0.02)), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.3 }));
    buckle.position.set(0, 0.12, -0.155);
    torso.add(belt, buckle);
  }
  if (outfit === 'dress') {
    const skirt = shadow(new THREE.Mesh(geo('skirt', () => new THREE.ConeGeometry(0.3, 0.5, 24, 1, true)), shirt));
    skirt.position.y = -0.04;
    skirt.material.side = THREE.DoubleSide;
    torso.add(skirt);
  }
  if (outfit === 'suit' || outfit === 'dealer') {
    const lapel = shadow(new THREE.Mesh(geo('lapel', () => new THREE.BoxGeometry(0.16, 0.26, 0.05)), new THREE.MeshStandardMaterial({ color: dealer ? 0xf4f4f4 : 0xf0f0f0, roughness: 0.6 })));
    lapel.position.set(0, 0.4, -0.145);
    const tie = shadow(new THREE.Mesh(geo(dealer ? 'bow' : 'tie', () => dealer ? new THREE.BoxGeometry(0.13, 0.05, 0.04) : new THREE.BoxGeometry(0.05, 0.24, 0.03)), new THREE.MeshStandardMaterial({ color: dealer ? 0xc0392b : pick(rnd, [0xc0392b, 0x2e86de, 0x111111]), roughness: 0.5 })));
    tie.position.set(0, dealer ? 0.5 : 0.4, -0.165);
    torso.add(lapel, tie);
  }
  if (outfit === 'shirt') {
    const collar = shadow(new THREE.Mesh(geo('collar', () => new THREE.CylinderGeometry(0.11, 0.14, 0.07, 14)), new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.7 })));
    collar.position.y = 0.55;
    torso.add(collar);
    const buttons = new THREE.Mesh(geo('buttons', () => new THREE.BoxGeometry(0.02, 0.28, 0.02)), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    buttons.position.set(0, 0.36, -0.15);
    torso.add(buttons);
  }
  if (outfit === 'hoodie') {
    const hood = shadow(new THREE.Mesh(geo('hood', () => new THREE.SphereGeometry(0.17, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6)), shirt));
    hood.position.set(0, 0.5, 0.12);
    hood.rotation.x = 0.9;
    torso.add(hood);
    const pocket = new THREE.Mesh(geo('pocket', () => new THREE.BoxGeometry(0.2, 0.09, 0.03)), cloth(shirtColor));
    pocket.position.set(0, 0.2, -0.155);
    torso.add(pocket);
  }
  const neck = shadow(new THREE.Mesh(geo('neck', () => new THREE.CylinderGeometry(0.055, 0.07, 0.1, 14)), skin));
  neck.position.y = 0.6;
  torso.add(neck);

  // ---------- Arme (Schulter -> Ellbogen -> Hand mit Daumen) ----------
  const mkArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.26 * build, 0.5, 0);
    const pad = shadow(new THREE.Mesh(geo('pad', () => new THREE.SphereGeometry(0.072, 14, 12)), shirt));
    pad.scale.set(1, 0.85, 1);
    // Oberarm mit Bizeps, Unterarm zum Handgelenk schmaler
    const upper = shadow(new THREE.Mesh(lathe('upper', [[0.04, 0], [0.02, 0.058], [-0.06, 0.066], [-0.14, 0.062], [-0.24, 0.052], [-0.32, 0.045], [-0.34, 0]]), shirt));
    const elbowBall = new THREE.Mesh(geo('elbowBall', () => new THREE.SphereGeometry(0.046, 12, 10)), sleeveMat);
    elbowBall.position.y = -0.3;
    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    const fore = shadow(new THREE.Mesh(lathe('fore', [[0.03, 0], [0.01, 0.046], [-0.06, 0.052], [-0.14, 0.044], [-0.24, 0.034], [-0.28, 0.03], [-0.3, 0]]), sleeveMat));
    const hand = shadow(new THREE.Mesh(geo('hand', () => new THREE.SphereGeometry(0.052, 12, 10)), skin));
    hand.scale.set(0.8, 1.3, 0.42);
    hand.position.y = -0.31;
    const fingers = new THREE.Mesh(geo('fingers', () => new THREE.BoxGeometry(0.075, 0.07, 0.03)), skin);
    fingers.position.y = -0.36;
    elbow.add(fingers);
    const thumb = new THREE.Mesh(geo('thumb', () => new THREE.CapsuleGeometry(0.014, 0.04, 4, 8)), skin);
    thumb.position.set(-side * 0.045, -0.29, -0.01);
    thumb.rotation.z = side * 0.6;
    elbow.add(fore, hand, thumb);
    shoulder.add(pad, upper, elbowBall, elbow);
    if (accessory !== 'none' && side === -1 && rnd() < 0.5) {
      const watch = new THREE.Mesh(geo('watch', () => new THREE.TorusGeometry(0.05, 0.012, 6, 14)), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.3 }));
      watch.position.y = -0.22; watch.rotation.x = Math.PI / 2;
      elbow.add(watch);
    }
    return { shoulder, elbow };
  };
  const armL = mkArm(-1); const armR = mkArm(1);
  torso.add(armL.shoulder, armR.shoulder);

  // ---------- Kopf & Gesicht ----------
  const head = new THREE.Group();
  head.position.y = 0.66;
  // Kopf: Kinn, Kiefer, Wangen, Schläfen und Schädeldecke als weiches Profil
  const skull = shadow(new THREE.Mesh(lathe('skull', [[-0.03, 0], [-0.02, 0.045], [0.02, 0.085], [0.06, 0.108], [0.11, 0.124], [0.16, 0.132], [0.21, 0.125], [0.25, 0.095], [0.275, 0.05], [0.28, 0]], 32), skin));
  skull.scale.set(0.96, 1, 1.06);
  head.add(skull);
  const jaw = new THREE.Mesh(geo('jaw', () => new THREE.SphereGeometry(0.1, 20, 14)), skin);
  jaw.scale.set(0.82, 0.5, 0.88);
  jaw.position.set(0, 0.035, 0.01);
  head.add(jaw);
  const eyeWhite = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.2, clearcoat: 1 });
  const irisMat = new THREE.MeshPhysicalMaterial({ color: pick(rnd, [0x5a3a1c, 0x2f6fb5, 0x3f8a4a, 0x2a2a2a]), roughness: 0.15, clearcoat: 1 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x050505 });
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.045, 0.14, -0.105);
    const white = new THREE.Mesh(geo('eye', () => new THREE.SphereGeometry(0.024, 14, 10)), eyeWhite);
    const iris = new THREE.Mesh(geo('iris', () => new THREE.SphereGeometry(0.013, 10, 8)), irisMat);
    iris.position.z = -0.018;
    const pupil = new THREE.Mesh(geo('pupil', () => new THREE.SphereGeometry(0.007, 8, 6)), pupilMat);
    pupil.position.z = -0.026;
    const lid = new THREE.Mesh(geo('lid', () => new THREE.SphereGeometry(0.027, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5)), skin);
    lid.position.y = 0.002;
    eye.add(white, iris, pupil, lid);
    eye.userData.lid = lid;
    head.add(eye);
    eyes.push(eye);
    const brow = new THREE.Mesh(geo('brow', () => new THREE.BoxGeometry(0.05, 0.011, 0.015)), hair);
    brow.position.set(side * 0.045, 0.18, -0.112);
    brow.rotation.z = side * 0.18;
    const ear = new THREE.Mesh(geo('ear', () => new THREE.SphereGeometry(0.028, 10, 8)), skin);
    ear.scale.set(0.6, 1, 0.8);
    ear.position.set(side * 0.118, 0.12, 0);
    head.add(brow, ear);
  }
  const nose = new THREE.Mesh(geo('nose', () => new THREE.SphereGeometry(0.02, 10, 8)), skin);
  nose.scale.set(0.8, 1.1, 1.3);
  nose.position.set(0, 0.105, -0.128);
  head.add(nose);
  // Lippen
  const lipMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(skinColor).lerp(new THREE.Color(0xa03a3a), 0.45), roughness: 0.35, clearcoat: 0.6 });
  const lipU = new THREE.Mesh(geo('lipU', () => new THREE.CapsuleGeometry(0.008, 0.05, 4, 10)), lipMat);
  lipU.rotation.z = Math.PI / 2; lipU.position.set(0, 0.075, -0.118);
  const lipL = new THREE.Mesh(geo('lipL', () => new THREE.CapsuleGeometry(0.01, 0.042, 4, 10)), lipMat);
  lipL.rotation.z = Math.PI / 2; lipL.position.set(0, 0.06, -0.116);
  const mouthLine = new THREE.Mesh(geo('mouthLine', () => new THREE.BoxGeometry(0.052, 0.004, 0.004)), skinDark);
  mouthLine.position.set(0, 0.0675, -0.126);
  head.add(lipU, lipL, mouthLine);
  // Frisur
  if (hairStyle !== 'bald') {
    const cap = shadow(new THREE.Mesh(geo('haircap', () => new THREE.SphereGeometry(0.137, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.52)), hair));
    cap.scale.set(0.95, 1.1, 1.0);
    cap.position.y = 0.125;
    head.add(cap);
    if (hairStyle === 'long') {
      const back = shadow(new THREE.Mesh(geo('hairlong', () => new THREE.CapsuleGeometry(0.11, 0.22, 6, 16)), hair));
      back.scale.set(1.1, 1, 0.55);
      back.position.set(0, -0.02, 0.08);
      head.add(back);
    } else if (hairStyle === 'ponytail') {
      const tail = shadow(new THREE.Mesh(geo('tail', () => new THREE.CapsuleGeometry(0.04, 0.22, 6, 12)), hair));
      tail.position.set(0, 0.02, 0.15);
      tail.rotation.x = 0.35;
      head.add(tail);
    } else if (hairStyle === 'bun') {
      const bun = shadow(new THREE.Mesh(geo('bun', () => new THREE.SphereGeometry(0.06, 14, 12)), hair));
      bun.position.set(0, 0.2, 0.11);
      head.add(bun);
    } else if (hairStyle === 'curly') {
      for (let i = 0; i < 11; i++) {
        const curl = new THREE.Mesh(geo('curl', () => new THREE.SphereGeometry(0.05, 10, 8)), hair);
        const a = (i / 11) * Math.PI * 2;
        curl.position.set(Math.cos(a) * 0.1, 0.19 + (i % 2) * 0.05, Math.sin(a) * 0.1);
        head.add(curl);
      }
    }
  }
  // Accessoires
  if (accessory === 'glasses') {
    const frame = new THREE.MeshStandardMaterial({ color: pick(rnd, [0x111111, 0xd4af37, 0x8a1b1b]), metalness: 0.6, roughness: 0.35 });
    const lensMat = new THREE.MeshPhysicalMaterial({ color: 0xaaddff, transparent: true, opacity: 0.25, roughness: 0.05, clearcoat: 1 });
    for (const side of [-1, 1]) {
      const ring = new THREE.Mesh(geo('lens', () => new THREE.TorusGeometry(0.03, 0.004, 6, 18)), frame);
      ring.position.set(side * 0.045, 0.14, -0.13);
      const lens = new THREE.Mesh(geo('lensGlass', () => new THREE.CircleGeometry(0.029, 16)), lensMat);
      lens.position.set(side * 0.045, 0.14, -0.13); lens.rotation.y = Math.PI;
      head.add(ring, lens);
    }
    const bridge = new THREE.Mesh(geo('bridge', () => new THREE.BoxGeometry(0.03, 0.005, 0.005)), frame);
    bridge.position.set(0, 0.14, -0.13);
    head.add(bridge);
  } else if (accessory === 'cap') {
    const capColor = pick(rnd, CLOTH);
    const dome = shadow(new THREE.Mesh(geo('capdome', () => new THREE.SphereGeometry(0.14, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5)), cloth(capColor)));
    dome.position.y = 0.13;
    const visor = shadow(new THREE.Mesh(geo('visor', () => new THREE.CylinderGeometry(0.15, 0.15, 0.02, 18, 1, false, Math.PI * 0.75, Math.PI * 0.5)), cloth(capColor)));
    visor.position.set(0, 0.14, -0.02);
    head.add(dome, visor);
  } else if (accessory === 'hat') {
    const hatMat = cloth(pick(rnd, [0x2c2c34, 0x5a3a1c, 0x8a1b1b]), { roughness: 0.7 });
    const brim = shadow(new THREE.Mesh(geo('brim', () => new THREE.CylinderGeometry(0.2, 0.2, 0.015, 28)), hatMat));
    brim.position.y = 0.2;
    const crown = shadow(new THREE.Mesh(geo('crown', () => new THREE.CylinderGeometry(0.11, 0.125, 0.14, 24)), hatMat));
    crown.position.y = 0.27;
    const band = new THREE.Mesh(geo('band', () => new THREE.CylinderGeometry(0.126, 0.126, 0.03, 24)), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.6, roughness: 0.4 }));
    band.position.y = 0.215;
    head.add(brim, crown, band);
  }
  torso.add(head);
  root.add(torso);
  root.scale.set(heightScale, heightScale, heightScale);

  // ---------- Namensschild ----------
  const label = textSprite(dealer ? `♠ ${name}` : bot ? `🤖 ${name}` : name, {
    size: 52, color: dealer ? '#f5d97a' : bot ? '#c9d1dc' : '#ffffff',
    bg: dealer ? 'rgba(30,20,0,0.7)' : bot ? 'rgba(40,40,50,0.7)' : 'rgba(0,0,0,0.6)', height: dealer ? 0.28 : 0.34,
  });
  label.position.y = 2.0 * heightScale + (accessory === 'hat' ? 0.15 : 0);
  g.add(label);
  g.userData.label = label;

  // ---------- Animation ----------
  let pose = 'idle';
  let phase = rnd() * Math.PI * 2;
  let lookT = 0; let lookTarget = 0; let lookCur = 0;
  let blinkT = 2 + rnd() * 4; let blink = 0;
  let lookAtPos = null;
  const damp = (obj, key, target, k) => { obj[key] += (target - obj[key]) * k; };
  const tmp = new THREE.Vector3();

  g.userData.setPose = (p) => {
    if (pose === p) return;
    pose = p;
    label.position.y = (2.0 * heightScale + (accessory === 'hat' ? 0.15 : 0)) - (p === 'sit' ? 0.36 : 0);
    // Vorzeichen: positive X-Rotation schwenkt ein hängendes Glied nach VORN (-Z)
    if (p === 'sit') {
      root.position.y = -0.36;
      legL.hip.rotation.x = legR.hip.rotation.x = Math.PI / 2 - 0.05;
      legL.knee.rotation.x = legR.knee.rotation.x = -(Math.PI / 2 - 0.05);
      legL.hip.rotation.z = 0.08; legR.hip.rotation.z = -0.08;
      legL.foot.rotation.x = legR.foot.rotation.x = 0;
      armL.shoulder.rotation.x = armR.shoulder.rotation.x = 0.9;
      armL.elbow.rotation.x = armR.elbow.rotation.x = 0.45;
      torso.rotation.x = -0.08;
    } else {
      root.position.y = 0;
      legL.hip.rotation.set(0, 0, 0); legR.hip.rotation.set(0, 0, 0);
      legL.knee.rotation.set(0, 0, 0); legR.knee.rotation.set(0, 0, 0);
      legL.foot.rotation.set(0, 0, 0); legR.foot.rotation.set(0, 0, 0);
      armL.shoulder.rotation.set(0, 0, 0.06); armR.shoulder.rotation.set(0, 0, -0.06);
      armL.elbow.rotation.set(0.15, 0, 0); armR.elbow.rotation.set(0.15, 0, 0);
      torso.rotation.set(0, 0, 0);
    }
  };

  /** Kopf zu einer Weltposition drehen (z. B. zum Betrachter), null = frei umschauen */
  g.userData.lookAt = (pos) => { lookAtPos = pos ? pos.clone() : null; };

  const updateHead = (dt) => {
    // Blinzeln
    blinkT -= dt;
    if (blinkT <= 0) { blink = 0.16; blinkT = 2.5 + Math.random() * 4; }
    if (blink > 0) { blink -= dt; }
    const closed = blink > 0 ? 1 : 0;
    for (const e of eyes) e.userData.lid.scale.y = 1 + closed * 1.1;
    // Blickrichtung
    if (lookAtPos) {
      head.getWorldPosition(tmp);
      const dx = lookAtPos.x - tmp.x; const dz = lookAtPos.z - tmp.z; const dy = lookAtPos.y - tmp.y;
      // Welt-Yaw zum Ziel, relativ zur Figur
      const worldYaw = Math.atan2(-dx, -dz);
      let rel = worldYaw - g.rotation.y - torso.rotation.y;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      const targetYaw = Math.max(-0.9, Math.min(0.9, rel));
      const targetPitch = Math.max(-0.4, Math.min(0.35, Math.atan2(dy, Math.hypot(dx, dz))));
      damp(head.rotation, 'y', targetYaw, Math.min(1, dt * 4));
      damp(head.rotation, 'x', targetPitch, Math.min(1, dt * 4));
    } else {
      lookT -= dt;
      if (lookT <= 0) { lookT = 2 + Math.random() * 4; lookTarget = (Math.random() - 0.5) * 0.9; }
      lookCur += (lookTarget - lookCur) * Math.min(1, dt * 3);
      damp(head.rotation, 'y', lookCur * (pose === 'sit' ? 0.5 : 1), Math.min(1, dt * 4));
      damp(head.rotation, 'x', 0, Math.min(1, dt * 3));
    }
  };

  g.userData.step = (dt, moving) => {
    updateHead(dt);
    if (pose === 'sit') {
      phase += dt * 1.4;
      chest.scale.y = 1 + Math.sin(phase) * 0.012;
      return;
    }
    if (moving) {
      phase += dt * 8.5;
      const s = Math.sin(phase); const c = Math.cos(phase);
      damp(legL.hip.rotation, 'x', s * 0.6, 0.5);
      damp(legR.hip.rotation, 'x', -s * 0.6, 0.5);
      damp(legL.knee.rotation, 'x', -Math.max(0, c) * 1.1, 0.5);
      damp(legR.knee.rotation, 'x', -Math.max(0, -c) * 1.1, 0.5);
      // Fußabrollen
      damp(legL.foot.rotation, 'x', Math.max(0, -s) * 0.35, 0.5);
      damp(legR.foot.rotation, 'x', Math.max(0, s) * 0.35, 0.5);
      damp(armL.shoulder.rotation, 'x', -s * 0.45, 0.5);
      damp(armR.shoulder.rotation, 'x', s * 0.45, 0.5);
      damp(armL.elbow.rotation, 'x', 0.25 + Math.max(0, -s) * 0.45, 0.5);
      damp(armR.elbow.rotation, 'x', 0.25 + Math.max(0, s) * 0.45, 0.5);
      root.position.y = Math.abs(s) * 0.035;
      torso.rotation.x = -0.05;
      torso.rotation.z = -s * 0.03;
      torso.rotation.y = s * 0.06; // Hüft-/Schulterrotation
      chest.scale.y = 1;
    } else {
      phase += dt * 1.6;
      for (const j of [legL.hip, legR.hip, legL.knee, legR.knee, legL.foot, legR.foot]) damp(j.rotation, 'x', 0, 0.15);
      damp(armL.shoulder.rotation, 'x', Math.sin(phase) * 0.04, 0.1);
      damp(armR.shoulder.rotation, 'x', -Math.sin(phase) * 0.04, 0.1);
      damp(armL.elbow.rotation, 'x', 0.15, 0.1);
      damp(armR.elbow.rotation, 'x', 0.15, 0.1);
      damp(root.position, 'y', 0, 0.2);
      damp(torso.rotation, 'x', 0, 0.1);
      damp(torso.rotation, 'y', 0, 0.1);
      damp(torso.rotation, 'z', Math.sin(phase * 0.5) * 0.015, 0.1);
      chest.scale.y = 1 + Math.sin(phase) * 0.012; // Atmen
    }
  };

  /** Croupier: gibt periodisch Karten (Ellbogen + Schulter), wiegt sich, schaut zu den Gästen */
  let dealPhase = rnd() * 6;
  g.userData.dealerStep = (dt, t) => {
    updateHead(dt);
    dealPhase += dt;
    const cycle = dealPhase % 7;
    const dealing = cycle < 2.0;
    const k = dealing ? Math.sin((cycle / 2.0) * Math.PI * 3) : 0;
    armR.shoulder.rotation.x = 0.8 + k * 0.4;
    armR.shoulder.rotation.z = -0.35 - k * 0.3;
    armR.elbow.rotation.x = 1.1 - k * 0.6;
    armL.shoulder.rotation.x = 0.75;
    armL.shoulder.rotation.z = 0.3;
    armL.elbow.rotation.x = 1.25;
    torso.rotation.y = Math.sin(t * 0.7) * 0.08 + (dealing ? k * 0.1 : 0);
    torso.rotation.x = -0.08;
    if (!lookAtPos) { head.rotation.y = Math.sin(t * 0.5) * 0.3 - torso.rotation.y; head.rotation.x = dealing ? -0.22 : -0.06; }
    chest.scale.y = 1 + Math.sin(t * 1.5) * 0.012;
  };

  g.userData.setPose('idle');
  return g;
}

/** Kurzes aufsteigendes Gewinn-/Verlust-Label über einer Figur */
export function floatText(engine, position, text, color) {
  const s = textSprite(text, { size: 56, color, bg: 'rgba(0,0,0,0.55)', height: 0.4 });
  s.position.copy(position).add(new THREE.Vector3(0, 2.3, 0));
  engine.scene.add(s);
  engine.tween(1800, (k) => { s.position.y = position.y + 2.3 + k * 1.2; s.material.opacity = 1 - k * k; }).then(() => { engine.scene.remove(s); s.material.map?.dispose(); s.material.dispose(); });
}
