import * as THREE from 'three';
import { gameTable } from '../furniture.js';
import { createCard } from '../assets.js';

/** 3-Card-Poker-Tisch: Halbrund-Tisch mit Ante/Play/Pair-Plus-Aufdruck und Kartenschlitten. */
export function buildPoker3Station() {
  const g = new THREE.Group();
  const table = gameTable({
    shape: 'half', w: 3.7, d: 2.1, felt: '#0c4a33', layout: 'poker3', shoe: true,
    sign: ['3-CARD POKER', 'Ante 10 · Max 1.000'],
  });
  g.add(table);

  // Deko-Karten und Pair-Plus-Marke
  const deco = [];
  for (let i = 0; i < 3; i++) {
    const c = createCard({ r: [1, 13, 10][i], s: 'SHD'[i] });
    c.rotation.x = -Math.PI / 2; c.rotation.z = (i - 1) * 0.22;
    c.position.set(-0.35 + i * 0.35, 0.965, 0.75);
    c.scale.setScalar(0.08);
    g.add(c);
    deco.push(c);
  }

  g.userData = {
    hit: [4.3, 2.4, 3.2], labelY: 2.75,
    seats: [[-1.05, 1.75], [0, 1.8], [1.05, 1.75]], face: [0, 0], sit: true, chairs: true,
    mount: { type: 'table', scale: 0.16, offset: [0, 0.95, 0], pull: 0.35, lookY: 0.9 },
  };
  return g;
}
