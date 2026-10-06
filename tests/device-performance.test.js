import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticQuality, getQuality, setQuality } from '../public/js/three/quality.js';
import { AdaptiveResolution } from '../public/js/three/adaptive.js';
import { Engine } from '../public/js/three/engine.js';

test('automatic quality starts conservatively on phones and limited devices', () => {
  assert.equal(automaticQuality({ cores: 8, memory: 8, mobile: true }), 'low');
  assert.equal(automaticQuality({ cores: 4, memory: 8 }), 'low');
  assert.equal(automaticQuality({ cores: 12, memory: 4 }), 'low');
  assert.equal(automaticQuality({ cores: 8 }), 'medium');
  assert.equal(automaticQuality(), 'medium');
  assert.equal(automaticQuality({ cores: 12, memory: 8 }), 'high');
});

test('new devices use Auto while explicit settings survive; unavailable storage is safe', t => {
  let value = null;
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => value } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage; });
  assert.equal(getQuality(), 'auto');
  for (value of ['high', 'medium', 'low', 'auto']) assert.equal(getQuality(), value);
  value = 'invalid'; assert.equal(getQuality(), 'auto');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage blocked'); } });
  assert.equal(getQuality(), 'auto');
  setQuality('low'); assert.equal(getQuality(), 'low');
  setQuality('invalid'); assert.equal(getQuality(), 'low');
});

test('Auto sheds effects under sustained overload and can recover resolution without effect oscillation', () => {
  const adaptive = new AdaptiveResolution({ minScale: 0.5, effects: true });
  adaptive.sample(5000);
  assert.equal(adaptive.scale, 1); assert.equal(adaptive.effectLevel, 0);
  for (let i = 0; i < 80; i++) adaptive.sample(350);
  assert.equal(adaptive.scale, 0.5); assert.equal(adaptive.effectLevel, 2);
  for (let i = 0; i < 12000; i++) adaptive.sample(1000 / 60);
  assert.equal(adaptive.scale, 1); assert.equal(adaptive.effectLevel, 2);
  const manual = new AdaptiveResolution();
  for (let i = 0; i < 80; i++) manual.sample(350);
  assert.equal(manual.scale, 0.7); assert.equal(manual.effectLevel, 0);
});

test('adaptive effects retain the mounted scene and release obsolete multisample buffers once', () => {
  let disposed = 0, changes = 0;
  const scene = {}, camera = {}, updaters = new Set(), target = { samples: 2, dispose: () => disposed++ };
  const engine = Object.assign(Object.create(Engine.prototype), {
    scene, camera, updaters, adaptive: { effectLevel: 1 },
    gtaoPass: { enabled: true }, bloomPass: { enabled: true }, smaaPass: { enabled: true },
    renderPass: { target }, onPerformanceChange: () => changes++,
  });
  engine.applyAdaptiveEffects();
  assert.equal(engine.gtaoPass.enabled, false); assert.equal(engine.bloomPass.enabled, true); assert.equal(target.samples, 2);
  engine.adaptive.effectLevel = 2; engine.applyAdaptiveEffects(); engine.applyAdaptiveEffects();
  assert.equal(engine.bloomPass.enabled, false); assert.equal(engine.smaaPass.enabled, false);
  assert.equal(target.samples, 0); assert.equal(disposed, 1); assert.equal(changes, 3);
  assert.equal(engine.scene, scene); assert.equal(engine.camera, camera); assert.equal(engine.updaters, updaters);
});

test('render adaptation measures real frame spacing across watchdog ticks and excludes hidden tabs', t => {
  let now = 400, renders = 0, resets = 0;
  const samples = [], document = { hidden: false };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'document', previous); else delete globalThis.document; });
  t.mock.method(performance, 'now', () => now);
  const engine = Object.assign(Object.create(Engine.prototype), {
    clock: { getDelta: () => 0.1 }, tweener: { update() {} }, updaters: new Set(),
    lastRendered: 100, adaptiveEnabled: true, adaptive: { sample: ms => { samples.push(ms); return false; }, reset: () => resets++ },
    camera: { updateMatrixWorld() {} }, scene: { updateMatrixWorld() {} }, renderer: { render: () => renders++ },
  });
  engine.step(false); assert.equal(engine.lastRendered, 100);
  now = 700; engine.step(true); assert.deepEqual(samples, [600]); assert.equal(renders, 1);
  document.hidden = true; now = 5000; engine.step(true);
  assert.equal(renders, 1); assert.equal(engine.lastRendered, undefined); assert.equal(resets, 1);
  document.hidden = false; now = 6000; engine.step(true);
  assert.deepEqual(samples, [600, 0]); assert.equal(renders, 2);
});
