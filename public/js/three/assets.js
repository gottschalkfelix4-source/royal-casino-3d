import * as THREE from 'three';

// ---------- Canvas-Helfer ----------
export function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d') };
}

export function canvasTexture(canvas, { repeat = null, anisotropy = 8 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- Materialien ----------
export const goldMaterial = (opts = {}) =>
  new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1, roughness: 0.28, ...opts });
export const darkMetalMaterial = (opts = {}) =>
  new THREE.MeshStandardMaterial({ color: 0x2a2f3a, metalness: 0.85, roughness: 0.4, ...opts });
export const glossyMaterial = (color, opts = {}) =>
  new THREE.MeshPhysicalMaterial({ color, metalness: 0.1, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15, ...opts });

// ---------- Texturen ----------
// Gecachte Texturen werden über Spielwechsel hinweg behalten (userData.keep)
const texCache = new Map();
const cached = (key, make) => {
  if (!texCache.has(key)) {
    const result = make();
    const list = result?.isTexture ? [result] : Object.values(result ?? {}).filter((t) => t?.isTexture);
    for (const t of list) t.userData.keep = true;
    texCache.set(key, result);
  }
  return texCache.get(key);
};

export function feltTexture(color = '#0f5a3a') {
  return cached(`felt:${color}`, () => {
    const { canvas, ctx } = makeCanvas(512, 512);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 512, 512);
    const img = ctx.getImageData(0, 0, 512, 512);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 26;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
    return canvasTexture(canvas, { repeat: [6, 6] });
  });
}

export function woodTexture() {
  return cached('wood', () => {
    const { canvas, ctx } = makeCanvas(512, 512);
    const g = ctx.createLinearGradient(0, 0, 512, 0);
    g.addColorStop(0, '#4a2a12'); g.addColorStop(0.5, '#6b3d1c'); g.addColorStop(1, '#3f2410');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 90; i++) {
      ctx.strokeStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.12})`;
      ctx.lineWidth = 1 + Math.random() * 3;
      ctx.beginPath();
      const y = Math.random() * 512;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(170, y + (Math.random() - 0.5) * 30, 340, y + (Math.random() - 0.5) * 30, 512, y);
      ctx.stroke();
    }
    return canvasTexture(canvas, { repeat: [2, 2] });
  });
}

/** Tischplatte mit Filz und Holzrand. */
export function buildTable(scene, { width = 14, depth = 9, felt = '#0f5a3a', y = 0, rim = 0.5 } = {}) {
  const group = new THREE.Group();
  const top = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ map: feltTexture(felt), roughness: 0.95, metalness: 0 })
  );
  top.rotation.x = -Math.PI / 2;
  top.position.y = y;
  top.receiveShadow = true;
  group.add(top);

  const woodMat = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.45, metalness: 0.05 });
  const mk = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, rim * 0.6, d), woodMat);
    m.position.set(x, y + rim * 0.3 - 0.01, z);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  };
  mk(width + rim * 2, rim, 0, depth / 2 + rim / 2);
  mk(width + rim * 2, rim, 0, -depth / 2 - rim / 2);
  mk(rim, depth, width / 2 + rim / 2, 0);
  mk(rim, depth, -width / 2 - rim / 2, 0);
  scene.add(group);
  return group;
}

// ---------- Text-Sprites ----------
export function textSprite(text, { size = 56, color = '#ffffff', bg = null, font = `800 ${56}px Inter, Arial`, padding = 18, height = 0.6, stroke = null } = {}) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
  sprite.userData.setText = (t) => {
    const { canvas, ctx } = makeCanvas(2, 2);
    ctx.font = font.replace(/\d+px/, `${size}px`);
    const w = Math.ceil(ctx.measureText(t).width) + padding * 2;
    const hgt = Math.ceil(size * 1.5);
    canvas.width = w; canvas.height = hgt;
    ctx.font = font.replace(/\d+px/, `${size}px`);
    if (bg) { ctx.fillStyle = bg; roundRect(ctx, 0, 0, w, hgt, hgt / 2); ctx.fill(); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (stroke) { ctx.lineWidth = size * 0.12; ctx.strokeStyle = stroke; ctx.strokeText(t, w / 2, hgt / 2); }
    ctx.fillStyle = color;
    ctx.fillText(t, w / 2, hgt / 2);
    sprite.material.map?.dispose();
    sprite.material.map = canvasTexture(canvas);
    sprite.material.needsUpdate = true;
    sprite.scale.set((w / hgt) * height, height, 1);
  };
  sprite.userData.setText(text);
  return sprite;
}

// ---------- Spielkarten ----------
export const CARD = { w: 1, h: 1.4, d: 0.02 };
const SUIT_CHAR = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANK_STR = (r) => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[r] ?? String(r));
let cardGeo = null;
const cardEdgeMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.8 });

export function cardFaceTexture(r, s) {
  return cached(`card:${r}${s}`, () => {
    const W = 256; const H = 358;
    const { canvas, ctx } = makeCanvas(W, H);
    const red = s === 'H' || s === 'D';
    const col = red ? '#c0392b' : '#1b1b1f';
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#eeeef2');
    ctx.fillStyle = grad;
    roundRect(ctx, 0, 0, W, H, 18); ctx.fill();
    ctx.strokeStyle = '#c9c9d1'; ctx.lineWidth = 3; roundRect(ctx, 1.5, 1.5, W - 3, H - 3, 17); ctx.stroke();

    const rank = RANK_STR(r); const suit = SUIT_CHAR[s];
    const corner = (x, y, rot) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '800 46px Inter, Arial'; ctx.fillText(rank, 0, 0);
      ctx.font = '40px "Segoe UI Symbol", Arial'; ctx.fillText(suit, 0, 44);
      ctx.restore();
    };
    corner(30, 34, 0);
    corner(W - 30, H - 34, Math.PI);

    ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (r >= 11) {
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      roundRect(ctx, 58, 78, W - 116, H - 156, 10); ctx.stroke();
      ctx.fillStyle = red ? 'rgba(192,57,43,0.08)' : 'rgba(27,27,31,0.06)';
      roundRect(ctx, 58, 78, W - 116, H - 156, 10); ctx.fill();
      ctx.fillStyle = col;
      ctx.font = '900 120px Cinzel, Georgia, serif'; ctx.fillText(rank, W / 2, H / 2 - 8);
      ctx.font = '44px "Segoe UI Symbol", Arial'; ctx.fillText(suit, W / 2, H / 2 + 70);
    } else if (r === 1) {
      ctx.font = '170px "Segoe UI Symbol", Arial'; ctx.fillText(suit, W / 2, H / 2 + 6);
    } else {
      // Pips-Layout
      const layouts = {
        2: [[0, -1], [0, 1]], 3: [[0, -1], [0, 0], [0, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
        5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
        7: [[-1, -1], [1, -1], [0, -0.5], [-1, 0], [1, 0], [-1, 1], [1, 1]],
        8: [[-1, -1], [1, -1], [0, -0.5], [-1, 0], [1, 0], [0, 0.5], [-1, 1], [1, 1]],
        9: [[-1, -1], [1, -1], [-1, -0.33], [1, -0.33], [0, 0], [-1, 0.33], [1, 0.33], [-1, 1], [1, 1]],
        10: [[-1, -1], [1, -1], [0, -0.66], [-1, -0.33], [1, -0.33], [-1, 0.33], [1, 0.33], [0, 0.66], [-1, 1], [1, 1]],
      };
      ctx.font = '58px "Segoe UI Symbol", Arial';
      for (const [px, py] of layouts[r]) {
        const x = W / 2 + px * 52; const y = H / 2 + py * 105;
        ctx.save(); ctx.translate(x, y); if (py > 0) ctx.rotate(Math.PI); ctx.fillText(suit, 0, 0); ctx.restore();
      }
    }
    return canvasTexture(canvas);
  });
}

export function cardBackTexture() {
  return cached('card:back', () => {
    const W = 256; const H = 358;
    const { canvas, ctx } = makeCanvas(W, H);
    ctx.fillStyle = '#f4f4f6'; roundRect(ctx, 0, 0, W, H, 18); ctx.fill();
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#8e1b2a'); g.addColorStop(1, '#4d0d16');
    ctx.fillStyle = g; roundRect(ctx, 14, 14, W - 28, H - 28, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(212,175,55,0.9)'; ctx.lineWidth = 3; roundRect(ctx, 22, 22, W - 44, H - 44, 8); ctx.stroke();
    ctx.save();
    ctx.beginPath(); roundRect(ctx, 26, 26, W - 52, H - 52, 6); ctx.clip();
    ctx.strokeStyle = 'rgba(212,175,55,0.35)'; ctx.lineWidth = 2;
    for (let i = -H; i < W + H; i += 22) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i, H); ctx.lineTo(i + H, 0); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#d4af37'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 64px Cinzel, Georgia, serif'; ctx.fillText('RC', W / 2, H / 2);
    return canvasTexture(canvas);
  });
}

/** Karten-Mesh; Vorderseite zeigt nach +Z. rotation.y = π für verdeckt. */
export function createCard(card, { faceUp = true } = {}) {
  cardGeo ??= new THREE.BoxGeometry(CARD.w, CARD.h, CARD.d);
  const back = new THREE.MeshStandardMaterial({ map: cardBackTexture(), roughness: 0.6 });
  const face = new THREE.MeshStandardMaterial({ map: card?.r ? cardFaceTexture(card.r, card.s) : cardBackTexture(), roughness: 0.55 });
  const mesh = new THREE.Mesh(cardGeo, [cardEdgeMat, cardEdgeMat, cardEdgeMat, cardEdgeMat, face, back]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.rotation.y = faceUp ? 0 : Math.PI;
  mesh.userData.card = card;
  return mesh;
}

export function setCardFace(mesh, card) {
  mesh.userData.card = card;
  mesh.material[4].map = cardFaceTexture(card.r, card.s);
  mesh.material[4].needsUpdate = true;
}

// ---------- Chips ----------
export const CHIP = { r: 0.36, h: 0.085 };
export const CHIP_STYLES = [
  { value: 1_00, color: '#e9e9e9', text: '#222', label: '1' },
  { value: 5_00, color: '#d63b2f', text: '#fff', label: '5' },
  { value: 10_00, color: '#2f6fd6', text: '#fff', label: '10' },
  { value: 25_00, color: '#22a35a', text: '#fff', label: '25' },
  { value: 100_00, color: '#1c1c1c', text: '#fff', label: '100' },
  { value: 500_00, color: '#7d3ab0', text: '#fff', label: '500' },
  { value: 1000_00, color: '#d4af37', text: '#1a1305', label: '1K' },
];
export const chipStyle = (cents) => [...CHIP_STYLES].reverse().find((c) => c.value <= cents) ?? CHIP_STYLES[0];
let chipGeo = null;

function chipTextures(style) {
  return cached(`chip:${style.value}`, () => {
    const { canvas, ctx } = makeCanvas(256, 256);
    ctx.fillStyle = style.color;
    ctx.beginPath(); ctx.arc(128, 128, 128, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 8; i++) {
      ctx.save(); ctx.translate(128, 128); ctx.rotate((i / 8) * Math.PI * 2);
      ctx.fillRect(-16, -128, 32, 34); ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(128, 128, 84, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(128, 128, 94, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = style.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 64px Inter, Arial'; ctx.fillText(style.label, 128, 130);
    const top = canvasTexture(canvas);

    const side = makeCanvas(512, 32);
    side.ctx.fillStyle = style.color; side.ctx.fillRect(0, 0, 512, 32);
    side.ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 8; i++) side.ctx.fillRect(i * 64 - 16, 0, 32, 32);
    const sideTex = canvasTexture(side.canvas, { repeat: [1, 1] });
    return { top, side: sideTex };
  });
}

export function createChip(cents) {
  chipGeo ??= new THREE.CylinderGeometry(CHIP.r, CHIP.r, CHIP.h, 48);
  const style = chipStyle(cents);
  const { top, side } = chipTextures(style);
  const mesh = new THREE.Mesh(chipGeo, [
    new THREE.MeshStandardMaterial({ map: side, roughness: 0.5 }),
    new THREE.MeshStandardMaterial({ map: top, roughness: 0.4 }),
    new THREE.MeshStandardMaterial({ map: top, roughness: 0.4 }),
  ]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Stapel aus Chips, der einen Betrag darstellt (max. maxChips Stück). */
export function chipStack(cents, { maxChips = 10 } = {}) {
  const group = new THREE.Group();
  let remaining = cents;
  const chips = [];
  for (const style of [...CHIP_STYLES].reverse()) {
    while (remaining >= style.value && chips.length < maxChips) { chips.push(style.value); remaining -= style.value; }
  }
  if (chips.length === 0) chips.push(cents);
  chips.reverse().forEach((v, i) => {
    const c = createChip(v);
    c.position.y = CHIP.h / 2 + i * CHIP.h;
    c.rotation.y = Math.random() * Math.PI;
    group.add(c);
  });
  return group;
}

// ---------- Würfel ----------
// Materialreihenfolge BoxGeometry: +x, -x, +y, -y, +z, -z
const DIE_FACE_ORDER = [1, 6, 2, 5, 3, 4];
export const DIE_NORMALS = {
  1: new THREE.Vector3(1, 0, 0), 6: new THREE.Vector3(-1, 0, 0),
  2: new THREE.Vector3(0, 1, 0), 5: new THREE.Vector3(0, -1, 0),
  3: new THREE.Vector3(0, 0, 1), 4: new THREE.Vector3(0, 0, -1),
};

function dieFaceTexture(n, color, pip) {
  return cached(`die:${n}:${color}`, () => {
    const { canvas, ctx } = makeCanvas(256, 256);
    const g = ctx.createRadialGradient(100, 90, 20, 128, 128, 190);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, color);
    ctx.fillStyle = g; roundRect(ctx, 0, 0, 256, 256, 44); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 6; roundRect(ctx, 3, 3, 250, 250, 42); ctx.stroke();
    const P = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
      5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
    ctx.fillStyle = pip;
    for (const [x, y] of P[n]) {
      ctx.beginPath(); ctx.arc(128 + x * 62, 128 + y * 62, 24, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.arc(128 + x * 62 - 8, 128 + y * 62 - 8, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = pip;
    }
    return canvasTexture(canvas);
  });
}

export function createDie(size = 0.8, { color = '#e8e8ee', pip = '#151515' } = {}) {
  const mats = DIE_FACE_ORDER.map((n) => new THREE.MeshStandardMaterial({ map: dieFaceTexture(n, color, pip), roughness: 0.35 }));
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mats);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Quaternion, bei der die Fläche `value` nach oben zeigt (mit Drehung yaw um Y). */
export function dieQuaternion(value, yaw = 0) {
  const q = new THREE.Quaternion().setFromUnitVectors(DIE_NORMALS[value].clone(), new THREE.Vector3(0, 1, 0));
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  return qy.multiply(q);
}

// ---------- Sonstiges ----------
export function emojiTexture(emoji, { size = 256, bg = null } = {}) {
  return cached(`emoji:${emoji}:${bg}`, () => {
    const { canvas, ctx } = makeCanvas(size, size);
    if (bg) { ctx.fillStyle = bg; roundRect(ctx, 0, 0, size, size, size * 0.18); ctx.fill(); }
    ctx.font = `${size * 0.7}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(emoji, size / 2, size / 2 + size * 0.04);
    return canvasTexture(canvas);
  });
}

export function disposeObject(obj) {
  obj.parent?.remove(obj);
  obj.traverse((o) => {
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) if (m !== cardEdgeMat) m.dispose?.();
  });
}

/** Einfaches Partikel-Burst (z. B. Explosion, Konfetti). */
export function burst(engine, position, { count = 60, color = 0xffc857, size = 0.12, speed = 6, gravity = 9, life = 1100, colors = null } = {}) {
  const group = new THREE.Group();
  const geo = new THREE.SphereGeometry(size, 6, 6);
  const parts = [];
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: colors ? colors[i % colors.length] : color, transparent: true });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(position);
    const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize();
    parts.push({ m, v: dir.multiplyScalar(speed * (0.4 + Math.random() * 0.8)) });
    group.add(m);
  }
  engine.scene.add(group);
  const start = performance.now();
  const stop = engine.onUpdate((dt) => {
    const age = performance.now() - start;
    for (const p of parts) {
      p.v.y -= gravity * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.material.opacity = Math.max(0, 1 - age / life);
    }
    if (age > life) { stop(); disposeObject(group); geo.dispose(); }
  });
}
