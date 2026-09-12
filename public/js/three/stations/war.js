import * as THREE from 'three';
import { gameTable } from '../furniture.js';

/** Casino-War-Tisch: Halbrund-Tisch, je ein Kartenfeld für Spieler und Dealer. */
export function buildWarStation() {
  const g = new THREE.Group();
  const table = gameTable({
    shape: 'half', w: 3.4, d: 2.0, felt: '#4a2410', layout: 'war', shoe: true,
    sign: ['CASINO WAR', 'Ante 10 · Max 1.000'],
  });
  g.add(table);

  g.userData = {
    hit: [4.0, 2.4, 3.0], labelY: 2.75,
    seats: [[-1.0, 1.7], [0, 1.75], [1.0, 1.7]], face: [0, 0], sit: true, chairs: true,
    mount: { type: 'table', scale: 0.16, offset: [0, 0.95, 0], pull: 0.35, lookY: 0.9 },
  };
  return g;
}
