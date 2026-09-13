import * as THREE from 'three';
import { cabinet } from '../furniture.js';
import { makeCanvas, canvasTexture } from '../assets.js';

function screenTexture() {
  const { canvas, ctx } = makeCanvas(512, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#2a1d05'); g.addColorStop(1, '#0d0902');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 8; ctx.strokeRect(20, 20, 472, 472);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f5d97a'; ctx.font = '900 64px Cinzel, Georgia, serif';
  ctx.fillText('RUBBELLOS', 256, 90);
  ctx.font = `120px "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.fillText('🎫', 256, 265);
  ctx.fillStyle = '#ffffff'; ctx.font = '700 34px Inter, Arial';
  ctx.fillText('DREI GLEICHE GEWINNEN', 256, 420);
  return canvasTexture(canvas);
}

/** Rubbellos-Automat: Arcade-Gehäuse; das Los wird als Bildschirmfläche gerendert. */
export function buildScratchStation() {
  const cab = cabinet(screenTexture(), 'RUBBELLOS', '#c9a227');

  cab.userData.hit = [1.7, 2.5, 1.7];
  cab.userData.labelY = 3.05;
  cab.userData.seats = [[0, 1.25], [-0.8, 1.3], [0.8, 1.3]];
  cab.userData.sit = false;
  cab.userData.mount = {
    type: 'screen', scale: 0.11,
    object: () => cab.userData.bezel, offset: [0, -0.05, 0.04],
    hide: [cab.userData.screen, cab.userData.glass],
    cabinetCam: true,
  };
  return cab;
}
