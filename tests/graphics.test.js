import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { batchStatic } from '../public/js/three/batch.js';
import { contributesToAO, WorldAOPass, PICK_LAYER } from '../public/js/three/occlusion.js';
import { disposeObject } from '../public/js/three/resources.js';
import { AdaptiveResolution } from '../public/js/three/adaptive.js';
import { surfaceMaps, trackTexture, textureRegistrySize } from '../public/js/three/materialmaps.js';
import { budgetAnimation } from '../public/js/three/animation-budget.js';

test('cache hit never calls a material builder',()=>{
  let builds=0; const opts={key:'test-cache',build:()=>{builds++;return {};}};
  const first=surfaceMaps(opts); for(let i=0;i<4;i++)assert.equal(surfaceMaps(opts),first);
  assert.equal(builds,1);
});
test('disposed transient textures leave registry, shared resources survive entity disposal',()=>{
  const baseline=textureRegistrySize();const texture=trackTexture(new THREE.Texture());
  const kept=trackTexture(new THREE.Texture());kept.userData.keep=true;
  const material=new THREE.MeshStandardMaterial({map:texture,normalMap:kept});
  const geometry=new THREE.BoxGeometry();geometry.userData.shared=true;
  let geometryDisposed=0,materialDisposed=0,textureDisposed=0;
  geometry.addEventListener('dispose',()=>geometryDisposed++);material.addEventListener('dispose',()=>materialDisposed++);texture.addEventListener('dispose',()=>textureDisposed++);
  const group=new THREE.Group(); group.add(new THREE.Mesh(geometry,material),new THREE.Mesh(geometry,material));
  disposeObject(group);assert.equal(textureRegistrySize(),baseline+1);
  assert.equal(geometryDisposed,0);assert.equal(materialDisposed,1);assert.equal(textureDisposed,1);kept.dispose();assert.equal(textureRegistrySize(),baseline);
});
test('AO hides only incompatible surfaces and restores preexisting visibility',()=>{
  const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera();
  const solid=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());
  const proxy=new THREE.Mesh(solid.geometry,new THREE.MeshBasicMaterial({transparent:true,opacity:0}));proxy.layers.set(PICK_LAYER);
  const sprite=new THREE.Sprite();const leaf=new THREE.Mesh(solid.geometry,new THREE.MeshStandardMaterial({alphaTest:0.4}));
  const alreadyHidden=solid.clone();alreadyHidden.visible=false;scene.add(solid,proxy,sprite,leaf,alreadyHidden);
  assert.equal(contributesToAO(solid),true);assert.equal(contributesToAO(proxy),false);assert.equal(contributesToAO(sprite),false);assert.equal(contributesToAO(leaf),false);
  const pass=new WorldAOPass(scene,camera);pass.setSize(1920,1080);
  assert.equal(pass.width,960);assert.equal(pass.height,540);
  pass._overrideVisibility();assert.equal(solid.visible,true);assert.equal(proxy.visible,false);assert.equal(sprite.visible,false);
  pass._restoreVisibility();assert.equal(proxy.visible,true);assert.equal(alreadyHidden.visible,false);pass.dispose();
});
test('spatial batching preserves transforms and dynamic children, instances repeated shapes',()=>{
  const scene=new THREE.Scene(); const root=new THREE.Group();root.position.set(10,0,20);root.rotation.y=0.5;scene.add(root);
  const geometry=new THREE.BoxGeometry();const mat=new THREE.MeshStandardMaterial({color:0x224466});
  const originals=[];
  for(let i=0;i<3;i++){const m=new THREE.Mesh(geometry,mat.clone());m.position.x=i*0.1;root.add(m);originals.push(m);}
  const dynamic=new THREE.Group();dynamic.userData.noBatch=true;const child=new THREE.Mesh(geometry,mat);dynamic.add(child);root.add(dynamic);
  scene.updateMatrixWorld(true);const positions=originals.map(m=>m.getWorldPosition(new THREE.Vector3()));
  const result=batchStatic(root);assert.equal(result.removed,3);assert.equal(child.parent,dynamic);
  scene.updateMatrixWorld(true);const inst=result.group.children[0];assert.equal(inst.isInstancedMesh,true);
  for(let i=0;i<3;i++){const matrix=new THREE.Matrix4();inst.getMatrixAt(i,matrix);matrix.premultiply(inst.matrixWorld);assert.ok(new THREE.Vector3().setFromMatrixPosition(matrix).distanceTo(positions[i])<1e-6);}
});
test('batching keeps picking layers and distant cells separate',()=>{
  const root=new THREE.Group();const geo=new THREE.BoxGeometry();const mat=new THREE.MeshBasicMaterial();
  for(const x of [0,0.1,30,30.1]){const o=new THREE.Mesh(geo,mat);o.position.x=x;o.layers.set(PICK_LAYER);root.add(o);}
  const result=batchStatic(root);assert.equal(result.meshes,2);for(const mesh of result.group.children)assert.equal(mesh.layers.mask,1<<PICK_LAYER);
});
test('adaptive resolution uses hysteresis, bounded scale and ignores tab pauses',()=>{
  const a=new AdaptiveResolution();for(let i=0;i<100;i++)a.sample(25);assert.equal(a.scale,1);
  for(let i=0;i<80;i++)a.sample(25);assert.ok(a.scale<1);
  for(let i=0;i<3000;i++)a.sample(40);assert.equal(a.scale,0.7);
  a.sample(5000);assert.equal(a.frames,0);
  for(let i=0;i<6000;i++)a.sample(10);assert.equal(a.scale,1);
});
test('adaptive resolution responds to sustained 19 ms frames without pumping at 60 Hz',()=>{
  const a=new AdaptiveResolution();
  for(let i=0;i<240;i++)a.sample(19);
  assert.equal(a.scale,0.9);
  for(let i=0;i<600;i++)a.sample(1000/60);
  assert.equal(a.scale,0.9);
});
test('distant animation accumulates delta rather than slowing simulation',()=>{
  const camera=new THREE.PerspectiveCamera();const object=new THREE.Group();object.position.z=30;
  let count=0,total=0;const update=budgetAnimation(object,camera,dt=>{count++;total+=dt;});
  for(let i=0;i<120;i++)update(1/120,i/120);
  assert.equal(count,12);assert.ok(Math.abs(total-1)<1e-9);
});

test('reflection restores hidden objects, pending shadows and render target on errors', async()=>{
  const { PlanarReflection }=await import('../public/js/three/reflection.js');
  const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(60,1,0.1,100);camera.position.set(0,2,3);camera.lookAt(0,0,0);
  const target={name:'previous'};let active=target;
  const renderer={shadowMap:{autoUpdate:true,needsUpdate:true},xr:{enabled:true},autoClear:true,
    getRenderTarget:()=>active,setRenderTarget:t=>{active=t;},state:{buffers:{depth:{setMask:()=>{}}}},render:()=>{throw new Error('test render failure');}};
  const reflection=new PlanarReflection(renderer,scene);const hidden=new THREE.Object3D();hidden.visible=false;const visible=new THREE.Object3D();reflection.hidden.add(hidden);reflection.hidden.add(visible);
  assert.throws(()=>reflection.update(camera),/test render failure/);
  assert.equal(hidden.visible,false);assert.equal(visible.visible,true);assert.equal(active,target);assert.equal(renderer.shadowMap.needsUpdate,true);assert.equal(renderer.shadowMap.autoUpdate,true);assert.equal(renderer.xr.enabled,true);reflection.dispose();
});

test('picking proxies remain raycastable while excluded from the camera world layer',()=>{
  const proxy=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial({transparent:true,opacity:0}));proxy.layers.set(PICK_LAYER);proxy.updateMatrixWorld();
  const ray=new THREE.Raycaster(new THREE.Vector3(0,0,3),new THREE.Vector3(0,0,-1));ray.layers.enable(PICK_LAYER);
  assert.ok(ray.intersectObject(proxy).length>0);assert.equal(proxy.layers.test(new THREE.PerspectiveCamera().layers),false);
});
