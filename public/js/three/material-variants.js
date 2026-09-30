/** Features that make Three select a different shader program for the same material. */
export function materialVariantKey(object, material) {
  const geometry = object.geometry;
  const morph = geometry.morphAttributes;
  const count = (morph.position ?? morph.normal ?? morph.color)?.length ?? 0;
  return [!!object.isInstancedMesh, !!object.instanceColor, !!object.morphTexture,
    !!object.isSkinnedMesh, !!object.isBatchedMesh, !!object.colorTexture,
    !!morph.position, !!morph.normal, !!morph.color, count,
    material.vertexColors && geometry.attributes.color?.itemSize === 4,
    !!geometry.attributes.tangent && (!!material.normalMap || material.anisotropy > 0)].join(':');
}

/** Fixed shared materials get one state cache per shader variant; textures remain shared. */
export function splitSharedMaterialVariants(root) {
  const variants = new Map();
  let count = 0;
  root.traverse(object => {
    if (!object.isMesh) return;
    const split = material => {
      // Mutable avatar/game materials must retain their owners' references.
      if (!material.userData.shared || material.userData.noBatch) return material;
      let cache = variants.get(material);
      if (!cache) { cache = new Map(); variants.set(material, cache); }
      const key = materialVariantKey(object, material);
      if (!cache.has(key)) {
        const variant = cache.size ? material.clone() : material;
        if (variant !== material) { variant.userData.shared = false; count++; }
        cache.set(key, variant);
      }
      return cache.get(key);
    };
    object.material = Array.isArray(object.material) ? object.material.map(split) : split(object.material);
  });
  return count;
}
