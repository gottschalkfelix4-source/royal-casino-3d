import * as THREE from 'three';

/** Install before creating a renderer. Keep material hooks and batching identities untouched. */
export function installLightingShader() {
  const source = THREE.ShaderChunk.lights_physical_pars_fragment;
  if (source.includes('casinoZeroLight')) return;
  THREE.ShaderChunk.lights_physical_pars_fragment = source.replace(
    /(void RE_Direct_Physical\s*\([\s\S]*?inout ReflectedLight reflectedLight\s*\)\s*\{)/,
    `$1
      // casinoZeroLight: every direct-light lobe contributes exactly zero here.
      if (!directLight.visible || (dot(geometryNormal, directLight.direction) <= 0.0
        && dot(geometryClearcoatNormal, directLight.direction) <= 0.0)) return;`);
}
