import * as THREE from 'three';

/** Two-bone IK. Intermediate twist bones may sit between the three controlled joints. */
export class LimbIK {
  constructor(upper, lower, end) {
    this.upper = upper; this.lower = lower; this.end = end;
    this.a = new THREE.Vector3(); this.b = new THREE.Vector3(); this.c = new THREE.Vector3();
    this.direction = new THREE.Vector3(); this.bend = new THREE.Vector3(); this.elbow = new THREE.Vector3();
    this.from = new THREE.Vector3(); this.to = new THREE.Vector3(); this.target = new THREE.Vector3();
    this.delta = new THREE.Quaternion(); this.world = new THREE.Quaternion(); this.parent = new THREE.Quaternion();
    upper.updateWorldMatrix(true, true);
    upper.getWorldPosition(this.a); lower.getWorldPosition(this.b); end.getWorldPosition(this.c);
    this.lengthA = this.a.distanceTo(this.b); this.lengthB = this.b.distanceTo(this.c);
  }
  rotate(bone, from, to) {
    this.delta.setFromUnitVectors(from.normalize(), to.normalize());
    bone.getWorldQuaternion(this.world); bone.parent.getWorldQuaternion(this.parent).invert();
    bone.quaternion.copy(this.parent.multiply(this.delta.multiply(this.world)));
    bone.updateWorldMatrix(false, true);
  }
  solve(target, pole) {
    this.upper.getWorldPosition(this.a); this.lower.getWorldPosition(this.b); this.end.getWorldPosition(this.c);
    this.direction.copy(target).sub(this.a);
    const distance = THREE.MathUtils.clamp(this.direction.length(), Math.abs(this.lengthA-this.lengthB)+0.001, this.lengthA+this.lengthB-0.001);
    this.direction.normalize(); this.target.copy(this.a).addScaledVector(this.direction, distance);
    this.bend.copy(pole).sub(this.a).addScaledVector(this.direction, -this.bend.dot(this.direction));
    if (this.bend.lengthSq() < 1e-8) {
      this.bend.set(Math.abs(this.direction.y)>0.9?1:0,Math.abs(this.direction.y)>0.9?0:1,0);
      this.bend.addScaledVector(this.direction,-this.bend.dot(this.direction));
    }
    this.bend.normalize();
    const cos = THREE.MathUtils.clamp((this.lengthA**2+distance**2-this.lengthB**2)/(2*this.lengthA*distance),-1,1);
    this.elbow.copy(this.a).addScaledVector(this.direction,this.lengthA*cos).addScaledVector(this.bend,this.lengthA*Math.sqrt(1-cos*cos));
    this.rotate(this.upper, this.from.copy(this.b).sub(this.a), this.to.copy(this.elbow).sub(this.a));
    this.lower.getWorldPosition(this.b); this.end.getWorldPosition(this.c);
    this.rotate(this.lower, this.from.copy(this.c).sub(this.b), this.to.copy(this.target).sub(this.b));
  }
}

export function createCharacterMotion(model, seed = 0) {
  const bones = {}; model.traverse(o => { if (o.isBone) bones[o.name] = o; });
  const root = bones.root, chest = bones.spine01, head = bones.head;
  const restY = root.position.y;
  const seatDrop = bones.upperleg01_L.userData.restHead[1] - 0.79;
  const height = model.getObjectByName('Human')?.userData.height ?? 1.8;
  const factor = height / 1.8;
  model.updateMatrixWorld(true);
  const arms = ['L','R'].map(side => new LimbIK(bones[`upperarm01_${side}`], bones[`lowerarm01_${side}`], bones[`wrist_${side}`]));
  const legs = ['L','R'].map(side => new LimbIK(bones[`upperleg01_${side}`], bones[`lowerleg01_${side}`], bones[`foot_${side}`]));
  const limbs=[...arms,...legs];
  const skins=[];model.traverse(o=>{if(o.name==='Skin'||o.name==='Skin_LOD1')skins.push(o);});
  const hands = ['L','R'].map((side,i) => {
    const wrist=bones[`wrist_${side}`];
    const forward=new THREE.Vector3().fromArray(bones[`finger3-3_${side}`].userData.restTail).sub(new THREE.Vector3().fromArray(wrist.userData.restHead)).normalize();
    const across=new THREE.Vector3().fromArray(bones[`finger2-1_${side}`].userData.restHead).sub(new THREE.Vector3().fromArray(bones[`finger5-1_${side}`].userData.restHead));
    across.addScaledVector(forward,-across.dot(forward)).normalize();
    const up=new THREE.Vector3().crossVectors(forward,across);
    const rest=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,up,forward));
    const desiredForward=new THREE.Vector3(0,0,-1), desiredAcross=new THREE.Vector3(i===0?1:-1,0,0);
    const desiredUp=new THREE.Vector3().crossVectors(desiredForward,desiredAcross);
    const flat=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(desiredAcross,desiredUp,desiredForward)).multiply(rest.invert());
    for(let finger=2;finger<=5;finger++)for(let joint=1;joint<=3;joint++) {
      bones[`finger${finger}-${joint}_${side}`]?.quaternion.setFromAxisAngle(across,(i===0?-1:1)*[0,0.16,0.25,0.12][joint]);
    }
    return {wrist,flat};
  });
  const target = new THREE.Vector3(), pole = new THREE.Vector3(), world = new THREE.Quaternion(), parent = new THREE.Quaternion();
  let walking = 0, sitting = 0, handBlend = 0, velocity = 1.4, gait = seed * 0.71, elapsed = seed * 0.71;
  const point = (out,x,y,z) => model.localToWorld(out.set(x*factor,y*factor,z*factor));
  function step(dt, { moving = false, speed = 1.4, seated = false, dealing = false, lookYaw = 0 } = {}) {
    elapsed += dt;
    walking = THREE.MathUtils.damp(walking,moving?1:0,8,dt);
    sitting = THREE.MathUtils.damp(sitting,seated?1:0,9,dt);
    handBlend = THREE.MathUtils.damp(handBlend,dealing?1:seated?0.65:0,9,dt);
    for(const hand of hands)hand.wrist.quaternion.identity();
    velocity = THREE.MathUtils.damp(velocity,THREE.MathUtils.clamp(speed,0.35,3),6,dt);
    gait += dt*THREE.MathUtils.clamp(velocity*Math.PI*2,3.4,10.5);
    const phase = gait, cycle = (elapsed+seed*0.37)%6;
    const reach = dealing ? Math.sin(THREE.MathUtils.clamp((cycle-0.4)/1.8,0,1)*Math.PI) : 0;
    root.position.y = restY - sitting*seatDrop + Math.sin(phase*2)*0.012*walking + Math.sin(elapsed*1.6)*0.002;
    chest.rotation.set(-0.025*sitting-0.018*reach,Math.sin(phase)*0.035*walking,Math.sin(phase)*0.013*walking);
    head.rotation.y = THREE.MathUtils.damp(head.rotation.y,lookYaw+Math.sin(elapsed*0.43)*0.035,7,dt);
    head.rotation.x = THREE.MathUtils.damp(head.rotation.x,-reach*0.10,7,dt);
    for (const limb of limbs) { limb.upper.quaternion.identity(); limb.lower.quaternion.identity(); }
    model.updateWorldMatrix(true,true);
    for (let i=0;i<2;i++) {
      const side=i===0?-1:1, swing=Math.sin(phase+i*Math.PI)*walking;
      const stride=-swing*0.23, lift=Math.max(0,Math.cos(phase+i*Math.PI))*0.08*walking;
      const ankleY=THREE.MathUtils.lerp(legs[i].end.userData.restHead[1]+0.004+lift,0.30,sitting)/factor;
      const ankleZ=THREE.MathUtils.lerp(stride,-0.18/factor,sitting);
      legs[i].solve(point(target,side*0.105,ankleY,ankleZ),point(pole,side*0.11,0.55,-0.65));
      // Keep the sole aligned with the floor, with a small heel roll while walking.
      model.getWorldQuaternion(world); legs[i].end.parent.getWorldQuaternion(parent).invert();
      legs[i].end.quaternion.copy(parent.multiply(world));
      legs[i].end.rotateX(-Math.max(0,swing)*0.14);
      let x=side*0.245,y=0.90,z=swing*0.20-0.015;
      if (dealing) { x=side*0.19+(i===1?-reach*0.11:0); y=1.07; z=i===1?-0.26-reach*0.25:-0.30; }
      else { y=THREE.MathUtils.lerp(y,1.02,sitting); z=THREE.MathUtils.lerp(z,-0.37,sitting); }
      arms[i].solve(point(target,x,y,z),point(pole,side*0.32,1.08,0.06));
      const hand=hands[i];model.getWorldQuaternion(world);world.multiply(hand.flat);
      hand.wrist.parent.getWorldQuaternion(parent).invert();
      hand.wrist.quaternion.slerp(parent.multiply(world),handBlend);
    }
    for(const skin of skins) if (skin.morphTargetInfluences) {
      const blink=(elapsed+seed)%4.3;
      skin.morphTargetInfluences[0]=blink<0.17?Math.sin(blink/0.17*Math.PI):0;
    }
    return { cycle, reach };
  }
  return { step, bones, height, seatDrop, hand: bones['finger3-2_R'] ?? bones.wrist_R };
}
