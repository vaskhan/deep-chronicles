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
export function shopObstacles(shop) {
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
const harbor = {
  temple:{x:66,z:-76},
  outline:[[-120,-90],[-65,-133],[32,-145],[102,-124],[119,-50],[110,90],[55,128],[-30,142],[-122,87],[-148,20]],
  gates:[{x:-143,z:0,rotation:-1.82},{x:-5,z:138,rotation:.163},{x:-8,z:-140,rotation:-3.018}],
  shops:[{...TOWN_SHOPS[0],x:-55,z:-22},{...TOWN_SHOPS[1],x:-55,z:22},{...TOWN_SHOPS[2],x:-89,z:24}],
  houses:[], roads:[], decor:TOWN_DECOR.filter(d=>['stall','lamp','barrels','cart'].includes(d.kind)),
  civic:[{id:'forge',name:'Кузнечный двор',x:-74,z:72,w:18,d:14,h:11},{id:'guild',name:'Дом гильдий',x:34,z:79,w:22,d:16,h:10},{id:'warehouse',name:'Портовый склад',x:88,z:74,w:20,d:13,h:12}],
};
for(const [x,z,rotation] of [
 [-113,-46,.3],[-98,-66,.4],[-81,-80,.2],[-62,-94,.1],[-42,-105,.1],[-96,-30,.6],[-74,-49,.5],[-53,-65,.3],[-33,-81,.2],[-111,32,-.1],[-108,55,-.3],[-93,82,-.2],[-74,99,Math.PI],[-52,112,Math.PI],[-31,106,Math.PI],[-16,78,2.8],[6,93,3],[-46,62,2.4],[-38,82,2.5],[55,102,3.2],[73,92,3],[72,47,Math.PI/2],[84,18,Math.PI/2],[39,49,-.4],[53,22,-.3],[30,-109,0],[3,-112,0],[-25,-119,0]
]) {const i=harbor.houses.length;harbor.houses.push({x,z,rotation,w:11+i%3,d:10+i%2,h:6.8+i%3*.65,roof:i%3?'red':'blue'});}
const road=(name,width,points)=>harbor.roads.push({name,width,points});
road('Торговая улица',9,[[-173,-8],[-143,0],[-111,6],[-82,0],[-55,2],[-22,0],[-8,0]]);
road('Храмовый подъём',9,[[8,-8],[24,-19],[41,-32],[58,-43],[66,-53],[66,-60]]);
road('Южная улица',8,[[0,12],[-2,39],[5,65],[6,94],[-5,138],[0,171]]);
road('Ремесленная улица',7,[[-22,9],[-38,34],[-59,48],[-73,52],[-74,87],[-48,95],[6,94]]);
road('Портовая улица',9,[[4,34],[32,37],[55,45],[79,51],[109,50],[153,50]]);
road('Переулок гильдий',6,[[5,65],[27,61],[51,65],[70,58]]);
road('Старый город',6,[[-111,6],[-94,-11],[-87,-44],[-62,-59],[-48,-83],[-27,-94],[-8,-100],[-8,-140],[-10,-170]]);
road('Северный проход',5,[[-8,-100],[10,-84],[20,-61],[22,-42],[24,-19]]);
road('Лавочный переулок',5,[[-55,-13],[-65,-3],[-73,13],[-89,32],[-91,47],[-59,48]]);
road('Набережная',8,[[109,-5],[109,25],[109,50],[109,75],[100,99],[77,108],[50,113],[6,94]]);
for(const z of [25,75])road('Причал',5,[[109,z],[153,z]]);
for(const [x,z] of [[-40,-26],[-48,37],[-16,48],[26,29],[78,-48],[-109,13],[25,109]])harbor.decor.push({kind:'tree',x,z,r:2.2,rotation:0});
for(const [x,z] of [[-22,-18],[14,-22],[48,-48],[72,-53],[-92,15],[-74,39],[16,67],[100,40],[100,64]])harbor.decor.push({kind:'lamp',x,z,r:.35,rotation:0});
for(const [x,z] of [[-38,19],[23,23],[81,-59],[-88,95],[55,108]])harbor.decor.push({kind:'bench',x,z,r:2,rotation:.2});
for(const [x,z] of [[28,25],[-40,23],[75,-58],[90,-62]])harbor.decor.push({kind:'planter',x,z,r:2,rotation:0});
harbor.decor.push({kind:'well',x:-83,z:-6,r:2,rotation:0});
// Дополнительные фасады вдоль улиц. Отступ учитывает весь объём дома,
// соседние участки, лавки и проходы; результат одинаков на сервере и клиенте.
const segmentDistance=(x,z,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],q=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a[0]-q*dx,z-a[1]-q*dz);};
for(let z=-110;z<=115;z+=14)for(let x=-120;x<=95;x+=14) {
  if(harbor.houses.length>=64)break;
  const w=9+(harbor.houses.length%3),d=9,r=Math.hypot(w,d)/2;
  if(Math.hypot(x,z)<31||Math.hypot(x-66,z+76)<37||x>67&&z<-24)continue;
  if(harbor.outline.some((a,i)=>segmentDistance(x,z,a,harbor.outline[(i+1)%harbor.outline.length])<r+6))continue;
  // Ray crossing excludes candidates beyond the city wall.
  let inside=false;
  for(let i=0,j=harbor.outline.length-1;i<harbor.outline.length;j=i++){
    const a=harbor.outline[i],b=harbor.outline[j];
    if((a[1]>z)!=(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  if(!inside)continue;
  let closest=Infinity,angle=0,blocked=false;
  for(const road of harbor.roads)for(let i=0;i<road.points.length-1;i++){
    const a=road.points[i],b=road.points[i+1],distance=segmentDistance(x,z,a,b);
    if(distance<r+road.width/2+1)blocked=true;
    if(distance<closest){closest=distance;angle=Math.atan2(b[1]-a[1],b[0]-a[0]);}
  }
  if(blocked||closest>26)continue;
  if([...harbor.houses,...harbor.civic,...harbor.shops.map(s=>({...s,z:s.z-3,w:12,d:19})),...harbor.decor.map(o=>({...o,w:o.r*2,d:o.r*2}))].some(o=>Math.hypot(x-o.x,z-o.z)<r+Math.hypot(o.w,o.d)/2+1))continue;
  const i=harbor.houses.length;
  harbor.houses.push({x,z,w,d,h:6.8+i%3*.65,rotation:-angle,roof:i%3?'red':'blue',variant:i%4});
}
export function townLayout(id) {
  return id==='harbor'?harbor:{temple:{x:0,z:-26},outline:null,gates:TOWN_GATES,shops:TOWN_SHOPS,houses:TOWN_HOUSES,roads:TOWN_ROADS,decor:TOWN_DECOR,civic:[]};
}
export function harborHeight(x,z,base) {
  const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
  const temple=smooth(24,44,x)*smooth(-28,-52,z)*(1-smooth(115,138,x))*(1-smooth(-110,-135,z));
  let h=base+8*temple;
  const port=smooth(-35,-10,z)*(1-smooth(100,150,z))*(1-smooth(190,280,x));
  h=h*(1-smooth(67,106,x)*port)-3*smooth(67,106,x)*port;
  const sea=smooth(113,129,x)*(1-smooth(130,190,Math.abs(z-25)))*(1-smooth(225,290,x));
  h=h*(1-sea)-13*sea;
  // Плоский настил причалов — часть общей поверхности движения.
  if(x>=105&&x<=155&&[25,50,75].some(p=>Math.abs(z-p)<=3))h=-3;
  return h;
}
