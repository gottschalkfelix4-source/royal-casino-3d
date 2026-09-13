import * as THREE from 'three';
import { Simplex } from './noise.js';
import { makeCanvas, roundRect } from './assets.js';
import {
  surfaceMaps, textureFromCanvas, fieldNormalCanvas, fieldToGrayCanvas, roughnessFromAlbedo,
} from './materialmaps.js';

/**
 * Prozedurale Oberflächen der Halle: Marmor, Teppich, Läufer, Wände, Decke, Metall und Leder.
 *
 * Aufbau: Die großflächige Struktur (Adern, Wolle, Putz, Maserung) kommt aus den Rauschfeldern in `noise.js`;
 * daraus werden Normal-, Rauheits- und AO-Karten abgeleitet (materialmaps.js). Rauschfelder werden in
 * reduzierter Auflösung gerechnet und für die Farbkarte hochskaliert – Muster und Ornamente bleiben in voller
 * Auflösung gezeichnet. Alle Ergebniskarten werden gecacht und über Spiel-/Qualitätswechsel behalten.
 */

const c255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Per-Pixel-Rauschen auf den ganzen Canvas (Luminanz ±amount) – feiner „Schmutz"/Körnung. */
function grain(ctx, w, h, amount) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/** Weiche, großflächige Fleckigkeit (Alterung, Wolken) auf Canvas-Ebene */
function mottle(ctx, w, h, { count = 120, radius = 120, alpha = 0.08, colors = ['#000', '#fff'] } = {}) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * w; const y = Math.random() * h; const r = radius * (0.5 + Math.random());
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = colors[i % colors.length];
    g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * Math.random();
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
}

/** Helligkeitsfeld eines Canvas in reduzierter Auflösung n×n (für Normal/AO-Ableitung). */
function lumField(canvas, n) {
  const { canvas: small, ctx } = makeCanvas(n, n);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, n, n);
  const d = ctx.getImageData(0, 0, n, n).data;
  const f = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) f[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255;
  return f;
}

/** Deterministische Prozedur je Pixel: fn(u, v, x, y) -> [r,g,b] (0..255). */
function paint(w, h, fn) {
  const { canvas, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const col = fn(x / w, y / h, x, y);
      const o = (y * w + x) * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Normal-Karten-Textur aus einem Feld. */
function normalTexture(field, w, h, { strength = 1, repeat = [1, 1] } = {}) {
  return textureFromCanvas(fieldNormalCanvas(field, w, h, { strength }), { repeat });
}

// ---------- Marmor ----------
/**
 * Cremefarbener Marmor: domain-verwarpete Turbulenz-Adern in mehreren Maßstäben, Kalzit-Wolken, feine
 * Mikrorisse. Farbkarte bei 2048² (Muster), Struktur bei 512² (Normal/AO). Fugen und Emperador-Rauten
 * wie gehabt, aber mit Mikrodetail und unregelmäßigem Glanz. repeat [8,6] => eine Kachel = 5 m.
 */
export function marbleTexture() {
  return surfaceMaps({
    key: 'marble-v2', repeat: [8, 6], normalStrength: 0.7, aoRadius: 4, aoStrength: 0.55,
    ...buildMarble(),
  });
}

function buildMarble() {
  const S = 2048; const T = S / 4; const N = 512;
  const sim = new Simplex(11);
  const h = new Float32Array(N * N);
  const base = paint(N, N, (u, v, x, y) => {
    const [wx, wy] = sim.warp(u * 3.0, v * 3.0, 0.9, { octaves: 4 });
    const cloud = sim.fbm(wx * 1.6 + 3, wy * 1.6 + 5, { octaves: 5 });
    const t = sim.turbulence(wx * 2.6 + 11, wy * 2.6 + 7, { octaves: 5 });
    const vein = Math.pow(1 - Math.abs(2 * t - 1), 7);
    const ridge = 1 - Math.abs(sim.fbm(wx * 5 + 31, wy * 5 + 17, { octaves: 4 }));
    const vein2 = Math.pow(ridge, 12);
    const crack = 1 - Math.abs(sim.fbm(u * 26 + 60, v * 26 + 90, { octaves: 3 }));
    const micro = Math.pow(crack, 16);
    const warm = 0.98 + cloud * 0.04;
    let r = 236 * warm; let g = 227 * warm; let b = 210 * warm;
    const lighten = cloud * 0.5 + 0.5;
    [r, g, b] = lerp3([r, g, b], [246, 240, 226], lighten * 0.35);
    const vc = Math.min(0.85, 0.8 * vein + 0.5 * vein2);
    [r, g, b] = lerp3([r, g, b], [116, 96, 74], vc);
    [r, g, b] = lerp3([r, g, b], [255, 252, 244], vein2 * 0.35);
    [r, g, b] = lerp3([r, g, b], [118, 100, 80], Math.min(0.4, micro));
    h[y * N + x] = Math.min(1, vein * 0.55 + vein2 * 0.35 + lighten * 0.12 + micro * 0.5);
    return [c255(r), c255(g), c255(b)];
  });

  const { canvas, ctx } = makeCanvas(S, S);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(base, 0, 0, S, S);
  // Plattenkanten/Abdunklung an den Rändern
  for (let ty = 0; ty < 4; ty++) {
    for (let tx = 0; tx < 4; tx++) {
      const x0 = tx * T; const y0 = ty * T;
      const eg = ctx.createLinearGradient(x0, y0, x0, y0 + 12);
      eg.addColorStop(0, 'rgba(60,45,30,0.20)'); eg.addColorStop(1, 'rgba(60,45,30,0)');
      ctx.fillStyle = eg; ctx.fillRect(x0, y0, T, 12);
      const eg2 = ctx.createLinearGradient(x0, y0, x0 + 12, y0);
      eg2.addColorStop(0, 'rgba(60,45,30,0.20)'); eg2.addColorStop(1, 'rgba(60,45,30,0)');
      ctx.fillStyle = eg2; ctx.fillRect(x0, y0, 12, T);
    }
  }
  // Fugen
  ctx.strokeStyle = 'rgba(120,105,80,0.55)'; ctx.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(i * T, 0); ctx.lineTo(i * T, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * T); ctx.lineTo(S, i * T); ctx.stroke();
  }
  // Dunkle Rauten-Intarsien an den Kreuzungen
  for (let ty = 0; ty <= 4; ty++) {
    for (let tx = 0; tx <= 4; tx++) {
      const cx = tx * T; const cy = ty * T; const r = 30;
      const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      g.addColorStop(0, '#4a3226'); g.addColorStop(0.5, '#2e1d15'); g.addColorStop(1, '#4a3226');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(201,162,74,0.7)'; ctx.lineWidth = 2.5; ctx.stroke();
    }
  }
  grain(ctx, S, S, 5);

  // Struktur = Adern + (gedownsampled) Ornamente, damit Fugen als flache Rillen wirken
  const lum = lumField(canvas, N);
  const combined = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) combined[i] = h[i] * 0.6 + lum[i] * 0.5;
  const roughness = roughnessFromAlbedo(canvas, { min: 0.07, max: 0.5, gamma: 0.8 });
  return { color: canvas, roughness, height: { data: combined, w: N, h: N } };
}

// ---------- Teppich ----------
const GOLD = '#c9a24a'; const GOLD_LIGHT = '#e6c86e'; const NAVY = '#1c2b52'; const TEAL = '#2f6b66';

/** Achtblättrige Rosette (Medaillon) mit Ring, Blättern und Mittelstern */
function medallion(ctx, x, y, r) {
  ctx.save(); ctx.translate(x, y);
  ctx.lineWidth = r * 0.03; ctx.strokeStyle = GOLD;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2); ctx.strokeStyle = `rgba(201,162,74,0.5)`; ctx.stroke();
  for (let i = 0; i < 8; i++) {
    ctx.save(); ctx.rotate((i / 8) * Math.PI * 2);
    ctx.fillStyle = NAVY;
    ctx.beginPath(); ctx.moveTo(0, -r * 0.2); ctx.quadraticCurveTo(r * 0.28, -r * 0.5, 0, -r * 0.84); ctx.quadraticCurveTo(-r * 0.28, -r * 0.5, 0, -r * 0.2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = GOLD_LIGHT; ctx.lineWidth = r * 0.025; ctx.stroke();
    ctx.strokeStyle = 'rgba(230,200,110,0.5)'; ctx.lineWidth = r * 0.015;
    ctx.beginPath(); ctx.moveTo(0, -r * 0.25); ctx.lineTo(0, -r * 0.78); ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = GOLD;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5a0f1e';
  ctx.beginPath(); ctx.arc(0, 0, r * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = TEAL;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, r * 0.045, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/** Geschwungene Ranke mit Blättchen zwischen zwei Punkten */
function scroll(ctx, x0, y0, x1, y1, bulge) {
  const mx = (x0 + x1) / 2; const my = (y0 + y1) / 2;
  const nx = -(y1 - y0); const ny = x1 - x0; const len = Math.hypot(nx, ny) || 1;
  const cx = mx + (nx / len) * bulge; const cy = my + (ny / len) * bulge;
  ctx.strokeStyle = 'rgba(201,162,74,0.62)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1); ctx.stroke();
  ctx.fillStyle = 'rgba(47,107,102,0.8)';
  for (let t = 0.2; t < 0.9; t += 0.2) {
    const px = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1;
    const py = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
    const tx = 2 * (1 - t) * (cx - x0) + 2 * t * (x1 - cx); const ty = 2 * (1 - t) * (cy - y0) + 2 * t * (y1 - cy);
    const a = Math.atan2(ty, tx);
    ctx.save(); ctx.translate(px, py); ctx.rotate(a + Math.PI / 2 * (t > 0.5 ? 1 : -1));
    ctx.beginPath(); ctx.ellipse(0, 9, 5, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

/**
 * Wollmikrostruktur (Flor) als Höhenfeld: verwobene fBm-Fasern plus Klumpen und Abnutzung. Wird als
 * Normal-Karte über das Teppichmuster gelegt – die sichtbare Ursache des „textilen" Eindrucks.
 */
function woolField(N, seed, { freq = 46, wear = 0 } = {}) {
  const sim = new Simplex(seed);
  const f = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N; const v = y / N;
      const fiber = sim.fbm(u * freq, v * freq, { octaves: 4 });
      const clump = sim.fbm(u * 11 + 5, v * 11 + 9, { octaves: 3 });
      const wearField = wear ? sim.fbm(u * 5 + 40, v * 5 + 2, { octaves: 3 }) : 0;
      f[y * N + x] = 0.5 + fiber * 0.32 + clump * 0.22 - Math.max(0, wearField) * wear;
    }
  }
  return f;
}

/**
 * Casino-Teppich (Inseln unter den Spieltischen): dunkles Bordeaux, goldene Medaillons mit Navy-Blättern,
 * Ranken, kleine Rosetten – Kachel = 2 m. Liefert { map, normal, aoMap }.
 */
export function carpetTexture() {
  return surfaceMaps({
    key: 'carpet-v2', repeat: [1, 1], normalStrength: 1.15, aoRadius: 3, aoStrength: 0.7,
    ...buildCarpet(),
  });
}

function buildCarpet() {
  const S = 1024;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.fillStyle = '#4a0f1f'; ctx.fillRect(0, 0, S, S);
  mottle(ctx, S, S, { count: 70, radius: 170, alpha: 0.09, colors: ['#7a1a30', '#2a0810', '#5a1526'] });
  // feines Rautengitter aus Punkten (Webstruktur)
  ctx.fillStyle = 'rgba(201,162,74,0.13)';
  for (let y = 0; y < S; y += 32) for (let x = (y / 32) % 2 ? 16 : 0; x < S; x += 32) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill(); }
  const pts = [[0, 0], [S, 0], [0, S], [S, S]];
  for (const [px, py] of pts) {
    scroll(ctx, px + (px ? -150 : 150), py + (py ? -60 : 60), S / 2 - (px ? -60 : 60), S / 2 - (py ? -150 : 150), (px === py) ? 70 : -70);
  }
  const rosette = (x, y, r) => {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = GOLD;
    for (let i = 0; i < 6; i++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.ellipse(0, r * 0.55, r * 0.28, r * 0.5, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = NAVY; ctx.beginPath(); ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };
  rosette(S / 2, 0, 46); rosette(S / 2, S, 46); rosette(0, S / 2, 46); rosette(S, S / 2, 46);
  medallion(ctx, S / 2, S / 2, 150);
  for (const [px, py] of pts) medallion(ctx, px, py, 110);
  grain(ctx, S, S, 20);

  const N = 256;
  const height = woolField(N, 71, { freq: 46 });
  // Abnutzung an den Rändern/Diagonalen leicht erhöhen
  const hh = height;
  for (let i = 0; i < hh.length; i++) hh[i] = Math.max(0, Math.min(1.4, hh[i]));
  return { color: canvas, height: { data: hh, w: N, h: N } };
}

/**
 * Roter Läufer mit Bordüre: Feld mit Rosetten und Rautenpunkten, an den Längsseiten Goldband,
 * Navy-Bordüre mit Lorbeer-Ornament. Textur ist 1 Kachel breit (= Läuferbreite) und 2 m lang.
 */
export function runnerTexture(widthMeters) {
  const maps = surfaceMaps({
    key: `runner-v2:${widthMeters}`, repeat: [1, 1], normalStrength: 1.1, aoRadius: 3, aoStrength: 0.65,
    ...buildRunner(widthMeters),
  });
  // Läufer läuft nur in x einmal (Clamp), damit die Bordüre an den Längsseiten sauber bleibt
  maps.map.wrapS = THREE.ClampToEdgeWrapping;
  return maps;
}

function buildRunner(widthMeters) {
  const S = 1024;
  const { canvas, ctx } = makeCanvas(S, S);
  const px = (m) => (m / widthMeters) * S;
  ctx.fillStyle = '#8e1a27'; ctx.fillRect(0, 0, S, S);
  mottle(ctx, S, S, { count: 80, radius: 150, alpha: 0.11, colors: ['#b3273a', '#5a0e18', '#a01f30'] });
  ctx.fillStyle = 'rgba(230,200,110,0.18)';
  for (let y = 0; y < S; y += 28) for (let x = (y / 28) % 2 ? 14 : 0; x < S; x += 28) { ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill(); }
  const rosette = (x, y, r) => {
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(230,200,110,0.72)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(230,200,110,0.78)';
    for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.ellipse(0, r * 0.55, r * 0.2, r * 0.4, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = NAVY; ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };
  const rr = Math.min(px(0.28), 110);
  rosette(S / 2, 0, rr); rosette(S / 2, S / 2, rr); rosette(S / 2, S, rr);
  if (widthMeters >= 4) { for (const y of [S / 4, (3 * S) / 4]) { rosette(S / 2 - px(1.1), y, rr * 0.7); rosette(S / 2 + px(1.1), y, rr * 0.7); } }
  const bw = px(Math.min(0.32, widthMeters * 0.09));
  const drawBorder = (flip) => {
    ctx.save();
    if (flip) { ctx.translate(S, 0); ctx.scale(-1, 1); }
    ctx.fillStyle = GOLD; ctx.fillRect(0, 0, bw * 0.16, S);
    ctx.fillStyle = NAVY; ctx.fillRect(bw * 0.16, 0, bw * 0.68, S);
    ctx.fillStyle = GOLD; ctx.fillRect(bw * 0.84, 0, bw * 0.08, S);
    ctx.fillStyle = 'rgba(230,200,110,0.82)';
    const cx = bw * 0.5; const leafStep = 40;
    for (let y = 0; y < S; y += leafStep) {
      for (const s of [-1, 1]) {
        ctx.save(); ctx.translate(cx, y + leafStep / 2); ctx.rotate(s * 0.7);
        ctx.beginPath(); ctx.ellipse(0, -bw * 0.16, bw * 0.06, bw * 0.17, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    ctx.strokeStyle = 'rgba(230,200,110,0.82)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, S); ctx.stroke();
    ctx.restore();
  };
  drawBorder(false); drawBorder(true);
  // Abnutzung: hellere Laufspur in der Mitte
  const wear = ctx.createLinearGradient(0, 0, S, 0);
  wear.addColorStop(0, 'rgba(0,0,0,0)'); wear.addColorStop(0.5, 'rgba(255,220,190,0.06)'); wear.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = wear; ctx.fillRect(0, 0, S, S);
  grain(ctx, S, S, 18);

  const N = 256;
  const height = woolField(N, 73 + Math.round(widthMeters * 10), { freq: 44, wear: 0.25 });
  return { color: canvas, height: { data: height, w: N, h: N } };
}

// ---------- Wände & Decke ----------
/** Creme-Stuckwand: Putz-fBm mit Alterung, Wandfelder mit Goldleisten, Holzsockel. */
export function wallTexture() {
  const maps = surfaceMaps({
    key: 'wall-v2', repeat: [10, 1], normalStrength: 0.6, aoRadius: 4, aoStrength: 0.6,
    ...buildWall(),
  });
  maps.map.userData.maps = maps;
  return maps.map;
}

function buildWall() {
  const S = 1024; const N = 256;
  const sim = new Simplex(23);
  const { canvas, ctx } = makeCanvas(S, S);
  // Putzgrund: heller Verlauf + Rauschflecken
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, '#ebdfc7'); g.addColorStop(0.72, '#dccba8'); g.addColorStop(1, '#d2bf99');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  mottle(ctx, S, S, { count: 36, radius: 260, alpha: 0.06, colors: ['#ffffff', '#b9a680'] });
  // Putzstruktur per Pixel (fBm-Körnigkeit)
  const plaster = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N; const v = y / N;
    plaster[y * N + x] = 0.5 + 0.5 * sim.fbm(u * 22, v * 22, { octaves: 4 }) + 0.25 * sim.fbm(u * 60 + 3, v * 60 + 1, { octaves: 3 });
  }
  ctx.globalAlpha = 0.10;
  ctx.drawImage(fieldToGrayCanvas(plaster, N, N, { lo: 0.2, hi: 1.0 }), 0, 0, S, S);
  ctx.globalAlpha = 1;
  // Damast (sehr dezent)
  ctx.strokeStyle = 'rgba(150,120,70,0.09)'; ctx.lineWidth = 2;
  for (let y = 0; y < 720; y += 64) for (let x = 0; x < S; x += 64) {
    ctx.beginPath(); ctx.moveTo(x + 32, y); ctx.quadraticCurveTo(x + 64, y + 32, x + 32, y + 64); ctx.quadraticCurveTo(x, y + 32, x + 32, y); ctx.stroke();
  }
  for (let x = 0; x < S; x += 512) {
    ctx.strokeStyle = 'rgba(201,162,74,0.88)'; ctx.lineWidth = 8; ctx.strokeRect(x + 56, 80, 400, 560);
    ctx.strokeStyle = 'rgba(120,90,40,0.28)'; ctx.lineWidth = 3; ctx.strokeRect(x + 82, 106, 348, 508);
    ctx.fillStyle = 'rgba(201,162,74,0.85)';
    for (const [ox, oy] of [[x + 56, 80], [x + 456, 80], [x + 56, 640], [x + 456, 640]]) { ctx.beginPath(); ctx.arc(ox, oy, 12, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.fillStyle = '#c9a24a'; ctx.fillRect(0, 690, S, 8);
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, 698, S, 4);
  // Holzsockel mit Kassetten
  const wg = ctx.createLinearGradient(0, 740, 0, S);
  wg.addColorStop(0, '#5b3a1d'); wg.addColorStop(0.5, '#47290f'); wg.addColorStop(1, '#2e1a08');
  ctx.fillStyle = wg; ctx.fillRect(0, 740, S, S - 740);
  for (let i = 0; i < 70; i++) { ctx.strokeStyle = `rgba(0,0,0,${0.06 + Math.random() * 0.1})`; ctx.lineWidth = 1 + Math.random() * 2; ctx.beginPath(); ctx.moveTo(0, 740 + Math.random() * 284); ctx.lineTo(S, 740 + Math.random() * 284); ctx.stroke(); }
  for (let x = 0; x < S; x += 256) { ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 4; ctx.strokeRect(x + 24, 780, 208, 190); ctx.strokeStyle = 'rgba(255,220,160,0.18)'; ctx.lineWidth = 2; ctx.strokeRect(x + 30, 786, 196, 178); }
  ctx.fillStyle = '#c9a24a'; ctx.fillRect(0, 732, S, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0, 732, S, 2);
  ctx.fillStyle = '#1d1208'; ctx.fillRect(0, S - 14, S, 14);
  grain(ctx, S, S, 7);

  const lum = lumField(canvas, N);
  const combined = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) combined[i] = plaster[i] * 0.7 + lum[i] * 0.5;
  const roughness = roughnessFromAlbedo(canvas, { min: 0.62, max: 0.92, gamma: 0.6 });
  return { color: canvas, roughness, height: { data: combined, w: N, h: N } };
}

/** Helle Kassettendecke mit Goldrahmen, Rosette und Stuckprofil je Feld. */
export function ceilingTexture() {
  const maps = surfaceMaps({
    key: 'ceiling-v2', repeat: [10, 7.5], normalStrength: 0.55, aoRadius: 4, aoStrength: 0.6,
    ...buildCeiling(),
  });
  maps.map.userData.maps = maps;
  return maps.map;
}

function buildCeiling() {
  const S = 1024; const N = 256;
  const sim = new Simplex(31);
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.fillStyle = '#efe4cf'; ctx.fillRect(0, 0, S, S);
  const plaster = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N; const v = y / N;
    plaster[y * N + x] = 0.5 + 0.5 * sim.fbm(u * 18 + 7, v * 18 + 2, { octaves: 4 });
  }
  ctx.globalAlpha = 0.12;
  ctx.drawImage(fieldToGrayCanvas(plaster, N, N, { lo: 0.15, hi: 1.0 }), 0, 0, S, S);
  ctx.globalAlpha = 1;
  for (let cy = 0; cy < S; cy += 512) {
    for (let cx = 0; cx < S; cx += 512) {
      const g = ctx.createRadialGradient(cx + 256, cy + 256, 40, cx + 256, cy + 256, 300);
      g.addColorStop(0, '#f8efdc'); g.addColorStop(1, '#d8c8a6');
      ctx.fillStyle = g; ctx.fillRect(cx + 28, cy + 28, 456, 456);
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 10; ctx.strokeRect(cx + 28, cy + 28, 456, 456);
      ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 10; ctx.strokeRect(cx + 40, cy + 40, 432, 432);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.strokeRect(cx + 47, cy + 47, 418, 418);
      ctx.strokeStyle = 'rgba(201,162,74,0.55)'; ctx.lineWidth = 3; ctx.strokeRect(cx + 70, cy + 70, 372, 372);
      ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 4;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        ctx.beginPath(); ctx.ellipse(cx + 256 + Math.cos(a) * 70, cy + 256 + Math.sin(a) * 70, 50, 16, a, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = '#c9a24a'; ctx.beginPath(); ctx.arc(cx + 256, cy + 256, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#efe4cf'; ctx.beginPath(); ctx.arc(cx + 256, cy + 256, 10, 0, Math.PI * 2); ctx.fill();
    }
  }
  grain(ctx, S, S, 5);
  const lum = lumField(canvas, N);
  const combined = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) combined[i] = plaster[i] * 0.6 + lum[i] * 0.55;
  const roughness = roughnessFromAlbedo(canvas, { min: 0.7, max: 0.95, gamma: 0.6 });
  return { color: canvas, roughness, height: { data: combined, w: N, h: N } };
}

/** Neon-Schriftzug mit Glühen (transparent) */
export function neonTexture(text, color, sub = null) {
  const { canvas, ctx } = makeCanvas(1024, 256);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '900 130px Cinzel, Georgia, serif';
  ctx.shadowColor = color; ctx.shadowBlur = 40;
  ctx.fillStyle = color;
  ctx.fillText(text, 512, sub ? 100 : 128);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.strokeText(text, 512, sub ? 100 : 128);
  if (sub) { ctx.font = '700 56px Inter, Arial'; ctx.shadowBlur = 20; ctx.fillText(sub, 512, 200); }
  return textureFromCanvas(canvas, { srgb: true });
}

/** Gebürstetes Metall (Chrom/Edelstahl) als Rauheits- und Normal-Struktur (fBm-Fasern) */
export function brushedNormal() {
  const N = 256;
  const sim = new Simplex(41);
  const height = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N; const v = y / N;
    // langgezogene Fasern: x stark gestreckt, y fein
    const fiber = sim.fbm(u * 6, v * 160, { octaves: 3 });
    const streaks = sim.fbm(u * 3 + 2, v * 420 + 5, { octaves: 2 });
    height[y * N + x] = 0.5 + fiber * 0.3 + streaks * 0.12;
  }
  const tex = normalTexture(height, N, N, { strength: 0.45, repeat: [4, 4] });
  tex.userData.keep = true;
  return tex;
}

/** Leder mit Narbung (Normal-Map) aus Zellklumpen und Falten (fBm) */
export function leatherNormal() {
  const N = 256;
  const sim = new Simplex(53);
  const height = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N; const v = y / N;
    const grain = sim.fbm(u * 90, v * 90, { octaves: 4 });
    const cells = sim.fbm(u * 26 + 4, v * 26 + 8, { octaves: 3 });
    const folds = sim.fbm(u * 9 + 1, v * 9 + 6, { octaves: 3 });
    height[y * N + x] = 0.5 + grain * 0.22 + Math.abs(cells) * 0.35 + folds * 0.15;
  }
  const tex = normalTexture(height, N, N, { strength: 1.4, repeat: [6, 6] });
  tex.userData.keep = true;
  return tex;
}

export { roundRect };