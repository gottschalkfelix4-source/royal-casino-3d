import * as THREE from 'three';
import { trackTexture } from './materialmaps.js';

const cache = new Map();
const fixtures = [[0, 5.4, 6], [-9, 5.4, -3], [9, 5.4, -3]];
/** Approximate static diffuse bounce, sampled once in world space. Dynamic shadows remain separate.
 * The deliberately low-frequency bake gives medium/low the same lighting composition as high.
 * It is not a ray-traced GI bake; no expensive realtime area/point lights are added.
 */
export function bakeRoomLight(mesh, key, resolution = 64) {
  mesh.updateMatrixWorld(true);
  if (!cache.has(key)) {
    const bytes = new Uint8Array(resolution * resolution * 4);
    const p = new THREE.Vector3(); const normal = new THREE.Vector3(0,0,1).transformDirection(mesh.matrixWorld);
    const width = mesh.geometry.parameters.width; const height = mesh.geometry.parameters.height;
    for(let y=0;y<resolution;y++) for(let x=0;x<resolution;x++) {
      p.set(((x+0.5)/resolution-0.5)*width,((y+0.5)/resolution-0.5)*height,0).applyMatrix4(mesh.matrixWorld);
      let irradiance = 0.09;
      for(const [fx,fy,fz] of fixtures) {
        const dx=fx-p.x,dy=fy-p.y,dz=fz-p.z; const distance=Math.hypot(dx,dy,dz);
        const facing=Math.max(0.15,(dx*normal.x+dy*normal.y+dz*normal.z)/distance);
        irradiance+=3.8*facing/(8+distance*distance);
      }
      // Neutral wall bounce, slightly warm near the floor.
      const o=(y*resolution+x)*4;
      bytes[o]=Math.min(255,irradiance*255);bytes[o+1]=Math.min(255,irradiance*249);bytes[o+2]=Math.min(255,irradiance*239);bytes[o+3]=255;
    }
    const texture=new THREE.DataTexture(bytes,resolution,resolution);
    texture.magFilter=texture.minFilter=THREE.LinearFilter; texture.needsUpdate=true;
    texture.channel=1;texture.userData.keep=true;trackTexture(texture);cache.set(key,texture);
  }
  mesh.geometry.setAttribute('uv1',mesh.geometry.attributes.uv.clone());
  mesh.material.lightMap=cache.get(key);mesh.material.lightMapIntensity=0.8;
}
