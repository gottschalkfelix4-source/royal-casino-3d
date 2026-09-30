import * as THREE from 'three';
/** Keep nearby interactions at full cadence; accumulate time for distant decorative animation. */
export function budgetAnimation(object, camera, update) {
  const position=new THREE.Vector3(); let elapsed=0;
  return (dt,time)=>{
    elapsed+=dt;
    object.getWorldPosition(position);
    const distance=position.distanceTo(camera.position);
    const interval=distance<8?0:distance<18?1/24:1/12;
    if(elapsed+1e-6<interval) return;
    update(elapsed,time,distance);elapsed=0;
  };
}
