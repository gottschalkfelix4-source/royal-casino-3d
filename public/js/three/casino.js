import * as THREE from 'three';
import { makeCanvas, canvasTexture, roundRect, goldMaterial, woodTexture, feltTexture, textSprite, createChip, createCard, createDie } from './assets.js';
import { createAvatar } from './avatars.js';

/**
 * Prozedural gebaute Casino-Halle im Stil der 2000er: Musterteppich, Kronleuchter,
 * Neonschilder, Slot-Bank, Spieltische, Bar. Jede Station ist anklickbar.
 */

export const HALL = { w: 40, d: 30, h: 6.5 };

// ---------- Texturen ----------
function carpetTexture() {
  const S = 512;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.fillStyle = '#3a0c1a';
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(212,175,55,0.5)';
  ctx.lineWidth = 3;
  for (let i = -S; i < S * 2; i += 64) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + S, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i, S); ctx.lineTo(i + S, 0); ctx.stroke();
  }
  for (let y = 64; y < S; y += 128) {
    for (let x = 64; x < S; x += 128) {
      ctx.fillStyle = '#1d3f7a';
      ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#c0392b';
      ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(212,175,55,0.9)';
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * 44, y + Math.sin(a) * 44, 5, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  const img = ctx.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 18; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(canvas, { repeat: [10, 7.5], anisotropy: 16 });
}

function ceilingTexture() {
  const S = 512;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.fillStyle = '#1a1512';
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#2a221c'; ctx.lineWidth = 4;
  for (let i = 0; i <= S; i += 128) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke(); }
  return canvasTexture(canvas, { repeat: [10, 7.5] });
}

function wallTexture() {
  const S = 512;
  const { canvas, ctx } = makeCanvas(S, S);
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, '#4a1020'); g.addColorStop(1, '#2a0810');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(212,175,55,0.35)'; ctx.lineWidth = 6;
  for (let x = 0; x < S; x += 128) { ctx.strokeRect(x + 12, 40, 104, S - 80); }
  return canvasTexture(canvas, { repeat: [10, 1.5] });
}

function neonTexture(text, color, sub = null) {
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

function screenTexture(draw) {
  const { canvas, ctx } = makeCanvas(256, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#0b1730'); g.addColorStop(1, '#03060f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  draw(ctx);
  return canvasTexture(canvas);
}

const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
const SCREENS = {
  slots: () => screenTexture((ctx) => {
    ctx.fillStyle = '#f5f0e0';
    [0, 1, 2].forEach((i) => { roundRect(ctx, 16 + i * 78, 60, 68, 136, 8); ctx.fill(); });
    ctx.font = `48px ${EMOJI_FONT}`;
    ['🍒', '7️⃣', '💎'].forEach((e, i) => ctx.fillText(e, 50 + i * 78, 130));
    ctx.fillStyle = '#ffd76a'; ctx.font = '900 30px Cinzel, serif'; ctx.fillText('JACKPOT', 128, 30);
  }),
  videopoker: () => screenTexture((ctx) => {
    ctx.fillStyle = '#f5f0e0';
    for (let i = 0; i < 5; i++) { roundRect(ctx, 10 + i * 48, 90, 42, 64, 5); ctx.fill(); }
    ctx.fillStyle = '#c0392b'; ctx.font = '700 28px Inter, Arial';
    ['A', 'K', 'Q', 'J', '10'].forEach((r, i) => ctx.fillText(r, 31 + i * 48, 122));
    ctx.fillStyle = '#7cf0ae'; ctx.font = '900 26px Cinzel, serif'; ctx.fillText('VIDEO POKER', 128, 40);
    ctx.fillStyle = '#ffd76a'; ctx.font = '700 20px Inter, Arial'; ctx.fillText('ROYAL FLUSH 800×', 128, 210);
  }),
  crash: () => screenTexture((ctx) => {
    ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(20, 220); ctx.quadraticCurveTo(140, 210, 220, 60); ctx.stroke();
    ctx.font = `56px ${EMOJI_FONT}`; ctx.fillText('🚀', 210, 60);
    ctx.fillStyle = '#ffffff'; ctx.font = '900 44px Cinzel, serif'; ctx.fillText('2,47×', 100, 90);
  }),
  mines: () => screenTexture((ctx) => {
    for (let i = 0; i < 25; i++) {
      const x = 28 + (i % 5) * 42; const y = 40 + Math.floor(i / 5) * 42;
      ctx.fillStyle = [3, 8, 12, 17].includes(i) ? '#0f5a3a' : '#2b3a55';
      roundRect(ctx, x - 18, y - 18, 36, 36, 5); ctx.fill();
      if ([3, 8, 12, 17].includes(i)) { ctx.font = `22px ${EMOJI_FONT}`; ctx.fillText('💎', x, y + 2); }
    }
  }),
  plinko: () => screenTexture((ctx) => {
    ctx.fillStyle = '#e8e8f0';
    for (let r = 0; r < 7; r++) for (let j = 0; j <= r + 1; j++) { ctx.beginPath(); ctx.arc(128 + (j - (r + 1) / 2) * 26, 40 + r * 24, 4, 0, Math.PI * 2); ctx.fill(); }
    const cols = ['#e74c3c', '#f39c12', '#f1c40f', '#2ecc71', '#f1c40f', '#f39c12', '#e74c3c'];
    cols.forEach((c, i) => { ctx.fillStyle = c; roundRect(ctx, 30 + i * 28, 210, 24, 22, 4); ctx.fill(); });
    ctx.fillStyle = '#ffd76a'; ctx.beginPath(); ctx.arc(128, 18, 8, 0, Math.PI * 2); ctx.fill();
  }),
  coinflip: () => screenTexture((ctx) => {
    const g = ctx.createRadialGradient(110, 100, 10, 128, 128, 90);
    g.addColorStop(0, '#ffe9a3'); g.addColorStop(1, '#a07a1e');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(128, 118, 80, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5c4410'; ctx.font = '900 44px Cinzel, serif'; ctx.fillText('KOPF', 128, 122);
    ctx.fillStyle = '#ffd76a'; ctx.font = '700 22px Inter, Arial'; ctx.fillText('1,96×', 128, 225);
  }),
  hilo: () => screenTexture((ctx) => {
    ctx.fillStyle = '#f5f0e0'; roundRect(ctx, 78, 50, 100, 140, 8); ctx.fill();
    ctx.fillStyle = '#1b1b1f'; ctx.font = '900 70px Inter, Arial'; ctx.fillText('7', 128, 120);
    ctx.fillStyle = '#7cf0ae'; ctx.font = '900 36px Inter, Arial'; ctx.fillText('▲', 40, 90);
    ctx.fillStyle = '#ff8a7a'; ctx.fillText('▼', 216, 150);
  }),
};

// ---------- Bausteine ----------
const brass = goldMaterial({ roughness: 0.32 });
const velvet = new THREE.MeshStandardMaterial({ color: 0x3a0a14, roughness: 0.95 });
const darkWood = new THREE.MeshStandardMaterial({ map: woodTexture(), color: 0x8a6a4a, roughness: 0.45 });
const chrome = new THREE.MeshStandardMaterial({ color: 0xd8d8e0, metalness: 1, roughness: 0.2 });
const bodyRed = new THREE.MeshPhysicalMaterial({ color: 0x7a0f22, metalness: 0.5, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1 });
const bodyBlack = new THREE.MeshPhysicalMaterial({ color: 0x14141a, metalness: 0.6, roughness: 0.35, clearcoat: 1 });

function emissivePlane(w, h, tex, intensity = 1.6) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: intensity, roughness: 0.3 }));
}

function slotMachine(screenTex) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.8, 0.8), bodyRed);
  body.position.y = 0.9; body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  const screen = emissivePlane(0.72, 0.72, screenTex, 1.4);
  screen.position.set(0, 1.35, 0.41);
  g.add(screen);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.4), bodyBlack);
  deck.position.set(0, 0.86, 0.5); deck.rotation.x = -0.35;
  g.add(deck);
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16), new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0xff2020, emissiveIntensity: 1.2 }));
  btn.position.set(0.25, 0.94, 0.55); btn.rotation.x = -0.35;
  g.add(btn);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.45, 0.5), bodyBlack);
  top.position.set(0, 2.02, -0.1);
  g.add(top);
  const sign = emissivePlane(0.85, 0.32, neonTexture('777', '#ffd76a'), 1.8);
  sign.position.set(0, 2.02, 0.16);
  g.add(sign);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.85), brass);
  trim.position.y = 1.8;
  g.add(trim);
  // Hocker
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 20), velvet);
  seat.position.set(0, 0.62, 0.95); seat.castShadow = true;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 10), chrome);
  pole.position.set(0, 0.3, 0.95);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 20), chrome);
  foot.position.set(0, 0.015, 0.95);
  g.add(seat, pole, foot);
  return g;
}

/** Spieltisch: shape 'rect' | 'oval' | 'half' (Halbkreis wie Blackjack) */
function gameTable({ shape = 'rect', w = 3, d = 1.8, felt = '#0f5a3a', rail = true } = {}) {
  const g = new THREE.Group();
  const feltMat = new THREE.MeshStandardMaterial({ map: feltTexture(felt), roughness: 0.95 });
  let topGeo;
  if (shape === 'oval') topGeo = new THREE.CylinderGeometry(1, 1, 0.1, 48).scale(w / 2, 1, d / 2);
  else if (shape === 'half') topGeo = new THREE.CylinderGeometry(1, 1, 0.1, 48, 1, false, 0, Math.PI).scale(w / 2, 1, d);
  else topGeo = new THREE.BoxGeometry(w, 0.1, d);
  const top = new THREE.Mesh(topGeo, feltMat);
  top.position.y = 0.9; top.castShadow = true; top.receiveShadow = true;
  if (shape === 'half') top.rotation.y = -Math.PI / 2; // runde Seite zu den Spielern (+z)
  g.add(top);
  const base = new THREE.Mesh(shape === 'rect' ? new THREE.BoxGeometry(w * 0.9, 0.8, d * 0.9) : new THREE.CylinderGeometry(Math.min(w, d) * 0.35, Math.min(w, d) * 0.4, 0.85, 24), darkWood);
  base.position.y = 0.43; base.castShadow = true;
  g.add(base);
  if (rail) {
    let railMesh;
    if (shape === 'rect') {
      railMesh = new THREE.Group();
      const mk = (len, x, z, rot) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, len, 4, 12), velvet); m.rotation.z = Math.PI / 2; m.rotation.y = rot; m.position.set(x, 0.99, z); railMesh.add(m); };
      mk(w, 0, d / 2, 0); mk(w, 0, -d / 2, 0); mk(d, w / 2, 0, Math.PI / 2); mk(d, -w / 2, 0, Math.PI / 2);
    } else if (shape === 'oval') {
      railMesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.09, 12, 64).scale(w / 2, d / 2, 1), velvet);
      railMesh.rotation.x = Math.PI / 2; railMesh.position.y = 0.99;
    } else {
      railMesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.09, 12, 48, Math.PI).scale(w / 2, d, 1), velvet);
      railMesh.rotation.x = Math.PI / 2; railMesh.position.y = 0.99;
    }
    g.add(railMesh);
  }
  return g;
}

function stool(x, z) {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 20), velvet);
  seat.position.y = 0.66; seat.castShadow = true;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.64, 10), chrome);
  pole.position.y = 0.32;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 20), chrome);
  foot.position.y = 0.015;
  g.add(seat, pole, foot);
  g.position.set(x, 0, z);
  return g;
}

function cabinet(screenTex, title, color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.9), bodyBlack);
  body.position.y = 1.05; body.castShadow = true;
  g.add(body);
  const screen = emissivePlane(0.85, 0.85, screenTex, 1.5);
  screen.position.set(0, 1.35, 0.46);
  g.add(screen);
  const marquee = emissivePlane(1.0, 0.3, neonTexture(title, color), 1.7);
  marquee.position.set(0, 1.95, 0.46);
  g.add(marquee);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.35), bodyRed);
  deck.position.set(0, 0.82, 0.55); deck.rotation.x = -0.3;
  g.add(deck);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.04, 0.94), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2 }));
  stripe.position.y = 0.3;
  g.add(stripe);
  return g;
}

function chandelier(x, z, y = 5.4) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 10, 48), brass);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 10, 32), brass);
  ring2.rotation.x = Math.PI / 2; ring2.position.y = 0.35;
  g.add(ring2);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6), brass);
  chain.position.y = 0.9;
  g.add(chain);
  // Kein "transmission": das würde pro Frame einen zusätzlichen Renderpass der ganzen Szene auslösen
  const crystalMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0.1, clearcoat: 1, emissive: 0xfff2cc, emissiveIntensity: 0.4, transparent: true, opacity: 0.85 });
  const crystalGeo = new THREE.OctahedronGeometry(0.07, 0);
  const crystals = new THREE.Group();
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const r = i % 2 ? 0.9 : 0.5;
    const c = new THREE.Mesh(crystalGeo, crystalMat);
    c.position.set(Math.cos(a) * r, -0.25 - (i % 3) * 0.12 + (i % 2 ? 0 : 0.35), Math.sin(a) * r);
    c.scale.y = 2;
    crystals.add(c);
  }
  g.add(crystals);
  const bulbs = new THREE.Group();
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffe0a0, emissiveIntensity: 3 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), bulbMat);
    b.position.set(Math.cos(a) * 0.9, 0.12, Math.sin(a) * 0.9);
    bulbs.add(b);
  }
  g.add(bulbs);
  g.position.set(x, y, z);
  g.userData.crystals = crystals;
  return g;
}

function column(x, z) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.45, HALL.h, 24), new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 0.55 }));
  shaft.position.y = HALL.h / 2; shaft.castShadow = true; shaft.receiveShadow = true;
  g.add(shaft);
  const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.45, 0.35, 24), brass);
  capTop.position.y = HALL.h - 0.18;
  const capBot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.65, 0.3, 24), brass);
  capBot.position.y = 0.15;
  g.add(capTop, capBot);
  g.position.set(x, 0, z);
  return g;
}

function bar(x, z) {
  const g = new THREE.Group();
  const counter = new THREE.Mesh(new THREE.BoxGeometry(8, 1.1, 1.2), darkWood);
  counter.position.y = 0.55; counter.castShadow = true;
  g.add(counter);
  const top = new THREE.Mesh(new THREE.BoxGeometry(8.3, 0.08, 1.4), new THREE.MeshPhysicalMaterial({ color: 0x1a1a1a, roughness: 0.1, clearcoat: 1 }));
  top.position.y = 1.14;
  g.add(top);
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 8, 8), brass);
  rail.rotation.z = Math.PI / 2; rail.position.set(0, 0.25, 0.75);
  g.add(rail);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(8, 3.2, 0.4), darkWood);
  shelf.position.set(0, 1.6, -1.6);
  g.add(shelf);
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 2.4), new THREE.MeshStandardMaterial({ color: 0x9fb4c8, metalness: 1, roughness: 0.05 }));
  mirror.position.set(0, 2.0, -1.39);
  g.add(mirror);
  const colors = [0x35c7ff, 0xff4d6d, 0x7cf0ae, 0xffd76a, 0xc59bff, 0xff8c42];
  for (let i = 0; i < 14; i++) {
    const c = colors[i % colors.length];
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.5, 12), new THREE.MeshPhysicalMaterial({ color: c, emissive: c, emissiveIntensity: 0.6, roughness: 0.1, clearcoat: 1, transparent: true, opacity: 0.85 }));
    bottle.position.set(-3.3 + i * 0.5, 1.3 + (i % 2) * 0.7, -1.32);
    g.add(bottle);
  }
  const ledStrip = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.04, 0.06), new THREE.MeshStandardMaterial({ color: 0x35c7ff, emissive: 0x35c7ff, emissiveIntensity: 2.5 }));
  ledStrip.position.set(0, 1.02, 0.62);
  g.add(ledStrip);
  for (let i = 0; i < 4; i++) g.add(stool(-2.4 + i * 1.6, 1.2));
  g.position.set(x, 0, z);
  return g;
}

function rouletteMini() {
  const g = new THREE.Group();
  const { canvas, ctx } = makeCanvas(512, 512);
  const n = 37;
  for (let i = 0; i < n; i++) {
    ctx.beginPath(); ctx.moveTo(256, 256);
    ctx.arc(256, 256, 256, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2); ctx.closePath();
    ctx.fillStyle = i === 0 ? '#1e8f4e' : i % 2 ? '#15161a' : '#b3261e'; ctx.fill();
  }
  ctx.fillStyle = '#4a2a12'; ctx.beginPath(); ctx.arc(256, 256, 150, 0, Math.PI * 2); ctx.fill();
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.18, 48), [darkWood, new THREE.MeshStandardMaterial({ map: canvasTexture(canvas), roughness: 0.4 }), darkWood]);
  wheel.position.y = 1.02;
  const hub = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.3, 24), brass);
  hub.position.y = 1.2;
  g.add(wheel, hub);
  g.userData.spin = wheel;
  return g;
}

function fortuneWheel() {
  const g = new THREE.Group();
  const { canvas, ctx } = makeCanvas(512, 512);
  const cols = ['#2a2f3a', '#2f6fd6', '#2a2f3a', '#22a35a', '#2a2f3a', '#7d3ab0', '#2a2f3a', '#d4af37'];
  for (let i = 0; i < 24; i++) {
    ctx.beginPath(); ctx.moveTo(256, 256);
    ctx.arc(256, 256, 256, (i / 24) * Math.PI * 2, ((i + 1) / 24) * Math.PI * 2); ctx.closePath();
    ctx.fillStyle = cols[i % cols.length]; ctx.fill();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.stroke();
  }
  const face = new THREE.Mesh(new THREE.CircleGeometry(1.5, 64), new THREE.MeshStandardMaterial({ map: canvasTexture(canvas), roughness: 0.5 }));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.08, 12, 64), brass);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.3, 24), brass);
  hub.rotation.x = Math.PI / 2; hub.position.z = 0.1;
  const wheelGroup = new THREE.Group();
  wheelGroup.add(face, rim, hub);
  wheelGroup.position.y = 2.2;
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffd76a, emissive: 0xffd76a, emissiveIntensity: 2 });
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), lampMat);
    l.position.set(Math.cos(a) * 1.72, 2.2 + Math.sin(a) * 1.72, 0.05);
    g.add(l);
  }
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), bodyBlack);
  stand.position.y = 0.45;
  const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 3), new THREE.MeshStandardMaterial({ color: 0xe74c3c }));
  pointer.rotation.x = Math.PI; pointer.position.set(0, 3.95, 0.12);
  g.add(wheelGroup, stand, pointer);
  g.userData.spin = wheelGroup;
  return g;
}

function pedestal() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.75, 1.0, 32), new THREE.MeshPhysicalMaterial({ color: 0x2a1f4a, roughness: 0.3, clearcoat: 1 }));
  base.position.y = 0.5; base.castShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.04, 10, 48), brass);
  ring.rotation.x = Math.PI / 2; ring.position.y = 1.0;
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 48), goldMaterial({ roughness: 0.25 }));
  coin.position.y = 1.5;
  coin.rotation.x = Math.PI / 2;
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.3, 32, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xcfe6ff, roughness: 0.05, metalness: 0.1, clearcoat: 1, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  glass.position.y = 1.65;
  g.add(base, ring, coin, glass);
  g.userData.spin = coin;
  return g;
}

// ---------- Halle ----------
export function buildCasino(engine) {
  const { scene } = engine;
  const { w, d, h } = HALL;
  const animated = [];
  const stations = [];

  // Boden, Decke, Wände
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: carpetTexture(), roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: ceilingTexture(), roughness: 0.9 }));
  ceiling.rotation.x = Math.PI / 2; ceiling.position.y = h;
  scene.add(ceiling);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.7 });
  const mkWall = (width, x, z, rotY) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, h), wallMat);
    m.position.set(x, h / 2, z); m.rotation.y = rotY; m.receiveShadow = true;
    scene.add(m);
  };
  mkWall(w, 0, -d / 2, 0);
  mkWall(w, 0, d / 2, Math.PI);
  mkWall(d, -w / 2, 0, Math.PI / 2);
  mkWall(d, w / 2, 0, -Math.PI / 2);
  // Goldene Sockel- und Deckenleisten
  const trimMat = brass;
  [[w, 0, -d / 2], [w, 0, d / 2]].forEach(([len, x, z]) => {
    for (const y of [0.08, h - 0.08]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(len, 0.16, 0.12), trimMat);
      t.position.set(x, y, z); scene.add(t);
    }
  });
  [[-w / 2, 0], [w / 2, 0]].forEach(([x, z]) => {
    for (const y of [0.08, h - 0.08]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, d), trimMat);
      t.position.set(x, y, z); scene.add(t);
    }
  });

  // Deckenspots (leuchtende Scheiben, Bloom macht den Rest)
  const spotDisc = new THREE.CircleGeometry(0.18, 16);
  const spotMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1d6, emissiveIntensity: 2.2 });
  for (let x = -16; x <= 16; x += 4) {
    for (let z = -12; z <= 12; z += 4) {
      const s = new THREE.Mesh(spotDisc, spotMat);
      s.rotation.x = Math.PI / 2; s.position.set(x, h - 0.02, z);
      scene.add(s);
    }
  }
  // Kronleuchter (Licht kommt von wenigen Punktlichtern, nicht von jedem Leuchter)
  for (const [x, z] of [[-8, -4], [8, -4], [-8, 6], [8, 6], [0, 1]]) {
    const c = chandelier(x, z, x === 0 ? 5.6 : 5.3);
    if (x === 0) c.scale.setScalar(1.5);
    scene.add(c);
    animated.push((dt, t) => { c.userData.crystals.rotation.y = t * 0.15; });
  }
  for (const [x, z] of [[-8, 1], [8, 1], [0, -8]]) {
    const light = new THREE.PointLight(0xffd9a0, 40, 20, 2);
    light.position.set(x, 5.0, z);
    scene.add(light);
  }
  // Säulen
  for (const [x, z] of [[-12, -9], [12, -9], [-12, 9], [12, 9], [-4, -9], [4, -9]]) scene.add(column(x, z));

  // Neon-Schriftzug an der Rückwand
  const neon = emissivePlane(12, 3, neonTexture('ROYAL CASINO', '#ff2d6f', '★ 24 STUNDEN GEÖFFNET ★'), 2.2);
  neon.position.set(0, 4.9, -d / 2 + 0.08);
  scene.add(neon);
  animated.push((dt, t) => { neon.material.emissiveIntensity = 2.0 + Math.sin(t * 9) * 0.15 + (Math.random() < 0.01 ? -0.8 : 0); });
  const neon2 = emissivePlane(6, 1.5, neonTexture('BAR', '#35c7ff'), 2);
  neon2.position.set(-13, 4.6, -d / 2 + 0.08);
  scene.add(neon2);
  const neon3 = emissivePlane(8, 1.6, neonTexture('JACKPOT', '#ffd76a'), 2);
  neon3.position.set(-w / 2 + 0.08, 4.6, 0); neon3.rotation.y = Math.PI / 2;
  scene.add(neon3);
  const neon4 = emissivePlane(8, 1.6, neonTexture('HIGH ROLLER', '#c59bff'), 2);
  neon4.position.set(w / 2 - 0.08, 4.6, 0); neon4.rotation.y = -Math.PI / 2;
  scene.add(neon4);

  scene.add(bar(-13, -12.4));

  /**
   * seats: lokale Sitz-/Stehplätze [[lx, lz], ...]; Figuren schauen zum lokalen Ursprung (bzw. `face`).
   */
  const addStation = (id, name, group, { x, z, rotY = 0, hit = [3, 2.6, 3], labelY = 2.9, seats = [[0, 1.5]], face = [0, 0], sit = true }) => {
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    scene.add(group);
    const cos = Math.cos(rotY); const sin = Math.sin(rotY);
    const worldSeats = seats.map(([lx, lz]) => {
      const [fx, fz] = typeof face === 'function' ? face(lx, lz) : face;
      return { x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos, ry: rotY + Math.atan2(lx - fx, lz - fz), sit };
    });
    const hitbox = new THREE.Mesh(new THREE.BoxGeometry(...hit), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hitbox.position.set(x, hit[1] / 2, z); hitbox.rotation.y = rotY;
    hitbox.userData.gameId = id;
    scene.add(hitbox);
    const label = textSprite(name, { size: 60, color: '#ffffff', bg: 'rgba(0,0,0,0.55)', height: 0.55 });
    label.position.set(x, labelY, z);
    scene.add(label);
    const ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(hit[0], hit[2]) * 0.55, Math.max(hit[0], hit[2]) * 0.55 + 0.12, 64), new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.03, z);
    scene.add(ring);
    const st = { id, name, group, hitbox, label, ring, position: new THREE.Vector3(x, 1, z), seats: worldSeats, radius: Math.max(hit[0], hit[2]) / 2, mount: null };
    stations.push(st);
    return st;
  };
  /** Montagepunkt für die Spielszene: type 'table' (auf der Platte, y nach oben) oder 'screen' (Bildschirm, +z zum Spieler) */
  const setMount = (st, { type, scale, object = null, offset = [0, 0, 0], hide = [], rotX = 0, pull = 0.3 }) => {
    st.mount = { type, scale, object, offset: new THREE.Vector3(...offset), hide, rotX, pull };
  };

  // Slot-Bank an der linken Wand
  const slotsGroup = new THREE.Group();
  const slotTex = SCREENS.slots();
  for (let i = 0; i < 6; i++) {
    const m = slotMachine(slotTex);
    m.position.z = (i - 2.5) * 1.15;
    m.rotation.y = Math.PI / 2;
    slotsGroup.add(m);
  }
  const slotsSt = addStation('slots', '🎰 Slots', slotsGroup, { x: -17.2, z: 0, hit: [3, 2.6, 7.5], labelY: 3.0, seats: [0, 1, 2, 3, 4, 5].map((i) => [0.95, (i - 2.5) * 1.15]), face: (lx, lz) => [0, lz] });
  // Walzen sitzen im Automaten; Bildschirm der Maschine ist Referenz (Index = Sitzplatz)
  setMount(slotsSt, { type: 'screen', scale: 0.1, object: (seatIndex) => slotsGroup.children[seatIndex].children[1], offset: [0, 0, -0.4] });
  animated.push((dt, t) => { slotsGroup.children.forEach((m, i) => { const s = m.children[1]; s.material.emissiveIntensity = 1.2 + Math.sin(t * 3 + i) * 0.4; }); });

  // Roulette
  const rl = gameTable({ shape: 'rect', w: 4.2, d: 2.0, felt: '#0f5a3a' });
  const mini = rouletteMini(); mini.position.set(-1.3, 0, 0);
  rl.add(mini);
  for (let i = 0; i < 3; i++) { const c = createChip([500, 2500, 10000][i]); c.position.set(0.4 + i * 0.5, 0.99, 0.3 - i * 0.2); rl.add(c); }
  for (let i = 0; i < 3; i++) rl.add(stool(-0.5 + i * 1.0, 1.5));
  const rlSt = addStation('roulette', '🎡 Roulette', rl, { x: -8, z: 4, hit: [5, 2.4, 3.6], seats: [[-0.5, 1.5], [0.5, 1.5], [1.5, 1.5]] });
  setMount(rlSt, { type: 'table', scale: 0.11, offset: [-0.6, 0.95, 0], hide: [mini], pull: 0 });
  animated.push((dt) => { mini.userData.spin.rotation.y += dt * 0.6; });

  // Blackjack
  const bj = gameTable({ shape: 'half', w: 4, d: 2.2, felt: '#0f5a3a' });
  for (let i = 0; i < 3; i++) { const c = createCard({ r: [1, 13, 10][i], s: 'SHD'[i] }); c.rotation.x = -Math.PI / 2; c.rotation.z = (i - 1) * 0.3; c.position.set((i - 1) * 0.7, 0.96, 0.9); c.scale.setScalar(0.6); bj.add(c); }
  const bjSeats = [0, 1, 2, 3].map((i) => { const a = -0.6 + i * 0.4; return [Math.sin(a) * 2.6, Math.cos(a) * 2.6 * 1.1 - 0.4]; });
  for (const [sx, sz] of bjSeats) bj.add(stool(sx, sz));
  const bjDeco = bj.children.filter((c) => c.userData.card);
  const bjSt = addStation('blackjack', '🃏 Blackjack', bj, { x: 0, z: 5.5, rotY: 0, hit: [4.6, 2.4, 4], seats: bjSeats });
  setMount(bjSt, { type: 'table', scale: 0.16, offset: [0, 0.95, 0.1], hide: bjDeco, pull: 0.45 });

  // Baccarat
  const bc = gameTable({ shape: 'oval', w: 4.4, d: 2.2, felt: '#5a1424' });
  for (let i = 0; i < 4; i++) { const c = createCard({ r: 2 + i * 3, s: 'CDHS'[i] }); c.rotation.x = -Math.PI / 2; c.position.set(-1.2 + i * 0.8, 0.96, 0); c.scale.setScalar(0.6); bc.add(c); }
  for (let i = 0; i < 3; i++) bc.add(stool(-1 + i, 1.7));
  const bcSt = addStation('baccarat', '🎴 Baccarat', bc, { x: 8, z: 4, hit: [5, 2.4, 3.8], seats: [[-1, 1.7], [0, 1.7], [1, 1.7]] });
  setMount(bcSt, { type: 'table', scale: 0.15, offset: [0, 0.95, 0], hide: bc.children.filter((c) => c.userData.card), pull: 0.35 });

  // Würfel (Craps-Tisch)
  const dc = gameTable({ shape: 'rect', w: 4.4, d: 2.0, felt: '#7a1b1b' });
  for (let i = 0; i < 3; i++) { const die = createDie(0.28); die.position.set(-0.6 + i * 0.5, 1.09, 0.2 - i * 0.15); die.rotation.set(0, i * 0.7, 0); dc.add(die); }
  for (let i = 0; i < 3; i++) dc.add(stool(-1 + i, 1.5));
  const dcSt = addStation('dice', '🎲 Würfel', dc, { x: -8, z: -5, hit: [5, 2.4, 3.6], seats: [[-1, 1.5], [0, 1.5], [1, 1.5]] });
  setMount(dcSt, { type: 'table', scale: 0.14, offset: [0, 0.95, 0], hide: dc.children.filter((c) => c.geometry?.type === 'BoxGeometry' && c.material?.length === 6) });

  // Hi-Lo
  const hl = gameTable({ shape: 'oval', w: 2.6, d: 1.8, felt: '#3b1d5c' });
  const hlCard = createCard({ r: 7, s: 'H' }); hlCard.rotation.x = -Math.PI / 2; hlCard.position.y = 0.96; hlCard.scale.setScalar(0.7); hl.add(hlCard);
  hl.add(stool(0, 1.4));
  const hlSt = addStation('hilo', '🔺 Hi-Lo', hl, { x: 8, z: -5, hit: [3.2, 2.4, 3.2], seats: [[0, 1.4], [-1.2, 0.8], [1.2, 0.8]] });
  setMount(hlSt, { type: 'table', scale: 0.16, offset: [0, 0.95, -0.1], hide: [hlCard], pull: 0.2 });

  // Glücksrad
  const fw = fortuneWheel();
  const fwSt = addStation('wheel', '🎯 Glücksrad', fw, { x: 0, z: -13.6, hit: [4, 4.3, 1.6], labelY: 4.5, seats: [[0, 2.2], [-1.2, 2.4], [1.2, 2.4]], sit: false });
  setMount(fwSt, { type: 'screen', scale: 0.34, object: () => fw.userData.spin, hide: [fw] });
  animated.push((dt) => { fw.userData.spin.rotation.z -= dt * 0.35; });

  // Automaten an der Rückwand
  const cab = { hit: [1.6, 2.4, 1.6], labelY: 2.6, seats: [[0, 1.2], [-0.8, 1.6], [0.8, 1.6]], sit: false };
  const screenOf = (cabGroup) => () => cabGroup.children[1];
  const crashCab = cabinet(SCREENS.crash(), 'CRASH', '#ff4d4d');
  setMount(addStation('crash', '🚀 Crash', crashCab, { x: -5.5, z: -13.9, ...cab }), { type: 'screen', scale: 0.07, object: screenOf(crashCab), offset: [0, -0.05, 0.02], hide: [crashCab.children[1]] });
  const plinkoCab = cabinet(SCREENS.plinko(), 'PLINKO', '#ff7ad9');
  setMount(addStation('plinko', '🔮 Plinko', plinkoCab, { x: 5.5, z: -13.9, ...cab }), { type: 'screen', scale: 0.06, object: screenOf(plinkoCab), offset: [0, 0.03, 0.02], hide: [plinkoCab.children[1]] });
  // Automaten an der rechten Wand
  const vpCab = cabinet(SCREENS.videopoker(), 'POKER', '#4d9cff');
  setMount(addStation('videopoker', '♠️ Video Poker', vpCab, { x: 19.3, z: 8, rotY: -Math.PI / 2, ...cab }), { type: 'screen', scale: 0.11, object: screenOf(vpCab), offset: [0, -0.12, 0.03], hide: [vpCab.children[1]] });
  const minesCab = cabinet(SCREENS.mines(), 'MINES', '#34e39a');
  setMount(addStation('mines', '💣 Mines', minesCab, { x: 19.3, z: 0, rotY: -Math.PI / 2, ...cab }), { type: 'screen', scale: 0.11, object: screenOf(minesCab), offset: [0, 0, 0.03], rotX: Math.PI / 2, hide: [minesCab.children[1]] });
  // Münzwurf-Podest in der Mitte
  const pd = pedestal();
  const pdSt = addStation('coinflip', '🪙 Münzwurf', pd, { x: 0, z: -3, hit: [1.8, 2.6, 1.8], labelY: 2.9, seats: [[0, 1.4], [-1.2, 0.7], [1.2, 0.7]], sit: false });
  setMount(pdSt, { type: 'table', scale: 0.14, offset: [0, 0.93, 0], hide: [pd.userData.spin], pull: 0 });

  // Marmor-Laufsteg vom Eingang zur Mitte, Samtkordeln, Pflanzen
  const marble = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 12), new THREE.MeshPhysicalMaterial({ color: 0xe9e4da, roughness: 0.18, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.1 }));
  marble.rotation.x = -Math.PI / 2; marble.position.set(0, 0.012, 9.5); marble.receiveShadow = true;
  scene.add(marble);
  const marbleTrim = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.02, 12.1), brass);
  marbleTrim.position.set(0, 0.003, 9.5);
  scene.add(marbleTrim);
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x8a1030, roughness: 0.85 });
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.0, 12), brass);
      post.position.set(side * 2.5, 0.5, 13.8 - i * 2.2);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.05, 16), brass);
      foot.position.set(side * 2.5, 0.025, 13.8 - i * 2.2);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), brass);
      knob.position.set(side * 2.5, 1.03, 13.8 - i * 2.2);
      scene.add(post, foot, knob);
      if (i < 3) {
        const rope = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.03, 8, 24, Math.PI * 0.55), ropeMat);
        rope.position.set(side * 2.5, 1.35, 12.7 - i * 2.2);
        rope.rotation.y = Math.PI / 2; rope.rotation.z = Math.PI + Math.PI * 0.225;
        scene.add(rope);
      }
    }
  }
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x1f6b3a, roughness: 0.8 });
  const potMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.6 });
  for (const [px, pz] of [[-18.5, 13], [18.5, 13], [-18.5, -13], [18.5, -13], [-6, 13.5], [6, 13.5]]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.6, 16), potMat);
    pot.position.set(px, 0.3, pz);
    scene.add(pot);
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 6), leafMat);
      leaf.position.set(px + Math.cos(i * 1.26) * 0.2, 1.2 + (i % 2) * 0.3, pz + Math.sin(i * 1.26) * 0.2);
      leaf.rotation.set(Math.cos(i) * 0.5, i, Math.sin(i) * 0.5);
      scene.add(leaf);
    }
  }
  // Wandleuchten
  const sconceMat = new THREE.MeshStandardMaterial({ color: 0xffe0b0, emissive: 0xffc070, emissiveIntensity: 2.4 });
  for (let x = -16; x <= 16; x += 8) {
    for (const z of [-d / 2 + 0.15, d / 2 - 0.15]) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), sconceMat);
      s.position.set(x, 3.4, z);
      const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.25, 12), brass);
      holder.position.set(x, 3.2, z);
      scene.add(s, holder);
    }
  }
  animated.push((dt, t) => { pd.userData.spin.rotation.y += dt * 2; pd.userData.spin.position.y = 1.5 + Math.sin(t * 2) * 0.1; });

  // Croupiers hinter den Tischen (Blickrichtung zu den Spielern)
  const DEALERS = [['blackjack', 'Croupier Max', 0, -1.7], ['baccarat', 'Croupier Lea', 0, -1.6], ['roulette', 'Croupier Tom', 0.6, -1.5], ['dice', 'Croupier Ana', 0, -1.5]];
  for (const [id, name, lx, lz] of DEALERS) {
    const st = stations.find((s) => s.id === id);
    if (!st) continue;
    const av = createAvatar({ name, dealer: true });
    av.position.set(st.group.position.x + lx, 0, st.group.position.z + lz);
    av.rotation.y = Math.PI; // schaut nach +z zu den Gästen
    scene.add(av);
    animated.push((dt, t) => av.userData.dealerStep(dt, t));
  }

  // Kamerapfad einmal durch die Halle
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 2.3, 13.5), new THREE.Vector3(-9, 2.4, 10), new THREE.Vector3(-13.5, 2.2, 0),
    new THREE.Vector3(-9, 2.5, -9), new THREE.Vector3(0, 2.6, -8), new THREE.Vector3(9, 2.4, -9),
    new THREE.Vector3(14, 2.2, 0), new THREE.Vector3(9, 2.5, 10),
  ], true, 'centripetal', 0.6);

  return { stations, animated, path, center: new THREE.Vector3(0, 1.2, 0) };
}
