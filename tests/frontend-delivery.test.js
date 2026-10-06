import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installFrontend } from '../server/frontend.js';
import { Engine, THREE } from '../public/js/three/engine.js';

test('frontend serves source without a build, hashed bundles with a build, and fresh HTML', async t => {
  const root = await mkdtemp(join(tmpdir(), 'casino-delivery-'));
  await mkdir(join(root, 'public/build'), { recursive: true });
  await writeFile(join(root, 'public/index.html'), '<script type="module" src="js/app.js"></script>');
  const app = express(); installFrontend(app, root);
  app.use(express.static(join(root, 'public')));
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  let response = await fetch(base);
  assert.match(await response.text(), /src="js\/app.js"/);
  assert.equal(response.headers.get('cache-control'), 'no-cache');
  await writeFile(join(root, 'public/build/app-HASH.js'), 'export const loaded = true;');
  await writeFile(join(root, 'public/build/manifest.json'), JSON.stringify({ app: '/build/app-HASH.js' }));
  response = await fetch(`${base}/index.html`);
  assert.match(await response.text(), /src="\/build\/app-HASH.js"/);
  response = await fetch(`${base}/build/app-HASH.js`);
  assert.equal(await response.text(), 'export const loaded = true;');
  assert.match(response.headers.get('cache-control'), /max-age=31536000.*immutable/);
  // A rebuild must update the entry without restarting the server or caching HTML.
  await writeFile(join(root, 'public/build/manifest.json'), JSON.stringify({ app: '/build/app-NEW.js' }));
  assert.match(await (await fetch(base)).text(), /app-NEW.js/);
  const model = Buffer.alloc(65536, 42);
  await writeFile(join(root, 'public/person.glb'), model);
  response = await fetch(`${base}/person.glb`, { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(response.headers.get('content-encoding'), 'gzip');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), model);
  response = await fetch(`${base}/person.glb`, { headers: { 'Accept-Encoding': 'identity' } });
  assert.equal(response.headers.get('content-encoding'), null);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), model);
});

test('shader warmup matches the HDR scene target and restores the renderer before awaiting compilation', async () => {
  const target = {}, previous = {}, scene = {}, camera = {};
  let active = previous, resolveCompile;
  const pending = new Promise(resolve => { resolveCompile = resolve; });
  const renderer = {
    getRenderTarget: () => active,
    setRenderTarget: value => { active = value; },
    compileAsync: (s, c) => { assert.equal(active, target); assert.equal(s, scene); assert.equal(c, camera); return pending; },
  };
  const result = Engine.prototype.warmup.call({ renderer, scene, camera, renderPass: { target } });
  assert.equal(active, previous);
  resolveCompile(); await result;
  renderer.compileAsync = () => { throw new Error('Compilation failed'); };
  assert.throws(() => Engine.prototype.warmup.call({ renderer, scene, camera }), /Compilation failed/);
  assert.equal(active, previous);
});

test('switching quality during shader compilation removes the canvas immediately and safely releases GPU resources after compilation', async () => {
  let finish, removed = 0, released = 0, disposedGeometry = 0;
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry();
  geometry.addEventListener('dispose', () => { disposedGeometry++; });
  scene.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
  const engine = {
    scene, camera: {}, stop() {}, resizeObserver: { disconnect() {} },
    tweener: { clear() {} }, updaters: new Set(),
    renderer: {
      getRenderTarget: () => null, setRenderTarget() {},
      compileAsync: () => new Promise(resolve => { finish = resolve; }),
      domElement: { remove() { removed++; } }, dispose() { released++; },
    },
  };
  const ready = Engine.prototype.warmup.call(engine);
  Engine.prototype.dispose.call(engine);
  assert.equal(removed, 1);
  assert.equal(released, 0);
  assert.equal(disposedGeometry, 0);
  assert.equal(engine.disposed, true);
  finish(); await ready;
  assert.equal(released, 1);
  assert.equal(disposedGeometry, 1);
  Engine.prototype.dispose.call(engine);
  assert.equal(released, 1);
});
