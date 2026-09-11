import * as THREE from 'three';
import { textSprite } from './assets.js';

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
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });
/** Stoff mit leichtem Sheen (Textil-Glanz an den Kanten) */
const cloth = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.9, sheen: 0.5, sheenRoughness: 0.8, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.3), ...o });
const shadow = (m) => { m.castShadow = true; return m; };

/**
 * Detaillierte Spielfigur mit Gelenken (Blickrichtung -Z, Höhe ≈ 1,78).
 * userData.setPose('idle'|'walk'|'sit'), userData.step(dt, moving), userData.dealerStep(dt, t), userData.label
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
  const pantsColor = dealer ? 0x101014 : outfit === 'suit' ? 0x1a1a22 : pick(rnd, PANTS);
  const heightScale = 0.94 + rnd() * 0.12;
  const build = 0.92 + rnd() * 0.18;

  const skin = new THREE.MeshPhysicalMaterial({ color: skinColor, roughness: 0.62, clearcoat: 0.08, clearcoatRoughness: 0.6, sheen: 0.15, sheenColor: new THREE.Color(0xffd9c0) });
  const hair = new THREE.MeshPhysicalMaterial({ color: hairColor, roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.4 });
  const shirt = outfit === 'suit' ? mat(shirtColor, { roughness: 0.5 }) : cloth(shirtColor);
  const pants = cloth(pantsColor, { sheen: 0.25 });
  const shoes = new THREE.MeshPhysicalMaterial({ color: dealer || outfit === 'suit' ? 0x0d0d0d : pick(rnd, [0xffffff, 0x111111, 0x8a5a2a, 0xe74c3c]), roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.3 });
  const sleeveMat = outfit === 'tshirt' || outfit === 'dress' ? skin : shirt;

  // ---------- Beine (Hüfte -> Knie -> Fuß) ----------
  const HIP_Y = 0.92;
  const mkLeg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.11, HIP_Y, 0);
    const thigh = shadow(new THREE.Mesh(geo('thigh', () => new THREE.CapsuleGeometry(0.075, 0.34, 4, 10)), outfit === 'dress' ? skin : pants));
    thigh.position.y = -0.22;
    const knee = new THREE.Group();
    knee.position.y = -0.44;
    const shin = shadow(new THREE.Mesh(geo('shin', () => new THREE.CapsuleGeometry(0.062, 0.32, 4, 10)), outfit === 'dress' ? skin : pants));
    shin.position.y = -0.21;
    const foot = shadow(new THREE.Mesh(geo('foot', () => new THREE.BoxGeometry(0.12, 0.07, 0.24)), shoes));
    foot.position.set(0, -0.445, -0.05);
    knee.add(shin, foot);
    hip.add(thigh, knee);
    return { hip, knee };
  };
  const legL = mkLeg(-1); const legR = mkLeg(1);
  root.add(legL.hip, legR.hip);

  // ---------- Rumpf ----------
  const torso = new THREE.Group();
  torso.position.y = HIP_Y;
  const pelvis = shadow(new THREE.Mesh(geo('pelvis', () => new THREE.CapsuleGeometry(0.19, 0.08, 4, 14)), outfit === 'dress' ? shirt : pants));
  pelvis.scale.set(1.05, 1, 0.75);
  pelvis.position.y = 0.03;
  const chest = shadow(new THREE.Mesh(geo('chest', () => new THREE.CapsuleGeometry(0.2, 0.3, 6, 16)), shirt));
  chest.scale.set(1.0 * build, 1, 0.68);
  chest.position.y = 0.36;
  torso.add(pelvis, chest);
  if (outfit === 'dress') {
    const skirt = shadow(new THREE.Mesh(geo('skirt', () => new THREE.ConeGeometry(0.3, 0.5, 18, 1, true)), shirt));
    skirt.position.y = -0.04;
    skirt.material.side = THREE.DoubleSide;
    torso.add(skirt);
  }
  if (outfit === 'suit' || outfit === 'dealer') {
    const lapel = shadow(new THREE.Mesh(geo('lapel', () => new THREE.BoxGeometry(0.16, 0.26, 0.05)), mat(dealer ? 0xf4f4f4 : 0xf0f0f0, { roughness: 0.6 })));
    lapel.position.set(0, 0.4, -0.145);
    const tie = shadow(new THREE.Mesh(geo(dealer ? 'bow' : 'tie', () => dealer ? new THREE.BoxGeometry(0.13, 0.05, 0.04) : new THREE.BoxGeometry(0.05, 0.24, 0.03)), mat(dealer ? 0xc0392b : pick(rnd, [0xc0392b, 0x2e86de, 0x111111]))));
    tie.position.set(0, dealer ? 0.5 : 0.4, -0.165);
    torso.add(lapel, tie);
  }
  if (outfit === 'shirt') {
    const collar = shadow(new THREE.Mesh(geo('collar', () => new THREE.CylinderGeometry(0.11, 0.14, 0.07, 12)), mat(0xf4f4f4)));
    collar.position.y = 0.55;
    torso.add(collar);
    const buttons = new THREE.Mesh(geo('buttons', () => new THREE.BoxGeometry(0.02, 0.28, 0.02)), mat(0xffffff));
    buttons.position.set(0, 0.36, -0.15);
    torso.add(buttons);
  }
  if (outfit === 'hoodie') {
    const hood = shadow(new THREE.Mesh(geo('hood', () => new THREE.SphereGeometry(0.17, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6)), shirt));
    hood.position.set(0, 0.5, 0.12);
    hood.rotation.x = 0.9;
    torso.add(hood);
    const pocket = new THREE.Mesh(geo('pocket', () => new THREE.BoxGeometry(0.2, 0.09, 0.03)), mat(shirtColor, { roughness: 0.9 }));
    pocket.position.set(0, 0.2, -0.155);
    torso.add(pocket);
  }
  const neck = shadow(new THREE.Mesh(geo('neck', () => new THREE.CylinderGeometry(0.055, 0.065, 0.1, 12)), skin));
  neck.position.y = 0.6;
  torso.add(neck);

  // ---------- Arme (Schulter -> Ellbogen -> Hand) ----------
  const mkArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.26 * build, 0.5, 0);
    const pad = shadow(new THREE.Mesh(geo('pad', () => new THREE.SphereGeometry(0.075, 12, 10)), shirt));
    const upper = shadow(new THREE.Mesh(geo('upper', () => new THREE.CapsuleGeometry(0.055, 0.22, 4, 10)), shirt));
    upper.position.y = -0.16;
    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    const fore = shadow(new THREE.Mesh(geo('fore', () => new THREE.CapsuleGeometry(0.048, 0.2, 4, 10)), sleeveMat));
    fore.position.y = -0.13;
    const hand = shadow(new THREE.Mesh(geo('hand', () => new THREE.SphereGeometry(0.055, 10, 8)), skin));
    hand.scale.set(0.8, 1.1, 0.5);
    hand.position.y = -0.27;
    elbow.add(fore, hand);
    shoulder.add(pad, upper, elbow);
    if (accessory !== 'none' && side === -1 && rnd() < 0.5) {
      const watch = new THREE.Mesh(geo('watch', () => new THREE.TorusGeometry(0.052, 0.012, 6, 12)), mat(0xd4af37, { metalness: 0.9, roughness: 0.3 }));
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
  const skull = shadow(new THREE.Mesh(geo('skull', () => new THREE.SphereGeometry(0.135, 22, 18)), skin));
  skull.scale.set(0.92, 1.12, 0.98);
  skull.position.y = 0.12;
  head.add(skull);
  const jaw = new THREE.Mesh(geo('jaw', () => new THREE.SphereGeometry(0.1, 16, 12)), skin);
  jaw.scale.set(0.85, 0.7, 0.9);
  jaw.position.set(0, 0.03, 0.005);
  head.add(jaw);
  const eyeWhite = mat(0xffffff, { roughness: 0.3 });
  const pupil = mat(pick(rnd, [0x2b1b0e, 0x1b4f8a, 0x2f7a3a, 0x111111]), { roughness: 0.2 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(geo('eye', () => new THREE.SphereGeometry(0.024, 10, 8)), eyeWhite);
    eye.position.set(side * 0.045, 0.14, -0.105);
    const iris = new THREE.Mesh(geo('iris', () => new THREE.SphereGeometry(0.012, 8, 6)), pupil);
    iris.position.set(side * 0.045, 0.14, -0.126);
    const brow = new THREE.Mesh(geo('brow', () => new THREE.BoxGeometry(0.05, 0.012, 0.015)), hair);
    brow.position.set(side * 0.045, 0.178, -0.11);
    brow.rotation.z = side * 0.15;
    const ear = new THREE.Mesh(geo('ear', () => new THREE.SphereGeometry(0.028, 8, 6)), skin);
    ear.scale.set(0.6, 1, 0.8);
    ear.position.set(side * 0.118, 0.12, 0);
    head.add(eye, iris, brow, ear);
  }
  const nose = new THREE.Mesh(geo('nose', () => new THREE.ConeGeometry(0.018, 0.045, 8)), skin);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0.105, -0.13);
  head.add(nose);
  const mouth = new THREE.Mesh(geo('mouth', () => new THREE.TorusGeometry(0.03, 0.006, 6, 12, Math.PI)), mat(0x7a2e2e, { roughness: 0.5 }));
  mouth.position.set(0, 0.07, -0.115);
  mouth.rotation.set(0, 0, Math.PI);
  head.add(mouth);
  // Frisur
  if (hairStyle !== 'bald') {
    const cap = shadow(new THREE.Mesh(geo('haircap', () => new THREE.SphereGeometry(0.135, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.52)), hair));
    cap.scale.set(0.95, 1.1, 1.0);
    cap.position.y = 0.125;
    head.add(cap);
    if (hairStyle === 'long') {
      const back = shadow(new THREE.Mesh(geo('hairlong', () => new THREE.CapsuleGeometry(0.11, 0.22, 4, 12)), hair));
      back.scale.set(1.1, 1, 0.55);
      back.position.set(0, -0.02, 0.08);
      head.add(back);
    } else if (hairStyle === 'ponytail') {
      const tail = shadow(new THREE.Mesh(geo('tail', () => new THREE.CapsuleGeometry(0.04, 0.22, 4, 10)), hair));
      tail.position.set(0, 0.02, 0.15);
      tail.rotation.x = 0.35;
      head.add(tail);
    } else if (hairStyle === 'bun') {
      const bun = shadow(new THREE.Mesh(geo('bun', () => new THREE.SphereGeometry(0.06, 12, 10)), hair));
      bun.position.set(0, 0.2, 0.11);
      head.add(bun);
    } else if (hairStyle === 'curly') {
      for (let i = 0; i < 9; i++) {
        const curl = new THREE.Mesh(geo('curl', () => new THREE.SphereGeometry(0.05, 8, 6)), hair);
        const a = (i / 9) * Math.PI * 2;
        curl.position.set(Math.cos(a) * 0.1, 0.19 + (i % 2) * 0.05, Math.sin(a) * 0.1);
        head.add(curl);
      }
    }
  }
  // Accessoires
  if (accessory === 'glasses') {
    const frame = mat(pick(rnd, [0x111111, 0xd4af37, 0x8a1b1b]), { metalness: 0.5, roughness: 0.4 });
    for (const side of [-1, 1]) {
      const ring = new THREE.Mesh(geo('lens', () => new THREE.TorusGeometry(0.03, 0.005, 6, 16)), frame);
      ring.position.set(side * 0.045, 0.14, -0.128);
      head.add(ring);
    }
    const bridge = new THREE.Mesh(geo('bridge', () => new THREE.BoxGeometry(0.03, 0.005, 0.005)), frame);
    bridge.position.set(0, 0.14, -0.128);
    head.add(bridge);
  } else if (accessory === 'cap') {
    const capColor = pick(rnd, CLOTH);
    const dome = shadow(new THREE.Mesh(geo('capdome', () => new THREE.SphereGeometry(0.14, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5)), mat(capColor)));
    dome.position.y = 0.13;
    const visor = shadow(new THREE.Mesh(geo('visor', () => new THREE.CylinderGeometry(0.15, 0.15, 0.02, 16, 1, false, Math.PI * 0.75, Math.PI * 0.5)), mat(capColor)));
    visor.position.set(0, 0.14, -0.02);
    head.add(dome, visor);
  } else if (accessory === 'hat') {
    const hatMat = mat(pick(rnd, [0x2c2c34, 0x5a3a1c, 0x8a1b1b]));
    const brim = shadow(new THREE.Mesh(geo('brim', () => new THREE.CylinderGeometry(0.2, 0.2, 0.015, 24)), hatMat));
    brim.position.y = 0.2;
    const crown = shadow(new THREE.Mesh(geo('crown', () => new THREE.CylinderGeometry(0.11, 0.125, 0.14, 20)), hatMat));
    crown.position.y = 0.27;
    const band = new THREE.Mesh(geo('band', () => new THREE.CylinderGeometry(0.126, 0.126, 0.03, 20)), mat(0xd4af37, { metalness: 0.6 }));
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
  const damp = (obj, key, target, k) => { obj[key] += (target - obj[key]) * k; };

  g.userData.setPose = (p) => {
    if (pose === p) return;
    pose = p;
    // Vorzeichen: positive X-Rotation schwenkt ein hängendes Glied nach VORN (-Z), negative nach hinten;
    // beim Oberkörper (über dem Gelenk) ist es umgekehrt.
    if (p === 'sit') {
      root.position.y = -0.36;
      legL.hip.rotation.x = legR.hip.rotation.x = Math.PI / 2 - 0.05;   // Oberschenkel waagerecht nach vorn
      legL.knee.rotation.x = legR.knee.rotation.x = -(Math.PI / 2 - 0.05); // Unterschenkel senkrecht nach unten
      legL.hip.rotation.z = 0.08; legR.hip.rotation.z = -0.08;
      armL.shoulder.rotation.x = armR.shoulder.rotation.x = 0.9;         // Arme nach vorn auf den Tisch
      armL.elbow.rotation.x = armR.elbow.rotation.x = 0.45;
      torso.rotation.x = -0.08;                                          // leicht vorgebeugt
    } else {
      root.position.y = 0;
      legL.hip.rotation.set(0, 0, 0); legR.hip.rotation.set(0, 0, 0);
      legL.knee.rotation.set(0, 0, 0); legR.knee.rotation.set(0, 0, 0);
      armL.shoulder.rotation.set(0, 0, 0.06); armR.shoulder.rotation.set(0, 0, -0.06);
      armL.elbow.rotation.set(0.15, 0, 0); armR.elbow.rotation.set(0.15, 0, 0);
      torso.rotation.x = 0;
    }
  };

  g.userData.step = (dt, moving) => {
    lookT -= dt;
    if (lookT <= 0) { lookT = 2 + Math.random() * 4; lookTarget = (Math.random() - 0.5) * 0.9; }
    lookCur += (lookTarget - lookCur) * Math.min(1, dt * 3);
    head.rotation.y = lookCur * (pose === 'sit' ? 0.5 : 1);
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
      // Knie beugt sich nach hinten, während das Bein nach vorn schwingt
      damp(legL.knee.rotation, 'x', -Math.max(0, c) * 1.1, 0.5);
      damp(legR.knee.rotation, 'x', -Math.max(0, -c) * 1.1, 0.5);
      damp(armL.shoulder.rotation, 'x', -s * 0.45, 0.5);
      damp(armR.shoulder.rotation, 'x', s * 0.45, 0.5);
      // Ellbogen beugt sich nach vorn, stärker beim vorderen Arm
      damp(armL.elbow.rotation, 'x', 0.25 + Math.max(0, -s) * 0.45, 0.5);
      damp(armR.elbow.rotation, 'x', 0.25 + Math.max(0, s) * 0.45, 0.5);
      root.position.y = Math.abs(s) * 0.035;
      torso.rotation.x = -0.05;
      torso.rotation.z = -s * 0.03;
      chest.scale.y = 1;
    } else {
      phase += dt * 1.6;
      for (const j of [legL.hip, legR.hip, legL.knee, legR.knee]) damp(j.rotation, 'x', 0, 0.15);
      damp(armL.shoulder.rotation, 'x', Math.sin(phase) * 0.04, 0.1);
      damp(armR.shoulder.rotation, 'x', -Math.sin(phase) * 0.04, 0.1);
      damp(armL.elbow.rotation, 'x', 0.15, 0.1);
      damp(armR.elbow.rotation, 'x', 0.15, 0.1);
      damp(root.position, 'y', 0, 0.2);
      damp(torso.rotation, 'x', 0, 0.1);
      damp(torso.rotation, 'z', Math.sin(phase * 0.5) * 0.015, 0.1);
      chest.scale.y = 1 + Math.sin(phase) * 0.012; // Atmen
    }
  };

  /** Croupier: gibt periodisch Karten (Ellbogen + Schulter), wiegt sich, schaut zu den Gästen */
  let dealPhase = rnd() * 6;
  g.userData.dealerStep = (dt, t) => {
    dealPhase += dt;
    const cycle = dealPhase % 7;
    const dealing = cycle < 2.0;
    const k = dealing ? Math.sin((cycle / 2.0) * Math.PI * 3) : 0;
    // Arme nach vorn über den Tisch; rechte Hand streckt beim Geben aus und zieht zurück
    armR.shoulder.rotation.x = 0.8 + k * 0.4;
    armR.shoulder.rotation.z = -0.35 - k * 0.3;
    armR.elbow.rotation.x = 1.1 - k * 0.6;
    armL.shoulder.rotation.x = 0.75;
    armL.shoulder.rotation.z = 0.3;
    armL.elbow.rotation.x = 1.25;
    torso.rotation.y = Math.sin(t * 0.7) * 0.08 + (dealing ? k * 0.1 : 0);
    torso.rotation.x = -0.08;
    head.rotation.y = Math.sin(t * 0.5) * 0.3 - torso.rotation.y;
    head.rotation.x = dealing ? -0.22 : -0.06; // Blick nach unten auf den Tisch
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
