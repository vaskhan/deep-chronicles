// Громовое ущелье (src/gorge.js): расстановка, стаи, телепорт, неизменность старого мира,
// умения мобов и продолжение кривой наград. npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { buildProps, zoneAt, heightAt, blockedAt, TELEPORTS, TOWNS, CRYPT, HUNTING_CAMPS, ZONES } from '../src/world-core.js';
import { GORGE, GORGE_TIERS, GORGE_PACKS, gorgeLocal, gorgeWorld, gorgeHeight, gorgeMask, tierAt, inGorge, halfWidth, FALLS, SUMMIT_YARD } from '../src/gorge.js';
import { MOBS, ITEMS, MAX_LEVEL } from '../src/data.js';
import { SOCIAL_R, famOf, social } from '../src/pack.js';
import { rankedDef } from '../src/elites.js';
import { mobHitEffects, guardTrigger } from '../src/mob-skills.js';
import { levelFactor, DEFAULT_RATES } from '../src/rates.js';
import { effectMul } from '../src/effects.js';

const { spawns, npcs } = buildProps();
const gorge = spawns.map((s, i) => ({ ...s, index: i + 1 })).filter((s) => s.pack);
const old = spawns.filter((s) => !s.pack);
const GORGE_KINDS = Object.keys(MOBS).filter((k) => gorge.some((s) => s.mob === k));

test('старый мир не изменился: 225 прежних точек спавна совпадают байт в байт и идут первыми', () => {
  assert.equal(old.length, 225);
  assert.ok(spawns.slice(0, 225).every((s) => !s.pack), 'стаи ущелья дописаны в конец: номера и ранги старых точек не сдвинулись');
  const fingerprint = crypto.createHash('sha1').update(JSON.stringify(old.map((s) => [s.mob, +s.x.toFixed(4), +s.z.toFixed(4), s.camp || '']))).digest('hex').slice(0, 12);
  assert.equal(fingerprint, '36d8d38829bf', 'координаты и виды прежних спавнов не должны меняться');
});

test('рельеф ущелья не трогает прежние зоны, города, катакомбы и точки прибытия', () => {
  const probe = (x, z, what) => assert.equal(gorgeHeight(x, z, 123.456), 123.456, `${what}: высота изменена ущельем`);
  for (const s of old) probe(s.x, s.z, `спавн ${s.mob}`);
  for (const n of npcs) probe(n.x, n.z, `NPC ${n.name}`);
  for (const t of TELEPORTS.filter((t) => t.id !== 'gorge')) probe(t.x, t.z, `телепорт ${t.id}`);
  for (const t of TOWNS) for (let a = 0; a < 6.28; a += 0.3) probe(t.x + Math.cos(a) * (t.r + 60), t.z + Math.sin(a) * (t.r + 60), t.name);
  for (const c of HUNTING_CAMPS) probe(c.x, c.z, c.name);
  probe(CRYPT.x, CRYPT.z, 'вход в катакомбы');
  for (const z of ZONES.filter((z) => z.id !== 'gorge')) probe(z.x, z.z, `центр зоны ${z.name}`);
  // прежние зоны определяются как раньше: ущелье не забирает их точки
  for (const s of old) if (!s.camp && s.x < 2000) assert.notEqual(zoneAt(s.x, s.z).id, 'gorge');
});

test('спавны ущелья: внутри зоны, не в препятствиях, на дне, а не на стене', () => {
  assert.ok(gorge.length >= 60, 'в ущелье достаточно целей для прокачки');
  for (const s of gorge) {
    assert.equal(zoneAt(s.x, s.z).id, 'gorge', `${s.mob} вне зоны`);
    assert.equal(blockedAt(s.x, s.z, 1.5), null, `${s.mob} стоит в препятствии`);
    const { u, s: side } = gorgeLocal(s.x, s.z);
    assert.ok(Math.abs(side) < halfWidth(u, side < 0 ? -1 : 1) - 3, `${s.mob} прижат к стене`);
    assert.ok(Number.isFinite(heightAt(s.x, s.z)));
  }
});

test('уровни мобов лежат в диапазоне своего яруса; на каждом ярусе 3–4 вида', () => {
  const kindsByTier = new Map(GORGE_TIERS.map((t) => [t.id, new Set()]));
  for (const s of gorge) {
    const tier = tierAt(gorgeLocal(s.x, s.z).u), lvl = MOBS[s.mob].lvl;
    assert.ok(lvl >= tier.lv[0] && lvl <= tier.lv[1], `${s.mob} ${lvl} вне яруса ${tier.name} ${tier.lv}`);
    kindsByTier.get(tier.id).add(s.mob);
  }
  for (const [id, kinds] of kindsByTier) assert.ok(kinds.size >= 3 && kinds.size <= 4, `${id}: ${kinds.size} видов`);
  // место под будущего рейд-босса на вершине свободно
  const yard = gorge.filter((s) => { const l = gorgeLocal(s.x, s.z); return Math.hypot(l.u - SUMMIT_YARD.u, l.s - SUMMIT_YARD.s) < SUMMIT_YARD.r; });
  assert.equal(yard.length, 0, 'двор развалин должен остаться пустым');
});

test('стаи компактны: сородичи в радиусе крика, соседние стаи не цепляют друг друга', () => {
  const packs = Map.groupBy(gorge, (s) => s.pack);
  assert.equal(packs.size, GORGE_PACKS.length);
  for (const [id, members] of packs) {
    assert.ok(members.length >= 3 && members.length <= 6, `${id}: ${members.length} в стае`);
    const fams = new Set(members.map((m) => famOf({ def: MOBS[m.mob], kind: m.mob })));
    assert.equal(fams.size, 1, `${id}: в стае одно семейство, иначе зов не поднимет соседей`);
    for (const m of members) {
      assert.ok(social({ def: MOBS[m.mob] }), `${m.mob} — стайный`);
      const nearest = Math.min(...members.filter((o) => o !== m).map((o) => Math.hypot(o.x - m.x, o.z - m.z)));
      assert.ok(nearest <= SOCIAL_R, `${id}: ${m.mob} отбился от стаи (${nearest.toFixed(1)})`);
    }
  }
  const list = [...packs.values()];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const same = famOf({ def: MOBS[list[i][0].mob], kind: list[i][0].mob }) === famOf({ def: MOBS[list[j][0].mob], kind: list[j][0].mob });
    const gap = Math.min(...list[i].flatMap((a) => list[j].map((b) => Math.hypot(a.x - b.x, a.z - b.z))));
    // крик одной стаи не должен доставать до сородичей соседней
    if (same) assert.ok(gap > SOCIAL_R, `стаи ${list[i][0].pack} и ${list[j][0].pack} слишком близко: ${gap.toFixed(1)}`);
    assert.ok(gap > 8, `стаи ${list[i][0].pack} и ${list[j][0].pack} слиплись`);
  }
});

test('элиты и чемпионы ущелья — по общим правилам src/elites.js', () => {
  const ranked = gorge.map((s) => rankedDef(MOBS[s.mob], s, s.index));
  const elites = ranked.filter((d) => d.rank === 'elite').length, champs = ranked.filter((d) => d.rank === 'champion').length;
  assert.ok(elites >= 3, `элит в ущелье: ${elites}`);
  assert.ok(elites + champs < gorge.length * 0.3, 'ранги не превратили зону в сплошную элиту');
  for (const d of ranked.filter((d) => d.rank)) assert.ok(d.onHit || d.guard || d.baseName, 'ранг сохраняет умения моба');
});

// Проходимость по сетке 2 м: препятствия-стены держат, но от телепорта можно дойти до каждой стаи.
test('телепорт в ущелье доступен у Хранителя врат, а от точки прибытия можно дойти до каждой стаи', () => {
  const tp = TELEPORTS.find((t) => t.id === 'gorge');
  assert.ok(tp && tp.cost === 1000, 'телепорт стоит 1000 монет — ступенью выше катакомб');
  assert.ok(tp.cost > TELEPORTS.find((t) => t.id === 'crypt').cost);
  assert.equal(zoneAt(tp.x, tp.z).id, 'gorge');
  assert.equal(blockedAt(tp.x, tp.z, 1), null);
  const cell = 2, key = (i, j) => i * 10000 + j, start = [Math.round(tp.x / cell), Math.round(tp.z / cell)];
  const seen = new Set([key(...start)]), queue = [start];
  while (queue.length) {
    const [i, j] = queue.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, k = key(ni, nj);
      if (seen.has(k)) continue;
      const x = ni * cell, z = nj * cell;
      if (!inGorge(x, z) || blockedAt(x, z, 0.6)) continue;
      seen.add(k); queue.push([ni, nj]);
    }
  }
  for (const s of gorge) {
    const i = Math.round(s.x / cell), j = Math.round(s.z / cell);
    const near = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => seen.has(key(i + a, j + b)));
    assert.ok(near, `${s.mob} (${s.pack}) недостижим от телепорта`);
  }
});

test('стены ущелья сплошные: со склона массива на дно не спуститься, кроме как через устье', () => {
  // Обход ограничен частью ущелья дальше устья (u > 0): отсюда на дно можно попасть только сквозь стену.
  const cell = 2, key = (i, j) => i * 10000 + j;
  for (const [u0, side] of [[120, -1], [250, 1], [400, -1], [470, 1]]) {
    const p = gorgeWorld(u0, side * (halfWidth(u0, side) + 10)), start = [Math.round(p.x / cell), Math.round(p.z / cell)];
    const seen = new Set([key(...start)]), queue = [start];
    let inside = 0;
    while (queue.length && seen.size < 60000) {
      const [i, j] = queue.pop();
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj, k = key(ni, nj);
        if (seen.has(k)) continue;
        const x = ni * cell, z = nj * cell, l = gorgeLocal(x, z);
        if (l.u < 0 || l.u > 520 || Math.abs(l.s) > 140 || blockedAt(x, z, 0.6)) continue;
        seen.add(k); queue.push([ni, nj]);
        if (Math.abs(l.s) < halfWidth(l.u, l.s < 0 ? -1 : 1) - 4) inside++;
      }
    }
    assert.equal(inside, 0, `со склона у u=${u0} можно пройти на дно ущелья`);
  }
});

test('уступ водопада непроходим у реки: подъём наверх только пандусом у правой стены', () => {
  // прямая линия вверх через отвес у реки упирается в препятствие
  let hit = false;
  for (let u = FALLS.u - 8; u <= FALLS.u + 8; u += 0.5) { const p = gorgeWorld(u, -10); if (blockedAt(p.x, p.z, 0.6)) hit = true; }
  assert.ok(hit, 'через отвес у реки можно пройти');
  let free = true;
  for (let u = FALLS.u - 25; u <= FALLS.u + 40; u += 0.5) { const p = gorgeWorld(u, 22); if (blockedAt(p.x, p.z, 0.6)) free = false; }
  assert.ok(free, 'пандус у правой стены перекрыт');
});

test('мобы ущелья: модель-основа из манифеста, семейство, добыча из каталога, кривая наград растёт', () => {
  const manifest = JSON.parse(fs.readFileSync('godot/assets/manifest.json', 'utf8'));
  assert.ok(GORGE_KINDS.length >= 10);
  for (const kind of GORGE_KINDS) {
    const def = MOBS[kind], entry = manifest.actors[kind];
    assert.ok(entry && entry.base === def.model && manifest.actors[entry.base]?.path, `${kind}: запись-псевдоним на готовую модель`);
    assert.match(entry.tint, /^[0-9a-f]{6}$/);
    assert.ok(def.fam && def.social && def.aggro, `${kind}: стайный агрессивный`);
    for (const id of Object.keys(def.drops)) assert.ok(ITEMS[id], `${kind}: нет предмета ${id}`);
    assert.ok(def.lvl < MAX_LEVEL);
  }
  // опыт и монеты продолжают кривую обычных мобов: ни один более высокий моб не даёт меньше
  // от последнего прежнего моба (призрак, 24) и дальше; танк-страж идёт с надбавкой за долгий бой
  const plain = [MOBS.wraith, ...GORGE_KINDS.filter((k) => k !== 'stone_guard').map((k) => MOBS[k])].sort((a, b) => a.lvl - b.lvl);
  for (let i = 1; i < plain.length; i++) if (plain[i].lvl > plain[i - 1].lvl) {
    assert.ok(plain[i].xp >= plain[i - 1].xp, `${plain[i].name}: опыт меньше, чем у ${plain[i - 1].name}`);
    assert.ok(plain[i].coins[0] + plain[i].coins[1] >= plain[i - 1].coins[0] + plain[i - 1].coins[1] - 1, `${plain[i].name}: монет меньше`);
  }
  // с 25 до 40 для каждого уровня есть обычный моб не старше героя и не младше на 3 — полная награда
  for (let lvl = 25; lvl < MAX_LEVEL; lvl++) {
    const best = Object.values(MOBS).filter((m) => !m.boss && m.lvl <= lvl).sort((a, b) => b.lvl - a.lvl)[0];
    assert.equal(levelFactor(best.lvl, lvl, DEFAULT_RATES), 1, `уровень ${lvl}: ближайший моб ${best.name} ${best.lvl} режется штрафом`);
  }
});

test('умения мобов: яд и проклятие по шансу, замедление бьёт по скорости атаки, а не бегу', () => {
  const now = 1000;
  assert.deepEqual(mobHitEffects('cliff_spider', MOBS.cliff_spider, 100, now, () => 0.99), [], 'без удачного броска эффекта нет');
  const [poison] = mobHitEffects('cliff_spider', MOBS.cliff_spider, 100, now, () => 0);
  assert.equal(poison.kind, 'dot'); assert.equal(poison.id, 'cliff_spider:dot'); assert.equal(poison.src, 'Скальный паук');
  assert.equal(poison.perTick, Math.round((100 * 1.2) / 4));
  const [slow] = mobHitEffects('river_drowned', MOBS.river_drowned, 90, now, () => 0);
  assert.equal(slow.kind, 'slow'); assert.equal(slow.stat, 'aspd', 'бег ведёт клиент: сервер режет только скорость атаки');
  assert.equal(effectMul([slow], 'speed', now + 1), 1);
  assert.equal(effectMul([slow], 'aspd', now + 1), 0.7);
  const curse = mobHitEffects('outpost_warlock', MOBS.outpost_warlock, 140, now, () => 0);
  assert.deepEqual(curse.map((e) => e.kind).sort(), ['debuff', 'dot']);
  assert.equal(effectMul(curse, 'pdef', now + 1), 0.75);
  const frost = mobHitEffects('summit_wraith', MOBS.summit_wraith, 120, now, () => 0);
  assert.deepEqual(frost.map((e) => e.kind).sort(), ['dot', 'slow']);
});

test('щит стража: срабатывает ниже порога здоровья, усиливает защиту и ждёт перезарядки', () => {
  const m = { kind: 'stone_guard', def: MOBS.stone_guard, hp: MOBS.stone_guard.hp, dead: false, effects: [] };
  assert.equal(guardTrigger(m, 0), null, 'на полном здоровье щита нет');
  m.hp = MOBS.stone_guard.hp * 0.4;
  const shield = guardTrigger(m, 1000);
  assert.equal(shield.kind, 'buff'); assert.equal(shield.stat, 'pdef');
  m.effects = [shield];
  assert.equal(effectMul(m.effects, 'pdef', 2000), 1.6);
  assert.equal(guardTrigger(m, 5000), null, 'повтор — только после перезарядки');
  assert.ok(guardTrigger(m, 1000 + MOBS.stone_guard.guard.cd * 1000));
  assert.equal(guardTrigger({ ...m, def: MOBS.cliff_spider }, 0), null, 'у паука щита нет');
});

test('клиент повторяет ось ущелья: константы шейдера рельефа и кадров совпадают с src/gorge.js', () => {
  const shader = fs.readFileSync('godot/shaders/terrain.gdshader', 'utf8');
  assert.ok(shader.includes(`vec2(${GORGE.ax}.0, ${GORGE.az}.0)`), 'точка устья');
  assert.ok(shader.includes(`vec2(${GORGE.dx}, ${GORGE.dz})`) && shader.includes(`vec2(${GORGE.dz}, -${GORGE.dx})`), 'направление оси');
  assert.ok(shader.includes('24.0 * sin(u / 440.0'), 'изгиб оси');
  for (const file of ['godot/tests/gorge_review.gd', 'godot/tests/perf_profile.gd']) assert.ok(fs.readFileSync(file, 'utf8').includes('24.0 * sin(u / 440.0 * PI * 1.6)'), `изгиб оси в ${file}`);
  for (const u of [0, 200, 400]) assert.ok(gorgeMask(u, 0) > 0.99);
});
