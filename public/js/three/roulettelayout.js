import { makeCanvas, canvasTexture, roundRect } from './assets.js';
import { colorOf } from './roulettewheel.js';

/**
 * Setz-Layout (Tableau) für den Roulette-Tisch als Filzaufdruck, inkl. Feldkoordinaten für 3D-Chips.
 * Canvas 1024×640 px entspricht einer Fläche von LAYOUT.w × LAYOUT.d Metern auf dem Tisch.
 */
export const LAYOUT = { W: 1024, H: 640, w: 2.72, d: 1.7 };
const CW = 64; const CH = 90; const X0 = 128; const Y0 = 96; // Zahlenraster
const COL_X = X0 + 12 * CW; // Kolonnen-Felder (2:1)
const ROW_DOZ = Y0 + 3 * CH; const ROW_OUT = ROW_DOZ + 58;

/** Mittelpunkt eines Wettfelds in Canvas-Pixeln: key wie im Spiel ('straight:17', 'dozen:2', 'column:3', 'red', ...) */
export function layoutCell(key) {
  const [type, v] = key.split(':'); const n = v == null ? null : Number(v);
  if (type === 'straight') {
    if (n === 0) return { x: X0 - 34, y: Y0 + CH * 1.5 };
    const col = Math.floor((n - 1) / 3); const row = 2 - ((n - 1) % 3);
    return { x: X0 + col * CW + CW / 2, y: Y0 + row * CH + CH / 2 };
  }
  if (type === 'column') return { x: COL_X + 34, y: Y0 + (3 - n) * CH + CH / 2 };
  if (type === 'dozen') return { x: X0 + (n - 1) * CW * 4 + CW * 2, y: ROW_DOZ + 29 };
  const idx = ['low', 'even', 'red', 'black', 'odd', 'high'].indexOf(type);
  if (idx >= 0) return { x: X0 + idx * CW * 2 + CW, y: ROW_OUT + 29 };
  return { x: LAYOUT.W / 2, y: LAYOUT.H / 2 };
}

/** Canvas-Pixel -> lokale Koordinaten des Decal-Planes (x nach rechts, z zum Spieler) in Metern */
export function layoutToLocal({ x, y }) {
  return { x: (x / LAYOUT.W - 0.5) * LAYOUT.w, z: (y / LAYOUT.H - 0.5) * LAYOUT.d };
}

export function rouletteLayoutTexture() {
  const { W, H } = LAYOUT;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.clearRect(0, 0, W, H);
  const line = 'rgba(250,240,200,0.95)';
  const fill = { red: 'rgba(178,32,28,0.92)', black: 'rgba(20,20,24,0.9)', green: 'rgba(24,120,64,0.92)' };
  ctx.lineWidth = 3; ctx.strokeStyle = line; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // Zahlenfelder
  for (let n = 1; n <= 36; n++) {
    const c = layoutCell(`straight:${n}`);
    ctx.fillStyle = fill[colorOf(n)];
    ctx.fillRect(c.x - CW / 2, c.y - CH / 2, CW, CH);
    ctx.strokeRect(c.x - CW / 2, c.y - CH / 2, CW, CH);
    ctx.fillStyle = '#fff'; ctx.font = '800 34px Inter, Arial';
    ctx.fillText(String(n), c.x, c.y + 1);
  }
  // Null (links, über alle drei Reihen, mit runder Außenkante)
  const z = layoutCell('straight:0');
  ctx.fillStyle = fill.green;
  ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X0 - 40, Y0); ctx.arc(X0 - 40, Y0 + CH * 1.5, CH * 1.5, -Math.PI / 2, Math.PI / 2, true); ctx.lineTo(X0, Y0 + CH * 3); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = '800 40px Inter, Arial'; ctx.fillText('0', z.x - 6, z.y);
  // Kolonnen 2:1
  for (let c = 1; c <= 3; c++) {
    const p = layoutCell(`column:${c}`);
    ctx.strokeRect(p.x - 34, p.y - CH / 2, 68, CH);
    ctx.fillStyle = line; ctx.font = '700 24px Inter, Arial'; ctx.fillText('2 : 1', p.x, p.y);
  }
  // Dutzende
  [['1. 12', 1], ['2. 12', 2], ['3. 12', 3]].forEach(([t, d]) => {
    const p = layoutCell(`dozen:${d}`);
    ctx.strokeRect(p.x - CW * 2, ROW_DOZ, CW * 4, 58);
    ctx.fillStyle = line; ctx.font = '700 28px Cinzel, Georgia, serif'; ctx.fillText(t, p.x, p.y + 1);
  });
  // Einfache Chancen
  [['1 – 18', 'low'], ['GERADE', 'even'], ['ROT', 'red'], ['SCHWARZ', 'black'], ['UNGERADE', 'odd'], ['19 – 36', 'high']].forEach(([t, k]) => {
    const p = layoutCell(k);
    ctx.strokeRect(p.x - CW, ROW_OUT, CW * 2, 58);
    if (k === 'red' || k === 'black') {
      ctx.fillStyle = fill[k];
      const rw = 40; const rh = 30;
      ctx.beginPath(); ctx.moveTo(p.x, p.y - rh); ctx.lineTo(p.x + rw, p.y); ctx.lineTo(p.x, p.y + rh); ctx.lineTo(p.x - rw, p.y); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else { ctx.fillStyle = line; ctx.font = '700 22px Inter, Arial'; ctx.fillText(t, p.x, p.y + 1); }
  });
  // Kopfzeile
  ctx.fillStyle = 'rgba(250,240,200,0.9)'; ctx.font = '700 30px Cinzel, Georgia, serif';
  ctx.fillText('ROULETTE', W / 2, 44);
  ctx.font = '600 18px Inter, Arial';
  ctx.fillText('EINFACHE CHANCEN 1 : 1  ·  DUTZEND / KOLONNE 2 : 1  ·  PLEIN 35 : 1', W / 2, 74);
  ctx.strokeStyle = 'rgba(250,240,200,0.5)'; ctx.lineWidth = 2; roundRect(ctx, 14, 14, W - 28, H - 28, 16); ctx.stroke();
  return canvasTexture(canvas, { anisotropy: 16 });
}
