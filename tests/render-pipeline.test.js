import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ScenePass } from '../public/js/three/scene-pass.js';
import { WorldAOPass } from '../public/js/three/occlusion.js';
import { batchStatic } from '../public/js/three/batch.js';
import { installLightingShader } from '../public/js/three/lighting-shaders.js';
import { surfaceMaterial } from '../public/js/three/surface-material.js';
import { mergeStaticDraws } from '../public/js/three/merge-static-draws.js';

test('scene MSAA and resolved depth resize together; fullscreen buffers are independent', () => {
  const pass = new ScenePass(new THREE.Scene(), new THREE.PerspectiveCamera(), 2, true);
  pass.setSize(2494, 1403);
  assert.equal(pass.target.samples, 2);
  assert.equal(pass.target.width, 2494);
  assert.equal(pass.target.height, 1403);
  assert.ok(pass.target.depthTexture.isDepthTexture);
  let disposed = 0; pass.target.addEventListener('dispose', () => disposed++);
  pass.dispose(); assert.equal(disposed, 1);
});

test('disabling AO copies scene colour once into the ordinary effect chain', () => {
  const scene = new THREE.Scene(), pass = new ScenePass(scene, new THREE.PerspectiveCamera(), 2, true);
  const read = {}, write = {}, draws = []; let target;
  const renderer = { autoClear: true, setRenderTarget: value => { target = value; }, clear: () => {}, render: object => draws.push([object, target]) };
  pass.consumer = { enabled: true }; pass.render(renderer, write, read);
  assert.deepEqual(draws, [[scene, pass.target]]);
  draws.length = 0; pass.consumer.enabled = false; pass.render(renderer, write, read);
  assert.equal(draws.length, 2); assert.deepEqual(draws[0], [scene, pass.target]); assert.equal(draws[1][1], read);
  pass.dispose();
});

test('AO consumes scene colour and depth without another geometry traversal', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()); scene.add(mesh);
  const pass = new WorldAOPass(scene, camera);
  const source = new THREE.WebGLRenderTarget(16, 16, { depthTexture: new THREE.DepthTexture(16, 16) });
  pass.sceneBuffer = source;
  pass._overrideVisibility = () => { throw new Error('extra geometry pass'); };
  pass._renderPass = () => {};
  pass.render({}, {}, {});
  assert.equal(pass.gtaoMaterial.uniforms.tDepth.value, source.depthTexture);
  assert.equal(pass.gtaoMaterial.defines.NORMAL_VECTOR_TYPE, 0);
  assert.equal(pass.copyMaterial.uniforms.tDiffuse.value, source.texture);
  assert.equal(mesh.visible, true);
  let externalDisposed = 0; source.depthTexture.addEventListener('dispose', () => externalDisposed++);
  pass.dispose(); assert.equal(externalDisposed, 0); source.dispose();
});

test('local batching retains moving descendants and follows the animated root', () => {
  const parent = new THREE.Group(), rotor = new THREE.Group(); parent.userData.noBatch = true;
  parent.position.x = 5; parent.add(rotor);
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  for (let i = 0; i < 3; i++) { const mesh = new THREE.Mesh(geometry, material); mesh.position.x = i; rotor.add(mesh); }
  const moving = new THREE.Mesh(geometry, material); moving.userData.noBatch = true; rotor.add(moving);
  const result = batchStatic(rotor, { local: true, cellSize: 100 });
  assert.equal(result.removed, 3); assert.equal(moving.parent, rotor);
  rotor.rotation.y = Math.PI / 2; parent.updateMatrixWorld(true);
  const instance = result.group.children[0], transform = new THREE.Matrix4(); instance.getMatrixAt(2, transform);
  transform.premultiply(instance.matrixWorld);
  const position = new THREE.Vector3().setFromMatrixPosition(transform);
  assert.ok(position.distanceTo(new THREE.Vector3(5, 0, -2)) < 1e-6);
});

test('lighting optimization preserves existing shader hooks and leaves all contributing lobes intact', () => {
  const scene = new THREE.Scene(), material = new THREE.MeshPhysicalMaterial();
  material.onBeforeCompile = shader => { shader.uniforms.ownerUniform = { value: 42 }; };
  material.customProgramCacheKey = () => 'owner'; scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  const hook = material.onBeforeCompile, key = material.customProgramCacheKey;
  installLightingShader(); const source = THREE.ShaderChunk.lights_physical_pars_fragment;
  installLightingShader(); assert.equal(THREE.ShaderChunk.lights_physical_pars_fragment, source);
  assert.equal(material.onBeforeCompile, hook); assert.equal(material.customProgramCacheKey, key);
  const shader = { fragmentShader: THREE.ShaderLib.physical.fragmentShader, uniforms: {} }; hook.call(material, shader);
  assert.equal(shader.uniforms.ownerUniform.value, 42); assert.equal(material.customProgramCacheKey(), 'owner');
  assert.match(source, /!directLight.visible/);
  assert.match(source, /geometryClearcoatNormal, directLight.direction\) <= 0.0/);
  assert.match(source, /BRDF_GGX_Clearcoat/);
});

test('surface selection keeps native texture resolution, independent maps and authored roughness', () => {
  const front = new THREE.Texture(), back = new THREE.Texture();
  const material = surfaceMaterial([front, front, back], [.8, .55, .6], { edgeColor: 0xf2f2f2 });
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader);
  assert.equal(material.map, front); assert.equal(shader.uniforms.surfaceTexture2.value, back);
  assert.deepEqual(shader.uniforms.surfaceRoughness.value.toArray(), [.8, .55, .6]);
  assert.match(shader.vertexShader, /vSurfaceIndex = surfaceIndex/);
  assert.match(shader.fragmentShader, /surfaceEdgeColor/);
  const replacement = new THREE.Texture(); material.map = replacement; assert.equal(material.map, replacement);
});

test('larger static cells keep topology, instance transforms, layers and separate shadow flags', () => {
  const root = new THREE.Group(); root.position.set(3, 1, 2); root.rotation.y = .4;
  const material = new THREE.MeshStandardMaterial(), box = new THREE.BoxGeometry(), sphere = new THREE.SphereGeometry(.4, 8, 6);
  const a = new THREE.Mesh(box, material), b = new THREE.InstancedMesh(sphere, material, 2);
  a.position.x = 2; b.position.z = -1;
  b.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 2, 0)); b.setMatrixAt(1, new THREE.Matrix4().makeTranslation(1, 0, 0));
  a.layers.set(2); b.layers.set(2); root.add(a, b);
  const shadowed = new THREE.Mesh(box, material); shadowed.castShadow = true; root.add(shadowed);
  root.updateWorldMatrix(true, true);
  const expected = [a.matrixWorld.clone(), b.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(0, 2, 0)), b.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(1, 0, 0))];
  assert.equal(mergeStaticDraws(root, Infinity), 2);
  const batch = root.children.find(o => o !== shadowed); assert.equal(batch.layers.mask, 4);
  assert.equal(batch.frustumCulled, true); assert.equal(shadowed.parent, root);
  assert.equal(batch.geometry.index.count, box.index.count + sphere.index.count * 2);
  root.updateWorldMatrix(true, true);
  for (const [i, geometry, offset] of [[0, box, 0], [1, sphere, box.index.count], [2, sphere, box.index.count + sphere.index.count]]) {
    const vertex = new THREE.Vector3().fromBufferAttribute(batch.geometry.attributes.position, batch.geometry.index.getX(offset)).applyMatrix4(batch.matrixWorld);
    const original = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, geometry.index.getX(0)).applyMatrix4(expected[i]);
    assert.ok(vertex.distanceTo(original) < 1e-6);
  }
  batch.geometry.dispose();
});
