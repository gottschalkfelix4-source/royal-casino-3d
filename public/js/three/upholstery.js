import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

/** Furniture outlines in world-sized metres, so padding stays equally thick on long tables. */
export function tableOutline(kind, width, depth) {
  const path = new THREE.Path();
  const x = width / 2, z = kind === 'half' ? depth : depth / 2;
  if (kind === 'oval') {
    path.absellipse(0, 0, x, z, 0, Math.PI * 2, false);
  } else if (kind === 'half') {
    const r = Math.min(0.12, x / 4, z / 4), a = Math.asin(r / z);
    path.moveTo(x - r, 0);
    path.quadraticCurveTo(x, 0, x * Math.cos(a), r);
    path.absellipse(0, 0, x, z, a, Math.PI - a, false);
    path.quadraticCurveTo(-x, 0, -x + r, 0);
    path.lineTo(x - r, 0);
  } else {
    const r = Math.min(0.14, x / 3, z / 3);
    path.moveTo(x - r, -z);
    path.absarc(x - r, -z + r, r, -Math.PI / 2, 0);
    path.lineTo(x, z - r);
    path.absarc(x - r, z - r, r, 0, Math.PI / 2);
    path.lineTo(-x + r, z);
    path.absarc(-x + r, z - r, r, Math.PI / 2, Math.PI);
    path.lineTo(-x, -z + r);
    path.absarc(-x + r, -z + r, r, Math.PI, Math.PI * 1.5);
    path.lineTo(x - r, -z);
  }
  return path;
}

class HorizontalPath extends THREE.Curve {
  constructor(path) { super(); this.path = path; this.arcLengthDivisions = 512; }
  getPoint(t, out = new THREE.Vector3()) {
    const p = this.path.getPoint(t);
    return out.set(p.x, 0, p.y);
  }
}

export function tableRailGeometry(kind, width, depth, radius = 0.09) {
  return new THREE.TubeGeometry(new HorizontalPath(tableOutline(kind, width, depth)), 128, radius, radius < 0.03 ? 8 : 12, true);
}

/** A closed, padded shell: inside, outside, end caps and small rounded bevels. */
export function chairBackGeometry() {
  const shape = new THREE.Shape();
  const start = Math.PI * 0.1, end = Math.PI * 0.9;
  shape.absarc(0, 0, 0.266, start, end, false);
  shape.absarc(0, 0, 0.234, end, start, true);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.27, steps: 1, bevelEnabled: true,
    bevelSize: 0.009, bevelThickness: 0.015, bevelSegments: 3, curveSegments: 20,
  });
  geo.rotateX(Math.PI / 2); geo.translate(0, 0.135, 0);
  // ExtrudeGeometry duplicates vertices; smooth only the adjacent bevel/arc faces.
  return toCreasedNormals(geo, Math.PI / 3);
}

/** Rotate before scaling: a half cylinder otherwise swaps table width and depth. */
export function halfTableGeometry(width, depth, height, lowerScale = 1) {
  return new THREE.CylinderGeometry(1, lowerScale, height, 72, 1, false, 0, Math.PI)
    .rotateY(-Math.PI / 2).scale(width / 2, 1, depth);
}
