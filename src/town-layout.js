import { SHOP_FLOOR_TRIANGLES } from './town-shop-floor.js';
import { SHOP_BARRIERS } from './town-shop-geometry.js';
import { houseDimensions } from './town-house-kit.js';
// Одна расстановка для серверных препятствий и визуального оформления Godot.
export const TOWN_DECOR = [
  {kind:'stall',x:-25,z:-8,r:3,rotation:Math.PI/2,color:'burgundy'},
  {kind:'stall',x:-25,z:7,r:3,rotation:Math.PI/2,color:'ochre'},
  {kind:'stall',x:-25,z:22,r:3,rotation:Math.PI/2,color:'green'},
  {kind:'bench',x:11,z:26,r:2,rotation:Math.PI},
  {kind:'bench',x:-8,z:26,r:2,rotation:Math.PI},
  {kind:'bench',x:27,z:-8,r:2,rotation:-Math.PI/2},
  {kind:'planter',x:21,z:-19,r:2,rotation:0},
  {kind:'planter',x:29,z:2,r:2,rotation:0},
  {kind:'planter',x:-15,z:26,r:2,rotation:0},
  {kind:'planter',x:18,z:27,r:2,rotation:0},
  {kind:'tree',x:30,z:-23,r:2.2,rotation:0},
  {kind:'tree',x:-34,z:28,r:2.2,rotation:0},
  {kind:'barrels',x:-29,z:14,r:1.5,rotation:0},
  {kind:'barrels',x:-29,z:-1,r:1.5,rotation:0},
  {kind:'lamp',x:-17,z:-10,r:.35,rotation:0},
  {kind:'lamp',x:17,z:-10,r:.35,rotation:0},
  {kind:'lamp',x:-5,z:24,r:.35,rotation:0},
  {kind:'lamp',x:22,z:8,r:.35,rotation:0},
];
export const TOWN_SHOPS = [
  {id:'weapons',name:'Оружейная',x:-39,z:-30,color:'burgundy',slots:['weapon','shield']},
  {id:'clothes',name:'Лавка одежды',x:39,z:-30,color:'green',slots:['head','armor','legs','gloves','feet']},
  {id:'alchemy',name:'Зелья и украшения',x:39,z:30,color:'ochre',slots:['ear','neck','ring']},
];
export const TOWN_ROADS = [
  {x:0,z:0,w:180,d:5}, {x:0,z:0,w:5,d:180},
  {x:-30,z:0,w:4,d:92}, {x:30,z:0,w:4,d:92},
  {x:0,z:-12,w:100,d:4}, {x:0,z:39,w:100,d:4},
];
export const SHOP_INTERIOR = {sellerX:2.55,generalSellerZ:1.4,customerX:1.2,counterX:2.05,counterZ:.6,counterDepth:2.8};
export function shopObstacles(shop) {
  if(shop.frontage) {
    const scale=shop.modelScale/.8;
    const points=[...SHOP_BARRIERS];
    if(shop.counter!==false)for(let z=SHOP_INTERIOR.counterZ-SHOP_INTERIOR.counterDepth/2;z<=SHOP_INTERIOR.counterZ+SHOP_INTERIOR.counterDepth/2;z+=.14)points.push([SHOP_INTERIOR.counterX,z,.18]);
    return points.map(([x,z,r=.1])=>({x:shop.x+x*scale,z:shop.z-7+z*scale,r:r*scale}));
  }
  const result=[{x:shop.x,z:shop.z-7,r:5.4}];
  for(let z=-4;z<=4;z+=1.5)for(const x of [-5,5])result.push({x:shop.x+x,z:shop.z+z,r:.85});
  for(let x=-4;x<=4;x+=1.5) result.push({x:shop.x+x,z:shop.z-4,r:.85});
  for(let x=-4;x<=4;x+=1.4) result.push({x:shop.x+x,z:shop.z-1.5,r:.7});
  result.push({x:shop.x+3.5,z:shop.z-.3,r:.5});
  return result;
}

// Кварталы группируются вдоль улиц; высота и ширина домов меняются по участкам.
export const TOWN_HOUSES = [];
const house = (x,z,rotation=0) => {
  if (Math.hypot(x,z)>84) return;
  const i=TOWN_HOUSES.length;
  TOWN_HOUSES.push({x,z,rotation,w:10+(i%3),d:9+(i%2),h:6.8+(i%3)*.65,roof:i%3?'red':'blue'});
};
for(const z of [-70,-53])for(const x of [-57,-39,-21,21,39,57])house(x,z,0);
for(const x of [-68,68])for(const z of [-32,-14,14,32,49])house(x,z,x<0?Math.PI/2:-Math.PI/2);
for(const z of [56,73])for(const x of [-48,-31,-15,15,31,48])house(x,z,Math.PI);
for(const x of [-20,20])house(x,-35,x<0?Math.PI/2:-Math.PI/2);
for(const x of [-47,47])house(x,8,x<0?Math.PI/2:-Math.PI/2);

export const TOWN_GATES = Array.from({length:4},(_,i)=>{
  const a=i*Math.PI/2-Math.PI/36;
  return {x:Math.cos(a)*95,z:Math.sin(a)*95,rotation:Math.PI/2-a};
});
export function gateObstacles(g) {
  // Локальная X направлена вдоль фасада, Z — наружу города.
  const c=Math.cos(g.rotation),s=Math.sin(g.rotation);
  return [-12,12,-8.4,8.4].map(x=>({x:g.x+c*x,z:g.z-s*x,r:Math.abs(x)>10?4:1.75}));
}
TOWN_ROADS.push(
  {x:0,z:-44,w:132,d:5},{x:0,z:46,w:132,d:5},
  {x:-56,z:4,w:5,d:112},{x:56,z:4,w:5,d:112},
  {x:0,z:-62,w:112,d:4},{x:0,z:65,w:114,d:4}
);
for(const x of [-55,55])for(const z of [-43,44])TOWN_DECOR.push({kind:'tree',x,z,r:2.2,rotation:0});
for(const x of [-12,12])for(const z of [-53,53])TOWN_DECOR.push({kind:'lamp',x,z,r:.35,rotation:0});
for(const cx of [-18,18]) {
  for(const dx of [-6,-3,0,3,6])for(const dz of [-2.5,2.5])
    TOWN_DECOR.push({kind:'hedge',x:cx+dx,z:34+dz,r:.9,rotation:0});
}
TOWN_DECOR.push({kind:'cart',x:-36,z:0,r:2.8,rotation:.2});
TOWN_DECOR.push({kind:'well',x:45,z:-12,r:2,rotation:0});

// Светлая Гавань: отдельный мастер-план. Каменный Брод сохраняет прежнюю схему.
export const HARBOR_PIERS = [25,50,75].map(z=>({x0:105,x1:155,z,halfWidth:2.9,y:-2.75}));
const harbor = {
  temple:{x:66,z:-76},
  outline:[[-119,-75],[-62,-115],[32,-120],[102,-114],[119,-50],[110,90],[55,110],[-30,108],[-111,78],[-130,20]],
  gates:[{x:-127.7,z:0,rotation:-1.686},{x:-5,z:108.59,rotation:.024},{x:-8,z:-117.87,rotation:-3.088}],
  shops:[{...TOWN_SHOPS[0],frontage:true,...houseDimensions("SI_SH02",3.6),x:-55,z:-16},{...TOWN_SHOPS[1],frontage:true,...houseDimensions("SI_SH02",3.6),x:-55,z:22},{...TOWN_SHOPS[2],frontage:true,...houseDimensions("SI_SH02",3.6),x:-96,z:32}],
  houses:[], roads:[], decor:TOWN_DECOR.filter(d=>['lamp','barrels','cart'].includes(d.kind)).map(d=>d.kind==='cart'?{...d,x:-36,z:-11}:d.kind==='barrels'?{...d,x:-31,z:d.z===-1?-8:d.z}:d),
  civic:[{id:'forge',name:'Кузнечный двор',x:-92,z:73,w:18,d:14,h:11},{id:'guild',name:'Дом гильдий',x:34,z:79,w:22,d:16,h:10},{id:'warehouse',name:'Портовый склад',x:82,z:72,w:20,d:13,h:12}],
};
harbor.civic=harbor.civic.map(s=>({...s,...houseDimensions("SI_SH02"),frontage:true,counter:false,interior:SHOP_INTERIOR}));
harbor.shops=harbor.shops.map(s=>({...s,interior:SHOP_INTERIOR}));
const road=(name,width,points)=>harbor.roads.push({name,width,points});
road('Торговая улица',6,[[-173,-8],[-127.7,0],[-108,5],[-82,0],[-55,2],[-22,0],[-8,0]]);
road('Храмовый подъём',7,[[8,-8],[24,-19],[41,-32],[66,-38],[66,-53],[66,-60]]);
road('Южная улица',6,[[0,12],[-2,34],[4,54],[6,76],[-1,93],[-5,108.59],[0,150]]);
road('Ремесленная улица',5,[[-22,9],[-38,34],[-59,48],[-59,60],[-59,87],[-43,96],[-20,91],[-1,93]]);
road('Портовая улица',7,[[4,34],[32,37],[55,45],[79,51],[109,50],[153,50]]);
road('Старый город',5,[[-108,5],[-113,-16],[-109,-45],[-101,-62],[-77,-69],[-52,-65],[-29,-58],[-12,-68],[-8,-92],[-8,-117.87],[-10,-160]]);
road('Улица пекарей',4,[[-101,-62],[-88,-92],[-65,-96],[-39,-90],[-8,-92]]);
road('Северный проход',4,[[-8,-92],[10,-84],[20,-61],[22,-42],[24,-19]]);
road('Лавочный переулок',4,[[-53.32,-10],[-65,-3],[-78,1],[-75.5,13],[-75.5,35],[-88,45],[-91,47],[-59,48]]);
road('Набережная',6,[[109,-5],[109,25],[109,50],[109,75],[95,85],[77,98],[50,101],[25,96],[-1,93]]);
for(const s of harbor.shops){
 const door=[s.x+.48*s.modelScale/.8,s.z-7+2.6*s.modelScale/.8];
 const next=[door[0],door[1]+5];
 const street=s.id==='weapons'?[-65,-3]:s.id==='clothes'?[-75.5,35]:[-88,45];
 road('Вход: '+s.name,2.4,[door,next,street]);
}
for(const hall of harbor.civic){
 const f=hall.modelScale/.8,door=[hall.x+.48*f,hall.z-7+2.6*f];
 const street=hall.id==='warehouse'?[95,85]:hall.id==='guild'?[25,96]:[-59,87];
 road('Вход: '+hall.name,2.8,[door,[door[0],door[1]+4],street]);
}
for(const z of [25,75])road('Причал',5,[[109,z],[153,z]]);
// Round lane corners in the shared plan, so visuals and walkability use the same route.
for(const r of harbor.roads){
 const original=r.points,rounded=[original[0]];
 for(let i=1;i<original.length-1;i++){
  const a=original[i-1],p=original[i],b=original[i+1];
  const cut=Math.min(2,Math.hypot(p[0]-a[0],p[1]-a[1])*.2,Math.hypot(b[0]-p[0],b[1]-p[1])*.2);
  const la=Math.hypot(p[0]-a[0],p[1]-a[1]),lb=Math.hypot(b[0]-p[0],b[1]-p[1]);
  const u=[p[0]+(a[0]-p[0])*cut/la,p[1]+(a[1]-p[1])*cut/la],v=[p[0]+(b[0]-p[0])*cut/lb,p[1]+(b[1]-p[1])*cut/lb];
  for(const t of [0,.5,1])rounded.push([(1-t)**2*u[0]+2*(1-t)*t*p[0]+t*t*v[0],(1-t)**2*u[1]+2*(1-t)*t*p[1]+t*t*v[1]]);
 }
 rounded.push(original.at(-1));r.points=rounded;
}
for(const [x,z] of [[-40,-26],[-48,37],[-16,48],[26,29],[78,-48],[-109,13],[25,109]])harbor.decor.push({kind:'tree',x,z,r:2.2,rotation:0});
for(const [x,z] of [[-22,-18],[14,-22],[48,-48],[72,-53],[-92,15],[-74,39],[16,67],[100,40],[100,64]])harbor.decor.push({kind:'lamp',x,z,r:.35,rotation:0});
for(const [x,z] of [[-38,19],[23,23],[81,-59],[-88,95],[52,103]])harbor.decor.push({kind:'bench',x,z,r:2,rotation:.2});
for(const [x,z] of [[28,25],[-40,23],[75,-58],[90,-62]])harbor.decor.push({kind:'planter',x,z,r:2,rotation:0});
harbor.decor.push({kind:'well',x:-83,z:-6,r:2,rotation:0});
// Connected street fronts, with narrow gaps between adjacent houses.
// Lots are explicit rather than scattered on a coarse background grid.
const segmentDistance=(x,z,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],q=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a[0]-q*dx,z-a[1]-q*dz);};
harbor.decor=harbor.decor.filter(o=>!harbor.shops.some(s=>Math.abs(o.x-s.x)<s.w/2+o.r&&Math.abs(o.z-(s.z-7))<s.d/2+o.r));
harbor.decor=harbor.decor.filter(o=>!harbor.roads.some(r=>r.points.slice(1).some((b,i)=>segmentDistance(o.x,o.z,r.points[i],b)<r.width/2+o.r+.7)));
function insideHarbor(x,z) {
  let inside=false;
  for(let i=0,j=harbor.outline.length-1;i<harbor.outline.length;j=i++) {
    const a=harbor.outline[i],b=harbor.outline[j];
    if((a[1]>z)!=(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
// Oriented footprints: buildings remain rigid and uniformly scaled at every angle.
function corners(o,margin=0) {
 const c=Math.cos(o.rotation||0),s=Math.sin(o.rotation||0);
 return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[o.x+c*a*(o.w/2+margin)+s*b*(o.d/2+margin),o.z-s*a*(o.w/2+margin)+c*b*(o.d/2+margin)]);
}
function overlaps(a,b) {
 const aa=corners(a,.65),bb=corners(b,.65);
 for(const angle of [a.rotation||0,b.rotation||0])for(const axis of [[Math.cos(angle),-Math.sin(angle)],[Math.sin(angle),Math.cos(angle)]]){
  const pa=aa.map(p=>p[0]*axis[0]+p[1]*axis[1]),pb=bb.map(p=>p[0]*axis[0]+p[1]*axis[1]);
  if(Math.max(...pa)<Math.min(...pb)||Math.max(...pb)<Math.min(...pa))return false;
 }
 return true;
}
function frontage(x,z,model,rotation=0) {
 const dimensions=houseDimensions(model),lot={x,z,...dimensions,rotation};
 const c=Math.cos(rotation),s=Math.sin(rotation);
 const near=(px,pz,margin)=>Math.abs(c*(px-x)-s*(pz-z))<lot.w/2+margin&&Math.abs(s*(px-x)+c*(pz-z))<lot.d/2+margin;
 if(!corners(lot,2).every(([px,pz])=>insideHarbor(px,pz)))return;
 // Keep the fountain square, elevated sanctuary and sloping waterfront clear.
 if(Math.hypot(x,z)<27 || (x>28&&z<-32) || x>98)return;
 const occupied=[...harbor.houses,...harbor.civic.map(o=>({...o,z:o.z-7})),...harbor.shops.map(o=>({...o,z:o.z-7}))];
 if(occupied.some(o=>overlaps(lot,o)))return;
 if(harbor.decor.some(o=>near(o.x,o.z,o.r+1)))return;
 for(const r of harbor.roads)for(let i=1;i<r.points.length;i++) {
  const a=r.points[i-1],b=r.points[i],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1]));
  for(let j=0;j<=steps;j++)if(near(a[0]+(b[0]-a[0])*j/steps,a[1]+(b[1]-a[1])*j/steps,r.width/2+.8))return;
 }
 const i=harbor.houses.length;
 harbor.houses.push({...lot,roof:i%3?'red':'blue',variant:i%4});
}
// Each facade follows its own stretch of lane. Larger homes terminate vistas;
// smaller homes close the gaps, leaving short passages and irregular courtyards.
const types=['SI_H04','SI_H01','SI_H02','SI_H03','SI_H01','SI_SH01','SI_H02','SI_SH03'];
for(let pass=0;pass<3;pass++)for(const [ri,r] of harbor.roads.entries()){
 if(['Причал','Храмовый подъём','Лавочный переулок'].includes(r.name))continue;
 for(let i=1;i<r.points.length;i++){
  const a=r.points[i-1],b=r.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length;
  for(let distance=4+pass*3;distance<length;distance+=7)for(const side of [-1,1]){
   const model=types[(ri+i+Math.floor(distance/7)+pass)%types.length];
   const size=houseDimensions(model),offset=r.width/2+size.d/2+1.5;
   const x=a[0]+dx*distance-dz*side*offset,z=a[1]+dz*distance+dx*side*offset;
   frontage(x,z,model,Math.atan2(dz,-dx)+(side<0?Math.PI:0));
  }
 }
}
// Close remaining street-front gaps without rescaling any asset.
for(let z=-103;z<=96;z+=5)for(let x=-113;x<=90;x+=5){
 let best=null,nearest=Infinity;
 for(const r of harbor.roads)for(let i=1;i<r.points.length;i++){
  const a=r.points[i-1],b=r.points[i],distance=segmentDistance(x,z,a,b);
  if(distance<nearest){nearest=distance;best=[a,b];}
 }
 if(nearest>22||nearest<10)continue;
 const [a,b]=best,angle=Math.atan2(b[1]-a[1],a[0]-b[0]);
 for(const model of ['SI_H04','SI_H02','SI_H01'])frontage(x,z,model,angle);
}
export const HARBOR_PLATFORMS = [...harbor.houses,...harbor.shops,...harbor.civic].map(b=>({...b,groundY:harborTerrain(b.x,b.z,4)}));
export function townLayout(id) {
  return id==='harbor'?harbor:{temple:{x:0,z:-26},outline:null,gates:TOWN_GATES,shops:TOWN_SHOPS,houses:TOWN_HOUSES,roads:TOWN_ROADS,decor:TOWN_DECOR,civic:[]};
}
function harborTerrain(x,z,base) {
  const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
  const temple=smooth(24,44,x)*smooth(-28,-52,z)*(1-smooth(115,138,x))*(1-smooth(-110,-135,z));
  let h=base+8*temple;
  const port=smooth(-35,-10,z)*(1-smooth(100,150,z))*(1-smooth(190,280,x));
  h=h*(1-smooth(67,106,x)*port)-3*smooth(67,106,x)*port;
  const sea=smooth(113,129,x)*(1-smooth(130,190,Math.abs(z-25)))*(1-smooth(225,290,x));
  h=h*(1-sea)-13*sea;
  return h;
}
export function harborHeight(x,z,base,walkable=true) {
  let h=harborTerrain(x,z,base),best=0,level=h;
  for(const b of HARBOR_PLATFORMS) {
    const centreZ=b.z-(b.frontage?7:0),angle=b.rotation||0,c=Math.cos(angle),s=Math.sin(angle);
    const dx=c*(x-b.x)-s*(z-centreZ),dz=s*(x-b.x)+c*(z-centreZ);
    const distance=Math.max(Math.abs(dx)-b.w/2,Math.abs(dz)-b.d/2);
    const t=Math.max(0,Math.min(1,1-distance/4)),weight=t*t*(3-2*t);
    if(weight>best){best=weight;level=b.groundY;}
  }
  h+=(level-h)*best;
  if(walkable)for(const b of HARBOR_PLATFORMS.filter(p=>p.frontage)) {
    const factor=b.modelScale/.8,px=(x-b.x)/factor,pz=(z-(b.z-7))/factor;
    if(Math.abs(px)>5||Math.abs(pz)>4)continue;
    for(const [ax,az,bx,bz,cx,cz,y] of SHOP_FLOOR_TRIANGLES){
      const d=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
      if(Math.abs(d)<1e-8)continue;
      const u=((bz-cz)*(px-cx)+(cx-bx)*(pz-cz))/d,v=((cz-az)*(px-cx)+(ax-cx)*(pz-cz))/d;
      if(u>=-.00001&&v>=-.00001&&u+v<=1.00001)h=Math.max(h,b.groundY+.08+(y-.13175)*b.modelScale);
    }
  }
  // Плоский настил причалов — часть общей поверхности движения.
  if(walkable)for(const p of HARBOR_PIERS)if(x>=p.x0&&x<=p.x1&&Math.abs(z-p.z)<=p.halfWidth)h=p.y;
  return h;
}
