import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { LimbIK, createCharacterMotion } from '../public/js/three/character-motion.js';
const assets=new URL('../public/assets/characters/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('models.json',assets),'utf8'));
function read(model) {
 const bytes=readFileSync(new URL(`${model.name}.glb`,assets));
 const length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length)),binary=bytes.subarray(28+length);
 const sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
 const array=id=>{const a=json.accessors[id],v=json.bufferViews[a.bufferView],type={5123:Uint16Array,5125:Uint32Array,5126:Float32Array}[a.componentType];return new type(binary.buffer,binary.byteOffset+(v.byteOffset??0)+(a.byteOffset??0),a.count*sizes[a.type]);};
 return {json,bytes,array};
}
for(const model of manifest) {
 test(`${model.name}: glTF integrity, complete skinning, bounded LOD and local textures`,()=>{
  const {json,bytes,array}=read(model);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),model.sha256);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  assert.ok(model.height>=1.6&&model.height<=1.9);
  assert.ok(model.lodTriangles<model.triangles*0.4);
  assert.equal(json.skins.length,1);
  for(const skin of json.skins)for(const joint of skin.joints)assert.ok(json.nodes[joint]);
  for(const image of json.images){assert.ok(!image.uri.includes('..'));assert.ok(existsSync(new URL(image.uri,assets)));}
  for(const mesh of json.meshes)for(const p of mesh.primitives) {
   const pos=array(p.attributes.POSITION),joint=array(p.attributes.JOINTS_0),weights=array(p.attributes.WEIGHTS_0),normal=array(p.attributes.NORMAL);
   for(const i of array(p.indices))assert.ok(i<pos.length/3);
   for(const i of joint)assert.ok(i<model.bones);
   for(let i=0;i<weights.length;i+=4)assert.ok(Math.abs(weights[i]+weights[i+1]+weights[i+2]+weights[i+3]-1)<1e-5);
   for(const attribute of [pos,normal,weights])for(const value of attribute)assert.ok(Number.isFinite(value));
   for(let i=0;i<normal.length;i+=3)assert.ok(Math.abs(Math.hypot(...normal.subarray(i,i+3))-1)<1e-4);
  }
 });
 test(`${model.name}: every motion pose keeps the real skeleton finite and separate instances independent`,()=>{
  const {json}=read(model);const make=()=>{
   const root=new THREE.Group();root.name='Human';root.userData={height:model.height};
   const nodes=json.nodes.map(n=>{const o=new THREE.Bone();o.name=n.name;o.userData=n.extras??{};if(n.translation)o.position.fromArray(n.translation);return o;});
   for(const id of json.skins[0].joints)for(const child of json.nodes[id].children??[])nodes[id].add(nodes[child]);
   root.add(nodes[json.skins[0].skeleton]);root.updateMatrixWorld(true);return root;
  };
  const a=make(),b=make(),motion=createCharacterMotion(a,7),other=createCharacterMotion(b,9);
  for(const pose of [{},{moving:true},{seated:true},{dealing:true},{}])for(let frame=0;frame<90;frame++) {
   motion.step(1/60,pose);a.updateMatrixWorld(true);
   a.traverse(o=>{for(const value of o.matrixWorld.elements)assert.ok(Number.isFinite(value));});
  }
  assert.notEqual(motion.bones.head,other.bones.head);
  motion.bones.head.rotation.y=0.5;assert.equal(other.bones.head.rotation.y,0);
 });
}

test('IK reaches moving targets under a transformed parent and handles a parallel bend pole',()=>{
 const scene=new THREE.Group();scene.position.set(3,2,-4);scene.rotation.y=0.7;
 const upper=new THREE.Bone(),lower=new THREE.Bone(),end=new THREE.Bone();
 lower.position.y=-0.3;end.position.y=-0.3;scene.add(upper);upper.add(lower);lower.add(end);scene.updateMatrixWorld(true);
 const ik=new LimbIK(upper,lower,end),actual=new THREE.Vector3();
 for(let i=0;i<60;i++){
  const target=scene.localToWorld(new THREE.Vector3(Math.sin(i/10)*0.15,-0.35,-0.2));
  const pole=scene.localToWorld(new THREE.Vector3(0,-0.2,-1));ik.solve(target,pole);end.getWorldPosition(actual);
  assert.ok(actual.distanceTo(target)<1e-5);
 }
 const straight=scene.localToWorld(new THREE.Vector3(0,0,0.4));ik.solve(straight,straight);end.getWorldPosition(actual);assert.ok(actual.distanceTo(straight)<1e-5);
});
