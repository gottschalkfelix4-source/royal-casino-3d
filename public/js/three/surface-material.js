import * as THREE from 'three';

/** Select authored surface textures in one draw; retain each face's roughness and original UVs. */
export function surfaceMaterial(textures, roughness, { roughnessMap = null, edgeColor = null } = {}) {
  const material = new THREE.MeshStandardMaterial({ map: textures[0], roughness: 1, roughnessMap });
  const edge = new THREE.Color(edgeColor ?? 0xffffff);
  material.onBeforeCompile = shader => {
    shader.uniforms.surfaceTexture1 = { value: textures[1] };
    shader.uniforms.surfaceTexture2 = { value: textures[2] ?? textures[1] };
    shader.uniforms.surfaceEdgeColor = { value: edge };
    shader.uniforms.surfaceRoughness = { value: new THREE.Vector3(...roughness) };
    shader.vertexShader = 'attribute float surfaceIndex;\nvarying float vSurfaceIndex;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('void main() {', 'void main() {\nvSurfaceIndex = surfaceIndex;');
    shader.fragmentShader = `varying float vSurfaceIndex;
      uniform sampler2D surfaceTexture1;
      uniform sampler2D surfaceTexture2;
      uniform vec3 surfaceEdgeColor;
      uniform vec3 surfaceRoughness;\n` + shader.fragmentShader;
    const firstSample = edgeColor === null ? 'texture2D(map, vMapUv)' : 'vec4(surfaceEdgeColor, 1.0)';
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
      `diffuseColor *= vSurfaceIndex < 0.5 ? ${firstSample} : vSurfaceIndex < 1.5
        ? texture2D(${edgeColor === null ? 'surfaceTexture1' : 'map'}, vMapUv) : texture2D(surfaceTexture2, vMapUv);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
       roughnessFactor *= vSurfaceIndex < 0.5 ? surfaceRoughness.x : vSurfaceIndex < 1.5 ? surfaceRoughness.y : surfaceRoughness.z;`);
  };
  material.customProgramCacheKey = () => `surface-material:${edgeColor === null ? 'textures' : 'card'}`;
  return material;
}
