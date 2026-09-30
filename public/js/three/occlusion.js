import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

export const WORLD_LAYER = 0;
export const LABEL_LAYER = 1;
export const PICK_LAYER = 2;

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
  }

  setSize(width, height) {
    super.setSize(Math.max(1, Math.round(width * (this.resolutionScale ?? 0.5))),
      Math.max(1, Math.round(height * (this.resolutionScale ?? 0.5))));
  }

  _overrideVisibility() {
    this.scene.traverse((object) => {
      if (object.visible && !contributesToAO(object)) {
        object.visible = false;
        this._visibilityCache.push(object);
      }
    });
  }

  render(...args) {
    const previous = this.scene.overrideMaterial;
    try { super.render(...args); }
    finally { this._restoreVisibility(); this.scene.overrideMaterial = previous; }
  }
}
