import * as THREE from 'three';

/**
 * Planare Spiegelung für den Hallenboden: die Szene wird einmal je Frame aus einer an der Bodenebene
 * gespiegelten Kamera in ein (kleineres) Render-Target gezeichnet. Das Marmor-Material blendet dieses Bild
 * per Fresnel und Rauheit als Reflexion ein (siehe applyFloorReflection) – so spiegeln sich Kronleuchter,
 * Decke, Tische und Figuren physikalisch korrekt im polierten Stein, ohne Screen-Space-Artefakte.
 *
 * Mathe nach three/addons/objects/Reflector.js (gespiegelte Kamera + schiefe Near-Plane).
 */
export class PlanarReflection {
  constructor(renderer, scene, { y = 0, scale = 0.5, layers = null } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.y = y;
    this.scale = scale;
    this.enabled = true;
    this.everyNth = 1;
    this.frame = 0;
    this.camera = new THREE.PerspectiveCamera();
    if (layers !== null) this.camera.layers.mask = layers;
    this.target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
    this.target.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.textureMatrix = new THREE.Matrix4();
    this.hidden = new Set(); // Objekte, die im Spiegelbild nicht erscheinen (der Boden selbst)
    this._plane = new THREE.Plane();
    this._normal = new THREE.Vector3(0, 1, 0);
    this._tmp = { view: new THREE.Vector3(), target: new THREE.Vector3(), camPos: new THREE.Vector3(), look: new THREE.Vector3(), rot: new THREE.Matrix4(), clip: new THREE.Vector4(), q: new THREE.Vector4(), pos: new THREE.Vector3(0, 0, 0) };
  }

  setSize(w, h) {
    const rw = Math.max(4, Math.round(w * this.scale)); const rh = Math.max(4, Math.round(h * this.scale));
    if (this.target.width !== rw || this.target.height !== rh) this.target.setSize(rw, rh);
  }

  /** Spiegelbild rendern (vor dem Hauptbild aufrufen) */
  update(camera) {
    if (!this.enabled) return;
    if ((this.frame++ % this.everyNth) !== 0) return;
    const { renderer, scene } = this;
    const t = this._tmp;
    const normal = this._normal;
    t.pos.set(0, this.y, 0);
    t.camPos.setFromMatrixPosition(camera.matrixWorld);
    // Kamera unterhalb der Ebene: nichts zu spiegeln
    if (t.camPos.y <= this.y + 0.01) return;
    t.view.subVectors(t.pos, t.camPos);
    t.view.reflect(normal).negate();
    t.view.add(t.pos);
    t.rot.extractRotation(camera.matrixWorld);
    t.look.set(0, 0, -1).applyMatrix4(t.rot).add(t.camPos);
    t.target.subVectors(t.pos, t.look);
    t.target.reflect(normal).negate();
    t.target.add(t.pos);
    const vc = this.camera;
    vc.position.copy(t.view);
    vc.up.set(0, 1, 0).applyMatrix4(t.rot).reflect(normal);
    vc.lookAt(t.target);
    vc.near = camera.near; vc.far = camera.far;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);
    // Texturmatrix: Weltkoordinaten -> Spiegel-Clip -> [0,1]
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    // Schiefe Near-Plane: alles unterhalb der Ebene wird abgeschnitten (Lengyel, Oblique View Frustums)
    this._plane.setFromNormalAndCoplanarPoint(normal, t.pos).applyMatrix4(vc.matrixWorldInverse);
    const clip = t.clip.set(this._plane.normal.x, this._plane.normal.y, this._plane.normal.z, this._plane.constant);
    const pm = vc.projectionMatrix;
    const q = t.q;
    q.x = (Math.sign(clip.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(clip.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1.0;
    q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    clip.multiplyScalar(2.0 / clip.dot(q));
    pm.elements[2] = clip.x; pm.elements[6] = clip.y; pm.elements[10] = clip.z + 1.0 - 0.002; pm.elements[14] = clip.w;

    const prevTarget = renderer.getRenderTarget();
    const prevShadow = renderer.shadowMap.autoUpdate;
    const prevXr = renderer.xr.enabled;
    renderer.xr.enabled = false;
    renderer.shadowMap.autoUpdate = false;
    for (const o of this.hidden) o.visible = false;
    renderer.setRenderTarget(this.target);
    renderer.state.buffers.depth.setMask(true);
    if (renderer.autoClear === false) renderer.clear();
    renderer.render(scene, vc);
    for (const o of this.hidden) o.visible = true;
    renderer.setRenderTarget(prevTarget);
    renderer.shadowMap.autoUpdate = prevShadow;
    renderer.xr.enabled = prevXr;
  }

  dispose() { this.target.dispose(); }
}

/**
 * Marmor-/Bodenmaterial um die planare Spiegelung erweitern. Die Reflexion wird über Schlick-Fresnel
 * (F0 = 0.04, Klarlack) und die Rauheit (Mip-Level der Spiegeltextur) gewichtet und zur ausgehenden
 * Strahldichte addiert. envMapIntensity des Materials sollte klein sein, damit die Umgebungsspiegelung
 * nicht doppelt zählt.
 */
export function applyFloorReflection(material, reflection, { strength = 1.0, blur = 5.0 } = {}) {
  material.userData.reflection = { strength, blur };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.tReflection = { value: reflection.target.texture };
    shader.uniforms.reflectionMatrix = { value: reflection.textureMatrix };
    shader.uniforms.reflectionStrength = { value: strength };
    shader.uniforms.reflectionBlur = { value: blur };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 reflectionMatrix;\nvarying vec4 vReflCoord;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n{ vec4 wp = modelMatrix * vec4( transformed, 1.0 ); vReflCoord = reflectionMatrix * wp; }');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tReflection;\nuniform float reflectionStrength;\nuniform float reflectionBlur;\nvarying vec4 vReflCoord;')
      .replace('#include <opaque_fragment>', `{
        float ndv = saturate( dot( normal, geometryViewDir ) );
        float fres = 0.04 + 0.96 * pow( 1.0 - ndv, 5.0 );
        float rough = clamp( roughnessFactor, 0.0, 1.0 );
        vec2 uvR = vReflCoord.xy / vReflCoord.w;
        float lod = rough * reflectionBlur;
        vec3 refl = textureLod( tReflection, uvR, lod ).rgb;
        // Rauere Stellen (Adern, Intarsien) spiegeln matter und schwächer
        float amount = reflectionStrength * fres * ( 1.0 - 0.75 * rough );
        outgoingLight += refl * amount;
      }
      #include <opaque_fragment>`);
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => 'floor-reflection';
  material.needsUpdate = true;
}
