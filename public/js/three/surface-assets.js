import * as THREE from 'three';
import { trackTexture, getTextureAnisotropy } from './materialmaps.js';

// Local CC0 assets: no third-party requests at runtime. Shared for the app lifetime.
const cache = new Map();
const pending = [];
const loader = new THREE.TextureLoader();
const files = {
  marble: ['marble_01_Diffuse.jpg', 'marble_01_Rough.jpg', 'marble_01_nor_gl.jpg'],
  wood: ['wood_table_001_Diffuse.jpg', 'wood_table_001_Rough.jpg', 'wood_table_001_nor_gl.jpg'],
  leather: ['leather_red_02_coll1.jpg', 'leather_red_02_Rough.jpg', 'leather_red_02_nor_gl.jpg'],
  fabric: [null, 'fabric_pattern_07_Rough.jpg', 'fabric_pattern_07_nor_gl.jpg'],
};
export function surfaceAsset(name, repeat = [1, 1]) {
  const key = `${name}:${repeat}`;
  if (cache.has(key)) return cache.get(key);
  const maps = {};
  files[name].forEach((file, i) => {
    if (!file) return;
    let resolve;
    pending.push(new Promise((done) => { resolve = done; }));
    const texture = loader.load(`/assets/materials/${file}`, resolve, undefined, () => {
      // A neutral fallback also makes offline/failed loads deterministic.
      const data = i === 2 ? [128, 128, 255, 255] : [220, 220, 220, 255];
      texture.image = { data: new Uint8Array(data), width: 1, height: 1 };
      texture.isDataTexture = true; texture.needsUpdate = true; resolve();
    });
    texture.colorSpace = i === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...repeat);
    texture.anisotropy = getTextureAnisotropy();
    texture.userData.keep = true;
    maps[['map', 'roughnessMap', 'normalMap'][i]] = trackTexture(texture);
  });
  cache.set(key, maps);
  return maps;
}
export function preloadMaterials() {
  surfaceAsset('marble', [8, 6]); surfaceAsset('wood', [2, 2]);
  surfaceAsset('leather', [3, 3]); surfaceAsset('fabric', [6, 6]);
  return Promise.all(pending);
}
