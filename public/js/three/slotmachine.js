import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCanvas, canvasTexture, roundRect } from './assets.js';
import { brushedNormal } from './textures.js';
import { casinoChair } from './furniture.js';

/**
 * Spielautomat ("einarmiger Bandit") in realer Größe mit fünf echten Walzen hinter Glas, Hebel, Tastenfeld,
 * Kreditanzeige, beleuchtetem Top-Glas und Lauflicht-Marquee. Das Walzenmodell ist mit dem Slot-Spiel geteilt
 * (gleiche Geometrie, gleicher Maßstab), sodass das Spiel seine Walzen exakt an derselben Stelle einbauen kann.
 */

// ---------- Walzen (geteilt mit dem Spiel) ----------
export const CELLS = 24;
export const CELL = 1.05;
export const R = (CELLS * CELL) / (2 * Math.PI); // ≈ 4.01 (Spieleinheiten)
export const REEL_W = 1.0;
export const PITCH = 1.14;
export const ANGLE = (Math.PI * 2) / CELLS;
export const REEL_SCALE = 0.075; // Spieleinheiten -> Meter im Automaten (Walzenradius ≈ 0,30 m)
export const REEL_COUNT = 5;

export const SYMBOL_DRAW = {
  cherry: { emoji: '🍒' }, lemon: { emoji: '🍋' }, orange: { emoji: '🍊' }, plum: { emoji: '🍇' },
  bell: { emoji: '🔔' }, diamond: { emoji: '💎' },
  bar: { text: 'BAR', color: '#f5d97a', bg: '#2a1e05' },
  seven: { text: '7', color: '#ff4d4d', bg: '#2a0808' },
  wild: { text: 'WILD', color: '#7cf0ae', bg: '#0b2a1c' },
};
const SYMBOLS = Object.keys(SYMBOL_DRAW);

/** Walzenstreifen als Textur (24 Felder nebeneinander, Symbol steht aufrecht auf der Walze) */
export function stripTexture(strip) {
  const S = 160;
  const { canvas, ctx } = makeCanvas(CELLS * S, S);
  strip.forEach((sym, i) => {
    const x = i * S;
    const g = ctx.createLinearGradient(x, 0, x, S);
    g.addColorStop(0, '#d9d1bd'); g.addColorStop(0.5, '#faf6ea'); g.addColorStop(1, '#cfc6b0');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, S, S);
    // Feldkante: feine Goldlinie und dunkler Trennstreifen
    ctx.strokeStyle = 'rgba(201,162,74,0.55)'; ctx.lineWidth = 3; ctx.strokeRect(x + 6, 6, S - 12, S - 12);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, 0, 2, S);
    const d = SYMBOL_DRAW[sym];
    ctx.save();
    ctx.translate(x + S / 2, S / 2);
    ctx.rotate(Math.PI / 2); // Symbol aufrecht auf der Walze
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (d.emoji) {
      ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
      ctx.font = '108px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
      ctx.fillText(d.emoji, 0, 8);
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.strokeStyle = 'rgba(60,40,20,0.25)'; ctx.lineWidth = 2; ctx.strokeText(d.emoji, 0, 8);
    } else {
      ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
      ctx.fillStyle = d.bg; roundRect(ctx, -64, -42, 128, 84, 14); ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.strokeStyle = d.color; ctx.lineWidth = 3; roundRect(ctx, -58, -36, 116, 72, 10); ctx.stroke();
      ctx.fillStyle = d.color; ctx.font = `900 ${d.text.length > 2 ? 50 : 82}px Cinzel, Georgia, serif`;
      ctx.fillText(d.text, 0, 6);
    }
    ctx.restore();
  });
  const tex = canvasTexture(canvas, { anisotropy: 16 });
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

let reelGeo = null;
/** Walzen-Zylinder (Achse entlang X, Vorderseite +Z), in Spieleinheiten */
export function reelGeometry() {
  if (!reelGeo) { reelGeo = new THREE.CylinderGeometry(R, R, REEL_W, 96, 1, true); reelGeo.rotateZ(Math.PI / 2); }
  return reelGeo;
}
export function reelMaterial(tex) {
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.02, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12 });
}
/** Walze i (0..4) mit Streifen-Textur, Position in Spieleinheiten */
export function buildReel(i, tex) {
  const reel = new THREE.Mesh(reelGeometry(), reelMaterial(tex));
  reel.position.x = (i - 2) * PITCH;
  reel.rotation.x = ANGLE * (Math.floor(Math.random() * CELLS) + 0.5);
  return reel;
}
/** Walzenwinkel, bei dem Feld `stop` mittig im Fenster steht */
export const stopAngle = (stop) => ANGLE * (stop + 0.5);

// ---------- Materialien ----------
const mats = {};
function materials() {
  if (mats.red) return mats;
  mats.red = new THREE.MeshPhysicalMaterial({ color: 0x8c0d1c, metalness: 0.55, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.06 });
  mats.redDark = new THREE.MeshPhysicalMaterial({ color: 0x4a0810, metalness: 0.5, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1 });
  mats.black = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0e, metalness: 0.3, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 });
  mats.matte = new THREE.MeshStandardMaterial({ color: 0x121215, roughness: 0.75, metalness: 0.2 });
  mats.cavity = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.95, side: THREE.BackSide });
  mats.chrome = new THREE.MeshStandardMaterial({ color: 0xe6e7ec, metalness: 1, roughness: 0.14, normalMap: brushedNormal(), normalScale: new THREE.Vector2(0.15, 0.15) });
  mats.chromeDull = new THREE.MeshStandardMaterial({ color: 0xbfc2c8, metalness: 0.95, roughness: 0.32 });
  mats.glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.03, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.03, transparent: true, opacity: 0.07, depthWrite: false, envMapIntensity: 0.9 });
  mats.knob = new THREE.MeshPhysicalMaterial({ color: 0xb3111f, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03 });
  mats.reelLight = new THREE.MeshStandardMaterial({ color: 0xfff3dc, emissive: 0xffe6c0, emissiveIntensity: 1.3 });
  mats.marker = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff2a2a, emissiveIntensity: 0.9, roughness: 0.4 });
  mats.lamp = new THREE.MeshStandardMaterial({ color: 0xffd76a, emissive: 0xffd76a, emissiveIntensity: 1.8 });
  mats.buttons = {
    spin: new THREE.MeshPhysicalMaterial({ color: 0xe0161f, emissive: 0xff2a2a, emissiveIntensity: 0.45, roughness: 0.25, clearcoat: 1 }),
    yellow: new THREE.MeshPhysicalMaterial({ color: 0xf1c40f, emissive: 0xf1c40f, emissiveIntensity: 0.35, roughness: 0.3, clearcoat: 1 }),
    green: new THREE.MeshPhysicalMaterial({ color: 0x27ae60, emissive: 0x2ecc71, emissiveIntensity: 0.35, roughness: 0.3, clearcoat: 1 }),
    blue: new THREE.MeshPhysicalMaterial({ color: 0x2f7be0, emissive: 0x3b82f6, emissiveIntensity: 0.35, roughness: 0.3, clearcoat: 1 }),
  };
  return mats;
}

/** Mehrere Boxen mit demselben Material zu einem Mesh zusammenfassen (weniger Draw-Calls) */
function merged(parts, material) {
  const geos = parts.map(({ geo, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] }) => {
    const g = geo.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s)));
    return g;
  });
  const m = new THREE.Mesh(mergeGeometries(geos, false), material);
  geos.forEach((g) => g.dispose());
  return m;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const rbox = (w, h, d, r = 0.01, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, r);

// ---------- Texturen des Automaten ----------
const texCache = {};
/** Top-Glas: Artwork mit "ROYAL 7s", Auszahlungshinweisen, warmem Hintergrund */
function topGlassTexture(variant) {
  const key = `top:${variant}`;
  if (texCache[key]) return texCache[key];
  const W = 768; const H = 448;
  const { canvas, ctx } = makeCanvas(W, H);
  const themes = [
    { name: 'ROYAL 7s', c1: '#3a0611', c2: '#12030a', accent: '#ff3b3b' },
    { name: 'DIAMOND RUSH', c1: '#061a3a', c2: '#02060f', accent: '#5ec8ff' },
    { name: 'GOLDEN BELL', c1: '#2e1a02', c2: '#0e0801', accent: '#ffd76a' },
    { name: 'LUCKY FRUITS', c1: '#052a12', c2: '#010d05', accent: '#7cf0ae' },
  ];
  const th = themes[variant % themes.length];
  const bg = ctx.createRadialGradient(W / 2, H * 0.4, 30, W / 2, H / 2, W * 0.7);
  bg.addColorStop(0, th.c1); bg.addColorStop(1, th.c2);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // Strahlen
  ctx.save(); ctx.translate(W / 2, H * 0.42); ctx.globalAlpha = 0.12;
  for (let i = 0; i < 18; i++) { ctx.rotate(Math.PI / 9); ctx.fillStyle = i % 2 ? '#ffffff' : th.accent; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-40, -600); ctx.lineTo(40, -600); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // Große 777 mit Chromverlauf
  const g7 = ctx.createLinearGradient(0, 60, 0, 250);
  g7.addColorStop(0, '#fff2b0'); g7.addColorStop(0.45, '#d4af37'); g7.addColorStop(0.5, '#8a6a1a'); g7.addColorStop(0.55, '#f5d97a'); g7.addColorStop(1, '#b08a2a');
  ctx.font = '900 190px Cinzel, Georgia, serif';
  ctx.shadowColor = th.accent; ctx.shadowBlur = 40;
  ctx.fillStyle = g7; ctx.fillText('777', W / 2, 150);
  ctx.shadowBlur = 0;
  ctx.lineWidth = 4; ctx.strokeStyle = '#3a2a05'; ctx.strokeText('777', W / 2, 150);
  ctx.font = '900 54px Cinzel, Georgia, serif'; ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 12;
  ctx.fillText(th.name, W / 2, 268);
  ctx.shadowBlur = 0;
  // Auszahlungszeilen
  const rows = [['7 7 7', '800×', true], ['💎 💎 💎', '250×'], ['🔔 🔔 🔔', '30×'], ['🍒 🍒 🍒', '8×']];
  rows.forEach(([sym, pay, isText], i) => {
    const x = 120 + (i % 2) * 380; const y = 330 + Math.floor(i / 2) * 58;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; roundRect(ctx, x - 90, y - 24, 340, 48, 12); ctx.fill();
    ctx.textAlign = 'left';
    if (isText) { ctx.font = '900 34px Cinzel, Georgia, serif'; ctx.fillStyle = '#ff4d4d'; }
    else { ctx.font = '30px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'; ctx.fillStyle = '#fff'; }
    ctx.fillText(sym, x - 76, y + 2);
    ctx.textAlign = 'right'; ctx.font = '800 32px Inter, Arial'; ctx.fillStyle = '#f5d97a'; ctx.fillText(pay, x + 236, y + 1);
  });
  ctx.textAlign = 'center';
  ctx.strokeStyle = 'rgba(245,217,122,0.7)'; ctx.lineWidth = 6; roundRect(ctx, 10, 10, W - 20, H - 20, 22); ctx.stroke();
  texCache[key] = canvasTexture(canvas, { anisotropy: 8 });
  return texCache[key];
}

/** Diagonaler Lichtreflex für Glasscheiben (transparent) */
function glassSheenTexture() {
  if (texCache.sheen) return texCache.sheen;
  const { canvas, ctx } = makeCanvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);
  const g = ctx.createLinearGradient(0, 256, 256, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.42, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.16)');
  g.addColorStop(0.56, 'rgba(255,255,255,0.05)'); g.addColorStop(0.62, 'rgba(255,255,255,0.12)'); g.addColorStop(0.7, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  texCache.sheen = canvasTexture(canvas);
  return texCache.sheen;
}

/** Marquee-Schriftzug (Topper) */
function marqueeTexture(text) {
  const key = `marquee:${text}`;
  if (texCache[key]) return texCache[key];
  const { canvas, ctx } = makeCanvas(768, 192);
  ctx.fillStyle = '#12060a'; roundRect(ctx, 0, 0, 768, 192, 40); ctx.fill();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '900 96px Cinzel, Georgia, serif';
  ctx.shadowColor = '#ffd76a'; ctx.shadowBlur = 36;
  const g = ctx.createLinearGradient(0, 40, 0, 150);
  g.addColorStop(0, '#fff2b0'); g.addColorStop(0.5, '#ffd76a'); g.addColorStop(1, '#c9932a');
  ctx.fillStyle = g; ctx.fillText(text, 384, 100);
  ctx.shadowBlur = 0; ctx.strokeStyle = '#3a2a05'; ctx.lineWidth = 3; ctx.strokeText(text, 384, 100);
  texCache[key] = canvasTexture(canvas);
  return texCache[key];
}

/** Beschriftung des Tastenfelds (transparent) */
function deckLabelTexture() {
  if (texCache.deck) return texCache.deck;
  const { canvas, ctx } = makeCanvas(1024, 384);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '700 34px Inter, Arial';
  [['CASH OUT', 170], ['BET ONE', 350], ['BET MAX', 530], ['SPIN', 850]].forEach(([t, x]) => ctx.fillText(t, x, 330));
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3;
  roundRect(ctx, 40, 40, 944, 304, 40); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '600 26px Inter, Arial';
  ctx.fillText('ROYAL CASINO · 5 REELS · 9 LINES', 512, 70);
  texCache.deck = canvasTexture(canvas);
  return texCache.deck;
}

/** Kreditanzeige (LCD), aktualisierbar */
function makeDisplay() {
  const W = 512; const H = 96;
  const { canvas, ctx } = makeCanvas(W, H);
  const tex = canvasTexture(canvas);
  const draw = (credits, win, msg) => {
    ctx.fillStyle = '#060a08'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,190,60,0.06)'; for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    ctx.textBaseline = 'middle'; ctx.font = '600 22px Inter, Arial';
    ctx.textAlign = 'left'; ctx.fillStyle = '#8a7a4a'; ctx.fillText('CREDIT', 22, 26); ctx.fillText('WIN', 300, 26);
    ctx.font = '800 40px "Courier New", monospace'; ctx.fillStyle = '#ffb020';
    ctx.shadowColor = '#ff9900'; ctx.shadowBlur = 12;
    ctx.fillText(String(credits), 22, 64); ctx.fillText(String(win), 300, 64);
    ctx.shadowBlur = 0;
    if (msg) { ctx.textAlign = 'right'; ctx.font = '700 20px Inter, Arial'; ctx.fillStyle = '#ffd76a'; ctx.fillText(msg, W - 18, 26); }
    tex.needsUpdate = true;
  };
  draw('0', '0', 'INSERT COIN');
  return { tex, draw };
}

// ---------- Automat ----------
/**
 * Baut einen Automaten. Lokal: +z zum Spieler, Fenster auf Höhe 1,17 m.
 * userData: reels (Anzeige-Walzen), reelAnchor (Walzenachse, +z zum Spieler), lookTarget (Fenstermitte),
 * pullLever() -> Promise, spinDemo(), setDisplay(credits, win, msg), setExcite(bool), update(dt, t), occupied.
 */
export function buildSlotMachine({ variant = 0, name = 'ROYAL SLOTS' } = {}) {
  const m = materials();
  const g = new THREE.Group();
  const S = REEL_SCALE;
  const WIN_Y = 1.17; // Fenstermitte
  const WIN_W = 0.445; const WIN_H = 0.255;
  const FRONT_Z = 0.30;
  const AXIS_Z = FRONT_Z - 0.03 - R * S; // Walzenvorderseite 3 cm hinter dem Glas

  // Sockel (Stand) mit Chrom-Sockelblende und Münzschale
  const stand = new THREE.Mesh(rbox(0.62, 0.62, 0.54, 0.02), m.matte);
  stand.position.set(0, 0.31, -0.02); stand.castShadow = true; stand.receiveShadow = true;
  g.add(stand);
  g.add(merged([
    { geo: box(0.64, 0.07, 0.56), p: [0, 0.035, -0.02] },
    { geo: box(0.64, 0.02, 0.56), p: [0, 0.615, -0.02] },
  ], m.chrome));
  // Münzschale: Chromschale mit dunkler Mulde
  const tray = new THREE.Mesh(rbox(0.5, 0.09, 0.14, 0.02), m.chrome);
  tray.position.set(0, 0.52, FRONT_Z - 0.02);
  const trayIn = new THREE.Mesh(rbox(0.44, 0.06, 0.1, 0.015), m.matte);
  trayIn.position.set(0, 0.545, FRONT_Z - 0.02);
  g.add(tray, trayIn);
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1, roughness: 0.3 });
  g.add(merged([[-0.12, 0.0, 0.2], [-0.05, 0.01, 1.1], [0.09, 0.0, 0.6], [0.14, 0.012, 2.2], [0.02, 0.0, 1.7]].map(([x, dy, rot]) => ({ geo: new THREE.CylinderGeometry(0.018, 0.018, 0.003, 20), p: [x, 0.578 + dy, FRONT_Z - 0.02 + (rot % 0.05)], r: [0, rot, 0] })), coinMat));

  // Hauptgehäuse: offene Schale (Seiten, Boden, Deckel, Rückwand) in Candy-Rot – die Front mit dem
  // Fensterausschnitt kommt als eigene Platte davor, dahinter liegt die dunkle Walzenkammer
  const BODY_Y0 = 0.62; const BODY_H = 0.9; const BODY_D = 0.66; const BODY_W = 0.70;
  const zBack = FRONT_Z - BODY_D; const zMid = (zBack + FRONT_Z - 0.06) / 2; const dInner = FRONT_Z - 0.06 - zBack;
  const body = merged([
    { geo: box(0.03, BODY_H, dInner), p: [-BODY_W / 2 + 0.015, BODY_Y0 + BODY_H / 2, zMid] },
    { geo: box(0.03, BODY_H, dInner), p: [BODY_W / 2 - 0.015, BODY_Y0 + BODY_H / 2, zMid] },
    { geo: box(BODY_W, 0.03, dInner), p: [0, BODY_Y0 + BODY_H - 0.015, zMid] },
    { geo: box(BODY_W, 0.03, dInner), p: [0, BODY_Y0 + 0.015, zMid] },
    { geo: box(BODY_W, BODY_H, 0.03), p: [0, BODY_Y0 + BODY_H / 2, zBack + 0.015] },
  ], m.red);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  // innere Kammer hinter dem Fenster (dunkel, von innen sichtbar)
  const cavity = new THREE.Mesh(box(BODY_W - 0.06, BODY_H - 0.06, dInner - 0.02), m.cavity);
  cavity.position.set(0, BODY_Y0 + BODY_H / 2, zMid);
  g.add(cavity);
  // Frontplatte aus vier Teilen um das Fenster (schwarz glänzend)
  const FP = 0.06; const fz = FRONT_Z - FP / 2;
  const top = BODY_Y0 + BODY_H; const winTop = WIN_Y + WIN_H / 2; const winBot = WIN_Y - WIN_H / 2;
  g.add(merged([
    { geo: box(BODY_W - 0.02, top - winTop, FP), p: [0, (top + winTop) / 2, fz] },
    { geo: box(BODY_W - 0.02, winBot - BODY_Y0, FP), p: [0, (winBot + BODY_Y0) / 2, fz] },
    { geo: box((BODY_W - 0.02 - WIN_W) / 2, WIN_H, FP), p: [-(WIN_W / 2 + (BODY_W - 0.02 - WIN_W) / 4), WIN_Y, fz] },
    { geo: box((BODY_W - 0.02 - WIN_W) / 2, WIN_H, FP), p: [WIN_W / 2 + (BODY_W - 0.02 - WIN_W) / 4, WIN_Y, fz] },
  ], m.black));
  // Schacht hinter dem Fensterausschnitt (matt schwarz), damit die Kammerkanten sauber wirken
  const SH = 0.07;
  g.add(merged([
    { geo: box(WIN_W + 0.02, 0.01, SH), p: [0, winTop + 0.005, FRONT_Z - FP - SH / 2 + 0.005] },
    { geo: box(WIN_W + 0.02, 0.01, SH), p: [0, winBot - 0.005, FRONT_Z - FP - SH / 2 + 0.005] },
    { geo: box(0.01, WIN_H + 0.02, SH), p: [-(WIN_W / 2 + 0.005), WIN_Y, FRONT_Z - FP - SH / 2 + 0.005] },
    { geo: box(0.01, WIN_H + 0.02, SH), p: [WIN_W / 2 + 0.005, WIN_Y, FRONT_Z - FP - SH / 2 + 0.005] },
  ], m.matte));
  // Chromrahmen um das Fenster + Kantenleisten des Gehäuses
  const fr = 0.022;
  g.add(merged([
    { geo: box(WIN_W + fr * 2, fr, 0.02), p: [0, winTop + fr / 2, FRONT_Z] },
    { geo: box(WIN_W + fr * 2, fr, 0.02), p: [0, winBot - fr / 2, FRONT_Z] },
    { geo: box(fr, WIN_H, 0.02), p: [-(WIN_W / 2 + fr / 2), WIN_Y, FRONT_Z] },
    { geo: box(fr, WIN_H, 0.02), p: [WIN_W / 2 + fr / 2, WIN_Y, FRONT_Z] },
    { geo: box(0.02, BODY_H, 0.02), p: [-BODY_W / 2 + 0.005, BODY_Y0 + BODY_H / 2, FRONT_Z - 0.005] },
    { geo: box(0.02, BODY_H, 0.02), p: [BODY_W / 2 - 0.005, BODY_Y0 + BODY_H / 2, FRONT_Z - 0.005] },
    { geo: box(BODY_W, 0.025, 0.03), p: [0, top + 0.0125, FRONT_Z - 0.015] },
    // Walzentrenner (dünne Chromstege im Fenster)
    ...[-1.5, -0.5, 0.5, 1.5].map((k) => ({ geo: box(0.008, WIN_H, 0.012), p: [k * PITCH * S, WIN_Y, FRONT_Z - 0.012] })),
  ], m.chrome));
  // Walzenbeleuchtung oben und unten im Fenster
  g.add(merged([
    { geo: box(WIN_W, 0.012, 0.02), p: [0, winTop - 0.008, FRONT_Z - 0.035] },
    { geo: box(WIN_W, 0.012, 0.02), p: [0, winBot + 0.008, FRONT_Z - 0.035] },
  ], m.reelLight));
  // Gewinnlinien-Markierungen (rote Dreiecke) beidseitig, drei Reihen
  const marker = new THREE.ConeGeometry(0.012, 0.024, 3);
  const rowY = (row) => WIN_Y + R * S * Math.sin(ANGLE * (1 - row));
  g.add(merged([0, 1, 2].flatMap((row) => [
    { geo: marker, p: [-(WIN_W / 2 + fr + 0.014), rowY(row), FRONT_Z + 0.004], r: [0, 0, -Math.PI / 2] },
    { geo: marker, p: [WIN_W / 2 + fr + 0.014, rowY(row), FRONT_Z + 0.004], r: [0, 0, Math.PI / 2] },
  ]), m.marker));
  // Glasscheibe mit weichem Reflexstreifen
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(WIN_W + fr * 2, WIN_H + fr * 2), m.glass);
  glass.position.set(0, WIN_Y, FRONT_Z + 0.011); glass.renderOrder = 2;
  const sheen = new THREE.Mesh(new THREE.PlaneGeometry(WIN_W + fr * 2, WIN_H + fr * 2), new THREE.MeshBasicMaterial({ map: glassSheenTexture(), transparent: true, depthWrite: false, opacity: 0.55 }));
  sheen.position.set(0, WIN_Y, FRONT_Z + 0.012); sheen.renderOrder = 3;
  g.add(glass, sheen);

  // Anzeige-Walzen (werden beim Spielen durch die Spielwalzen ersetzt)
  const reelAnchor = new THREE.Object3D();
  reelAnchor.position.set(0, WIN_Y, AXIS_Z);
  g.add(reelAnchor);
  const reelGroup = new THREE.Group();
  reelGroup.scale.setScalar(S);
  reelAnchor.add(reelGroup);
  const reels = [];
  let seed = variant * 7919 + 17;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < REEL_COUNT; i++) {
    const strip = Array.from({ length: CELLS }, () => SYMBOLS[Math.floor(rnd() * SYMBOLS.length)]);
    const reel = buildReel(i, stripTexture(strip));
    reel.rotation.x = stopAngle(Math.floor(rnd() * CELLS));
    reelGroup.add(reel);
    reels.push(reel);
  }
  const lookTarget = new THREE.Object3D();
  lookTarget.position.set(0, WIN_Y + 0.06, FRONT_Z);
  g.add(lookTarget);

  // Kreditanzeige unter dem Fenster
  const display = makeDisplay();
  const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.064), new THREE.MeshStandardMaterial({ map: display.tex, emissive: 0xffffff, emissiveMap: display.tex, emissiveIntensity: 1.1, roughness: 0.4 }));
  lcd.position.set(0, winBot - 0.075, FRONT_Z + 0.002);
  const lcdFrame = new THREE.Mesh(box(0.36, 0.084, 0.012), m.chrome);
  lcdFrame.position.set(0, winBot - 0.075, FRONT_Z - 0.004);
  g.add(lcdFrame, lcd);

  // Tastenfeld (geneigt) mit Tasten, Beschriftung, Geldeinwurf
  const deck = new THREE.Group();
  deck.position.set(0, BODY_Y0 + 0.16, FRONT_Z + 0.09);
  deck.rotation.x = -0.32;
  const deckBody = new THREE.Mesh(rbox(0.64, 0.06, 0.24, 0.015), m.black);
  deck.add(deckBody);
  const deckLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.22), new THREE.MeshStandardMaterial({ map: deckLabelTexture(), transparent: true, roughness: 0.5, depthWrite: false }));
  deckLabel.rotation.x = -Math.PI / 2; deckLabel.position.y = 0.031;
  deck.add(deckLabel);
  const btn = (mat, x, r, h = 0.018) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, h, 24), mat); b.position.set(x, 0.03 + h / 2, 0.0); deck.add(b); const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 1.08, 0.004, 6, 24), m.chrome); rim.rotation.x = Math.PI / 2; rim.position.set(x, 0.032, 0); deck.add(rim); return b; };
  btn(m.buttons.green, -0.2, 0.026);
  btn(m.buttons.yellow, -0.095, 0.026);
  btn(m.buttons.blue, 0.01, 0.026);
  const spinBtn = btn(m.buttons.spin, 0.2, 0.042, 0.024);
  g.add(deck);
  // Geldeinwurf/Bill-Acceptor rechts unter dem Deck
  g.add(merged([
    { geo: box(0.09, 0.05, 0.02), p: [0.24, BODY_Y0 + 0.05, FRONT_Z + 0.005] },
    { geo: box(0.05, 0.004, 0.022), p: [0.24, BODY_Y0 + 0.05, FRONT_Z + 0.006] },
    { geo: box(0.05, 0.02, 0.02), p: [-0.24, BODY_Y0 + 0.05, FRONT_Z + 0.005] },
  ], m.chromeDull));

  // LED-Leisten an den vorderen Kanten (Farbe wird animiert)
  const ledMat = new THREE.MeshStandardMaterial({ color: 0x35c7ff, emissive: 0x35c7ff, emissiveIntensity: 1.8 });
  const leds = merged([
    { geo: box(0.012, BODY_H + 0.3, 0.012), p: [-BODY_W / 2 - 0.006, BODY_Y0 + BODY_H / 2 + 0.15, FRONT_Z - 0.03] },
    { geo: box(0.012, BODY_H + 0.3, 0.012), p: [BODY_W / 2 + 0.006, BODY_Y0 + BODY_H / 2 + 0.15, FRONT_Z - 0.03] },
  ], ledMat);
  g.add(leds);

  // Top-Glas (beleuchtetes Artwork) mit Chromrahmen und schwarzem Kasten dahinter
  const TOP_Y0 = top + 0.025; const TOP_H = 0.36;
  const topBox = new THREE.Mesh(rbox(BODY_W, TOP_H, 0.42, 0.02), m.redDark);
  topBox.position.set(0, TOP_Y0 + TOP_H / 2, FRONT_Z - 0.25); topBox.castShadow = true;
  g.add(topBox);
  const artTex = topGlassTexture(variant);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.32), new THREE.MeshStandardMaterial({ map: artTex, emissive: 0xffffff, emissiveMap: artTex, emissiveIntensity: 1.25, roughness: 0.35 }));
  art.position.set(0, TOP_Y0 + TOP_H / 2, FRONT_Z - 0.038);
  const artGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.34), m.glass);
  artGlass.position.set(0, TOP_Y0 + TOP_H / 2, FRONT_Z - 0.03); artGlass.renderOrder = 2;
  g.add(art, artGlass);
  g.add(merged([
    { geo: box(0.66, 0.02, 0.02), p: [0, TOP_Y0 + TOP_H / 2 + 0.17, FRONT_Z - 0.035] },
    { geo: box(0.66, 0.02, 0.02), p: [0, TOP_Y0 + TOP_H / 2 - 0.17, FRONT_Z - 0.035] },
    { geo: box(0.02, 0.36, 0.02), p: [-0.33, TOP_Y0 + TOP_H / 2, FRONT_Z - 0.035] },
    { geo: box(0.02, 0.36, 0.02), p: [0.33, TOP_Y0 + TOP_H / 2, FRONT_Z - 0.035] },
  ], m.chrome));

  // Topper: Marquee mit Lauflicht
  const MQ_Y = TOP_Y0 + TOP_H + 0.13;
  const marqueeBack = new THREE.Mesh(rbox(0.6, 0.2, 0.12, 0.03), m.black);
  marqueeBack.position.set(0, MQ_Y, FRONT_Z - 0.3);
  const marqueeTex = marqueeTexture(name);
  const marquee = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.14), new THREE.MeshStandardMaterial({ map: marqueeTex, emissive: 0xffffff, emissiveMap: marqueeTex, emissiveIntensity: 1.6, roughness: 0.4 }));
  marquee.position.set(0, MQ_Y, FRONT_Z - 0.238);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.08, 10), m.chrome);
  post.position.set(0, TOP_Y0 + TOP_H + 0.04, FRONT_Z - 0.3);
  g.add(marqueeBack, marquee, post);
  const LAMPS = 18;
  const LAMP_ON = new THREE.Color(0xffe08a).multiplyScalar(2.2); const LAMP_OFF = new THREE.Color(0x4a3a10);
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffd76a, emissive: 0xffd76a, emissiveIntensity: 1 }), LAMPS);
  const lm = new THREE.Matrix4();
  const lampPos = [];
  for (let i = 0; i < LAMPS; i++) {
    // Rechteckiger Umlauf um das Marquee
    const t = i / LAMPS; const per = 2 * (0.6 + 0.2);
    let d = t * per; let x; let y;
    if (d < 0.6) { x = -0.3 + d; y = 0.11; } else if (d < 0.8) { x = 0.3; y = 0.11 - (d - 0.6); } else if (d < 1.4) { x = 0.3 - (d - 0.8); y = -0.11; } else { x = -0.3; y = -0.11 + (d - 1.4); }
    lampPos.push([x, MQ_Y + y, FRONT_Z - 0.235]);
    lm.setPosition(x, MQ_Y + y, FRONT_Z - 0.235);
    lamps.setMatrixAt(i, lm);
    lamps.setColorAt(i, new THREE.Color(0xffd76a));
  }
  g.add(lamps);

  // Hebel rechts: Chromgehäuse, Arm mit rotem Knauf
  const lever = new THREE.Group();
  lever.position.set(BODY_W / 2 + 0.035, WIN_Y - 0.02, FRONT_Z - 0.2);
  const housing = new THREE.Mesh(rbox(0.07, 0.16, 0.16, 0.015), m.chrome);
  lever.add(housing);
  const armPivot = new THREE.Group();
  lever.add(armPivot);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.4, 12), m.chrome);
  arm.position.y = 0.2; arm.castShadow = true;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 20, 16), m.knob);
  knob.position.y = 0.41; knob.castShadow = true;
  const hubCap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16), m.chromeDull);
  hubCap.rotation.z = Math.PI / 2; hubCap.position.x = 0.045;
  armPivot.add(arm, knob, hubCap);
  const REST = -0.32; const PULLED = 1.55;
  armPivot.rotation.x = REST;
  g.add(lever);

  // Stuhl
  const chair = casinoChair({ seatY: 0.62 });
  chair.position.set(0, 0, 0.92);
  g.add(chair);

  // ---------- Verhalten ----------
  const state = { pull: null, spin: null, excite: 0, demoTimer: 6 + Math.random() * 8, occupied: false, phase: Math.random() * 10 };
  const pullResolvers = [];
  g.userData.reels = reels;
  g.userData.reelGroup = reelGroup;
  g.userData.reelAnchor = reelAnchor;
  g.userData.lookTarget = lookTarget;
  g.userData.chair = chair;
  g.userData.setDisplay = (credits, win, msg = '') => display.draw(credits, win, msg);
  g.userData.setExcite = (on) => { state.excite = on ? 1 : 0; };
  g.userData.pullLever = () => new Promise((resolve) => { if (!state.pull) state.pull = { t: 0 }; pullResolvers.push(resolve); });
  /** Anzeige-Walzen drehen (Demo/Mitspieler), stops optional (Feldindex je Walze) */
  g.userData.spinDemo = (stops = null) => {
    if (state.spin) return;
    const targets = stops ?? reels.map(() => Math.floor(Math.random() * CELLS));
    state.spin = reels.map((reel, i) => ({ t: -i * 0.12, a0: reel.rotation.x, dur: 1.0 + i * 0.32, target: null, stop: targets[i] }));
    g.userData.pullLever();
  };
  g.userData.update = (dt, t) => {
    // Hebel
    if (state.pull) {
      state.pull.t += dt;
      const p = state.pull.t;
      let a;
      if (p < 0.32) a = REST + (PULLED - REST) * (1 - Math.cos((p / 0.32) * Math.PI / 2)); // zügig ziehen
      else if (p < 0.45) a = PULLED;
      else if (p < 1.05) { const k = (p - 0.45) / 0.6; a = REST + (PULLED - REST) * (1 - k) * Math.cos(k * Math.PI * 1.5) * (1 - k); } // zurückfedern mit Nachschwingen
      else { a = REST; state.pull = null; pullResolvers.splice(0).forEach((r) => r()); }
      armPivot.rotation.x = a;
    }
    // Demo-Walzen
    if (state.spin) {
      let done = true;
      state.spin.forEach((s, i) => {
        s.t += dt;
        if (s.t < 0) { done = false; return; }
        const reel = reels[i];
        if (s.t < 0.25) { reel.rotation.x = s.a0 + 0.9 * (s.t / 0.25) ** 2; done = false; }
        else if (s.t < 0.25 + s.dur) { reel.rotation.x = s.a0 + 0.9 + 17 * (s.t - 0.25); done = false; }
        else {
          if (s.target === null) { const a2 = reel.rotation.x; const theta = stopAngle(s.stop); s.target = theta + Math.PI * 2 * Math.ceil((a2 + 1.6 - theta) / (Math.PI * 2)); s.a2 = a2; }
          const k = Math.min(1, (s.t - 0.25 - s.dur) / 0.6);
          const c1 = 1.70158; const c3 = c1 + 1; const e = 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
          reel.rotation.x = s.a2 + (s.target - s.a2) * e;
          if (k < 1) done = false; else reel.rotation.x = s.target % (Math.PI * 2);
        }
      });
      if (done) { state.spin = null; state.excite = Math.random() < 0.3 ? 1 : 0; state.demoTimer = 5 + Math.random() * 9; if (state.excite) setTimeout(() => { state.excite = 0; }, 2500); }
    } else if (state.occupied || g.userData.occupied) {
      state.demoTimer -= dt;
      if (state.demoTimer <= 0) g.userData.spinDemo();
    } else {
      // Attract-Modus: freie Automaten blinken alle 25–45 s kurz auf
      state.attract = (state.attract ?? 12 + Math.random() * 30) - dt;
      if (state.attract <= 0) { state.excite = 1; state.attract = 25 + Math.random() * 20; setTimeout(() => { if (!state.spin) state.excite = 0; }, 1800); }
    }
    // Lauflicht am Marquee
    const speed = state.excite ? 14 : 4;
    for (let i = 0; i < LAMPS; i++) {
      const on = state.excite ? Math.sin(t * speed + i * 0.35) > -0.2 : ((Math.floor(t * speed) + i) % 3) === 0;
      lamps.setColorAt(i, on ? LAMP_ON : LAMP_OFF);
    }
    lamps.instanceColor.needsUpdate = true;
    // LED-Kanten: langsamer Farbverlauf, beim Gewinn schnelles Pulsieren
    const hue = state.excite ? (t * 1.5) % 1 : (0.55 + Math.sin(t * 0.25 + state.phase) * 0.12);
    ledMat.emissive.setHSL(hue, 1, 0.55); ledMat.color.copy(ledMat.emissive);
    ledMat.emissiveIntensity = state.excite ? 2.2 + Math.sin(t * 20) * 1.2 : 1.6;
    spinBtn.material.emissiveIntensity = 0.45 + Math.max(0, Math.sin(t * 3)) * 0.5;
  };
  return g;
}
