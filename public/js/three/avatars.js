import * as THREE from 'three';
import { textSprite } from './assets.js';

/** Deterministischer Farbton aus dem Namen */
export function hueFor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

const SKIN = [0xf1c9a5, 0xe0ac7e, 0xc68642, 0x8d5524, 0xffdbac];
const HAIR = [0x2b1b0e, 0x0d0d0d, 0x6b3e1a, 0xd9b36b, 0x8a1b1b];
const geoCache = {};
const geo = (key, make) => (geoCache[key] ??= make());

/**
 * Stilisierte Spielfigur (Blickrichtung -Z). userData.setPose('idle'|'walk'|'sit'), userData.step(dt, moving).
 */
export function createAvatar({ name, bot = false }) {
  const hue = hueFor(name);
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue / 360, 0.6, bot ? 0.35 : 0.5), roughness: 0.7 });
  const pants = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(((hue + 200) % 360) / 360, 0.35, 0.22), roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: SKIN[hue % SKIN.length], roughness: 0.6 });
  const hair = new THREE.MeshStandardMaterial({ color: HAIR[(hue * 7) % HAIR.length], roughness: 0.5 });

  const legL = new THREE.Mesh(geo('leg', () => new THREE.CapsuleGeometry(0.09, 0.5, 4, 10)), pants);
  const legR = legL.clone();
  legL.position.set(-0.12, 0.42, 0); legR.position.set(0.12, 0.42, 0);
  const hips = new THREE.Group();
  hips.add(legL, legR);
  const torso = new THREE.Mesh(geo('torso', () => new THREE.CapsuleGeometry(0.22, 0.45, 6, 14)), shirt);
  torso.position.y = 1.05;
  const armL = new THREE.Mesh(geo('arm', () => new THREE.CapsuleGeometry(0.06, 0.45, 4, 10)), shirt);
  const armR = armL.clone();
  armL.position.set(-0.32, 1.05, 0); armR.position.set(0.32, 1.05, 0);
  const head = new THREE.Mesh(geo('head', () => new THREE.SphereGeometry(0.2, 20, 20)), skin);
  head.position.y = 1.6;
  const hairMesh = new THREE.Mesh(geo('hair', () => new THREE.SphereGeometry(0.21, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55)), hair);
  hairMesh.position.y = 1.62;
  const eyeGeo = geo('eye', () => new THREE.SphereGeometry(0.03, 8, 8));
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.07, 1.62, -0.17);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.07, 1.62, -0.17);
  for (const m of [legL, legR, torso, armL, armR, head]) { m.castShadow = true; }
  g.add(hips, torso, armL, armR, head, hairMesh, eyeL, eyeR);

  const label = textSprite(bot ? `🤖 ${name}` : name, { size: 52, color: bot ? '#c9d1dc' : '#ffffff', bg: bot ? 'rgba(40,40,50,0.7)' : 'rgba(0,0,0,0.6)', height: 0.34 });
  label.position.y = 2.05;
  g.add(label);

  let pose = 'idle';
  let phase = Math.random() * Math.PI * 2;
  g.userData.label = label;
  g.userData.setPose = (p) => {
    if (pose === p) return;
    pose = p;
    if (p === 'sit') {
      legL.rotation.x = legR.rotation.x = -Math.PI / 2;
      legL.position.set(-0.12, 0.35, -0.22); legR.position.set(0.12, 0.35, -0.22);
      hips.position.y = -0.3; torso.position.y = 0.75; head.position.y = 1.3; hairMesh.position.y = 1.32;
      eyeL.position.y = eyeR.position.y = 1.32; armL.position.y = armR.position.y = 0.75;
      armL.rotation.x = armR.rotation.x = -0.8;
    } else {
      legL.rotation.x = legR.rotation.x = 0;
      legL.position.set(-0.12, 0.42, 0); legR.position.set(0.12, 0.42, 0);
      hips.position.y = 0; torso.position.y = 1.05; head.position.y = 1.6; hairMesh.position.y = 1.62;
      eyeL.position.y = eyeR.position.y = 1.62; armL.position.y = armR.position.y = 1.05;
      armL.rotation.x = armR.rotation.x = 0;
    }
  };
  g.userData.step = (dt, moving) => {
    if (pose === 'sit') return;
    if (moving) {
      phase += dt * 9;
      const s = Math.sin(phase) * 0.6;
      legL.rotation.x = s; legR.rotation.x = -s;
      armL.rotation.x = -s * 0.7; armR.rotation.x = s * 0.7;
      g.position.y = Math.abs(Math.sin(phase)) * 0.04;
    } else {
      legL.rotation.x *= 0.85; legR.rotation.x *= 0.85; armL.rotation.x *= 0.85; armR.rotation.x *= 0.85;
      phase += dt * 1.5;
      torso.position.y = 1.05 + Math.sin(phase) * 0.01;
    }
  };
  return g;
}

/** Kurzes aufsteigendes Gewinn-/Verlust-Label über einer Figur */
export function floatText(engine, position, text, color) {
  const s = textSprite(text, { size: 56, color, bg: 'rgba(0,0,0,0.55)', height: 0.4 });
  s.position.copy(position).add(new THREE.Vector3(0, 2.3, 0));
  engine.scene.add(s);
  engine.tween(1800, (k) => { s.position.y = position.y + 2.3 + k * 1.2; s.material.opacity = 1 - k * k; }).then(() => { engine.scene.remove(s); s.material.map?.dispose(); s.material.dispose(); });
}
