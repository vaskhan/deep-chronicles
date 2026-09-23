import { harborLandscapeHeight } from './harbor-landscape.js';
import { TOWN_DECOR, TOWN_SHOPS, TOWN_ROADS, TOWN_HOUSES, TOWN_GATES, gateObstacles, shopObstacles, townLayout, harborHeight } from './town-layout.js';
import { GORGE, GORGE_TIERS, GORGE_ARRIVAL, FALLS, POOL, SUMMIT_YARD, gorgeHeight, inGorge, gorgeLocal, gorgeWorld, gorgeObstacles, gorgeSpawns, halfWidth, floorAt, riverS, tierAt } from './gorge.js';
// Ядро мира без three.js: рельеф, зоны, расстановка построек, препятствия, спавны.
// Формы передаются наружу через «эмиттер» B — клиент строит из них меши, сервер берёт пустышку.
// Всё, что нужно и клиенту, и серверу (heightAt/zoneAt/obstacles/spawns), живёт здесь.

// ---------- шум ----------
export function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x, y) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 5; i++) { s += a * vnoise(x * f, y * f); a *= 0.5; f *= 2; } return s; };
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export const MAP = 1600; // сторона карты, м
export const DUNGEON = { x0: 2200, z0: -200, cell: 18, n: 11 }; // катакомбы — отдельная площадка за краем карты

export const TOWNS = [
  { id: 'harbor', name: 'Светлая Гавань', x: -430, z: 400, r: 136, scale: .8, color: 0xd8cfb8 },
  { id: 'ford', name: 'Каменный Брод', x: 430, z: -400, r: 76, scale: .8, color: 0xb8a890 },
];

// зоны: круги с уровнем и мобами; первая подходящая по расстоянию
export const ZONES = [
  { id: 'meadow', name: 'Солнечные луга', x: -300, z: 250, r: 320, lv: '1–9', mobs: [['rabbit', 14], ['wolf', 12], ['goblin', 10], ['boar', 8]], ground: [0.36, 0.55, 0.24] },
  { id: 'forest', name: 'Сумрачный лес', x: 20, z: 10, r: 300, lv: '10–17', mobs: [['treant', 10], ['orc', 10], ['spider', 9]], ground: [0.16, 0.3, 0.14] },
  { id: 'waste', name: 'Выжженная пустошь', x: 360, z: -120, r: 330, lv: '18–25', mobs: [['scorpion', 12], ['golem', 9]], ground: [0.66, 0.55, 0.36] },
  // Громовое ущелье: границу задаёт форма ущелья (inGorge), а не круг; мобы стоят стаями (gorgeSpawns).
  { id: GORGE.id, name: GORGE.name, x: GORGE.x, z: GORGE.z, r: GORGE.r, lv: GORGE.lv, mobs: [], ground: GORGE.ground, shaped: true },
];
// Hand-authored hunting rhythm on top of the deterministic world: two exits,
// small low-level clearings, then stronger groups further from the safe town.
export const HUNTING_CAMPS = [
  { id: 'east_rabbits', name: 'Западная дорога · 1', x: -620, z: 400, mob: 'rabbit', count: 12, radius: 19 },
  { id: 'north_rabbits', name: 'Опушка · 1', x: -430, z: 210, mob: 'rabbit', count: 12, radius: 19 },
  { id: 'east_wolves', name: 'Волчий лог · 3', x: -675, z: 385, mob: 'wolf', count: 9, radius: 20 },
  { id: 'north_wolves', name: 'Сухой ручей · 3', x: -447, z: 155, mob: 'wolf', count: 9, radius: 20 },
  { id: 'east_goblins', name: 'Разведчики руин · 5', x: -725, z: 360, mob: 'goblin', count: 8, radius: 20 },
  { id: 'north_goblins', name: 'Заброшенный тракт · 5', x: -455, z: 100, mob: 'goblin', count: 8, radius: 20 },
  { id: 'meadow_arrival', name: 'Охотничья стоянка · 1–3', x: -240, z: 185, mob: 'rabbit', count: 12, radius: 20 },
];

export const CRYPT = { x: 150, z: 250 }; // вход в катакомбы в лесу

export function zoneAt(x, z) {
  if (x > DUNGEON.x0 - 100) return { id: 'crypt', name: 'Катакомбы', lv: '18–28' };
  for (const t of TOWNS) if (Math.hypot(x - t.x, z - t.z) < t.r + 20) return { id: t.id, name: t.name, town: true, lv: 'мирная зона' };
  if (inGorge(x, z)) return ZONES[3];
  let best = null, bd = Infinity;
  for (const zn of ZONES) { if (zn.shaped) continue; const d = Math.hypot(x - zn.x, z - zn.z) / zn.r; if (d < bd) { bd = d; best = zn; } }
  return best;
}

export function heightAt(x, z) {
  if (x > DUNGEON.x0 - 100) return 0;
  let h = fbm(x * 0.006, z * 0.006) * 34 - 12;
  h += Math.pow(fbm(x * 0.02 + 5, z * 0.02), 2) * 6;
  // Separate ridges and low passes, rather than a square 90m perimeter wall.
  const edge = Math.max(Math.abs(x), Math.abs(z)) / (MAP / 2);
  if (edge > 0.76) {
    const peak = (px, pz, width, height) => height * Math.exp(-((x-px)**2+(z-pz)**2)/(width*width));
    const ridges = peak(-770,-660,230,95) + peak(120,-850,280,70) + peak(850,330,230,85);
    h += smooth(0.76, 1.05, edge) * ridges;
  }
  // Beyond the playable map the land descends below the sea; the terrain mesh
  // therefore ends underwater, not at a visible straight vertical cut.
  h = lerp(h, -14, smooth(1.01, 1.2, edge));
  // пустошь ровнее
  const w = ZONES[2]; h = lerp(h, h * 0.35 + 2, smooth(w.r, w.r * 0.5, Math.hypot(x - w.x, z - w.z)));
  // Громовое ущелье: горный массив с коридором; вне своего прямоугольника высоту не трогает
  h = gorgeHeight(x, z, h);
  h = harborLandscapeHeight(x, z, h);
  // города — ровные площадки
  for (const t of TOWNS) { const d = Math.hypot(x - t.x, z - t.z); h = lerp(4, h, smooth(t.r, t.r + 60, d)); }
  h = harborHeight((x-TOWNS[0].x)/TOWNS[0].scale,(z-TOWNS[0].z)/TOWNS[0].scale,h);
  // площадка у склепа
  h = lerp(heightAtBase(CRYPT.x, CRYPT.z), h, smooth(14, 30, Math.hypot(x - CRYPT.x, z - CRYPT.z)));
  return h;
}
function heightAtBase(x, z) { return fbm(x * 0.006, z * 0.006) * 34 - 12; }

// препятствия: круги {x,z,r}
export const obstacles = [];
const addObs = (x, z, r) => obstacles.push({ x, z, r });

// эмиттер-пустышка: сервер строит расстановку, но не геометрию
export const nullEmitter = { add() {}, use() {} };

function buildHarborWalls(t,layout,B,heightAt) {
  const points=layout.outline;
  B.use('brick');
  for(let i=0;i<points.length;i++) {
    if(i===4)continue; // Набережная открыта к гавани.
    const [ax,az]=points[i], [bx,bz]=points[(i+1)%points.length],len=Math.hypot(bx-ax,bz-az),steps=Math.ceil(len/3);
    for(let j=0;j<steps;j++) {
      const u=(j+.5)/steps,x=ax+(bx-ax)*u,z=az+(bz-az)*u;
      if(layout.gates.some(g=>Math.hypot(g.x-x,g.z-z)<13))continue;
      const wx=t.x+x,wz=t.z+z,y=heightAt(wx,wz),r=Math.atan2(bx-ax,bz-az);
      B.add('box',0xb0a997,wx,y+4,wz,r,2.1,8,len/steps+.15);
      if(j%2===0)B.add('box',0xc2baa7,wx,y+8.7,wz,r,2.3,1.4,1.5);
      addObs(wx,wz,1.85);
    }
  }
  for(let x=39;x<=110;x+=2.5)if(x<57||x>75)addObs(t.x+x,t.z-44,1.4);
  for(const x of [51,81])for(const z of [-59,-72,-87])addObs(t.x+x,t.z+z,.65);
  // Ограждение края воды с проёмами к трём причалам.
  for(let z=-24;z<=105;z+=2)if(![25,50,75].some(p=>Math.abs(z-p)<4))addObs(t.x+114,t.z+z,.9);
}

// Стены прямоугольных домов: углы не должны оставаться проходимыми.
function buildingObstacles(x,z,w,d,rotation=0) {
  const c=Math.cos(rotation),s=Math.sin(rotation);
  const add=(a,b)=>addObs(x+c*a+s*b,z-s*a+c*b,.8);
  const nx=Math.ceil(w/1.4),nz=Math.ceil(d/1.4);
  for(let i=0;i<=nx;i++)for(const side of [-1,1])add(-w/2+w*i/nx,side*d/2);
  for(let i=1;i<nz;i++)for(const side of [-1,1])add(side*w/2,-d/2+d*i/nz);
}

// План остаётся в исходных метрах; один масштаб применяется к геометрии,
// коллизиям и NPC. Высоту берём уже в окончательных мировых координатах.
function buildTown(t, B, npcs) {
  const scale=t.scale, startObs=obstacles.length, startNpc=npcs.length;
  const wx=x=>t.x+(x-t.x)*scale, wz=z=>t.z+(z-t.z)*scale;
  const emitter={use:key=>B.use(key),add:(shape,color,x,y,z,r,w,h,d)=>B.add(shape,color,wx(x),y,wz(z),r,w*scale,h,d*scale)};
  buildTownPlan({...t,r:t.r/scale},emitter,npcs,(x,z)=>heightAt(wx(x),wz(z)));
  for(const o of obstacles.slice(startObs)){o.x=wx(o.x);o.z=wz(o.z);o.r*=scale;}
  for(const npc of npcs.slice(startNpc)){npc.x=wx(npc.x);npc.z=wz(npc.z);}
}
function buildTownPlan(t, B, npcs, heightAt) {
  const y = heightAt(t.x, t.z), layout=townLayout(t.id);
  if (layout.outline) buildHarborWalls(t,layout,B,heightAt);
  // стена кольцом из сегментов, 4 ворот
  const segs = 36;
  B.use('brick');
  for (let i = 0; !layout.outline && i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    if (i % 9 === 0 || i % 9 === 8) continue; // проёмы ворот (стороны света)
    const x = t.x + Math.cos(a) * t.r, z = t.z + Math.sin(a) * t.r;
    B.add('box', 0x9a9088, x, y + 4, z, -a, 2.2, 8, (2 * Math.PI * t.r) / segs + 0.6);
    for (const k of [-1,0,1]) { const dx=-Math.sin(a)*k*4.5, dz=Math.cos(a)*k*4.5; B.add('box',0xb3aa95,x+dx,y+8.7,z+dz,-a,2.6,1.4,1.6); }
    B.add('box',0x978d79,x,y+1,z,-a,3.4,2,17);
    if (i % 3 === 0) { B.add('cyl', 0x8a8078, x, y + 6, z, 0, 5, 12, 5); B.use('roof_red'); B.add('cone', 0x6a3a2a, x, y + 14, z, 0, 6.5, 5, 6.5); B.use('brick'); addObs(x, z, 3); }
    else addObs(x, z, 2.4);
  }
  // площадь и фонтан
  B.use('cobble');
  B.add('cyl', 0xcfc6b0, t.x, y + 0.1, t.z, 0, t.id==='harbor'?18:40, 0.3, t.id==='harbor'?18:40);
  B.use('stone');
  B.add('cyl', 0x8a9aa8, t.x, y + 1, t.z, 0, 8, 2, 8);
  B.add('cyl', 0xd8d0c0, t.x, y + 3, t.z, 0, 1.2, 5, 1.2);
  B.use('plain'); B.add('cyl', 0x4a8ac8, t.x, y + 1.6, t.z, 0, 7, 0.4, 7);
  addObs(t.x, t.z, 4.5);
  // Жилые кварталы с проходами между рядами домов.
  for (const house of layout.houses) {
    const {w,d,h,rotation}=house, x=t.x+house.x,z=t.z+house.z,y=heightAt(x,z);
    B.use('house'); B.add('box', t.color, x, y+h/2, z, rotation, w,h,d);
    B.use(house.roof==='red'?'roof_red':'roof_blue');
    B.add('cone4',0x8a3a2a,x,y+h+w*.25,z,rotation,w*.95,w*.5,d*.95);
    buildingObstacles(x,z,w,d,rotation);
  }
  for (const g of layout.gates) for (const o of gateObstacles(g)) addObs(t.x+o.x,t.z+o.z,o.r);
  // Храм на собственной террасе, а не на общей оси всех домов.
  const tx=t.x+layout.temple.x,tz=t.z+layout.temple.z,ty=heightAt(tx,tz);
  B.use('brick'); B.add('box',0xeeeae0,tx,ty+7,tz,0,16,14,12);
  B.use('roof'); B.add('cone4',0xc8a040,tx,ty+19,tz,0,16,10,12);addObs(tx,tz,9);
  for(const hall of layout.civic) buildingObstacles(t.x+hall.x,t.z+hall.z,hall.w,hall.d);
  for (const item of layout.decor) addObs(t.x + item.x, t.z + item.z, item.r);
  for (const shop of layout.shops) for (const o of shopObstacles(shop)) addObs(t.x+o.x,t.z+o.z,o.r);
  // NPC
  npcs.push({ id: t.id + ':gk', town: t.id, role: 'gatekeeper', name: 'Хранитель врат', x: t.x + 12, z: t.z + 10, color: 0x9040d0 });
  npcs.push({ id: t.id + ':shop', town: t.id, role: 'merchant', name: 'Рыночный торговец', x: t.x - 20.5, z: t.z + 7, color: 0xd09030 });
  npcs.push({ id: t.id + ':priest', town: t.id, role: 'priest', name: 'Жрец', x: tx, z: tz + 13, color: 0xf0e8d0 });
  for (const shop of layout.shops) npcs.push({id:t.id+':'+shop.id,town:t.id,role:'merchant',shop:shop.id,name:shop.name,rotation:shop.frontage?-Math.PI/2:0,x:t.x+shop.x+(shop.frontage?3.9*shop.modelScale/.8:0),z:t.z+shop.z+(shop.frontage?-7:2),color:0xc4a479});
  // Стражи стоят у настоящих входов.
  layout.gates.forEach((g,i)=>{const c=Math.cos(g.rotation),s=Math.sin(g.rotation);
    for(const k of [-1,1])npcs.push({id:`${t.id}:guard${i}${k}`,town:t.id,role:'guard',name:'Страж',x:t.x+g.x+s*8+c*k*5,z:t.z+g.z+c*8-s*k*5,color:0x8090a0});
  });
  if(t.id==='harbor')npcs.push({id:'harbor:smith',town:t.id,role:'merchant',shop:'weapons',name:'Кузнец',x:t.x-74,z:t.z+84,color:0x9e7954});
  // врата телепорта — светящееся кольцо
  B.use('stone'); B.add('cyl', 0x6a5aa0, t.x + 18, y + 0.3, t.z + 16, 0, 6, 0.6, 6);
}

function buildNature(B) {
  // деревья: густо в лесу, реже на лугах; камни в пустоши
  let placed = 0;
  for (let i = 0; i < 9000 && placed < 2600; i++) {
    const x = (hash(i, 1) - 0.5) * MAP * 0.95, z = (hash(i, 2) - 0.5) * MAP * 0.95;
    const zn = zoneAt(x, z); if (zn.town) continue;
    if (HUNTING_CAMPS.some(c => Math.hypot(x-c.x,z-c.z) < c.radius + 10)) continue;
    if (TOWNS.some((t) => Math.hypot(x - t.x, z - t.z) < t.r + 30)) continue;
    if (Math.hypot(x - CRYPT.x, z - CRYPT.z) < 30) continue;
    if (TELEPORTS.some((t) => Math.hypot(x - t.x, z - t.z) < 14)) continue; // точки прибытия свободны
    const h = heightAt(x, z); if (h < -5 || h > 55) continue;
    const p = hash(i, 3);
    if (zn.id === 'forest' && p < 0.75) {
      const s = 1 + hash(i, 4) * 1.2;
      B.use('bark'); B.add('cyl', 0x4a3020, x, h + 3 * s, z, 0, 0.9 * s, 6 * s, 0.9 * s);
      B.use('leaves'); B.add('cone', p < 0.4 ? 0x1f4a24 : 0x2a5a2a, x, h + 9 * s, z, 0, 7 * s, 11 * s, 7 * s);
      addObs(x, z, 1.2 * s); placed++;
    } else if (zn.id === 'meadow' && p < 0.12) {
      const s = 1 + hash(i, 4);
      B.use('bark'); B.add('cyl', 0x5a3a22, x, h + 2 * s, z, 0, 0.8 * s, 4 * s, 0.8 * s);
      B.use('leaves'); B.add('ico', 0x3a7a30, x, h + 5.5 * s, z, 0, 3.2 * s, 2.8 * s, 3.2 * s);
      addObs(x, z, 1 * s); placed++;
    } else if (zn.id === 'waste' && p < 0.1) {
      const s = 1.5 + hash(i, 4) * 3;
      B.use('sandstone'); B.add('ico', 0x8a7050, x, h + s * 0.4, z, p * 30, s, s * 0.7, s * 1.2);
      addObs(x, z, s * 0.9); placed++;
    }
  }
}

// Громовое ущелье: стены-препятствия, валуны у подошвы и в реке, развалины заставы на вершине.
// Коллизии общие серверу и клиенту; вода, водопад и туман рисует клиент (godot/scripts/gorge.gd).
function buildGorge(B) {
  for (const o of gorgeObstacles()) addObs(o.x, o.z, o.r);
  const at = (u, s) => { const p = gorgeWorld(u, s); return { ...p, y: heightAt(p.x, p.z) }; };
  // валуны у подошвы стен — прячут стык рельефа и цепочки препятствий
  B.use('granite');
  for (let u = -14, i = 0; u < 470; u += 5 + hash(i, 38) * 9, i++) for (const side of [-1, 1]) {
    const w = halfWidth(u, side); if (w < 8) continue;
    const r = hash(i, side + 40);
    if (r < 0.35) continue; // не забор: камни группами с просветами
    const big = hash(i, side + 44) > 0.8, sz = (big ? 3.4 : 1.6) + r * (big ? 2 : 2.2), p = at(u, side * (w + 1 + hash(i, side + 46) * 3.5));
    B.add('ico', 0x6f7472, p.x, p.y + sz * 0.25, p.z, r * 9, sz * 1.25, sz * 0.75, sz);
  }
  // уступ водопада: обломки по кромке и под обрывом
  for (let k = 0; k < 10; k++) {
    const s = -halfWidth(FALLS.u, -1) + 2 + hash(k, 81) * (halfWidth(FALLS.u, -1) - 4);
    if (Math.abs(s - riverS(FALLS.u)) < 8) continue;
    const up = k % 2 === 0, p = at(FALLS.u + (up ? 3.5 : -4), s), sz = 1.4 + hash(k, 82) * 2.2;
    B.add('ico', 0x6f7472, p.x, p.y + sz * 0.25, p.z, k, sz * 1.3, sz * 0.8, sz);
  }
  // гроты: тёмные зевы в нишах стен второго яруса
  B.use('plain');
  const facing = Math.atan2(-GORGE.dz, GORGE.dx);
  const grottos = [[242, -1], [300, -1], [270, 1]];
  for (const [u, side] of grottos) {
    const w = halfWidth(u, side), p = at(u, side * (w + 0.8)), q = at(u, side * (w - 3)), y = heightAt(q.x, q.z);
    B.add('ico', 0x0b0e11, p.x, y + 2.4, p.z, facing, 6.2, 5, 3.2);
  }
  // каменное обрамление зевов
  B.use('granite');
  for (const [u, side] of grottos) for (const k of [-1, 1]) {
    const w = halfWidth(u + k * 6.5, side), p = at(u + k * 6.5, side * (w - 0.5)), sz = 2.4 + hash(u, k + 5) * 1.6;
    B.add('ico', 0x6f7472, p.x, p.y + sz * 0.3, p.z, u + k, sz * 1.1, sz * 1.1, sz);
  }
  // камни в русле и у бочага под водопадом (проходимы: вода мелкая)
  for (let i = 0; i < 26; i++) {
    const u = -20 + hash(i, 71) * 300, s = riverS(u) + (hash(i, 72) - 0.5) * 7, p = at(u, s), sz = 0.7 + hash(i, 73) * 1.1;
    if (Math.abs(u - FALLS.u) < 6) continue;
    B.add('ico', 0x5b6462, p.x, p.y + sz * 0.25, p.z, i, sz * 1.3, sz * 0.7, sz);
  }
  // развалины заставы: уцелевшая сторожевая башня, обломанные башни и куски стены вокруг пустого двора
  B.use('brick');
  {
    const p = at(476, -14);
    B.add('cyl', 0x8a8078, p.x, p.y + 6, p.z, 0, 5, 12, 5); B.use('roof_red'); B.add('cone', 0x6a3a2a, p.x, p.y + 14, p.z, 0, 6.5, 5, 6.5); B.use('brick');
    addObs(p.x, p.z, 3.4);
  }
  const towers = [[392, -44, 11], [404, 46, 7], [452, -46, 13], [466, 20, 5], [428, 54, 9]];
  towers.forEach(([u, s, hgt], k) => {
    const p = at(u, s), d = 6.5;
    B.add('cyl', 0x8d8a84, p.x, p.y + hgt / 2 - 0.6, p.z, 0, d, hgt, d);
    // обломанные зубцы по кольцу: у каждой башни свой излом
    for (let j = 0; j < 4; j++) {
      if (hash(k, j + 60) < 0.3) continue;
      const a = j * Math.PI / 2 + k, tall = 0.8 + hash(k, j + 61) * 1.8;
      B.add('box', 0x9b968c, p.x + Math.cos(a) * 2.6, p.y + hgt - 0.6 + tall / 2, p.z + Math.sin(a) * 2.6, -a, 1.2, tall, 1.8);
    }
    addObs(p.x, p.z, d / 2 + 0.4);
  });
  const walls = [[398, -30, 18, 3.2], [410, 28, 14, 2.4], [456, -26, 16, 4], [470, 6, 12, 2]];
  for (const [u, s, len, hgt] of walls) {
    const a = at(u, s), b = at(u + len * 0.9, s + len * 0.3), cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2, cy = heightAt(cx, cz);
    const r = Math.atan2(b.x - a.x, b.z - a.z), L = Math.hypot(b.x - a.x, b.z - a.z);
    B.add('box', 0x8f8b82, cx, cy + hgt / 2 - 0.4, cz, r, 1.6, hgt, L);
    for (let t = 0; t <= 1; t += 1 / Math.ceil(L / 2.4)) addObs(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 1.2);
  }
  // упавшие блоки у двора
  for (let i = 0; i < 12; i++) {
    const a = hash(i, 91) * Math.PI * 2, p = at(SUMMIT_YARD.u + Math.cos(a) * (SUMMIT_YARD.r + 3 + hash(i, 92) * 6), SUMMIT_YARD.s + Math.sin(a) * (SUMMIT_YARD.r + 3));
    B.add('box', 0x938e84, p.x, p.y + 0.5, p.z, a, 1.6 + hash(i, 93), 1, 1.2 + hash(i, 94));
  }
}

function buildCrypt(B) {
  const y = heightAt(CRYPT.x, CRYPT.z);
  B.use('brick');
  B.add('box', 0x5a5560, CRYPT.x, y + 5, CRYPT.z, 0, 14, 10, 14);
  B.use('roof'); B.add('cone4', 0x3a3540, CRYPT.x, y + 14, CRYPT.z, 0, 15, 8, 15);
  B.use('plain'); B.add('box', 0x0a0a10, CRYPT.x, y + 3, CRYPT.z + 7.05, 0, 4, 6, 0.3); // проём
  addObs(CRYPT.x, CRYPT.z, 7.5);
}

// лабиринт катакомб: генерация проходов (DFS), стены — препятствия
export const dungeonCells = [];
export const dungeonWalls = new Set(); // заполняется при генерации — для тестов проходимости
function buildDungeon(B) {
  const { x0, z0, cell, n } = DUNGEON;
  const vis = Array.from({ length: n }, () => Array(n).fill(false));
  const walls = new Set(); // "x,z,dir" dir: e/s
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { walls.add(`${i},${j},e`); walls.add(`${i},${j},s`); }
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const stack = [[0, 0]]; vis[0][0] = true;
  while (stack.length) {
    const [i, j] = stack[stack.length - 1];
    const nb = [[1, 0, 'e'], [-1, 0, 'w'], [0, 1, 's'], [0, -1, 'n']].filter(([di, dj]) => vis[i + di]?.[j + dj] === false);
    if (!nb.length) { stack.pop(); continue; }
    const [di, dj, d] = nb[Math.floor(rnd() * nb.length)];
    if (d === 'e') walls.delete(`${i},${j},e`); if (d === 'w') walls.delete(`${i - 1},${j},e`);
    if (d === 's') walls.delete(`${i},${j},s`); if (d === 'n') walls.delete(`${i},${j - 1},s`);
    vis[i + di][j + dj] = true; stack.push([i + di, j + dj]);
  }
  // лишние проходы — меньше тупиков
  for (let k = 0; k < n * 2; k++) { const i = Math.floor(rnd() * (n - 1)), j = Math.floor(rnd() * n); walls.delete(`${i},${j},e`); }
  for (const w of walls) dungeonWalls.add(w);
  const size = n * cell;
  B.use('dfloor'); B.add('box', 0x3a3438, x0 + size / 2, -0.5, z0 + size / 2, 0, size, 1, size);
  const wall = (x, z, sx, sz) => {
    B.use('dbrick'); B.add('box', 0x5a5460, x, 4, z, 0, sx, 8, sz);
    // препятствия — цепочка кругов вдоль стены
    const len = Math.max(sx, sz), steps = Math.ceil(len / 2.5);
    for (let s = 0; s <= steps; s++) { const t = s / steps - 0.5; addObs(x + (sx > sz ? t * sx : 0), z + (sz > sx ? t * sz : 0), 1.6); }
  };
  wall(x0 + size / 2, z0, size, 1.5); wall(x0 + size / 2, z0 + size, size, 1.5);
  wall(x0, z0 + size / 2, 1.5, size); wall(x0 + size, z0 + size / 2, 1.5, size);
  for (const w of walls) {
    const [i, j, d] = w.split(','); const ci = +i, cj = +j;
    if (d === 'e' && ci < n - 1) wall(x0 + (ci + 1) * cell, z0 + (cj + 0.5) * cell, 1.5, cell + 1.5);
    if (d === 's' && cj < n - 1) wall(x0 + (ci + 0.5) * cell, z0 + (cj + 1) * cell, cell + 1.5, 1.5);
  }
  // колонны и факелы в клетках
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const cx = x0 + (i + 0.5) * cell, cz = z0 + (j + 0.5) * cell;
    dungeonCells.push({ x: cx, z: cz, i, j });
    if ((i + j) % 3 === 0) B.use('plain'), B.add('cyl', 0xff8a30, cx, 7.5, cz - cell / 2 + 1.2, 0, 0.5, 1, 0.5);
  }
}

// расстановка мира: заполняет obstacles/dungeonCells/dungeonWalls и возвращает NPC и точки спавна.
// B — эмиттер форм (клиент даёт свой, сервер — nullEmitter). Считается один раз на процесс.
let props = null;
export function buildProps(B = nullEmitter) {
  if (props) return props;
  const npcs = [];
  for (const t of TOWNS) buildTown(t, B, npcs);
  buildNature(B);
  buildGorge(B);
  buildCrypt(B);
  buildDungeon(B);
  const spawns = [];
  for (const zn of ZONES) for (const [mob, count] of zn.mobs) for (let k = 0; k < count; k++) {
    for (let tries = 0; tries < 30; tries++) {
      const a = hash(k * 13 + zn.x, mob.length * 7 + tries) * Math.PI * 2, d = Math.sqrt(hash(k, tries + zn.z)) * zn.r * 0.85;
      const x = zn.x + Math.cos(a) * d, z = zn.z + Math.sin(a) * d;
      if (zoneAt(x, z).id !== zn.id || heightAt(x, z) < -5 || heightAt(x, z) > 45) continue;
      if (TOWNS.some((t) => Math.hypot(x - t.x, z - t.z) < t.r + 40)) continue;
      if (blockedAt(x, z, 2)) continue;
      spawns.push({ mob, x, z }); break;
    }
  }
  const undead = ['skeleton', 'skeleton', 'ghoul', 'wraith'];
  dungeonCells.forEach((c, k) => { if (c.i + c.j > 1 && k % 2 === 0) spawns.push({ mob: undead[k % undead.length], x: c.x + 3, z: c.z - 2 }); });
  const last = dungeonCells[dungeonCells.length - 1];
  spawns.push({ mob: 'lich', x: last.x, z: last.z });
  for (const camp of HUNTING_CAMPS) {
    for (let i = 0; i < camp.count; i++) {
      const angle = i * 2.3999632297;
      const radius = Math.sqrt((i + 0.5) / camp.count) * camp.radius;
      const x = camp.x + Math.cos(angle) * radius, z = camp.z + Math.sin(angle) * radius;
      if (zoneAt(x,z).town || blockedAt(x,z,2) || heightAt(x,z) < -5) continue;
      spawns.push({ mob: camp.mob, x, z, camp: camp.id });
    }
  }
  // Стаи Громового ущелья идут в конце списка: номера старых точек и их ранги не сдвигаются.
  spawns.push(...gorgeSpawns((x, z) => blockedAt(x, z, 2)));
  // Solitary encounters fill empty stretches of each biome. Append them so
  // existing mobs keep their IDs/ranks; starter camps and gorge packs remain.
  for (const [zoneIndex, zn] of ZONES.entries()) {
    if (zn.shaped) continue;
    for (let encounter = 0; encounter < 36; encounter++) {
      for (const [speciesIndex, [mob]] of zn.mobs.entries()) {
        const seed = 8101 + zoneIndex * 10000 + speciesIndex * 1000 + encounter * 7;
        let best = null, clearanceSquared = 28 * 28;
        for (let attempt = 0; attempt < 80; attempt++) {
          const angle = hash(seed,attempt) * Math.PI * 2;
          const distance = Math.sqrt(hash(attempt+91,seed)) * zn.r * .96;
          const x = zn.x+Math.cos(angle)*distance, z = zn.z+Math.sin(angle)*distance;
          if (zoneAt(x,z).id !== zn.id) continue;
          if (TOWNS.some(t => Math.hypot(x-t.x,z-t.z) < t.r+40)) continue;
          if (TELEPORTS.some(t => Math.hypot(x-t.x,z-t.z) < 25)) continue;
          let nearestSquared=Infinity;
          for (const other of spawns) {
            nearestSquared=Math.min(nearestSquared,(other.x-x)**2+(other.z-z)**2);
            if (nearestSquared <= clearanceSquared) break;
          }
          if (nearestSquared <= clearanceSquared) continue;
          const y=heightAt(x,z);
          if (y < -3 || y > 40 || blockedAt(x,z,3)) continue;
          if (Math.max(Math.abs(heightAt(x+3,z)-y), Math.abs(heightAt(x-3,z)-y), Math.abs(heightAt(x,z+3)-y), Math.abs(heightAt(x,z-3)-y)) > 2) continue;
          // Prefer the largest local gap, spreading sightings over the map.
          clearanceSquared=nearestSquared; best={x,z};
        }
        if (best) spawns.push({mob,...best,habitat:`${zn.id}:${mob}:solo:${encounter}`});
      }
    }
  }
  const placed=(key)=>TOWNS.flatMap(t=>(townLayout(t.id)[key]||[]).map(v=>({...v,town:t.id,scale:t.scale,x:t.x+(v.x||0)*t.scale,z:t.z+(v.z||0)*t.scale,...(v.points?{points:v.points.map(([x,z])=>[t.x+x*t.scale,t.z+z*t.scale])}:{})})));
  props = {npcs,spawns,huntingCamps:HUNTING_CAMPS,gorge:gorgeOutline(),townGates:placed('gates'),townHouses:placed('houses'),townShops:placed('shops'),townRoads:placed('roads').map(r=>({...r,...(r.width?{width:r.width*r.scale}:{w:r.w*r.scale,d:r.d*r.scale})})),townDecor:placed('decor'),townCivic:placed('civic'),townOutlines:TOWNS.filter(t=>townLayout(t.id).outline).map(t=>({town:t.id,points:townLayout(t.id).outline.map(([x,z])=>[t.x+x*t.scale,t.z+z*t.scale])})),townTemples:TOWNS.map(t=>({scale:t.scale,x:t.x+townLayout(t.id).temple.x*t.scale,z:t.z+townLayout(t.id).temple.z*t.scale}))};
  return props;
}

// точки телепорта
export const TELEPORTS = [
  { id: 'harbor', name: 'Светлая Гавань', x: TOWNS[0].x + 18*TOWNS[0].scale, z: TOWNS[0].z + 22*TOWNS[0].scale, cost: 0 },
  { id: 'ford', name: 'Каменный Брод', x: TOWNS[1].x + 18*TOWNS[1].scale, z: TOWNS[1].z + 22*TOWNS[1].scale, cost: 0 },
  { id: 'hunting', name: 'Охотничьи угодья (1–5)', x: -608, z: 389, cost: 0 },
  { id: 'meadow', name: 'Солнечные луга (1–9)', x: -260, z: 180, cost: 80 },
  { id: 'forest', name: 'Сумрачный лес (10–17)', x: -20, z: 60, cost: 200 },
  { id: 'waste', name: 'Выжженная пустошь (18–25)', x: 300, z: -160, cost: 400 },
  { id: 'crypt', name: 'Катакомбы (18–28)', x: DUNGEON.x0 + DUNGEON.cell / 2, z: DUNGEON.z0 + DUNGEON.cell / 2, cost: 600 },
  { id: 'gorge', name: 'Громовое ущелье (25–40)', x: Math.round(GORGE_ARRIVAL.x), z: Math.round(GORGE_ARRIVAL.z), cost: 1000 },
];

// Контур ущелья, ярусы, река и водопад для клиента: зона по форме, подписи, вода и туман.
export function gorgeOutline() {
  const left = [], right = [], river = [], tiers = [];
  for (let u = -48; u <= 492; u += 6) {
    for (const [side, list] of [[-1, left], [1, right]]) { const p = gorgeWorld(u, side * (halfWidth(u, side) + 16)); list.push([+p.x.toFixed(2), +p.z.toFixed(2)]); }
  }
  for (let u = -34; u <= 304; u += 4) {
    const p = gorgeWorld(u, riverS(u)), l = gorgeWorld(u, riverS(u) - 4), r = gorgeWorld(u, riverS(u) + 4);
    river.push([+p.x.toFixed(2), +p.z.toFixed(2), +(floorAt(u, riverS(u)) - 1.35).toFixed(2), +(l.x - r.x).toFixed(3), +(l.z - r.z).toFixed(3)]);
  }
  for (const t of GORGE_TIERS) { const c = gorgeWorld(Math.max(t.u0, 0) * 0.5 + t.u1 * 0.5, 0); tiers.push({ id: t.id, name: t.name, lv: t.lv, u0: t.u0, u1: t.u1, x: +c.x.toFixed(1), z: +c.z.toFixed(1) }); }
  const lip = gorgeWorld(FALLS.u, riverS(FALLS.u)), across = gorgeWorld(FALLS.u, riverS(FALLS.u) + 1);
  const yard = gorgeWorld(SUMMIT_YARD.u, SUMMIT_YARD.s), pool = gorgeWorld(POOL.u, riverS(POOL.u));
  return {
    pool: { x: pool.x, z: pool.z, r: POOL.r, y: FALLS.low - 1.35 },
    polygon: [...right, ...left.reverse()], river, tiers,
    falls: { x: lip.x, z: lip.z, top: FALLS.high - 0.4, bottom: FALLS.low - 1.2, ax: across.x - lip.x, az: across.z - lip.z, width: 13 },
    yard: { x: yard.x, z: yard.z, r: SUMMIT_YARD.r }, axis: { x: GORGE.dx, z: GORGE.dz }, origin: { x: GORGE.ax, z: GORGE.az },
  };
}

// столкновения: круговые препятствия. Общая для клиента и сервера проверка шага.
export function blockedAt(x, z, r = 0) {
  for (const o of obstacles) if (Math.hypot(x - o.x, z - o.z) < o.r + r) return o;
  return null;
}
