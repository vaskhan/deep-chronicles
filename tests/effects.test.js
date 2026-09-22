// Правила боевой глубины: эффекты во времени, элиты/чемпионы и стаи. npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeBuff, makeDebuff, makeSlow, makeDot, makeHot, makeDrain,
  applyEffect, tickEffects, effectMul, drainMul, drainHeal, snapshotEffects,
} from '../src/effects.js';
import { ELITE, CHAMPION, ELITE_RATE, CHAMPION_RATE, eliteDef, championDef, rankedDef, rankOf } from '../src/elites.js';
import { SOCIAL_R, PACK_MAX, famOf, social, socialAllies } from '../src/pack.js';
import { MOBS, SKILLS, CLASSES } from '../src/data.js';
import { calcDmg, newMob, mobStep, rollDrops, MOB_SPREAD, MOB_CRIT, mobCrit, mobAtk, MOB_SPEED } from '../src/sim.js';
import { buildProps } from '../src/world-core.js';
import { skillRanks } from '../src/progression.js';
import { calcStats } from '../src/stats.js';
import { newChar } from '../server/sim/player.js';

const T0 = 1_000_000;

// ---------- эффекты во времени ----------

test('эффект тикает нужное число раз и спадает ровно в срок', () => {
  // 12 урона за 6 с по тику в 2 с — три тика по 4
  let list = [makeDot('curse:dot', { mul: 1, dur: 6, tick: 2 }, 12, T0, 7)];
  assert.equal(list[0].perTick, 4);
  let total = 0;
  for (let t = T0 + 100; t <= T0 + 6000; t += 100) {
    const r = tickEffects(list, t); list = r.list; total += r.dmg;
  }
  assert.equal(total, 12, 'суммарный урон равен обещанному');
  const done = tickEffects(list, T0 + 6001);
  assert.deepEqual(done.list, [], 'эффект снят после истечения срока');
  assert.equal(done.expired.length + list.length - done.list.length >= 0, true);
});

test('лечение со временем возвращает долю здоровья за тик и знает источник', () => {
  const hot = makeHot('heal:hot', { amount: 0.03, dur: 6, tick: 1.5 }, 1000, T0, 3);
  assert.equal(hot.perTick, 30);
  assert.equal(hot.from, 3);
  const r = tickEffects([hot], T0 + 4500);
  assert.equal(r.heal, 90, 'три тика за 4.5 секунды');
  assert.equal(r.hits[0].n, 3);
  assert.equal(tickEffects(r.list, T0 + 6100).list.length, 0);
});

test('одинаковый эффект не суммируется, а продлевает срок и сохраняет фазу тиков', () => {
  const first = makeDot('curse:dot', { mul: 1, dur: 6, tick: 2 }, 12, T0, 7);
  let list = applyEffect([], first);
  assert.equal(list.length, 1);
  // повторное наложение через секунду: один эффект, новый срок, тик остаётся на прежней фазе
  const second = makeDot('curse:dot', { mul: 1, dur: 6, tick: 2 }, 12, T0 + 1000, 7);
  list = applyEffect(list, second);
  assert.equal(list.length, 1, 'второй экземпляр не появился');
  assert.equal(list[0].until, T0 + 7000, 'срок продлён от момента повторного наложения');
  assert.equal(list[0].next, T0 + 2000, 'фаза тиков сохранена — лишнего тика нет');
  const r = tickEffects(list, T0 + 2000);
  assert.equal(r.dmg, 4, 'ровно один тик, а не два наложенных источника');
  // разные id живут независимо
  assert.equal(applyEffect(list, makeDot('rend:dot', { mul: 1, dur: 4, tick: 2 }, 8, T0, 7)).length, 2);
});

test('ослабление и замедление множат характеристику, усиление — тоже, и всё спадает', () => {
  const now = T0;
  const list = [
    makeBuff('battle_cry', { stat: 'patk', mul: 1.3, dur: 20 }, now, 1),
    makeDebuff('curse:weak', { stat: 'patk', mul: 0.72, dur: 9 }, now, 2),
    makeSlow('ice_nova:slow', { mul: 0.55, dur: 6 }, now, 2),
  ];
  assert.ok(Math.abs(effectMul(list, 'patk', now) - 1.3 * 0.72) < 1e-9, 'множители перемножаются');
  assert.equal(effectMul(list, 'speed', now), 0.55);
  assert.equal(effectMul(list, 'pdef', now), 1, 'чужая характеристика не трогается');
  assert.equal(effectMul(list, 'speed', now + 6001), 1, 'спавший эффект больше не действует');
  // calcStats применяет только эффекты с характеристикой
  const P = newChar('Тест', 'warrior');
  const plain = calcStats(P).patk;
  const buffed = calcStats(P, list, now).patk;
  assert.ok(Math.abs(buffed - plain * 1.3 * 0.72) < 1e-6, 'усиление и ослабление считает calcStats');
  const withDot = calcStats(P, [...list, makeDot('d', { mul: 1, dur: 5, tick: 1 }, 50, now, 1)], now).patk;
  assert.equal(withDot, buffed, 'урон со временем характеристик не меняет');
});

test('вампиризм лечит долей урона и складывается без переполнения', () => {
  const now = T0;
  const one = [makeDrain('blood_rage:drain', { mul: 0.3, dur: 12 }, now, 1)];
  assert.ok(Math.abs(drainMul(one, now) - 0.3) < 1e-9);
  assert.equal(drainHeal(100, drainMul(one, now)), 30);
  const two = applyEffect(one, makeDrain('other:drain', { mul: 0.5, dur: 12 }, now, 1));
  assert.ok(Math.abs(drainMul(two, now) - 0.65) < 1e-9, 'два источника не дают больше 100 %');
  assert.equal(drainMul(one, now + 12001), 0, 'после спада вампиризма нет');
  assert.equal(drainHeal(0, 0.3), 0);
  assert.equal(drainHeal(1, 0.3), 1, 'ненулевой урон лечит хотя бы на единицу');
});

test('снапшот эффектов отдаёт id, вид и остаток срока', () => {
  const list = [makeSlow('ice_nova:slow', { mul: 0.55, dur: 6 }, T0, 2)];
  assert.deepEqual(snapshotEffects(list, T0 + 1500), [['ice_nova:slow', 'slow', 4500]]);
  assert.deepEqual(snapshotEffects(list, T0 + 9000), [], 'истёкшие в снапшот не попадают');
});

test('умения получили эффекты во времени и усиливают их по рангам', () => {
  assert.ok(SKILLS.ice_nova.slow, 'ледяная волна замедляет');
  assert.ok(SKILLS.heal.hot && SKILLS.heal.amount < 0.35, 'исцеление часть возвращает со временем');
  assert.ok(SKILLS.curse.dot && SKILLS.curse.debuff, 'печать немощи жжёт и ослабляет');
  assert.ok(SKILLS.blood_rage.drain, 'кровавая ярость даёт вампиризм');
  assert.ok(CLASSES.warrior.skills.includes('blood_rage') && CLASSES.mage.skills.includes('curse'));
  const curse = skillRanks('curse');
  assert.ok(curse.length >= 2 && curse[1].dot.mul > curse[0].dot.mul, 'урон со временем растёт с рангом');
  assert.ok(curse[1].debuff.mul < curse[0].debuff.mul, 'ослабление углубляется с рангом');
  assert.ok(skillRanks('blood_rage')[1].drain.mul > skillRanks('blood_rage')[0].drain.mul);
  assert.ok(skillRanks('ice_nova')[1].slow.mul < skillRanks('ice_nova')[0].slow.mul);
  // суммарное лечение первого ранга осталось около прежних 35 % максимального здоровья
  const h = skillRanks('heal')[0];
  const total = h.amount + h.hot.amount * Math.floor(h.hot.dur / h.hot.tick);
  assert.ok(total > 0.33 && total < 0.38, `суммарное лечение ${total}`);
});

test('замедление снижает реальную скорость шага моба', () => {
  // свободный от препятствий коридор внутри карты: иначе шаг упрётся в выталкивание
  const m = newMob(1, { mob: 'wolf', x: -700, z: -675 }, () => 0.5);
  const player = { id: 5, x: -660, z: -675, dead: false, inTown: false };
  const ctx = { now: T0, players: [player], onHit: () => {} };
  m.state = 'chase'; m.target = player.id;
  const before = m.x;
  mobStep(m, ctx, 0.5);
  const fast = m.x - before;
  m.x = before; m.effects = [makeSlow('ice_nova:slow', { mul: 0.5, dur: 6 }, T0, 5)];
  mobStep(m, ctx, 0.5);
  assert.ok(Math.abs((m.x - before) - fast * 0.5) < 1e-6, 'шаг ровно вдвое короче');
  assert.ok(MOB_SPEED(MOBS.wolf) > 0);
});

test('ослабление атаки моба уменьшает его удар', () => {
  const m = newMob(2, { mob: 'orc', x: 0, z: 0 }, () => 0.5);
  assert.equal(mobAtk(m, T0), MOBS.orc.patk);
  m.effects = [makeDebuff('curse:weak', { stat: 'patk', mul: 0.5, dur: 9 }, T0, 5)];
  assert.equal(mobAtk(m, T0), MOBS.orc.patk * 0.5);
  assert.equal(mobAtk(m, T0 + 9001), MOBS.orc.patk, 'после спада удар прежний');
});

// ---------- разброс и крит мобов ----------

test('удар моба шире по разбросу и имеет собственный крит; формула прежняя', () => {
  assert.equal(MOB_SPREAD, 0.3); assert.equal(MOB_CRIT, 0.08);
  assert.equal(mobCrit(MOBS.wolf), MOB_CRIT);
  assert.equal(mobCrit({ crit: 0.2 }), 0.2);
  const low = calcDmg(100, 70, 1, 0, () => 0, MOB_SPREAD).d;
  const high = calcDmg(100, 70, 1, 0, () => 0.999999, MOB_SPREAD).d;
  assert.ok(Math.abs(low / high - 0.85 / 1.15) < 0.01, 'разброс ±15 %');
  // умолчание сохраняет прежние ±10 % для игроков
  assert.equal(calcDmg(100, 70, 1, 0, () => 0).d, calcDmg(100, 70, 1, 0, () => 0, 0.2).d);
  assert.equal(calcDmg(100, 70, 1, 1, () => 0).crit, true);
});

// ---------- элиты и чемпионы ----------

test('множители элиты и чемпиона поднимают жизнь, урон, размер и награду', () => {
  const base = MOBS.wolf, e = eliteDef(base), c = championDef(base, 'Матёрый');
  assert.equal(e.hp, Math.round(base.hp * ELITE.hp));
  assert.equal(e.patk, Math.round(base.patk * ELITE.atk));
  assert.equal(e.xp, Math.round(base.xp * ELITE.reward));
  assert.deepEqual(e.coins, base.coins.map((n) => Math.round(n * ELITE.reward)));
  assert.ok(e.size > base.size && e.rank === 'elite' && e.baseName === base.name);
  assert.equal(c.hp, base.hp * CHAMPION.hp);
  assert.ok(c.xp > e.xp && c.hp > e.hp, 'чемпион сильнее элиты');
  assert.equal(c.respawn, CHAMPION.respawn);
  assert.ok(c.name.startsWith('Матёрый') && c.rank === 'champion' && c.aggro);
  assert.equal(base.hp, MOBS.wolf.hp, 'исходное определение не испорчено');
  // повышенный шанс добычи чемпиона
  assert.deepEqual(rollDrops({ drops: { pelt: 0.1 }, dropMul: CHAMPION.drop }, () => 0.4), ['pelt']);
  assert.deepEqual(rollDrops({ drops: { pelt: 0.1 } }, () => 0.4), []);
  assert.deepEqual(rollDrops({ drops: { pelt: 0.5 }, dropMul: 5 }, () => 0.99), ['pelt'], 'умноженный шанс упирается в единицу, а не уходит выше');
});

test('ранг точки спавна детерминирован, боссы и охотничьи лагеря не ранжируются', () => {
  const spawns = buildProps().spawns;
  const ranks = spawns.map((sp, i) => rankOf(sp, i + 1, MOBS[sp.mob]));
  const again = spawns.map((sp, i) => rankOf(sp, i + 1, MOBS[sp.mob]));
  assert.deepEqual(ranks, again, 'повторный расчёт даёт тот же мир');
  spawns.forEach((sp, i) => {
    if (sp.camp) assert.equal(ranks[i], null, `лагерь ${sp.camp} получил ранг`);
    if (MOBS[sp.mob].boss) assert.equal(ranks[i], null, 'босс получил ранг');
  });
  const elites = ranks.filter((r) => r === 'elite').length;
  const champions = ranks.filter((r) => r === 'champion').length;
  const rankable = spawns.filter((sp) => !sp.camp && !MOBS[sp.mob].boss).length;
  assert.ok(elites >= 8 && elites <= rankable * ELITE_RATE * 2, `элит ${elites} из ${rankable}`);
  assert.ok(champions >= 1 && champions <= rankable * CHAMPION_RATE * 3, `чемпионов ${champions}`);
  assert.ok(champions < elites, 'чемпион реже элиты');
  // ранговое определение приходит из общей точки входа
  const elite = spawns.map((sp, i) => rankedDef(MOBS[sp.mob], sp, i + 1)).find((d) => d.rank === 'elite');
  assert.ok(elite.hp > MOBS[elite.baseName ? Object.keys(MOBS).find((k) => MOBS[k].name === elite.baseName) : 'wolf'].hp);
});

// ---------- стаи ----------

test('за моба вступаются только сородичи того же семейства в радиусе', () => {
  const mob = (id, kind, x, z, extra = {}) => ({ id, kind, def: MOBS[kind], x, z, state: 'idle', dead: false, ...extra });
  const wolf = mob(1, 'wolf', 0, 0);
  const near = mob(2, 'wolf', SOCIAL_R - 1, 0);
  const far = mob(3, 'wolf', SOCIAL_R + 1, 0);
  const other = mob(4, 'goblin', 2, 0);
  const rabbit = mob(5, 'rabbit', 2, 0);
  const busy = mob(6, 'wolf', 3, 0, { state: 'chase' });
  const dead = mob(7, 'wolf', 3, 0, { dead: true });
  const camper = mob(8, 'wolf', 4, 0, { camp: 'east_wolves' });
  const list = [wolf, near, far, other, rabbit, busy, dead, camper];
  assert.deepEqual(socialAllies(wolf, list).map((m) => m.id), [2], 'только свободный сородич в радиусе');
  assert.equal(socialAllies(rabbit, list).length, 0, 'одиночки стай не водят');
  assert.equal(socialAllies(camper, list).length, 0, 'мобы охотничьих лагерей вне стай');
  assert.equal(famOf(wolf), 'wolf');
  assert.equal(famOf(mob(9, 'spider', 0, 0)), famOf(mob(10, 'scorpion', 0, 0)), 'общее семейство у членистоногих');
  assert.ok(social(wolf) && !social(rabbit) && !social(camper));
  assert.ok(SOCIAL_R < 14, 'радиус стаи меньше радиуса агрессии');
  // ровно на границе радиуса сородич ещё отзывается
  assert.equal(socialAllies(wolf, [wolf, mob(11, 'wolf', SOCIAL_R, 0)]).length, 1);
  assert.equal(socialAllies(wolf, [wolf, mob(12, 'wolf', SOCIAL_R + 0.01, 0)]).length, 0);
  // предохранитель: один крик не собирает всю поляну, и отзываются ближайшие
  const crowd = [wolf];
  for (let i = 0; i < PACK_MAX + 3; i++) crowd.push(mob(20 + i, 'wolf', 10 - i, 0));
  const answered = socialAllies(wolf, crowd);
  assert.equal(answered.length, PACK_MAX);
  assert.deepEqual(answered.map((o) => o.x), answered.map((o) => o.x).slice().sort((p, q) => p - q));
});

test('стартовые лагеря остались неагрессивными и без стай', () => {
  const spawns = buildProps().spawns.filter((s) => s.camp);
  assert.ok(spawns.length > 60);
  for (const sp of spawns) assert.ok(!MOBS[sp.mob].aggro, `${sp.mob} в лагере стал агрессивным`);
  const mob = newMob(1, spawns[0], () => 0.5);
  assert.equal(mob.camp, spawns[0].camp, 'моб помнит свой лагерь');
  assert.equal(social(mob), false);
});
