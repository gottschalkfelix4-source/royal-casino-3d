import * as THREE from 'three';
import { gameTable } from '../furniture.js';
import { makeCanvas, canvasTexture, goldMaterial } from '../assets.js';

/**
 * Keno-Lounge: Konsole mit Leuchttafel (8×10 Zahlen). Die eigentliche Ziehung rendert das Spiel
 * als Bodenraster auf der Tischplatte (Mount 'fixed', damit das Brett in Metern aufgebaut wird).
 */
export const KENO_COLS = 10;
export const KENO_ROWS = 8;

function boardTexture() {
  const { canvas, ctx } = makeCanvas(512, 640);
  ctx.fillStyle = '#04140d';
  ctx.fillRect(0, 0, 512, 640);
  ctx.strokeStyle = 'rgba(120,220,170,0.25)';
  ctx.lineWidth = 2;
  const cw = 512 / KENO_COLS;
  const ch = 560 / KENO_ROWS;
  ctx.font = '600 20px Inter, Arial';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let r = 0; r < KENO_ROWS; r++) {
    for (let c = 0; c < KENO_COLS; c++) {
      const x = c * cw; const y = 60 + r * ch;
      ctx.strokeRect(x + 4, y + 4, cw - 8, ch - 8);
      ctx.fillStyle = 'rgba(150,255,200,0.65)';
      ctx.fillText(String(r * KENO_COLS + c + 1), x + cw / 2, y + ch / 2);
    }
  }
  ctx.fillStyle = '#7cf0ae';
  ctx.font = '700 34px Cinzel, Georgia, serif';
  ctx.fillText('KENO', 256, 30);
  return canvasTexture(canvas);
}

export function buildKenoStation() {
  const g = new THREE.Group();
  const m = goldMaterial({ roughness: 0.35 });

  const table = gameTable({
    shape: 'rect', w: 3.3, d: 2.0, felt: '#07281c', rack: false,
    sign: ['KENO', 'Zahlen 1–80'],
  });
  g.add(table);

  // Aufrechte Leuchttafel hinter dem Tisch
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.85),
    new THREE.MeshStandardMaterial({ map: boardTexture(), emissive: 0xffffff, emissiveMap: boardTexture2(), emissiveIntensity: 0.55, roughness: 0.5 })
  );
  board.position.set(0, 1.95, -1.28);
  board.rotation.x = -0.12;
  g.add(board);

  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.66, 2.0, 0.08), m);
  frame.position.set(0, 1.95, -1.34);
  g.add(frame);

  // Zwei Sitzsäcke/Stühle werden von addStation gesetzt (chairs: true)

  g.userData = {
    hit: [3.7, 2.6, 2.6], labelY: 3.35,
    seats: [[0, 1.75], [-1.05, 1.6], [1.05, 1.6]], face: [0, 0.3], sit: true, chairs: true,
    mount: { type: 'fixed', scale: 1, offset: [0, 0, 0], pull: 0, hide: [], lookY: 0.96, fov: 60 },
  };
  return g;
}

// Zweite, hellere Textur für die Emissive-Map (Leuchtraster)
function boardTexture2() {
  const { canvas, ctx } = makeCanvas(512, 640);
  ctx.fillStyle = '#020a06';
  ctx.fillRect(0, 0, 512, 640);
  const cw = 512 / KENO_COLS;
  const ch = 560 / KENO_ROWS;
  for (let r = 0; r < KENO_ROWS; r++) {
    for (let c = 0; c < KENO_COLS; c++) {
      ctx.fillStyle = (r + c) % 2 ? 'rgba(120,220,170,0.35)' : 'rgba(120,220,170,0.18)';
      ctx.fillRect(c * cw + 5, 60 + r * ch + 5, cw - 10, ch - 10);
    }
  }
  return canvasTexture(canvas);
}
