import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Merge compatible fixed batches into larger spatial cells without changing their surfaces. */
export function mergeStaticDraws(root, cellSize = 16) {
  root.updateWorldMatrix(true, true);
  const groups = new Map(), inverse = root.matrixWorld.clone().invert(), center = new THREE.Vector3();
  for (const object of root.children) {
    if (!object.isMesh || object.isBatchedMesh || Array.isArray(object.material) || !object.visible) continue;
    if (object.material.transparent || object.geometry.morphAttributes.position?.length || object.instanceColor) continue;
    object.computeBoundingSphere?.(); object.geometry.computeBoundingSphere();
    center.copy(object.boundingSphere?.center ?? object.geometry.boundingSphere.center).applyMatrix4(object.matrixWorld).applyMatrix4(inverse);
    const cell = `${Math.floor(center.x / cellSize)},${Math.floor(center.z / cellSize)}`;
    const attributes = Object.entries(object.geometry.attributes).map(([name, a]) => `${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`).sort().join('|');
    const key = `${cell}:${object.material.id}:${attributes}:${!!object.geometry.index}:${object.castShadow}:${object.receiveShadow}:${object.layers.mask}:${object.renderOrder}`;
    const list = groups.get(key) ?? []; list.push(object); groups.set(key, list);
  }
  let removed = 0;
  const matrix = new THREE.Matrix4(), transform = new THREE.Matrix4();
  for (const objects of groups.values()) {
    if (objects.length < 2) continue;
    const parts = [];
    for (const object of objects) {
      transform.multiplyMatrices(inverse, object.matrixWorld);
      for (let i = 0; i < (object.isInstancedMesh ? object.count : 1); i++) {
        if (object.isInstancedMesh) { object.getMatrixAt(i, matrix); matrix.premultiply(transform); }
        else matrix.copy(transform);
        parts.push(object.geometry.clone().applyMatrix4(matrix));
      }
    }
    const geometry = mergeGeometries(parts, false); parts.forEach(g => g.dispose());
    if (!geometry) continue;
    const first = objects[0], mesh = new THREE.Mesh(geometry, first.material);
    mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow;
    mesh.layers.mask = first.layers.mask; mesh.renderOrder = first.renderOrder;
    geometry.computeBoundingSphere(); geometry.computeBoundingBox();
    for (const object of objects) { root.remove(object); if (object.isInstancedMesh) object.dispose(); removed++; }
    root.add(mesh);
  }
  return removed;
}
