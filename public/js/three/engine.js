import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Tweener, Easing } from './tween.js';

export { THREE, Easing };

/** Grafikqualität (localStorage): high | medium | low */
export function getQuality() {
  const q = localStorage.getItem('casino.quality');
  return ['high', 'medium', 'low'].includes(q) ? q : 'high';
}
export function setQuality(q) { localStorage.setItem('casino.quality', q); }
export const QUALITY = {
  high: { dpr: 2, shadows: true, shadowMap: 2048 },
  medium: { dpr: 1.25, shadows: true, shadowMap: 1024 },
  low: { dpr: 1, shadows: false, shadowMap: 512 },
};

/**
 * Kapselt Renderer, Szene, Kamera, Render-Loop, Tweens und Picking.
 */
export class Engine {
  constructor(container, opts = {}) {
    const {
      fov = 45, position = [0, 6, 10], target = [0, 0, 0], background = 0x07090d,
      shadows = true, exposure = 1.0, envIntensity = 0.7, fog = null, bloom = null, alpha = false,
    } = opts;
    this.container = container;
    this.disposed = false;
    this.quality = QUALITY[getQuality()];

    this.renderer = new THREE.WebGLRenderer({ antialias: this.quality.dpr < 2 || (window.devicePixelRatio || 1) < 1.5, powerPreference: 'high-performance', stencil: false, alpha });
    if (alpha) this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.dpr));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = exposure;
    this.renderer.shadowMap.enabled = shadows && this.quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.classList.add('three-canvas');
    container.prepend(this.renderer.domElement);

    this.scene = new THREE.Scene();
    if (!alpha) this.scene.background = new THREE.Color(background);
    if (fog) this.scene.fog = new THREE.Fog(background, fog[0], fog[1]);

    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 500);
    this.camera.position.set(...position);
    this.cameraTarget = new THREE.Vector3(...target);
    this.camera.lookAt(this.cameraTarget);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = envIntensity;
    pmrem.dispose();

    // Optionale Nachbearbeitung (Bloom für Neon, Lampen, Leuchtschriften)
    if (bloom) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), bloom.strength ?? 0.5, bloom.radius ?? 0.5, bloom.threshold ?? 0.85);
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
    }

    this.clock = new THREE.Clock();
    this.tweener = new Tweener();
    this.updaters = new Set();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.shakeAmount = 0;
    this.running = false;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  /** Pixeldichte zur Laufzeit begrenzen (z. B. Hintergrund-Rendering sparsamer) */
  setPixelRatioCap(cap) {
    const r = Math.min(window.devicePixelRatio || 1, this.quality.dpr, cap);
    this.renderer.setPixelRatio(r);
    this.composer?.setPixelRatio(r);
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const hgt = this.container.clientHeight || 1;
    this.renderer.setSize(w, hgt, false);
    this.composer?.setSize(w, hgt);
    this.camera.aspect = w / hgt;
    this.camera.updateProjectionMatrix();
    this.applyFit();
  }

  /** Kamera-Abstand so wählen, dass ein Bereich (Breite × Höhe um das Kameraziel) immer sichtbar ist. */
  setFit(width, height, margin = 1.08) {
    this.fitBox = { width, height, margin };
    this.applyFit();
  }

  applyFit() {
    if (!this.fitBox) return;
    const { width, height, margin } = this.fitBox;
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const dist = Math.max((height * margin) / (2 * Math.tan(vFov / 2)), (width * margin) / (2 * Math.tan(hFov / 2)));
    const dir = this.camera.position.clone().sub(this.cameraTarget).normalize();
    this.camera.position.copy(this.cameraTarget).addScaledVector(dir, dist);
    this.camera.lookAt(this.cameraTarget);
  }

  /** Standardbeleuchtung: Hemisphäre + Key-Spot mit Schatten + Fill. */
  addLights({ key = [4, 10, 6], keyIntensity = 2.2, hemi = 0.55, fill = 0.8, shadowSize = 14 } = {}) {
    const hemiLight = new THREE.HemisphereLight(0xdfe9ff, 0x1a1408, hemi);
    this.scene.add(hemiLight);
    const dir = new THREE.DirectionalLight(0xfff2dc, keyIntensity);
    dir.position.set(...key);
    dir.castShadow = true;
    dir.shadow.mapSize.set(this.quality.shadowMap, this.quality.shadowMap);
    dir.shadow.camera.left = -shadowSize; dir.shadow.camera.right = shadowSize;
    dir.shadow.camera.top = shadowSize; dir.shadow.camera.bottom = -shadowSize;
    dir.shadow.camera.near = 0.5; dir.shadow.camera.far = 60;
    dir.shadow.bias = -0.0005;
    dir.shadow.normalBias = 0.02;
    this.scene.add(dir);
    const fillLight = new THREE.DirectionalLight(0x8fb3ff, fill);
    fillLight.position.set(-6, 5, -4);
    this.scene.add(fillLight);
    return { hemiLight, dir, fillLight };
  }

  addSpot({ position = [0, 10, 0], target = [0, 0, 0], intensity = 400, angle = 0.5, penumbra = 0.6, color = 0xffffff, shadow = false } = {}) {
    const spot = new THREE.SpotLight(color, intensity, 0, angle, penumbra, 2);
    spot.position.set(...position);
    spot.target.position.set(...target);
    spot.castShadow = shadow;
    if (shadow) spot.shadow.mapSize.set(1024, 1024);
    this.scene.add(spot, spot.target);
    return spot;
  }

  /** Ein Simulationsschritt (Tweens, Updater, optional Rendern) */
  step(render = true) {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const now = performance.now();
    this.lastFrame = now;
    this.tweener.update(now);
    for (const u of this.updaters) u(dt, now / 1000);
    if (this.shakeAmount > 0.001) {
      const s = this.shakeAmount;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.shakeAmount *= 0.88;
    }
    if (!render) return;
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.clock.start();
    this.lastFrame = performance.now();
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.step(true);
    };
    loop();
    // Watchdog: liefert der Browser keine Frames (Tab im Hintergrund, gedrosselt), laufen Tweens und
    // Spiellogik per Timer weiter, damit Runden nicht "hängen" – gerendert wird dann nicht.
    this.watchdog = setInterval(() => {
      if (this.running && performance.now() - this.lastFrame > 400) this.step(false);
    }, 100);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    clearInterval(this.watchdog);
  }

  onUpdate(fn) {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }

  tween(duration, fn, ease = Easing.outCubic) { return this.tweener.add(duration, fn, ease); }
  delay(ms) { return this.tweener.add(ms, () => {}, Easing.linear); }

  shake(amount = 0.25) { this.shakeAmount = Math.max(this.shakeAmount, amount); }

  /** Raycast auf Objekte anhand eines Pointer-Events. */
  pick(event, objects, recursive = true) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(objects, recursive);
  }

  /** Kamera weich auf neue Position/Ziel bewegen. */
  moveCamera(position, target, duration = 1200, ease = Easing.inOutCubic) {
    const p0 = this.camera.position.clone();
    const t0 = this.cameraTarget.clone();
    const p1 = new THREE.Vector3(...position);
    const t1 = new THREE.Vector3(...target);
    return this.tween(duration, (k) => {
      this.camera.position.lerpVectors(p0, p1, k);
      this.cameraTarget.lerpVectors(t0, t1, k);
      this.camera.lookAt(this.cameraTarget);
    }, ease);
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.resizeObserver.disconnect();
    this.tweener.clear();
    this.updaters.clear();
    this.scene.traverse((obj) => {
      obj.geometry?.dispose?.();
      const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
      for (const m of mats) {
        for (const v of Object.values(m)) if (v && v.isTexture && !v.userData.keep) v.dispose();
        m.dispose?.();
      }
    });
    this.scene.environment?.dispose?.();
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
