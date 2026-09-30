import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { trackTexture, getTextureAnisotropy } from './materialmaps.js';

const models = new Map();
const textures = new Map();
let pending;
export const CHARACTER_VARIANTS = ['man', 'man-dark', 'woman'];

/** Local CC0 models, downloaded once. Scene clones share meshes and textures, never skeletons. */
export function preloadCharacters() {
  if (!pending) pending = Promise.allSettled(CHARACTER_VARIANTS.map(async name => {
    const gltf = await new GLTFLoader().loadAsync(`/assets/characters/${name}.glb`);
    gltf.scene.traverse(object => {
      if (!object.isMesh) return;
      object.geometry.userData.shared = true;
      const material = object.material;
      material.userData.shared = true;
      material.envMapIntensity = material.name === 'Eyes' ? 0.65 : 0.38;
      material.alphaToCoverage = material.alphaTest > 0;
      for (const [slot, value] of Object.entries(material)) {
        if (!value?.isTexture) continue;
        const association = gltf.parser.associations.get(value);
        const definition = gltf.parser.json.textures[association?.textures];
        const uri = gltf.parser.json.images[definition?.source]?.uri;
        const key = `${uri}:${value.colorSpace}`;
        if (uri && textures.has(key) && textures.get(key) !== value) {
          material[slot] = textures.get(key); value.dispose();
        } else {
          value.userData.keep = true; value.anisotropy = getTextureAnisotropy();
          trackTexture(value); if (uri) textures.set(key, value);
        }
      }
    });
    const root=gltf.scene.getObjectByName('Human');
    const lod=new THREE.LOD(), near=new THREE.Group(), far=new THREE.Group();
    for(const child of [...root.children])if(child.isMesh)(child.userData.lod===1?far:near).add(child);
    lod.addLevel(near,0);lod.addLevel(far,11,0.16);root.add(lod);
    models.set(name, gltf.scene);
  })).then(results => {
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length) console.warn('Einige Figuren konnten nicht geladen werden.', failures.map(r => String(r.reason)));
    return { available: models.size, failed: failures.length };
  });
  return pending;
}

export function instantiateCharacter(variant) {
  const template = models.get(variant) ?? models.values().next().value;
  if (!template) return null;
  const model = clone(template);
  const materials = new Map();
  let skeleton;
  model.traverse(object => {
    if (!object.isMesh) return;
    if (!materials.has(object.material)) {
      const own = object.material.clone(); own.userData.shared = false;
      materials.set(object.material, own);
    }
    object.material = materials.get(object.material);
    if(object.isSkinnedMesh) {
      if(!skeleton)skeleton=object.skeleton;
      else if(object.skeleton!==skeleton){object.skeleton.dispose();object.skeleton=skeleton;}
    }
    object.castShadow = object.material.alphaTest === 0;
    object.receiveShadow = true;
    // Includes seated poses and a full arm reach, without CPU skinning for bounds every frame.
    object.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, -0.1), 1.25);
  });
  return model;
}
