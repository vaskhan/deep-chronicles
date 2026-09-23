// Громовое ущелье: зона 25–40 уровней в юго-восточном углу карты, за лесом и пустошью.
// Чистые функции без импортов (world-core.js импортирует этот модуль, обратного импорта нет):
// локальные координаты ущелья, рельеф, границы стен, река, водопад и стаи.
//
// Ущелье — изогнутый коридор вдоль оси A → B. Координаты внутри:
//   u — расстояние вдоль оси от входа (0 — устье, растёт к вершине),
//   s — поперечное смещение от оси с учётом изгиба (минус — левый берег, там река).
// Три яруса по u: нижние террасы, водопад и гроты, вершина с развалинами заставы.

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
// Свой детерминированный шум: мелкая неровность камня не должна зависеть от шума основного мира.
const h2 = (x, y) => { const s = Math.sin(x * 91.7 + y * 47.3) * 24634.6345; return s - Math.floor(s); };
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const ridge = (x, y) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { s += a * (1 - Math.abs(noise(x * f, y * f) * 2 - 1)); a *= 0.5; f *= 2.1; } return s; };

export const GORGE = {
  id: 'gorge', name: 'Громовое ущелье', lv: '25–40',
  // ось: устье у края пустоши → вершина у угла карты
  ax: 410, az: 330, dx: 0.6, dz: 0.8, length: 440,
  // круг для подписи на карте и для общих списков зон; принадлежность точки решает inGorge
  x: 545, z: 510, r: 240,
  ground: [0.42, 0.44, 0.4],
};

// Ярусы по оси u. Уровни мобов каждого яруса лежат внутри lv.
export const GORGE_TIERS = [
  { id: 'terraces', name: 'Нижние террасы', lv: [25, 30], u0: -40, u1: 196 },
  { id: 'falls', name: 'Водопад и гроты', lv: [30, 35], u0: 196, u1: 336 },
  { id: 'summit', name: 'Вершина · развалины заставы', lv: [35, 40], u0: 336, u1: 480 },
];

// Уступ водопада и подъёмы между ярусами.
export const FALLS = { u: 195, low: 26, high: 46 };
const SUMMIT_RISE = { u0: 318, u1: 352, low: 52, high: 66 };
// Двор развалин на вершине оставлен пустым: место под будущего рейд-босса.
export const SUMMIT_YARD = { u: 440, s: 4, r: 22 };

// изгиб оси: ущелье не прямое, видно из любой точки только часть
const bend = (u) => 24 * Math.sin((u / 440) * Math.PI * 1.6);

export function gorgeLocal(x, z) {
  const px = x - GORGE.ax, pz = z - GORGE.az;
  const u = px * GORGE.dx + pz * GORGE.dz;
  const v = px * GORGE.dz - pz * GORGE.dx;
  return { u, s: v - bend(u) };
}
export function gorgeWorld(u, s) {
  const v = s + bend(u);
  return { x: GORGE.ax + u * GORGE.dx + v * GORGE.dz, z: GORGE.az + u * GORGE.dz - v * GORGE.dx };
}

// Полуширина дна: левая (к реке) и правая стена отдельно, у гротов — ниши в стенах.
export function halfWidth(u, side) {
  let w = mix(46, 34, sm(170, 215, u));
  w = mix(w, 60, sm(330, 372, u));
  // ниши гротов второго яруса, поочерёдно слева и справа
  const niche = (c, r) => Math.max(0, 1 - Math.abs(u - c) / r);
  if (side < 0) w += 14 * sm(0, 1, niche(242, 16)) + 12 * sm(0, 1, niche(300, 14));
  else w += 13 * sm(0, 1, niche(270, 16));
  // устье сужается воротами, конец вершины закрыт горой
  w = mix(w, 30, 1 - sm(-40, 10, u));
  return w * (1 - sm(466, 492, u));
}

// Русло: река идёт по левой половине дна от родника в дальнем гроте до устья.
export const riverS = (u) => -mix(20, 13, sm(200, 300, u)) + 3 * Math.sin(u * 0.045);
export const RIVER = { u0: -34, u1: 304, width: 7 };
// Бочаг под водопадом: чаша, в которую падает вода (мелкая — проходима).
export const POOL = { u: 186, r: 10, depth: 1.6 };

// Сглаженное дно без ступеней и отвеса: на него опираются стены и массив за ними,
// чтобы уступы дна не прорезали горы насквозь.
function floorSoft(u) {
  let f = 6 + 20 * sm(-10, 190, u);
  f += 20 * sm(FALLS.u - 20, FALLS.u + 40, u) + 6 * sm(215, 318, u);
  f = mix(f, SUMMIT_RISE.high, sm(SUMMIT_RISE.u0, SUMMIT_RISE.u1, u));
  return f + 4 * sm(360, 470, u);
}

// Высота дна по оси u и поперечному положению s.
export function floorAt(u, s) {
  // нижние террасы: четыре ступени по 5 м с пологими уступами
  const k = Math.min(4, Math.max(0, (u + 10) / 46));
  const step = Math.floor(k), frac = k - step;
  let f = 6 + 5 * (step + sm(0.72, 1, frac));
  f = Math.min(f, FALLS.low);
  // уступ водопада: у реки отвесный, у правой стены — длинный пандус
  const cliff = sm(FALLS.u - 2, FALLS.u + 2, u), ramp = sm(FALLS.u - 20, FALLS.u + 40, u);
  const side = sm(-4, 10, s);
  f = mix(f, FALLS.high, mix(cliff, ramp, side));
  // гроты полого поднимаются, дальше подъём на вершину
  f += 6 * sm(215, 318, u);
  f = mix(f, SUMMIT_RISE.high, sm(SUMMIT_RISE.u0, SUMMIT_RISE.u1, u));
  f += 4 * sm(360, 470, u);
  return f;
}

// Влияние ущелья на рельеф (0 — мир не тронут). Массив гор держит дно и стены,
// на внешних склонах плавно отдаёт высоту обычному рельефу.
const MASSIF = 96, FADE = 64;
export function gorgeMask(u, s) {
  const w = Math.max(halfWidth(u, Math.sign(s) || 1), 30);
  return sm(-120, -50, u) * (1 - sm(w + MASSIF, w + MASSIF + FADE, Math.abs(s)));
}
// Быстрая отсечка по прямоугольнику: всё, что дальше, рельеф ущелья не трогает.
export const GORGE_BOUNDS = { x0: 190, x1: 1000, z0: 70, z1: 1000 };

export function gorgeHeight(x, z, base) {
  if (x < GORGE_BOUNDS.x0 || z < GORGE_BOUNDS.z0 || x > GORGE_BOUNDS.x1 || z > GORGE_BOUNDS.z1) return base;
  const { u, s } = gorgeLocal(x, z);
  const mask = gorgeMask(u, s);
  if (mask <= 0) return base;
  const side = s < 0 ? -1 : 1, w = halfWidth(u, side), a = Math.abs(s);
  const uc = Math.min(Math.max(u, -60), 470);
  let floor = mix(floorAt(uc, s), floorSoft(uc), sm(w - 2, w + 10, a));
  // мелкая неровность дна, крупнее на вершине
  floor += (noise(x * 0.11, z * 0.11) - 0.5) * mix(0.9, 1.6, sm(340, 420, u));
  // русло реки
  if (u > RIVER.u0 && u < RIVER.u1) {
    const d = Math.abs(s - riverS(u));
    floor -= 2.0 * (1 - sm(RIVER.width * 0.5, RIVER.width * 0.8, d)) * sm(RIVER.u0, RIVER.u0 + 20, u) * (1 - sm(RIVER.u1 - 14, RIVER.u1, u));
  }
  // бочаг под водопадом
  {
    const d = Math.hypot(u - POOL.u, s - riverS(POOL.u));
    if (d < POOL.r) floor -= POOL.depth * (1 - sm(POOL.r * 0.3, POOL.r, d));
  }
  // стены: отвес у подошвы, выше — зазубренный гребень; на вершине гребень ниже, но в снегу
  const rise = mix(40, 30, sm(330, 380, u)) * sm(-60, 10, u);
  const crag = ridge(x * 0.018, z * 0.018);
  // отвес стены с пластами-уступами и рваной кромкой: иначе стена читается гладким одеялом
  const face = rise * sm(w - 1, w + 12, a);
  const strata = face + 1.9 * Math.sin(face * 0.42 + noise(x * 0.05, z * 0.05) * 4) * sm(w, w + 4, a);
  const rough = 8 * (noise(x * 0.075, z * 0.075) - 0.45) * sm(w + 1, w + 8, a);
  const wall = strata + rough + (18 + 34 * crag) * sm(w + 8, w + 60, a) * sm(-60, 20, u);
  const peaks = 26 * sm(w + 40, w + 90, a) * ridge(x * 0.009 + 3, z * 0.009);
  const gorge = floor + wall + peaks;
  return mix(base, gorge, mask);
}

// Точка внутри ущелья (дно и подошва стен) — это зона «Громовое ущелье».
export function inGorge(x, z) {
  if (x < GORGE_BOUNDS.x0 || z < GORGE_BOUNDS.z0) return false;
  const { u, s } = gorgeLocal(x, z);
  if (u < -48 || u > 492) return false;
  return Math.abs(s) < halfWidth(u, s < 0 ? -1 : 1) + 16;
}
export const tierAt = (u) => GORGE_TIERS.find((t) => u < t.u1) || GORGE_TIERS[GORGE_TIERS.length - 1];

// Непроходимые стены: цепочки кругов по подошве обеих стен, у торца и вдоль кромки водопада.
// Проход наверх — только по пандусу у правой стены.
export function gorgeObstacles() {
  const out = [], add = (u, s, r) => { const p = gorgeWorld(u, s); out.push({ x: p.x, z: p.z, r }); };
  // шаг — по длине самой стены, а не по оси: у ниш и в сужении торца стена резко уходит вбок
  for (const side of [-1, 1]) {
    let last = null;
    for (let u = -14; u <= 492; u += 0.25) {
      const w = halfWidth(u, side);
      if (w < 4) break;
      const p = gorgeWorld(u, side * (w + 3.4));
      if (last && Math.hypot(p.x - last.x, p.z - last.z) < 3.2) continue;
      out.push({ x: p.x, z: p.z, r: 3.1 }); last = p;
    }
  }
  // торец вершины: цепочки стен сходятся, щели между ними нет
  for (let s = -12; s <= 12; s += 3) add(490, s, 3.1);
  // уступ водопада: от левой стены до начала пандуса — сверху и снизу обрыва
  for (let s = -halfWidth(FALLS.u, -1) - 2; s <= 1; s += 2.6) { add(FALLS.u - 3.2, s, 1.9); add(FALLS.u + 3.2, s, 1.9); }
  return out;
}

// Стаи ущелья: [u, s, [вид, число], ...]. Сородичи стоят компактно (соседи ближе SOCIAL_R),
// между стаями — больше радиуса агрессии, чтобы бой не тянул соседний лагерь.
export const GORGE_PACKS = [
  // нижние террасы 25–30
  [16, 16, ['cliff_spider', 4]],
  [34, -25, ['river_drowned', 3]],
  [58, 20, ['fang_warrior', 4]],
  [82, -4, ['cliff_spider', 3]],
  [104, 22, ['fang_warrior', 3], ['fang_shaman', 1]],
  [124, -26, ['river_drowned', 4]],
  [146, 10, ['cliff_spider', 5]],
  [170, 28, ['fang_warrior', 2], ['fang_shaman', 2]],
  [176, -18, ['river_drowned', 3]],
  // водопад и гроты 30–35
  [214, -12, ['pool_drowned', 4]],
  [226, 16, ['stone_guard', 3]],
  [246, -32, ['grotto_weaver', 4]],
  [268, 22, ['pool_drowned', 3]],
  [284, -8, ['stone_guard', 3]],
  [304, -26, ['grotto_weaver', 3]],
  [312, 16, ['stone_guard', 3]],
  // вершина и развалины заставы 35–40
  [362, -32, ['outpost_guard', 4]],
  [370, 30, ['outpost_guard', 3], ['outpost_warlock', 1]],
  [394, -2, ['summit_wraith', 3]],
  [412, 38, ['outpost_guard', 4]],
  [418, -42, ['summit_wraith', 3]],
  [446, 44, ['outpost_warlock', 2], ['outpost_guard', 2]],
  [462, -34, ['summit_wraith', 3]],
];

// Точки спавна стай. blocked(x, z) — проверка препятствий мира.
export function gorgeSpawns(blocked) {
  const out = [];
  GORGE_PACKS.forEach(([u, s, ...groups], k) => {
    const kinds = groups.flatMap(([mob, n]) => Array(n).fill(mob));
    const radius = kinds.length <= 3 ? 3.6 : 4.8;
    kinds.forEach((mob, i) => {
      for (let tries = 0; tries < 8; tries++) {
        const a = i * 2.3999632297 + k * 0.7 + tries * 0.9, d = (i === 0 && tries === 0 ? 0.6 : radius) * (1 - tries * 0.08);
        const p = gorgeWorld(u + Math.cos(a) * d, s + Math.sin(a) * d);
        if (blocked(p.x, p.z)) continue;
        out.push({ mob, x: p.x, z: p.z, pack: `gorge${k}` });
        break;
      }
    });
  });
  return out;
}

// Точка прибытия телепорта: устье, на сухом берегу напротив реки.
export const GORGE_ARRIVAL = gorgeWorld(-26, 12);
