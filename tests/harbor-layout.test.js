import test from 'node:test';
import assert from 'node:assert/strict';
import {buildProps,blockedAt,TOWNS} from '../src/world-core.js';
import {townLayout} from '../src/town-layout.js';
import {harborLandscapeHeight} from '../src/harbor-landscape.js';
buildProps();
test('Harbor street centerlines stay walkable for a character, including shop approaches',()=>{
 const town=TOWNS[0];
 for(const road of townLayout('harbor').roads)for(let i=1;i<road.points.length;i++){
  const a=road.points[i-1],b=road.points[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*2);
  for(let k=0;k<=n;k++){
   const x=town.x+(a[0]+(b[0]-a[0])*k/n)*town.scale,z=town.z+(a[1]+(b[1]-a[1])*k/n)*town.scale;
   assert.equal(blockedAt(x,z,.45),null,`${road.name}: ${x}, ${z}`);
  }
 }
});
test('Harbor landscape leaves the town platform and distant regions intact',()=>{
 for(const [x,z] of [[-430,400],[0,0],[430,-400],[-800,155],[-435,-100]])assert.equal(harborLandscapeHeight(x,z,7),7);
 let previous=harborLandscapeHeight(-435,-45,7);
 for(let z=-44;z<=355;z++){
  const height=harborLandscapeHeight(-435,z,7);
  assert.ok(Number.isFinite(height));assert.ok(Math.abs(height-previous)<.5,'no step across the hunting corridor');previous=height;
 }
});
test('Complete shop doorway is walkable and the merchant stands inside behind the counter',()=>{
 const town=TOWNS[0];
 for(const shop of townLayout('harbor').shops){
  const originX=town.x+shop.x*town.scale,originZ=town.z+(shop.z-7)*town.scale,f=shop.modelScale;
  for(let z=3.6;z>=1;z-=.1)assert.equal(blockedAt(originX+.48*f,originZ+z*f,.6),null,`${shop.id} doorway ${z}`);
  assert.ok(blockedAt(originX+3.1*f,originZ,.45),`${shop.id} solid counter`);
  assert.equal(blockedAt(originX+3.9*f,originZ,.45),null,`${shop.id} NPC behind counter`);
  assert.equal(blockedAt(originX+2*f,originZ,.6),null,`${shop.id} interaction point`);
 }
});
