import * as THREE from 'three';

/** Soft illustrated surfaces, evaluated inside the existing PBR draw.
 * Keep authored maps, material hooks and batching identities; sprites/basic screens stay unaltered.
 * Install once before any renderer compiles programs. No extra outline or fullscreen pass.
 */
export function installGraphicStyle() {
  const chunks = THREE.ShaderChunk;
  if (chunks.lights_physical_fragment.includes('casinoIllustratedSurface')) return;
  // Runs after texture sampling AND card/chip face selection, so every surface gets the same finish.
  chunks.lights_physical_fragment = /* glsl */`
    // casinoIllustratedSurface: broader highlights and a little more diffuse colour on metals.
    roughnessFactor = max(roughnessFactor, 0.58);
    metalnessFactor *= 0.68;
    float casinoLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    diffuseColor.rgb = clamp(mix(vec3(casinoLuma), diffuseColor.rgb, 1.08), 0.0, 1.0);
  ` + chunks.lights_physical_fragment
    .replace('material.clearcoat = saturate( material.clearcoat );',
      'material.clearcoat = 0.25 * saturate( material.clearcoat );')
    .replace('max( material.clearcoatRoughness, 0.0525 )',
      'max( material.clearcoatRoughness, 0.42 )');
  // Retain fabric/wood/marble relief, with less tiny moving highlight noise.
  chunks.normal_fragment_maps = chunks.normal_fragment_maps.replace('mapN.xy *= normalScale;',
    `mapN.xy *= normalScale;
     #ifdef STANDARD
       mapN.xy *= 0.55;
     #endif`);
}
