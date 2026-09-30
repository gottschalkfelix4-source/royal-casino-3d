import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { halfTableGeometry, tableRailGeometry, chairBackGeometry } from '../public/js/three/upholstery.js';

test('non-square half table keeps requested width, height and player-facing depth', () => {
  const geo = halfTableGeometry(3.6, 1.1, 0.1);
  geo.computeBoundingBox(); const box = geo.boundingBox;
  assert.ok(Math.abs(box.min.x + 1.8) < 1e-6);
  assert.ok(Math.abs(box.max.x - 1.8) < 1e-6);
  assert.ok(Math.abs(box.min.z) < 1e-6);
  assert.ok(Math.abs(box.max.z - 1.1) < 1e-6);
  assert.ok(Math.abs(box.max.y - box.min.y - 0.1) < 1e-6);
  geo.dispose();
});

test('every rail cross-section keeps its radius and closes without a seam', () => {
  for (const kind of ['rect', 'half', 'oval']) {
    const geo = tableRailGeometry(kind, 8, 1.2);
    const points = geo.attributes.position, normals = geo.attributes.normal;
    const ringSize = 13, ring = [], center = new THREE.Vector3(), first = new THREE.Vector3();
    for (let i = 0; i < points.count; i += ringSize) {
      ring.length = 0; center.set(0, 0, 0);
      for (let j = 0; j < ringSize - 1; j++) {
        const p = new THREE.Vector3().fromBufferAttribute(points, i + j);
        ring.push(p); center.add(p);
        assert.ok(Math.abs(new THREE.Vector3().fromBufferAttribute(normals, i + j).length() - 1) < 1e-6);
      }
      center.divideScalar(ring.length);
      for (const p of ring) assert.ok(Math.abs(p.distanceTo(center) - 0.09) < 1e-6, kind);
    }
    for (let j = 0; j < ringSize; j++) {
      first.fromBufferAttribute(points, j);
      assert.ok(first.distanceTo(new THREE.Vector3().fromBufferAttribute(points, points.count - ringSize + j)) < 1e-6);
    }
    geo.dispose();
  }
});

test('padded chair back has visible inner, outer and top surfaces with outward normals', () => {
  const geo = chairBackGeometry(); geo.computeBoundingBox();
  assert.ok(Math.abs(geo.boundingBox.max.y - geo.boundingBox.min.y - 0.3) < 1e-6);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  mesh.updateMatrixWorld();
  for (const [origin, direction] of [
    [[0, 0, 0], [0, 0, 1]], [[0, 0, 0.6], [0, 0, -1]], [[0, 0.5, 0.25], [0, -1, 0]],
  ]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction));
    assert.ok(ray.intersectObject(mesh).length > 0);
  }
  for (const value of geo.attributes.normal.array) assert.ok(Number.isFinite(value));
  mesh.material.dispose(); geo.dispose();
});
