/**
 * Prozedurales Rauschen für Texturen: 2D-Simplex-Noise (deterministisch per Seed), fBm, Domain-Warping,
 * Worley-/Zellrauschen und Helfer, um Höhenfelder in Canvas-Bilddaten zu schreiben.
 * Alle Funktionen sind reine Rechenfunktionen ohne Three.js-Abhängigkeit.
 */

/** Kleiner deterministischer Zufallsgenerator (mulberry32) */
export function rng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRAD = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

/** Simplex-Noise-Instanz mit eigener Permutationstabelle */
export class Simplex {
  constructor(seed = 1) {
    const rand = rng(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  /** Wert in [-1, 1] */
  noise(x, y) {
    const perm = this.perm;
    const s = (x + y) * F2;
    const i = Math.floor(x + s); const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t); const y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0; const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2; const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2; const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255; const jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = GRAD[perm[ii + perm[jj]] & 7]; t0 *= t0; n += t0 * t0 * (g[0] * x0 + g[1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = GRAD[perm[ii + i1 + perm[jj + j1]] & 7]; t1 *= t1; n += t1 * t1 * (g[0] * x1 + g[1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = GRAD[perm[ii + 1 + perm[jj + 1]] & 7]; t2 *= t2; n += t2 * t2 * (g[0] * x2 + g[1] * y2); }
    return 70 * n;
  }

  /** Fraktales Rauschen (fBm) in [-1, 1] */
  fbm(x, y, { octaves = 5, lacunarity = 2.0, gain = 0.5 } = {}) {
    let amp = 1; let freq = 1; let sum = 0; let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise(x * freq, y * freq);
      norm += amp;
      amp *= gain; freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Betragsrauschen („Turbulenz“) in [0, 1] – gut für Adern und Wolken */
  turbulence(x, y, { octaves = 5, lacunarity = 2.0, gain = 0.5 } = {}) {
    let amp = 1; let freq = 1; let sum = 0; let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * Math.abs(this.noise(x * freq, y * freq));
      norm += amp;
      amp *= gain; freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Domain-Warping: Koordinaten mit fBm verschieben (Marmorwolken, Holzverzerrung) */
  warp(x, y, strength = 1, opts = {}) {
    const qx = this.fbm(x + 5.2, y + 1.3, opts);
    const qy = this.fbm(x + 1.7, y + 9.2, opts);
    return [x + strength * qx, y + strength * qy];
  }
}

/**
 * Worley-/Zellrauschen (kachelbar auf einem Gitter von `cells` Zellen je Achse). Liefert Abstand zum nächsten
 * (f1) und zweitnächsten (f2) Zellpunkt, normiert auf die Zellgröße.
 */
export function worley(x, y, cells, seed = 7) {
  const rand = rng(seed);
  const pts = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([i + rand(), j + rand()]);
  const px = x * cells; const py = y * cells;
  const ci = Math.floor(px); const cj = Math.floor(py);
  let f1 = 9; let f2 = 9;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const i = ((ci + di) % cells + cells) % cells; const j = ((cj + dj) % cells + cells) % cells;
      const p = pts[j * cells + i];
      // Zellpunkt in den Nachbarraum verschieben (kachelbar)
      const dx = p[0] + (ci + di - i) - px; const dy = p[1] + (cj + dj - j) - py;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
  }
  return { f1, f2 };
}

/** Kachelbare Version: Rauschen an den Rändern über Kreuzblenden verbinden */
export function tileable(fn, x, y, size) {
  const u = x / size; const v = y / size;
  const a = fn(x, y); const b = fn(x - size, y); const c = fn(x, y - size); const d = fn(x - size, y - size);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/**
 * Höhenfeld (Float32Array, Werte beliebig) über eine Canvas-Fläche berechnen.
 * fn(u, v) mit u, v in [0, 1). Rückgabe: { data, min, max }.
 */
export function heightField(w, h, fn) {
  const data = new Float32Array(w * h);
  let min = Infinity; let max = -Infinity;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = fn(x / w, y / h);
      data[y * w + x] = v;
      if (v < min) min = v; if (v > max) max = v;
    }
  }
  return { data, min, max };
}

/** Höhenfeld als Graustufen in einen Canvas schreiben (normiert auf [lo, hi] -> 0..255) */
export function heightToCanvas(ctx, w, h, field, { lo = null, hi = null } = {}) {
  const img = ctx.createImageData(w, h);
  const min = lo ?? field.min; const max = hi ?? field.max;
  const span = (max - min) || 1;
  for (let i = 0; i < w * h; i++) {
    const v = Math.max(0, Math.min(255, Math.round(((field.data[i] - min) / span) * 255)));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a + (b - a) * t;
