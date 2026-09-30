/** Release only resources owned by this object; cached assets live for the application lifetime. */
export function disposeObject(root) {
  root.parent?.remove(root);
  const resources = new Set();
  root.traverse((object) => {
    if (object.geometry && !object.geometry.userData.shared) resources.add(object.geometry);
    if (object.skeleton) resources.add(object.skeleton);
    if (object.isInstancedMesh) resources.add(object);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material || material.userData.shared) continue;
      for (const value of Object.values(material)) {
        if (value?.isTexture && !value.userData.keep) resources.add(value);
      }
      resources.add(material);
    }
  });
  for (const resource of resources) resource.dispose();
}
