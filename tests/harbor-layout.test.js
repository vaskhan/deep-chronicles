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

test('All three pier decks have exact walkable height up to both edges, independently of seabed',async()=>{
 const {heightAt}=await import('../src/world-core.js');
 const {townPiers}=buildProps();
 assert.equal(townPiers.length,3);
 for(const p of townPiers)for(let x=p.x0;x<=p.x1;x+=.37){
  for(const offset of [-p.halfWidth+.02,0,p.halfWidth-.02])assert.equal(heightAt(x,p.z+offset),p.y);
  assert.equal(blockedAt(x,p.z,.6),null,'pier entrance and deck stay clear');
 }
 for(const p of townPiers)assert.ok(heightAt(p.x1-1,p.z,false)<p.y-5,'sea floor stays below the deck');
});

test('Shipped harbor kit is self-contained and production code does not depend on local_assets',async()=>{
 const fs=await import('node:fs');
 const {HOUSE_KIT}=await import('../src/town-house-kit.js');
 for(const id of [...Object.keys(HOUSE_KIT),'merchant_complete']){
  const bytes=fs.readFileSync(new URL(`../godot/assets/town/houses/${id}.glb`,import.meta.url));
  assert.equal(bytes.toString('ascii',0,4),'glTF');
  const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
  assert.ok(gltf.meshes.length>0);assert.ok(gltf.images.length>0);
  for(const resource of [...gltf.buffers,...gltf.images])assert.ok(!resource.uri||resource.uri.startsWith('data:'),`${id}: external dependency ${resource.uri}`);
 }
 for(const file of ['town_architecture.gd','town_decor.gd']){
  const code=fs.readFileSync(new URL(`../godot/scripts/${file}`,import.meta.url),'utf8');
  assert.ok(code.includes('res://assets/town/houses/'));
  assert.ok(!code.includes('res://local_assets/'));
 }
});
