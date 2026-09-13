import * as THREE from 'three';

/**
 * Prozedurale PBR-Karten: Höhenfelder (aus `noise.js`) werden zu Normal-, Umgebungsverdeckungs- (AO) und
 * Rauheits-Texturen verrechnet. `surfaceMaps` bündelt die Ergebnisse und cached sie, damit die teure
 * Rauschberechnung nur einmal je Oberfläche läuft. Alle Texturen werden global registriert, sodass die
 * Anisotropie beim Qualitätswechsel an einer Stelle nachgezogen werden kann.
 */

const registry = new Set();
let currentAnisotropy = 8;
/** Textur registrieren, damit `setTextureAnisotropy` sie später findet. */
export function trackTexture(tex) { registry.add(tex); return tex; }
/** Anisotropie aller erzeugten Texturen setzen (Qualitätswechsel); gilt auch für neu erzeugte. */
export function setTextureAnisotropy(anisotropy) {
  currentAnisotropy = anisotropy;
  for (const t of registry) { if (t) t.anisotropy = anisotropy; }
}
export function getTextureAnisotropy() { return currentAnisotropy; }
export function clearTextureRegistry() { registry.clear(); }

export function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d') };
}

/** Canvas-Textur mit passendem Farbraum und Wiederholung. */
export function textureFromCanvas(canvas, { repeat = [1, 1], anisotropy = currentAnisotropy, srgb = false, clamp = false } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = anisotropy;
  if (repeat) {
    tex.wrapS = tex.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  trackTexture(tex);
  return tex;
}

/** Statistik eines Feldes (Min/Max) für Normierung. */
export function fieldStats(field) {
  let min = Infinity; let max = -Infinity;
  for (let i = 0; i < field.length; i++) { const v = field[i]; if (v < min) min = v; if (v > max) max = v; }
  return { min, max };
}

/** Kopie eines Feldes auf [0,1] normiert. */
export function normalizeField(field) {
  const { min, max } = fieldStats(field);
  const span = (max - min) || 1;
  const out = new Float32Array(field.length);
  for (let i = 0; i < field.length; i++) out[i] = (field[i] - min) / span;
  return out;
}

/** Separierender Box-Blur mit Wrap-Rand (für AO und weiche Feldmittel). */
export function blurField(field, w, h, radius) {
  const r = Math.max(1, Math.round(radius));
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += field[row + ((x + k) % w + w) % w];
      tmp[row + x] = s * inv;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[(((y + k) % h + h) % h) * w + x];
      out[y * w + x] = s * inv;
    }
  }
  return out;
}

/** Normal-Map-Canvas aus einem Höhenfeld (Sobel-Ableitung, kachelnd). */
export function fieldNormalCanvas(field, w, h, { strength = 1 } = {}) {
  const { canvas, ctx } = makeCanvas(w, h);
  const out = ctx.createImageData(w, h);
  const at = (x, y) => field[((y % h + h) % h) * w + ((x % w + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const o = (y * w + x) * 4;
      out.data[o] = ((-dx / len) * 0.5 + 0.5) * 255;
      out.data[o + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[o + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out.data[o + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

/**
 * AO-Canvas aus einem Höhenfeld: mehrskaliger Vergleich mit der lokalen Umgebung. Vertiefungen (unter dem
 * Mittel) werden dunkler, Erhebungen hell. Ergebnis ist auf den vollen Bereich normiert, damit `strength`
 * unabhängig von der Feldschwankung wirkt.
 */
export function fieldAoCanvas(field, w, h, { radius = 6, strength = 1, levels = 2, contrast = 1 } = {}) {
  const norm = normalizeField(field);
  const occ = new Float32Array(w * h);
  let r = Math.max(1, radius);
  for (let l = 0; l < levels; l++) {
    const blur = blurField(norm, w, h, r);
    const weight = 1 / (l + 1);
    for (let i = 0; i < w * h; i++) occ[i] += Math.max(0, blur[i] - norm[i]) * weight;
    r *= 2;
  }
  let max = 0;
  for (let i = 0; i < w * h; i++) if (occ[i] > max) max = occ[i];
  const inv = max > 1e-6 ? 1 / max : 0;
  const { canvas, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const t = Math.min(1, occ[i] * inv * contrast);
    const v = Math.round(255 * Math.max(0, Math.min(1, 1 - t * strength)));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Feld als Graustufen-Canvas (Werte werden auf `lo`/`hi` normiert, optional invertiert). */
export function fieldToGrayCanvas(field, w, h, { lo = null, hi = null, invert = false, gamma = 1 } = {}) {
  const st = fieldStats(field);
  const min = lo ?? st.min; const max = hi ?? st.max;
  const span = (max - min) || 1;
  const { canvas, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    let t = Math.max(0, Math.min(1, (field[i] - min) / span));
    if (invert) t = 1 - t;
    const v = Math.round(255 * Math.pow(t, gamma));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Farb-Canvas direkt aus einem Feld; `colorize(t)` (t in [0,1]) liefert [r,g,b] in 0..255. */
export function fieldToCanvas(field, w, h, colorize, { lo = null, hi = null } = {}) {
  const st = fieldStats(field);
  const min = lo ?? st.min; const max = hi ?? st.max;
  const span = (max - min) || 1;
  const { canvas, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const t = Math.max(0, Math.min(1, (field[i] - min) / span));
    const [r, g, b] = colorize(t);
    img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Rauheit aus der Helligkeit eines Farb-Canvas ableiten (dunkle Adern/Poren wirken matter). */
export function roughnessFromAlbedo(src, { min = 0.08, max = 0.95, invert = false, gamma = 1, field = null } = {}) {
  const w = src.width; const h = src.height;
  const data = src.getContext('2d').getImageData(0, 0, w, h).data;
  const { canvas, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  let extraMin = 0; let extraMax = 1;
  if (field) { const st = fieldStats(field.data ? field.data : field); extraMin = st.min; extraMax = st.max; }
  const fdata = field ? (field.data ?? field) : null;
  for (let i = 0; i < w * h; i++) {
    let l = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) / 255;
    if (invert) l = 1 - l;
    l = Math.pow(l, gamma);
    let v = min + (1 - l) * (max - min);
    if (fdata) { const t = (fdata[i] - extraMin) / ((extraMax - extraMin) || 1); v += (t - 0.5) * 0.1; }
    const o = Math.round(255 * Math.max(0, Math.min(1, v)));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = o; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Canvas linear hochskalieren (z. B. grobe Rauschfelder auf Zielauflösung bringen). */
export function upscaleCanvas(src, size) {
  if (src.width === size && src.height === size) return src;
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, size, size);
  return canvas;
}

/**
 * Zentrale Fabrik: bündelt Farb-, Rauheits-, Normal- und AO-Karte zu einem Materialkarten-Satz.
 * `color`/`roughness`/`normal`/`ao` sind Canvas-Elemente, `height` ist optional `{ data, w, h }` und leitet
 * Normal/AO ab, wenn diese nicht direkt übergeben wurden. Ergebnis wird per `key` gecacht.
 */
const surfaceCache = new Map();
export function surfaceMaps({
  key, color = null, roughness = null, normal = null, ao = null, height = null,
  repeat = [1, 1], anisotropy = currentAnisotropy, normalStrength = 1, aoRadius = 6, aoStrength = 1, aoLevels = 2,
} = {}) {
  if (surfaceCache.has(key)) return surfaceCache.get(key);
  const maps = {};
  if (color) maps.map = textureFromCanvas(color, { repeat, anisotropy, srgb: true });
  if (roughness) maps.roughnessMap = textureFromCanvas(roughness, { repeat, anisotropy });
  if (normal) maps.normalMap = textureFromCanvas(normal, { repeat, anisotropy });
  if (ao) maps.aoMap = textureFromCanvas(ao, { repeat, anisotropy });
  if (height) {
    const { data, w, h } = height;
    if (!maps.normalMap) maps.normalMap = textureFromCanvas(fieldNormalCanvas(data, w, h, { strength: normalStrength }), { repeat, anisotropy });
    if (!maps.aoMap) maps.aoMap = textureFromCanvas(fieldAoCanvas(data, w, h, { radius: aoRadius, strength: aoStrength, levels: aoLevels }), { repeat, anisotropy });
  }
  for (const t of Object.values(maps)) t.userData.keep = true;
  surfaceCache.set(key, maps);
  return maps;
}

export function clearSurfaceCache() { surfaceCache.clear(); }