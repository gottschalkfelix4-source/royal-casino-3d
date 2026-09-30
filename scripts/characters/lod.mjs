import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MeshoptSimplifier } from 'meshoptimizer';
await MeshoptSimplifier.ready;
const base=new URL('../../public/assets/characters/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('models.json',base),'utf8'));
for(const model of manifest) {
 const path=new URL(`${model.name}.glb`,base), source=await readFile(path);
 const jsonLength=source.readUInt32LE(12), doc=JSON.parse(source.subarray(20,20+jsonLength));
 if(doc.meshes.some(m=>m.name.endsWith('_LOD1')))throw new Error('Rebuild the source GLBs before running LOD again.');
 const data=source.subarray(28+jsonLength), additions=[];let offset=data.length;
 const sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
 function array(id) {
  const a=doc.accessors[id],v=doc.bufferViews[a.bufferView];
  const type={5126:Float32Array,5123:Uint16Array,5125:Uint32Array}[a.componentType];
  return new type(data.buffer,data.byteOffset+(v.byteOffset??0)+(a.byteOffset??0),a.count*sizes[a.type]);
 }
 let lowTriangles=0;
 for(const node of [...doc.nodes]) {
  if(node.mesh===undefined)continue;
  const original=doc.meshes[node.mesh],p=original.primitives[0];
  const indices=new Uint32Array(array(p.indices)),positions=array(p.attributes.POSITION),normals=array(p.attributes.NORMAL),uv=array(p.attributes.TEXCOORD_0);
  const attributes=new Float32Array(positions.length/3*5);
  for(let i=0;i<positions.length/3;i++){attributes.set(normals.subarray(i*3,i*3+3),i*5);attributes.set(uv.subarray(i*2,i*2+2),i*5+3);}
  const [simplified]=MeshoptSimplifier.simplifyWithAttributes(indices,positions,3,attributes,5,[0.5,0.5,0.5,1,1],null,Math.floor(indices.length*0.30/3)*3,0.012,['RegularizeLight']);
  const output=new Uint16Array(simplified);const padding=(4-offset%4)%4;
  additions.push(Buffer.alloc(padding));offset+=padding;
  const view=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:offset,byteLength:output.byteLength});
  const raw=Buffer.from(output.buffer);additions.push(raw);offset+=raw.length;
  const accessor=doc.accessors.length;doc.accessors.push({bufferView:view,componentType:5123,count:output.length,type:'SCALAR'});
  const mesh=structuredClone(original);mesh.name+='_LOD1';mesh.primitives[0].indices=accessor;
  const lowNode={...node,name:node.name+'_LOD1',mesh:doc.meshes.length,extras:{lod:1}};
  doc.meshes.push(mesh);doc.nodes[0].children.push(doc.nodes.length);doc.nodes.push(lowNode);lowTriangles+=output.length/3;
 }
 const binary=Buffer.concat([data,...additions,Buffer.alloc((4-offset%4)%4)]);doc.buffers[0].byteLength=binary.length;
 let text=Buffer.from(JSON.stringify(doc));text=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,32)]);
 const head=Buffer.alloc(20);head.write('glTF');head.writeUInt32LE(2,4);head.writeUInt32LE(28+text.length+binary.length,8);head.writeUInt32LE(text.length,12);head.write('JSON',16);
 const bh=Buffer.alloc(8);bh.writeUInt32LE(binary.length);bh.write('BIN\0',4);
 const result=Buffer.concat([head,text,bh,binary]);await writeFile(path,result);
 model.lodTriangles=lowTriangles;model.bytes=result.length;model.sha256=createHash('sha256').update(result).digest('hex');
 console.log(model.name,model.triangles,'→',lowTriangles,'triangles');
}
await writeFile(new URL('models.json',base),JSON.stringify(manifest,null,2)+'\n');
