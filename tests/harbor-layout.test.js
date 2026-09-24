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
  assert.ok(blockedAt(originX+shop.interior.counterX*f,originZ,.45),`${shop.id} solid counter`);
  assert.equal(blockedAt(originX+shop.interior.sellerX*f,originZ,.45),null,`${shop.id} NPC behind counter`);
  assert.equal(blockedAt(originX+shop.interior.customerX*f,originZ,.6),null,`${shop.id} interaction point`);
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

test('General merchant stays inside a shop, apart from its specialist and within reach of the aisle',()=>{
 const props=buildProps(),merchant=props.npcs.find(n=>n.id==='harbor:shop');
 const shop=props.townShops.find(s=>s.town==='harbor'&&s.id===merchant.building);
 assert.ok(shop?.frontage,'general merchant must belong to an enterable building');
 assert.equal(merchant.shop,undefined,'keep the unfiltered general catalogue');
 assert.ok(Math.abs(merchant.x-shop.x)<shop.w*shop.scale/2);
 assert.ok(Math.abs(merchant.z-(shop.z-7*shop.scale))<shop.d*shop.scale/2);
 assert.equal(blockedAt(merchant.x,merchant.z,.65),null,'seller clear of furniture');
 const aisle={x:shop.x+shop.interior.customerX*shop.modelScale,z:merchant.z};
 assert.equal(blockedAt(aisle.x,aisle.z,.6),null,'customer can stand at the counter');
 assert.ok(Math.hypot(aisle.x-merchant.x,aisle.z-merchant.z)<8);
 for(const other of props.npcs.filter(n=>n.id!==merchant.id))assert.ok(Math.hypot(other.x-merchant.x,other.z-merchant.z)>1.8,'NPCs must not overlap');
});

test('Shop facade masonry uses a continuous planar UV map around the doorway',async()=>{
 const fs=await import('node:fs');
 const bytes=fs.readFileSync(new URL('../godot/assets/town/houses/merchant_complete.glb',import.meta.url));
 const jsonSize=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.toString('utf8',20,20+jsonSize));
 const mesh=gltf.meshes.find(m=>m.name==='SI_SH02');
 const wall=mesh.primitives.find(p=>gltf.materials[p.material].name==='sp_v_wall12d');
 const read=(name,width)=>{
  const a=gltf.accessors[wall.attributes[name]],v=gltf.bufferViews[a.bufferView];
  return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,k)=>bytes.readFloatLE(28+jsonSize+(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||width*4)+k*4)));
 };
 const positions=read('POSITION',3),uvs=read('TEXCOORD_0',2);
 const facade=positions.map((p,i)=>({p,uv:uvs[i]})).filter(v=>v.p[2]>2.61);
 assert.ok(facade.length>=30,'test covers the complete facade, including arch vertices');
 const left=facade.reduce((a,b)=>a.p[0]<b.p[0]?a:b),right=facade.reduce((a,b)=>a.p[0]>b.p[0]?a:b);
 for(const {p,uv} of facade){
  const t=(p[0]-left.p[0])/(right.p[0]-left.p[0]);
  assert.ok(Math.abs(uv[0]-(left.uv[0]+t*(right.uv[0]-left.uv[0])))<1e-5,'stone width must not shear with doorway triangulation');
 }
});


test('Shop entrance has vertical jambs from the threshold to the arch spring',async()=>{
 const fs=await import('node:fs');
 const bytes=fs.readFileSync(new URL('../godot/assets/town/houses/merchant_complete.glb',import.meta.url));
 const n=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.toString('utf8',20,20+n));
 const mesh=gltf.meshes.find(m=>m.name==='SI_SH02');
 const wall=mesh.primitives.find(p=>gltf.materials[p.material].name==='sp_v_wall12d');
 const a=gltf.accessors[wall.attributes.POSITION],v=gltf.bufferViews[a.bufferView],points=[];
 for(let i=0;i<a.count;i++){
  const start=28+n+(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||12);
  const p=[0,4,8].map(k=>bytes.readFloatLE(start+k));
  if(p[2]>2.61&&p[0]>0&&p[0]<1.6)points.push(p);
 }
 for(const x of [.319,1.249])for(const y of [-2.773,-2.289]){
  assert.ok(points.some(p=>Math.abs(p[0]-x)<.002&&Math.abs(p[1]-y)<.002),'jamb must stay vertical, without diamond-shaped widening');
 }
});

test('Every residential source has full-height doors at its configured uniform scale',async()=>{
 const fs=await import('node:fs');const {HOUSE_SCALE}=await import('../src/town-house-kit.js');
 for(const id of ['SI_H01','SI_H02','SI_H03','SI_H04']){
  const bytes=fs.readFileSync(new URL(`../godot/assets/town/houses/${id}.glb`,import.meta.url));
  const n=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.toString('utf8',20,20+n));let doors=0;
  for(const mesh of gltf.meshes)for(const p of mesh.primitives){
   if(!gltf.materials[p.material].name.startsWith('sp_v_door0'))continue;
   const a=gltf.accessors[p.attributes.POSITION];
   assert.ok((a.max[1]-a.min[1])*HOUSE_SCALE[id]>=3,`${id}: undersized door`);doors++;
  }
  assert.ok(doors>0,`${id}: actual door geometry must be measured`);
 }
 for(const house of townLayout('harbor').houses)assert.equal(house.modelScale,HOUSE_SCALE[house.model]);
});

test('Public buildings have clear entrances and level floors without tall foundation steps',async()=>{
 const {heightAt}=await import('../src/world-core.js');const world=buildProps();
 for(const b of [...world.townShops,...world.townCivic].filter(b=>b.frontage)){
  const f=b.modelScale,baseZ=b.z-7*b.scale,doorX=b.x+.48*f;
  let previous=heightAt(doorX,baseZ+3.8*f);
  for(let z=3.7;z>=1.5;z-=.1){
   const current=heightAt(doorX,baseZ+z*f);
   assert.equal(blockedAt(doorX,baseZ+z*f,.6),null,`${b.id}: doorway obstructed`);
   assert.ok(Math.abs(current-previous)<.12,`${b.id}: high threshold step`);previous=current;
  }
  const floor=world.townFloors.find(p=>Math.abs(p.x-b.x)<.01&&Math.abs(p.z-baseZ)<.01);
  assert.ok(floor);assert.ok(Math.abs(heightAt(doorX,baseZ+1.5*f)-floor.y)<.001);
 }
});

test('Visible gaps between residential footprints admit the player capsule',()=>{
 const world=buildProps(),houses=world.townHouses.filter(h=>h.town==='harbor');let checked=0;
 const perimeter=h=>{
  const c=Math.cos(h.rotation),s=Math.sin(h.rotation),w=h.w*h.scale,d=h.d*h.scale,points=[];
  for(let x=-w/2;x<=w/2;x+=.5)for(const z of [-d/2,d/2])points.push([h.x+c*x+s*z,h.z-s*x+c*z]);
  for(let z=-d/2;z<=d/2;z+=.5)for(const x of [-w/2,w/2])points.push([h.x+c*x+s*z,h.z-s*x+c*z]);
  return points;
 };
 const edges=houses.map(perimeter);
 for(let i=0;i<houses.length;i++)for(let j=i+1;j<houses.length;j++){
  let gap=Infinity,pair;
  for(const a of edges[i])for(const b of edges[j]){const d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(d<gap){gap=d;pair=[a,b];}}
  if(gap<1.6||gap>8)continue;
  const [a,b]=pair,x=(a[0]+b[0])/2,z=(a[1]+b[1])/2;
  assert.equal(blockedAt(x,z,.6),null,`invisible obstacle between ${houses[i].model} and ${houses[j].model}`);checked++;
 }
 assert.ok(checked>=2,'measure several actual alleys, not only the main streets');
});
