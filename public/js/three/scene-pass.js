import * as THREE from 'three';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';

/** MSAA belongs to geometry coverage, not every subsequent fullscreen effect. */
export class ScenePass extends RenderPass {
  constructor(scene, camera, samples, withDepth) {
    super(scene, camera);
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, samples,
      ...(withDepth ? { depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType) } : {}),
    });
    this.copy = new ShaderPass(CopyShader);
    this.copy.material.blending = THREE.NoBlending;
    this.consumer = null;
  }

  setSize(width, height) { this.target.setSize(width, height); }

  render(renderer, writeBuffer, readBuffer) {
    super.render(renderer, writeBuffer, this.target);
    // AO can consume the resolved scene directly. Other configurations need one colour copy.
    if (!this.consumer?.enabled) this.copy.render(renderer, readBuffer, this.target);
  }

  dispose() { this.target.dispose(); this.copy.dispose(); }
}
