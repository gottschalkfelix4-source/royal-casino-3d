import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Statisches Batching: unbewegliche Meshes mit demselben Material werden zu einem Mesh zusammengefasst
 * (Weltmatrix in die Geometrie gebacken). Senkt die Zahl der Draw-Calls der Halle um ein Vielfaches – das ist
 * die Voraussetzung dafür, dass Spiegelung, Umgebungsverdeckung (GTAO) und mehrere Schattenpässe je Frame
 * bezahlbar bleiben.
 *
 * Ausgenommen werden automatisch: transparente Materialien, Sprites, Instanzen, Multi-Material-Meshes,
 * Objekte mit userData.noBatch (auch geerbt von einem Elternobjekt), Objekte in `exclude`.
 * Der Aufrufer markiert alles, was sich bewegt oder später ein-/ausgeblendet wird, mit userData.noBatch = true.
 */
export function batchStatic(root, { exclude = new Set(), minGroup = 2 } = {}) {
  const groups = new Map();
  const excludedSet = new Set(exclude);
  const isExcluded = (obj) => {
    for (let o = obj; o; o = o.parent) if (o.userData?.noBatch || excludedSet.has(o)) return true;
    return false;
  };
  root.updateMatrixWorld(true);
  const candidates = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.isSprite || o.isBatchedMesh) return;
    if (!o.visible) return;
    const mat = o.material;
    if (!mat || Array.isArray(mat) || mat.transparent || mat.isShaderMaterial || mat.isRawShaderMaterial) return;
    // Materialien mit eigenem Shader-Programm (onBeforeCompile) oder ausdrücklichem Opt-out nicht bündeln
    if (mat.userData?.noBatch) return;
    if (mat.onBeforeCompile && mat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return;
    if (mat.customProgramCacheKey && mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey) return;
    const geo = o.geometry;
    if (!geo?.attributes?.position || geo.morphAttributes?.position?.length) return;
    if (isExcluded(o)) return;
    candidates.push(o);
  });
  for (const o of candidates) {
    const geo = o.geometry;
    const attrs = Object.keys(geo.attributes).sort().map((k) => `${k}:${geo.attributes[k].itemSize}`).join(',');
    const key = `${o.material.uuid}|${attrs}|${geo.index ? 'i' : 'n'}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${o.renderOrder}|${o.layers.mask}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  }
  const result = new THREE.Group();
  result.name = 'static-batches';
  let merged = 0; let removed = 0;
  for (const list of groups.values()) {
    if (list.length < minGroup) continue;
    // sehr große Gruppen in Blöcke teilen (Index-Grenze 2^32 ist fern, aber Frustum-Culling und
    // Sortierung profitieren von ein paar räumlichen Blöcken)
    const geos = [];
    for (const o of list) {
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      geos.push(g);
    }
    let mergedGeo;
    try { mergedGeo = mergeGeometries(geos, false); } catch { mergedGeo = null; }
    geos.forEach((g) => g.dispose());
    if (!mergedGeo) continue;
    const proto = list[0];
    const mesh = new THREE.Mesh(mergedGeo, proto.material);
    mesh.castShadow = proto.castShadow; mesh.receiveShadow = proto.receiveShadow;
    mesh.renderOrder = proto.renderOrder; mesh.layers.mask = proto.layers.mask;
    mesh.frustumCulled = true;
    mesh.userData.batched = list.length;
    result.add(mesh);
    for (const o of list) { o.parent?.remove(o); removed++; }
    merged++;
  }
  root.add(result);
  return { group: result, meshes: merged, removed };
}
