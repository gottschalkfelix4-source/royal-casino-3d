import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const WORLD_LAYER = 0;
export const LABEL_LAYER = 1;
export const PICK_LAYER = 2;
export const AO_LAYER = 3;

/** AO needs positions/normals, not the hundreds of separate furniture materials. */
export function buildStaticAO(root, cellSize = 8) {
  root.updateWorldMatrix(true, true);
  const group = new THREE.Group();
  group.name = 'static-ao';
  group.userData.aoOnly = true;
  const sources = new Set(), cells = new Map();
  const center = new THREE.Vector3(), transform = new THREE.Matrix4();
  for (const object of root.children) {
    if (!object.isMesh || !object.visible || !contributesToAO(object) || !object.layers.isEnabled(WORLD_LAYER)) continue;
    const source = object.geometry;
    if (!source.attributes.normal || source.morphAttributes.position?.length) continue;
    object.computeBoundingSphere?.();
    source.computeBoundingSphere();
    center.copy(object.boundingSphere?.center ?? source.boundingSphere.center).applyMatrix4(object.matrixWorld);
    const key = `${Math.floor(center.x / cellSize)},${Math.floor(center.z / cellSize)}`;
    const geometries = cells.get(key) ?? [];
    const count = object.isInstancedMesh ? object.count : 1;
    for (let i = 0; i < count; i++) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', source.attributes.position.clone());
      geometry.setAttribute('normal', source.attributes.normal.clone());
      if (source.index) geometry.setIndex(source.index.clone());
      // Match the original indexed/nonindexed topology, without material groups or UV attributes.
      if (object.isInstancedMesh) { object.getMatrixAt(i, transform); transform.premultiply(object.matrixWorld); }
      else transform.copy(object.matrixWorld);
      geometry.applyMatrix4(transform);
      geometries.push(geometry);
    }
    cells.set(key, geometries);
    sources.add(object);
  }
  const material = new THREE.MeshNormalMaterial();
  for (const geometries of cells.values()) {
    // Some authored shapes are nonindexed; merge each format separately to retain exact triangles.
    for (const indexed of [true, false]) {
      const compatible = geometries.filter((g) => !!g.index === indexed);
      if (!compatible.length) continue;
      const geometry = mergeGeometries(compatible, false);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.layers.set(AO_LAYER);
      group.add(mesh);
    }
    geometries.forEach((g) => g.dispose());
  }
  if (!group.children.length) material.dispose();
  return { group, sources };
}

export function contributesToAO(object) {
  if (object.isSprite || object.isPoints || object.isLine || object.userData.excludeAO) return false;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  // Blended glass, interaction proxies and cutout foliage must not become opaque rectangles.
  // Foliage receives material/lighting shading; it deliberately does not occlude the room in GTAO.
  return !materials.some((m) => m && (m.transparent || m.opacity < 1 || m.alphaTest > 0));
}

export class WorldAOPass extends GTAOPass {
  constructor(scene, camera, scale = 0.5) {
    super(scene, camera, 1, 1, undefined,
      { radius: 0.28, distanceExponent: 1.5, thickness: 0.35, scale: 1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false },
      { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 3, radiusExponent: 1, rings: 2, samples: 12 });
    this.resolutionScale = scale;
    this.blendIntensity = 0.65;
    this.staticSources = new Set();
  }

  setSize(width, height) {
    super.setSize(Math.max(1, Math.round(width * (this.resolutionScale ?? 0.5))),
      Math.max(1, Math.round(height * (this.resolutionScale ?? 0.5))));
  }

  _overrideVisibility() {
    this.scene.traverse((object) => {
      if (object.visible && (this.staticSources.has(object) || !contributesToAO(object))) {
        object.visible = false;
        this._visibilityCache.push(object);
      }
    });
  }

  render(...args) {
    const previous = this.scene.overrideMaterial;
    const layers = this.camera.layers.mask;
    this.camera.layers.enable(AO_LAYER);
    try { super.render(...args); }
    finally {
      this._restoreVisibility(); this.scene.overrideMaterial = previous;
      this.camera.layers.mask = layers;
    }
  }
}
