import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * Kleiner Abschluss-Pass nach dem Bloom: dezente Vignette, feines Filmkorn und optional eine sehr schwache
 * chromatische Aberration. Läuft in linearem HDR vor `OutputPass`, ist also günstig und für alle
 * Qualitätsstufen mit Nachbearbeitung geeignet.
 */
export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignette: { value: 0.55 },
    grain: { value: 0.022 },
    aberration: { value: 0.0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float vignette;
    uniform float grain;
    uniform float aberration;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec2 dir = vUv - 0.5;
      vec3 col;
      if (aberration > 0.0) {
        vec2 ca = dir * aberration * dot(dir, dir);
        col.r = texture2D(tDiffuse, vUv - ca).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, vUv + ca).b;
      } else {
        col = texture2D(tDiffuse, vUv).rgb;
      }
      float v = 1.0 - vignette * smoothstep(0.25, 0.9, length(dir) * 1.35);
      col *= clamp(v, 0.0, 1.0);
      float n = hash(vUv * vec2(1920.0, 1080.0) + fract(time) * 100.0) - 0.5;
      col += n * grain;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createGradePass({ vignette = 0.55, grain = 0.022, aberration = 0.0 } = {}) {
  const pass = new ShaderPass(GradeShader);
  pass.uniforms.vignette.value = vignette;
  pass.uniforms.grain.value = grain;
  pass.uniforms.aberration.value = aberration;
  return pass;
}

export const disposeGradePass = (pass) => pass?.dispose?.();