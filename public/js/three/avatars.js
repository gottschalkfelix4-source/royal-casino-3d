import * as THREE from 'three';
import { textSprite, createCard } from './assets.js';
import { instantiateCharacter } from './character-assets.js';
import { createCharacterMotion } from './character-motion.js';

export { preloadCharacters } from './character-assets.js';
export function hueFor(name) {
  let h=0; for(const c of name) h=(h*31+c.charCodeAt(0))%360; return h;
}
function seedFor(name) {
  let value=2166136261;for(const c of name)value=Math.imul(value^c.charCodeAt(0),16777619)>>>0;return value;
}

/** Each person owns their skeleton and materials; the authored topology and textures stay shared. */
export function createAvatar({ name, bot=false, dealer=false, variant=null }) {
  const seed=seedFor(name);
  if(!variant) {
    variant = dealer && /(?:Lea|Ana|Mia|Sofia|Lina|Emma)\b/i.test(name) ? 'woman' : ['man','man-dark','woman'][seed%3];
    if(dealer && /(?:Max|Tom)\b/i.test(name)) variant=name.includes('Max')?'man':'man-dark';
  }
  const group=new THREE.Group();group.userData.noBatch=true;
  const model=instantiateCharacter(variant);
  const height=model?.getObjectByName('Human')?.userData.height??1.8;
  const label=textSprite(dealer?`♠ ${name}`:name,{size:44,height:0.21,color:dealer?'#ead9a7':bot?'#c9d1dc':'#ffffff',bg:'rgba(15,19,25,0.6)'});
  label.position.y=height+0.16;group.add(label);group.userData.label=label;
  group.userData.variant=variant;
  if(!model) {
    // A failed local asset request must not prevent entering a game.
    group.userData.step=group.userData.dealerStep=group.userData.setPose=group.userData.lookAt=()=>{};
    return group;
  }
  group.add(model);
  const motion=createCharacterMotion(model,seed%101);
  let pose='idle',target=null,previousCycle=0,dealStart=null;
  const aim=new THREE.Vector3(),hand=new THREE.Vector3(),destination=new THREE.Vector3(0.1,0.99,-0.78);
  const held=dealer?createCard({r:1,s:'S'}):null;
  if(held) {held.scale.setScalar(0.08);held.visible=false;group.add(held);}
  group.userData.setPose=value=>{pose=value;label.position.y=height+0.16-(pose==='sit'?motion.seatDrop:0);};
  group.userData.lookAt=value=>{target=value?.clone()??null;};
  const update=(dt,moving,dealing,speed=1.4)=>{
    let lookYaw=0;
    if(target) {
      group.updateWorldMatrix(true,false);aim.copy(target);group.worldToLocal(aim);
      lookYaw=THREE.MathUtils.clamp(Math.atan2(-aim.x,-aim.z),-0.6,0.6);
    }
    const {cycle}=motion.step(dt,{moving,speed,seated:pose==='sit',dealing,lookYaw});
    if(held) {
      held.visible=dealing&&cycle>0.35&&cycle<2.8;
      if(!dealing)return;
      if(cycle<1.65) {
        motion.hand.updateWorldMatrix(true,false);motion.hand.getWorldPosition(hand);group.worldToLocal(hand);
        held.position.copy(hand);held.rotation.set(-Math.PI/2,0,0);
        dealStart=hand.clone();
      } else {
        const k=THREE.MathUtils.smoothstep(cycle,1.65,2.2);
        held.position.copy(dealStart??destination).lerp(destination,k);
        held.position.y+=Math.sin(k*Math.PI)*0.025;
      }
      if(cycle<previousCycle)dealStart=null;
      previousCycle=cycle;
    }
  };
  group.userData.step=(dt,moving,speed)=>update(dt,moving,false,speed);
  group.userData.dealerStep=dt=>update(dt,false,true);
  group.userData.rig=motion.bones;
  group.userData.model=model;
  // Start in a relaxed pose; the model's authoring A-pose is never displayed.
  for(let i=0;i<3;i++)update(1/60,false,dealer);
  return group;
}

export function floatText(engine, position, text, color) {
  const label=textSprite(text,{size:48,color,bg:'rgba(0,0,0,0.55)',height:0.3});
  label.position.copy(position).add(new THREE.Vector3(0,2.1,0)); engine.scene.add(label);
  engine.tween(1800,k=>{label.position.y=position.y+2.1+k;label.material.opacity=1-k*k;}).then(()=>{
    label.removeFromParent();label.material.map?.dispose();label.material.dispose();
  });
}
