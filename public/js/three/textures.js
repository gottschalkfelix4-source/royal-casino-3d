import * as THREE from 'three';
import { makeCanvas, canvasTexture, normalMapFromCanvas, roundRect } from './assets.js';

/**
 * Prozedurale Oberflächen der Halle: Marmor, Teppich, Läufer, Wände, Decke.
 * Alle Texturen werden einmal erzeugt und gecacht (kein Neuaufbau bei Spielwechsel).
 */

const cache = new Map();
const once = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };

/** Körnung: per-Pixel-Rauschen auf den ganzen Canvas (Luminanz ±amount) */
function grain(ctx, w, h, amount) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/** Weiche, großflächige Fleckigkeit (z. B. abgetretener Teppich, Marmorwolken) */
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

/** Feines Flor-Rauschen für die Normal-Map von Teppichen (unabhängig vom Muster) */
function pileNormal(strength = 1.0, repeat = [1, 1]) {
  return once(`pile:${strength}:${repeat}`, () => {
    const S = 256;
    const { canvas, ctx } = makeCanvas(S, S);
    const img = ctx.createImageData(S, S);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 60;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // leicht weichzeichnen: Flor ist nicht pixelscharf
    ctx.globalAlpha = 0.5; ctx.drawImage(canvas, 1, 0); ctx.drawImage(canvas, 0, 1); ctx.globalAlpha = 1;
    return normalMapFromCanvas(canvas, { strength, repeat });
  });
}

// ---------- Marmor ----------
/**
 * Cremefarbener Marmor: 4×4 Platten je 1,25 m auf 5 m Kachel, Adern in mehreren Lagen, feine Fugen,
 * dunkle Emperador-Rauten an den Plattenkreuzungen. repeat so wählen, dass eine Kachel 5 m entspricht.
 */
export function marbleTexture() {
  return once('marble', () => {
    const S = 2048; const T = S / 4;
    const { canvas, ctx } = makeCanvas(S, S);
    for (let ty = 0; ty < 4; ty++) {
      for (let tx = 0; tx < 4; tx++) {
        const x0 = tx * T; const y0 = ty * T;
        const warm = 0.96 + Math.random() * 0.06;
        const base = `rgb(${Math.round(238 * warm)},${Math.round(229 * warm)},${Math.round(212 * warm)})`;
        ctx.fillStyle = base; ctx.fillRect(x0, y0, T, T);
        ctx.save();
        ctx.beginPath(); ctx.rect(x0, y0, T, T); ctx.clip();
        // Wolken
        mottle(ctx, T, T, { count: 14, radius: 220, alpha: 0.12, colors: ['#ffffff', '#cdbfa5', '#d8ccb4'] });
        ctx.translate(x0, y0);
        mottle(ctx, T, T, { count: 10, radius: 200, alpha: 0.1, colors: ['#ffffff', '#c9b995'] });
        // Adern: mehrere Lagen, große schwache und feine dunkle
        const vein = (n, width, alpha, len) => {
          for (let i = 0; i < n; i++) {
            ctx.strokeStyle = `rgba(${105 + Math.random() * 40},${85 + Math.random() * 30},${60 + Math.random() * 25},${alpha * (0.6 + Math.random() * 0.6)})`;
            ctx.lineWidth = width * (0.5 + Math.random());
            ctx.lineCap = 'round';
            ctx.beginPath();
            let x = Math.random() * T; let y = Math.random() * T;
            const dir = Math.random() * Math.PI * 2;
            ctx.moveTo(x, y);
            for (let k = 0; k < 7; k++) {
              const a = dir + (Math.random() - 0.5) * 1.2;
              const nx = x + Math.cos(a) * len * (0.5 + Math.random()); const ny = y + Math.sin(a) * len * (0.5 + Math.random());
              ctx.quadraticCurveTo(x + (Math.random() - 0.5) * len, y + (Math.random() - 0.5) * len, nx, ny);
              x = nx; y = ny;
            }
            ctx.stroke();
          }
        };
        vein(5, 9, 0.08, 120);
        vein(9, 3, 0.16, 90);
        vein(14, 1.2, 0.28, 60);
        // helle Kristalladern
        ctx.globalCompositeOperation = 'lighter';
        vein(6, 1.5, 0.05, 80);
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
        // Plattenkante: leichte Abdunklung außen, Fuge
        const eg = ctx.createLinearGradient(x0, y0, x0, y0 + 10);
        eg.addColorStop(0, 'rgba(60,45,30,0.22)'); eg.addColorStop(1, 'rgba(60,45,30,0)');
        ctx.fillStyle = eg; ctx.fillRect(x0, y0, T, 10);
        const eg2 = ctx.createLinearGradient(x0, y0, x0 + 10, y0);
        eg2.addColorStop(0, 'rgba(60,45,30,0.22)'); eg2.addColorStop(1, 'rgba(60,45,30,0)');
        ctx.fillStyle = eg2; ctx.fillRect(x0, y0, 10, T);
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
    grain(ctx, S, S, 6);
    // Rand-Wiederholung: die Rauten am Rand liegen genau auf der Kachelgrenze (0 und S) – wrap sorgt für Nahtlosigkeit
    const map = canvasTexture(canvas, { repeat: [8, 6], anisotropy: 16 });
    // Rauheit: Adern und Intarsien etwas matter als die polierte Fläche
    const { canvas: rc, ctx: rctx } = makeCanvas(512, 512);
    rctx.drawImage(canvas, 0, 0, 512, 512);
    const img = rctx.getImageData(0, 0, 512, 512);
    for (let i = 0; i < img.data.length; i += 4) {
      const l = (img.data[i] * 0.299 + img.data[i + 1] * 0.587 + img.data[i + 2] * 0.114) / 255;
      const v = Math.round(255 * (0.1 + (1 - l) * 0.35));
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    }
    rctx.putImageData(img, 0, 0);
    const roughnessMap = new THREE.CanvasTexture(rc);
    roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping; roughnessMap.repeat.set(8, 6);
    return { map, roughnessMap };
  });
}

// ---------- Teppich ----------
const GOLD = '#c9a24a'; const GOLD_LIGHT = '#e6c86e'; const NAVY = '#1c2b52'; const TEAL = '#2f6b66';

/** Achtblättrige Rosette (Medaillon) mit Ring, Blättern und Mittelstern */
function medallion(ctx, x, y, r) {
  ctx.save(); ctx.translate(x, y);
  ctx.lineWidth = r * 0.03; ctx.strokeStyle = GOLD;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2); ctx.strokeStyle = `rgba(201,162,74,0.55)`; ctx.stroke();
  for (let i = 0; i < 8; i++) {
    ctx.save(); ctx.rotate((i / 8) * Math.PI * 2);
    ctx.fillStyle = NAVY;
    ctx.beginPath(); ctx.moveTo(0, -r * 0.2); ctx.quadraticCurveTo(r * 0.28, -r * 0.5, 0, -r * 0.84); ctx.quadraticCurveTo(-r * 0.28, -r * 0.5, 0, -r * 0.2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = GOLD_LIGHT; ctx.lineWidth = r * 0.025; ctx.stroke();
    ctx.strokeStyle = 'rgba(230,200,110,0.6)'; ctx.lineWidth = r * 0.015;
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
  ctx.strokeStyle = 'rgba(201,162,74,0.75)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1); ctx.stroke();
  ctx.fillStyle = 'rgba(47,107,102,0.9)';
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
 * Casino-Teppich (Inseln unter den Spieltischen): dunkles Bordeaux, goldene Medaillons mit Navy-Blättern,
 * Ranken, kleine Rosetten – Kachel = 2 m. Liefert { map, normal }.
 */
export function carpetTexture() {
  return once('carpet', () => {
    const S = 1024;
    const { canvas, ctx } = makeCanvas(S, S);
    ctx.fillStyle = '#4a0f1f'; ctx.fillRect(0, 0, S, S);
    mottle(ctx, S, S, { count: 90, radius: 160, alpha: 0.1, colors: ['#7a1a30', '#2a0810', '#5a1526'] });
    // feines Rautengitter aus Punkten (Webstruktur)
    ctx.fillStyle = 'rgba(201,162,74,0.16)';
    for (let y = 0; y < S; y += 32) for (let x = (y / 32) % 2 ? 16 : 0; x < S; x += 32) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill(); }
    // Ranken als Raute zwischen den Medaillons
    const pts = [[0, 0], [S, 0], [0, S], [S, S]];
    for (const [px, py] of pts) {
      scroll(ctx, px + (px ? -150 : 150), py + (py ? -60 : 60), S / 2 - (px ? -60 : 60), S / 2 - (py ? -150 : 150), (px === py) ? 70 : -70);
    }
    // kleine Rosetten in den Rautenmitten
    const rosette = (x, y, r) => {
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = GOLD;
      for (let i = 0; i < 6; i++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.ellipse(0, r * 0.55, r * 0.28, r * 0.5, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = NAVY; ctx.beginPath(); ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
    rosette(S / 2, 0, 46); rosette(S / 2, S, 46); rosette(0, S / 2, 46); rosette(S, S / 2, 46);
    // Medaillons: Mitte + Viertel an den Ecken (nahtlos kachelbar)
    medallion(ctx, S / 2, S / 2, 150);
    for (const [px, py] of pts) medallion(ctx, px, py, 110);
    grain(ctx, S, S, 22);
    const map = canvasTexture(canvas, { repeat: [1, 1], anisotropy: 16 });
    return { map, normal: pileNormal(1.1, [1, 1]) };
  });
}

/**
 * Roter Läufer mit Bordüre: Feld mit Rosetten und Rautenpunkten, an den Längsseiten Goldband,
 * Navy-Bordüre mit Lorbeer-Ornament. Textur ist 1 Kachel breit (= Läuferbreite) und 2 m lang.
 */
export function runnerTexture(widthMeters) {
  return once(`runner:${widthMeters}`, () => {
    const S = 1024; // 1024 px = widthMeters (x) bzw. 2 m (y)
    const { canvas, ctx } = makeCanvas(S, S);
    const px = (m) => (m / widthMeters) * S;
    ctx.fillStyle = '#8e1a27'; ctx.fillRect(0, 0, S, S);
    mottle(ctx, S, S, { count: 90, radius: 140, alpha: 0.12, colors: ['#b3273a', '#5a0e18', '#a01f30'] });
    // Feld: Rautengitter aus Punkten
    ctx.fillStyle = 'rgba(230,200,110,0.22)';
    for (let y = 0; y < S; y += 28) for (let x = (y / 28) % 2 ? 14 : 0; x < S; x += 28) { ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill(); }
    // Rosetten auf der Mittellinie (alle 1 m) und versetzt seitlich, sofern der Läufer breit genug ist
    const rosette = (x, y, r) => {
      ctx.save(); ctx.translate(x, y);
      ctx.strokeStyle = 'rgba(230,200,110,0.8)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(230,200,110,0.85)';
      for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.ellipse(0, r * 0.55, r * 0.2, r * 0.4, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = NAVY; ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
    const rr = Math.min(px(0.28), 110);
    rosette(S / 2, 0, rr); rosette(S / 2, S / 2, rr); rosette(S / 2, S, rr);
    if (widthMeters >= 4) { for (const y of [S / 4, (3 * S) / 4]) { rosette(S / 2 - px(1.1), y, rr * 0.7); rosette(S / 2 + px(1.1), y, rr * 0.7); } }
    // Bordüre beidseitig
    const bw = px(Math.min(0.32, widthMeters * 0.09));
    const drawBorder = (flip) => {
      ctx.save();
      if (flip) { ctx.translate(S, 0); ctx.scale(-1, 1); }
      ctx.fillStyle = GOLD; ctx.fillRect(0, 0, bw * 0.16, S);
      ctx.fillStyle = NAVY; ctx.fillRect(bw * 0.16, 0, bw * 0.68, S);
      ctx.fillStyle = GOLD; ctx.fillRect(bw * 0.84, 0, bw * 0.08, S);
      // Lorbeerblätter in der Navy-Bahn
      ctx.fillStyle = 'rgba(230,200,110,0.9)';
      const cx = bw * 0.5; const leafStep = 40;
      for (let y = 0; y < S; y += leafStep) {
        for (const s of [-1, 1]) {
          ctx.save(); ctx.translate(cx, y + leafStep / 2); ctx.rotate(s * 0.7);
          ctx.beginPath(); ctx.ellipse(0, -bw * 0.16, bw * 0.06, bw * 0.17, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      }
      ctx.strokeStyle = 'rgba(230,200,110,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, S); ctx.stroke();
      ctx.restore();
    };
    drawBorder(false); drawBorder(true);
    grain(ctx, S, S, 20);
    const map = canvasTexture(canvas, { repeat: [1, 1], anisotropy: 16 });
    map.wrapS = THREE.ClampToEdgeWrapping;
    return { map, normal: pileNormal(1.1, [1, 1]) };
  });
}

// ---------- Wände & Decke ----------
/** Creme-Stuckwand: Wandfelder mit Goldleisten und dezentem Damast, Holzsockel mit Profil */
export function wallTexture() {
  return once('wall', () => {
    const S = 1024;
    const { canvas, ctx } = makeCanvas(S, S);
    const g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, '#ebdfc7'); g.addColorStop(0.72, '#dccba8'); g.addColorStop(1, '#d2bf99');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    mottle(ctx, S, S, { count: 40, radius: 260, alpha: 0.06, colors: ['#ffffff', '#b9a680'] });
    // Damast (sehr dezent) im oberen Bereich
    ctx.strokeStyle = 'rgba(150,120,70,0.10)'; ctx.lineWidth = 2;
    for (let y = 0; y < 720; y += 64) for (let x = 0; x < S; x += 64) {
      ctx.beginPath(); ctx.moveTo(x + 32, y); ctx.quadraticCurveTo(x + 64, y + 32, x + 32, y + 64); ctx.quadraticCurveTo(x, y + 32, x + 32, y); ctx.stroke();
    }
    // Wandfelder
    for (let x = 0; x < S; x += 512) {
      ctx.strokeStyle = 'rgba(201,162,74,0.9)'; ctx.lineWidth = 8; ctx.strokeRect(x + 56, 80, 400, 560);
      ctx.strokeStyle = 'rgba(120,90,40,0.28)'; ctx.lineWidth = 3; ctx.strokeRect(x + 82, 106, 348, 508);
      // Eckornamente
      ctx.fillStyle = 'rgba(201,162,74,0.85)';
      for (const [ox, oy] of [[x + 56, 80], [x + 456, 80], [x + 56, 640], [x + 456, 640]]) { ctx.beginPath(); ctx.arc(ox, oy, 12, 0, Math.PI * 2); ctx.fill(); }
    }
    // Stuhlleiste
    ctx.fillStyle = '#c9a24a'; ctx.fillRect(0, 690, S, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, 698, S, 4);
    // Holzsockel mit Kassetten und Profil
    const wg = ctx.createLinearGradient(0, 740, 0, S);
    wg.addColorStop(0, '#5b3a1d'); wg.addColorStop(0.5, '#47290f'); wg.addColorStop(1, '#2e1a08');
    ctx.fillStyle = wg; ctx.fillRect(0, 740, S, S - 740);
    for (let i = 0; i < 70; i++) { ctx.strokeStyle = `rgba(0,0,0,${0.06 + Math.random() * 0.1})`; ctx.lineWidth = 1 + Math.random() * 2; ctx.beginPath(); ctx.moveTo(0, 740 + Math.random() * 284); ctx.lineTo(S, 740 + Math.random() * 284); ctx.stroke(); }
    for (let x = 0; x < S; x += 256) { ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 4; ctx.strokeRect(x + 24, 780, 208, 190); ctx.strokeStyle = 'rgba(255,220,160,0.18)'; ctx.lineWidth = 2; ctx.strokeRect(x + 30, 786, 196, 178); }
    ctx.fillStyle = '#c9a24a'; ctx.fillRect(0, 732, S, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0, 732, S, 2);
    ctx.fillStyle = '#1d1208'; ctx.fillRect(0, S - 14, S, 14);
    grain(ctx, S, S, 8);
    return canvasTexture(canvas, { repeat: [10, 1], anisotropy: 8 });
  });
}

/** Helle Kassettendecke mit Goldrahmen, Rosette und Stuckprofil je Feld */
export function ceilingTexture() {
  return once('ceiling', () => {
    const S = 1024;
    const { canvas, ctx } = makeCanvas(S, S);
    ctx.fillStyle = '#efe4cf'; ctx.fillRect(0, 0, S, S);
    for (let cy = 0; cy < S; cy += 512) {
      for (let cx = 0; cx < S; cx += 512) {
        const g = ctx.createRadialGradient(cx + 256, cy + 256, 40, cx + 256, cy + 256, 300);
        g.addColorStop(0, '#f8efdc'); g.addColorStop(1, '#d8c8a6');
        ctx.fillStyle = g; ctx.fillRect(cx + 28, cy + 28, 456, 456);
        // Stuckprofil (mehrere Stufen)
        ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 10; ctx.strokeRect(cx + 28, cy + 28, 456, 456);
        ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 10; ctx.strokeRect(cx + 40, cy + 40, 432, 432);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.strokeRect(cx + 47, cy + 47, 418, 418);
        ctx.strokeStyle = 'rgba(201,162,74,0.55)'; ctx.lineWidth = 3; ctx.strokeRect(cx + 70, cy + 70, 372, 372);
        // Rosette
        ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 4;
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          ctx.beginPath(); ctx.ellipse(cx + 256 + Math.cos(a) * 70, cy + 256 + Math.sin(a) * 70, 50, 16, a, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = '#c9a24a'; ctx.beginPath(); ctx.arc(cx + 256, cy + 256, 22, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#efe4cf'; ctx.beginPath(); ctx.arc(cx + 256, cy + 256, 10, 0, Math.PI * 2); ctx.fill();
      }
    }
    grain(ctx, S, S, 6);
    return canvasTexture(canvas, { repeat: [10, 7.5], anisotropy: 16 });
  });
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
  return canvasTexture(canvas);
}

/** Gebürstetes Metall (Chrom/Edelstahl) als Rauheits- und Normal-Struktur */
export function brushedNormal() {
  return once('brushed', () => {
    const S = 256;
    const { canvas, ctx } = makeCanvas(S, S);
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) {
      ctx.strokeStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${0.05 + Math.random() * 0.08})`;
      ctx.lineWidth = 1;
      const y = Math.random() * S;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y + (Math.random() - 0.5) * 2); ctx.stroke();
    }
    return normalMapFromCanvas(canvas, { strength: 0.5, repeat: [4, 4] });
  });
}

/** Leder mit Narbung (Normal-Map) */
export function leatherNormal() {
  return once('leather', () => {
    const S = 256;
    const { canvas, ctx } = makeCanvas(S, S);
    ctx.fillStyle = '#7f7f7f'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * S; const y = Math.random() * S; const r = 2 + Math.random() * 4;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${Math.random() > 0.5 ? 200 : 60},${Math.random() > 0.5 ? 200 : 60},${Math.random() > 0.5 ? 200 : 60},0.35)`); g.addColorStop(1, 'rgba(128,128,128,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    return normalMapFromCanvas(canvas, { strength: 1.4, repeat: [6, 6] });
  });
}

export { roundRect };
