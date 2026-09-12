import * as THREE from 'three';
import { goldMaterial } from '../assets.js';
import { contactShadow } from '../furniture.js';

/**
 * Derby-Diorama unter der Glashaube: elliptische Bahn mit sechs Spuren. Die Pferdefiguren baut
 * das Spiel (siehe export buildHorse); die statische Startaufstellung liefert diese Station.
 */
export const DERBY_TRACK = {
  a: 1.3, b: 0.92, step: 0.05, y: 1.02, startAngle: -Math.PI / 2, laneCount: 6,
};

/** Halbachsen der Spur i (0 = außen) */
export function laneRadii(i) {
  return { a: DERBY_TRACK.a - i * DERBY_TRACK.step, b: DERBY_TRACK.b - i * DERBY_TRACK.step };
}

/** Punkt (Weltkoordinaten der Station) und Fahrtrichtung auf Spur i bei Bahnparameter t (0..1) */
export function trackPoint(i, t) {
  const { a, b } = laneRadii(i);
  const ang = DERBY_TRACK.startAngle + t * Math.PI * 2;
  const pos = new THREE.Vector3(a * Math.cos(ang), DERBY_TRACK.y, b * Math.sin(ang));
  const tan = new THREE.Vector3(-a * Math.sin(ang), 0, b * Math.cos(ang)).normalize();
  return { pos, tan };
}

/** Stilisiertes Pferd mit Jockey; schaut entlang +x. */
export function buildHorse(color) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2118, roughness: 0.7 });
  const barrel = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.16, 6, 12), body);
  barrel.rotation.z = Math.PI / 2; barrel.position.y = 0.13; barrel.castShadow = true;
  g.add(barrel);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.05, 0.14, 10), body);
  neck.position.set(0.1, 0.21, 0); neck.rotation.z = -0.55;
  g.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.05), body);
  head.position.set(0.165, 0.27, 0); head.rotation.z = 0.25;
  g.add(head);
  for (const [x, z] of [[-0.07, -0.035], [-0.07, 0.035], [0.07, -0.035], [0.07, 0.035]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.13, 8), dark);
    leg.position.set(x, 0.065, z);
    g.add(leg);
  }
  const jockey = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 12), new THREE.MeshStandardMaterial({ color: 0xf5d97a, roughness: 0.4 }));
  jockey.position.set(-0.01, 0.225, 0);
  g.add(jockey);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.05, 12), body);
  cap.position.set(-0.01, 0.27, 0);
  g.add(cap);
  return g;
}

function turfTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1c5a2e'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(${20 + Math.random() * 60},${90 + Math.random() * 90},${30 + Math.random() * 50},0.5)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildDerbyStation() {
  const g = new THREE.Group();
  const m = goldMaterial({ roughness: 0.35 });

  // Sockel
  const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.0, 2.5), new THREE.MeshPhysicalMaterial({ color: 0x2a1b10, roughness: 0.3, clearcoat: 0.8 }));
  base.position.y = 0.5; base.castShadow = true; base.receiveShadow = true;
  g.add(base);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.06, 2.6), m);
  rim.position.y = 1.0;
  g.add(rim);

  // Bahnfläche
  const turf = new THREE.Mesh(
    new THREE.CircleGeometry(1, 96).scale(DERBY_TRACK.a + 0.18, 1, DERBY_TRACK.b + 0.18),
    new THREE.MeshStandardMaterial({ map: turfTexture(), roughness: 1 })
  );
  turf.rotation.x = -Math.PI / 2; turf.position.y = DERBY_TRACK.y - 0.005; turf.receiveShadow = true;
  g.add(turf);

  // Innenfeld
  const infield = new THREE.Mesh(
    new THREE.CircleGeometry(1, 96).scale(DERBY_TRACK.a - 0.32, 1, DERBY_TRACK.b - 0.32),
    new THREE.MeshStandardMaterial({ color: 0x0f3d20, roughness: 1 })
  );
  infield.rotation.x = -Math.PI / 2; infield.position.y = DERBY_TRACK.y + 0.01;
  g.add(infield);

  // Spurschienen
  const laneMat = new THREE.MeshStandardMaterial({ color: 0xf0e6cf, roughness: 0.6, transparent: true, opacity: 0.55 });
  for (let i = 0; i < DERBY_TRACK.laneCount; i++) {
    const { a, b } = laneRadii(i);
    const pts = [];
    for (let k = 0; k <= 72; k++) {
      const ang = (k / 72) * Math.PI * 2;
      pts.push(new THREE.Vector3(a * Math.cos(ang), DERBY_TRACK.y + 0.006, b * Math.sin(ang)));
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 120, 0.006, 6), laneMat));
  }

  // Start/Ziel: Ziellinie frontal (Bahnparameter 0)
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.012), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x666666 }));
  line.rotation.x = -Math.PI / 2; line.rotation.z = Math.PI / 2;
  line.position.set(0, DERBY_TRACK.y + 0.012, -DERBY_TRACK.b - 0.02);
  g.add(line);

  // Statische Pferde an der Startaufstellung
  const horses = new THREE.Group();
  const colors = ['#e23b2e', '#e0a324', '#c7ccd6', '#5566a0', '#2f9e57', '#8a4bd0'];
  for (let i = 0; i < DERBY_TRACK.laneCount; i++) {
    const { pos, tan } = trackPoint(i, 0);
    const h = buildHorse(colors[i]);
    h.position.copy(pos);
    h.rotation.y = Math.atan2(-tan.z, tan.x);
    horses.add(h);
  }
  g.add(horses);

  // Glashaube
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2).scale(DERBY_TRACK.a + 0.35, 1.0, DERBY_TRACK.b + 0.35),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 2 })
  );
  dome.position.y = DERBY_TRACK.y;
  g.add(dome);

  const cs = contactShadow(3.4, 2.7, 0.5);
  cs.position.y = 0.02;
  g.add(cs);

  g.userData = {
    hit: [3.5, 2.5, 2.8], labelY: 2.8,
    seats: [[0, 1.9], [-1.1, 1.75], [1.1, 1.75]], face: [0, 0.2], sit: true, chairs: true,
    mount: { type: 'fixed', scale: 1, offset: [0, 0, 0], pull: 0, hide: [horses], lookY: DERBY_TRACK.y, fov: 55 },
    update: (dt, t) => {
      horses.children.forEach((h, i) => { h.position.y = Math.sin(t * 3 + i) * 0.006; });
    },
  };
  return g;
}
