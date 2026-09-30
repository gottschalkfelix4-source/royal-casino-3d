import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Statisches Batching: unbewegliche Meshes mit demselben Material werden zu einem Mesh zusammengefasst
 * (Weltmatrix in die Geometrie gebacken). Senkt die Zahl der Draw-Calls der Halle um ein Vielfaches – das ist
 * die Voraussetzung dafür, dass Spiegelung, Umgebungsverdeckung (GTAO) und mehrere Schattenpässe je Frame
 * bezahlbar bleiben.
 *
 * Ausgenommen werden automatisch: transparente Materialien, Sprites,
 * Objekte mit userData.noBatch (auch geerbt von einem Elternobjekt), Objekte in `exclude`.
 * Der Aufrufer markiert alles, was sich bewegt oder später ein-/ausgeblendet wird, mit userData.noBatch = true.
 */
export function batchStatic(root, { exclude = new Set(), minGroup = 2, cellSize = 8, local = false } = {}) {
  const groups = new Map();
  const materialKeys = new Map();
  const materialKey = (m) => {
    if (!materialKeys.has(m)) {
      const properties = {};
      for (const key of Object.keys(m).sort()) {
        if (['id', 'uuid', 'name', 'userData', 'version', '_listeners'].includes(key)) continue;
        const v = m[key];
        if (v === null || ['number', 'string', 'boolean'].includes(typeof v)) properties[key] = v;
        else if (v?.isTexture) properties[key] = v.uuid;
        else if (v?.isColor || v?.isVector2 || v?.isVector3) properties[key] = v.toArray();
      }
      materialKeys.set(m, JSON.stringify(properties));
    }
    return materialKeys.get(m);
  };
  const excludedSet = new Set(exclude);
  const isExcluded = (obj) => {
    for (let o = obj; o; o = o.parent) {
      if (!(local && o === root) && (o.userData?.noBatch || excludedSet.has(o))) return true;
      if (local && o === root) break;
    }
    return false;
  };
  root.updateMatrixWorld(true);
  const candidates = [];
  const origin = new THREE.Vector3();
  const rootInverse = root.matrixWorld.clone().invert();
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || o.isSprite || o.isBatchedMesh) return;
    if (!o.visible) return;
    const mat = o.material;
    const materials = Array.isArray(mat) ? mat : [mat];
    if (materials.some((m) => !m || m.transparent || m.isShaderMaterial || m.isRawShaderMaterial)) return;
    // Materialien mit eigenem Shader-Programm (onBeforeCompile) oder ausdrücklichem Opt-out nicht bündeln
    if (materials.some((m) => m.userData?.noBatch ||
      m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile ||
      m.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey)) return;
    if (o.isInstancedMesh && (o.instanceColor || o.morphTexture)) return;
    const geo = o.geometry;
    if (!geo?.attributes?.position || geo.morphAttributes?.position?.length) return;
    if (isExcluded(o)) return;
    candidates.push(o);
  });
  for (const o of candidates) {
    const geo = o.geometry;
    const attrs = Object.keys(geo.attributes).sort().map((k) => `${k}:${geo.attributes[k].itemSize}`).join(',');
    origin.setFromMatrixPosition(o.matrixWorld);
    const cell = `${Math.floor(origin.x / cellSize)},${Math.floor(origin.z / cellSize)}`;
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    const key = `${cell}|${materials.map(materialKey).join(';')}|${attrs}|${geo.index ? 'i' : 'n'}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${o.renderOrder}|${o.layers.mask}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  }
  const result = new THREE.Group();
  result.name = 'static-batches';
  let merged = 0; let removed = 0;
  for (const list of groups.values()) {
    if (list.length < minGroup) continue;
    // Repeated cached shapes become instances; the rest is merged within a spatial cell.
    const byGeometry = new Map();
    for (const o of list) {
      const bucket = byGeometry.get(o.geometry) ?? [];
      bucket.push(o); byGeometry.set(o.geometry, bucket);
    }
    const remaining = [];
    for (const [geometry, objects] of byGeometry) {
      if (objects.length < 3 && !objects.some((o) => o.isInstancedMesh)) { remaining.push(...objects); continue; }
      if (objects.length < 2) continue;
      const first = objects[0];
      const count = objects.reduce((sum, o) => sum + (o.isInstancedMesh ? o.count : 1), 0);
      const inst = new THREE.InstancedMesh(geometry, first.material, count);
      inst.castShadow = first.castShadow; inst.receiveShadow = first.receiveShadow;
      inst.layers.mask = first.layers.mask; inst.renderOrder = first.renderOrder;
      const local = new THREE.Matrix4();
      const world = new THREE.Matrix4();
      let index = 0;
      for (const o of objects) {
        world.multiplyMatrices(rootInverse, o.matrixWorld);
        if (o.isInstancedMesh) {
          for (let i = 0; i < o.count; i++) {
            o.getMatrixAt(i, local);
            inst.setMatrixAt(index++, local.premultiply(world));
          }
        } else inst.setMatrixAt(index++, world);
      }
      inst.computeBoundingBox(); inst.computeBoundingSphere();
      inst.userData.batched = objects.length;
      result.add(inst);
      objects.forEach((o) => { o.parent?.remove(o); if (o.isInstancedMesh) o.dispose(); removed++; });
      merged++;
    }
    // Geometry groups on cards/chips must survive; only identical shapes may be instanced.
    if (remaining.length < minGroup || Array.isArray(remaining[0].material)) continue;
    const geos = [];
    for (const o of remaining) {
      const g = o.geometry.clone();
      g.applyMatrix4(rootInverse.clone().multiply(o.matrixWorld));
      geos.push(g);
    }
    let mergedGeo;
    try { mergedGeo = mergeGeometries(geos, false); } catch { mergedGeo = null; }
    geos.forEach((g) => g.dispose());
    if (!mergedGeo) continue;
    const proto = remaining[0];
    const mesh = new THREE.Mesh(mergedGeo, proto.material);
    mesh.castShadow = proto.castShadow; mesh.receiveShadow = proto.receiveShadow;
    mesh.renderOrder = proto.renderOrder; mesh.layers.mask = proto.layers.mask;
    mesh.frustumCulled = true;
    mesh.userData.batched = remaining.length;
    result.add(mesh);
    for (const o of remaining) { o.parent?.remove(o); removed++; }
    merged++;
  }
  root.add(result);
  return { group: result, meshes: merged, removed };
}

/** Cache transforms of fixed furniture; animated branches and their descendants remain writable. */
export function freezeStaticTransforms(root) {
  root.updateMatrixWorld(true);
  let frozen = 0;
  const visit = (object, dynamic) => {
    dynamic ||= !!object.userData.noBatch || object.isBone || object.isSkinnedMesh || object.isLOD;
    if (object !== root && !dynamic) {
      object.matrixAutoUpdate = false;
      object.matrixWorldAutoUpdate = false;
      frozen++;
    }
    for (const child of object.children) visit(child, dynamic);
  };
  visit(root, false);
  return frozen;
}
