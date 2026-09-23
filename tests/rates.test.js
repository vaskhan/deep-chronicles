// Серверные коэффициенты (рейты): значения по умолчанию обязаны повторять прежний баланс,
// множители — работать в точках выдачи, мусор — зажиматься. npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOBS, RECIPES, ITEMS, MAX_LEVEL } from '../src/data.js';
import { xpForKill, rollCoins, rollDrops, sellPrice, enchSucceeds } from '../src/sim.js';
import { SAFE_ENCH, ENCH_CHANCE } from '../src/stats.js';
import { spForKill } from '../src/progression.js';
import {
  DEFAULT_RATES, RATE_KEYS, RATE_NAMES, normalizeRates, ratesOf, isDefaultRates,
  rateXp, rateSp, rateCoins, rateDropChance, rollDropsRated, countDrops, partyMultiplier,
  rateRespawnMs, rateSellPrice, rateBuyPrice, rateRecipe, enchantChanceOf, enchSucceedsRated,
  describeRates, formatRate, levelFactor, coinLevelFactor, dropLevelFactor,
  LEVEL_GAP_FULL, LEVEL_GAP_NONE, splitByWeights, partyWeight, levelCurve,
} from '../src/rates.js';
import { loadRates, envName } from '../server/rates.js';
import { createMobs } from '../server/sim/mobs.js';
import { createParties } from '../server/sim/party.js';
import { newActor, newChar } from '../server/sim/player.js';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
// повторяемый источник случайности: тот же поток чисел для «до» и «после»
const seeded = (seed) => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

test('рейты по умолчанию равны единице и ничего не меняют в наградах', () => {
  const multipliers = RATE_NAMES.filter(k => !k.startsWith('levelGap'));
  assert.deepEqual(DEFAULT_RATES, { ...Object.fromEntries(multipliers.map(k => [k, 1])),
    levelGap4: 0.9, levelGap5: 0.75, levelGap6: 0.55, levelGap7: 0.35, levelGap8: 0.2, levelGap9: 0.08,
    levelGapAffectsCoins: 1, levelGapAffectsDrop: 1 });
  assert.ok(isDefaultRates(ratesOf({})) && isDefaultRates(ratesOf(undefined)) && isDefaultRates(ratesOf(null)));
  for (const [id, def] of Object.entries(MOBS)) {
    for (const lvl of [1, def.lvl, MAX_LEVEL]) assert.equal(rateXp(xpForKill(def, lvl)), xpForKill(def, lvl), `${id}: опыт`);
    assert.equal(rateSp(spForKill(def.xp)), spForKill(def.xp), `${id}: SP`);
    assert.equal(rateCoins(rollCoins(def, seeded(7))), rollCoins(def, seeded(7)), `${id}: монеты`);
    assert.deepEqual(rollDropsRated(def, DEFAULT_RATES, seeded(9)), rollDrops(def, seeded(9)), `${id}: дроп`);
    for (const chance of Object.values(def.drops || {})) assert.equal(rateDropChance(chance), chance, `${id}: шанс дропа`);
    assert.equal(rateRespawnMs((def.respawn || 25) * 1000), (def.respawn || 25) * 1000, `${id}: респавн`);
  }
  for (const [id, item] of Object.entries(ITEMS)) {
    assert.equal(rateSellPrice(sellPrice(item)), sellPrice(item), `${id}: продажа`);
    if (item.price) assert.equal(rateBuyPrice(item.price), item.price, `${id}: покупка`);
  }
  for (const [id, recipe] of Object.entries(RECIPES)) assert.deepEqual(rateRecipe(recipe), recipe, `${id}: рецепт`);
  assert.equal(enchantChanceOf(DEFAULT_RATES), ENCH_CHANCE);
  for (const cur of [0, SAFE_ENCH - 1, SAFE_ENCH, 10]) for (const roll of [0.01, 0.5, 0.999]) {
    assert.equal(enchSucceedsRated(cur, DEFAULT_RATES, () => roll), enchSucceeds(cur, () => roll), `заточка +${cur} при ${roll}`);
  }
  for (let size = 1; size <= 6; size++) assert.equal(partyMultiplier(size), 1);
  assert.equal(describeRates(DEFAULT_RATES), 'обычные (все ×1)');
});

test('файл настроек в репозитории хранит значения по умолчанию', () => {
  const shipped = JSON.parse(fs.readFileSync(path.join(root, 'server/rates.json'), 'utf8'));
  assert.deepEqual(shipped.rates, DEFAULT_RATES, 'server/rates.json обязан сохранять текущий баланс');
  assert.deepEqual(Object.keys(shipped.rates), RATE_NAMES, 'в файле перечислены все коэффициенты');
});

test('множители применяются к опыту, SP, монетам, дропу, ценам, крафту, заточке и респавну', () => {
  const rates = ratesOf({ xp: 3, sp: 2, coins: 4, dropChance: 2, dropAmount: 3, craftCost: 0.5, enchantChance: 1.2, sellPrice: 2, buyPrice: 0.5, respawn: 5 });
  assert.equal(rateXp(xpForKill(MOBS.goblin, 5), rates), xpForKill(MOBS.goblin, 5) * 3);
  assert.equal(rateSp(spForKill(MOBS.goblin.xp), rates), spForKill(MOBS.goblin.xp) * 2);
  assert.equal(rateCoins(25, rates), 100);
  assert.equal(rateDropChance(0.3, rates), 0.6);
  assert.equal(rateDropChance(0.8, rates), 1, 'шанс не превышает единицу');
  assert.equal(rateDropChance(1, rates), 1, 'гарантированный дроп остаётся гарантированным');
  assert.equal(rateDropChance(1, ratesOf({ dropChance: 0.2 })), 1, 'понижающий рейт не отнимает гарантированную печать');
  // волк: шанс шкуры 0.3; бросок 0.5 проходит только с удвоенным шансом
  assert.deepEqual(rollDropsRated(MOBS.wolf, DEFAULT_RATES, () => 0.5), []);
  assert.deepEqual(rollDropsRated(MOBS.wolf, rates, () => 0.5), ['pelt', 'pelt', 'pelt'], 'dropAmount повторяет вещь');
  assert.deepEqual(countDrops(['pelt', 'pelt', 'bone']), [{ item: 'pelt', n: 2 }, { item: 'bone', n: 1 }]);
  assert.deepEqual(rateRecipe(RECIPES.sword_long, rates), { coins: 150, materials: { pelt: 10, bone: 10 } });
  assert.equal(rateRecipe({ coins: 0, materials: { lich_seal: 1 } }, ratesOf({ craftCost: 0.1 })).materials.lich_seal, 1, 'материал не обнуляется');
  assert.equal(rateSellPrice(sellPrice(ITEMS.pelt), rates), sellPrice(ITEMS.pelt) * 2);
  assert.equal(rateSellPrice(0, rates), 0, 'непродаваемое остаётся непродаваемым');
  assert.equal(rateBuyPrice(ITEMS.sword_long.price, rates), Math.round(ITEMS.sword_long.price / 2));
  assert.equal(rateBuyPrice(1, ratesOf({ buyPrice: 0.1 })), 1, 'товар не становится бесплатным');
  assert.equal(enchantChanceOf(rates), Math.min(1, ENCH_CHANCE * 1.2));
  assert.ok(enchSucceedsRated(SAFE_ENCH, rates, () => 0.7) && !enchSucceeds(SAFE_ENCH, () => 0.7), 'рейт заточки меняет исход броска');
  assert.equal(rateRespawnMs(25000, rates), 5000, 'респавн — обратный множитель');
  assert.equal(rateRespawnMs(25000, ratesOf({ respawn: 0.5 })), 50000);
  assert.equal(rateXp(1, ratesOf({ xp: 0.1 })), 1, 'награда не обнуляется понижающим рейтом');
  assert.equal(describeRates(ratesOf({ xp: 2, coins: 3 })), 'опыт ×2, монеты ×3');
  assert.equal(formatRate(1.5), '×1,5');
});

test('мусорные и неизвестные значения зажимаются, сервер остаётся на рабочих числах', () => {
  const { rates, warnings } = normalizeRates({ xp: '2,5', sp: 'быстро', coins: 1e9, dropChance: -4, dropAmount: 2.6, partyBonus: 50, unknown: 3, respawn: null });
  assert.equal(rates.xp, 2.5, 'строка с запятой читается как число');
  assert.equal(rates.sp, 1, 'нечисло не меняет баланс');
  assert.equal(rates.coins, RATE_KEYS.coins.max);
  assert.equal(rates.dropChance, RATE_KEYS.dropChance.min);
  assert.equal(rates.dropAmount, 3, 'количество дропа целое');
  assert.equal(rates.partyBonus, RATE_KEYS.partyBonus.max);
  assert.equal(rates.respawn, 1);
  assert.ok(warnings.some(w => w.includes('unknown')), 'неизвестный ключ назван в предупреждениях');
  assert.equal(Object.keys(rates).length, RATE_NAMES.length, 'лишние ключи не попадают в рейты');
  for (const raw of ['мусор', 42, [], true]) assert.ok(isDefaultRates(ratesOf(raw)), `${JSON.stringify(raw)} — не настройки`);
  for (const key of RATE_NAMES) {
    const spec = RATE_KEYS[key];
    if (spec.bool) {
      assert.equal(ratesOf({ [key]: false })[key], 0, `${key}: выключается`);
      assert.equal(ratesOf({ [key]: 'нет' })[key], 0, `${key}: выключается словом`);
      assert.equal(ratesOf({ [key]: '1' })[key], 1, `${key}: включается`);
      assert.equal(ratesOf({ [key]: 7 })[key], spec.def, `${key}: непонятное значение не меняет настройку`);
      continue;
    }
    assert.equal(ratesOf({ [key]: -1e9 })[key], spec.min, `${key}: нижний предел`);
    assert.equal(ratesOf({ [key]: 1e9 })[key], spec.max, `${key}: верхний предел`);
  }
});

test('загрузка настроек: файл, переменные окружения, битый файл не роняет сервер', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rates-'));
  try {
    const file = path.join(dir, 'rates.json');
    fs.writeFileSync(file, JSON.stringify({ rates: { xp: 2, coins: 3 } }));
    assert.equal(envName('dropChance'), 'RATE_DROP_CHANCE');
    const fromFile = loadRates({}, file);
    assert.equal(fromFile.rates.xp, 2); assert.equal(fromFile.rates.coins, 3); assert.equal(fromFile.rates.sp, 1);
    assert.deepEqual(fromFile.warnings, []);
    const overridden = loadRates({ RATE_XP: '5', RATE_DROP_CHANCE: '2', RATE_SP: '' }, file);
    assert.equal(overridden.rates.xp, 5, 'переменная окружения сильнее файла');
    assert.equal(overridden.rates.dropChance, 2);
    assert.equal(overridden.rates.sp, 1, 'пустая переменная не считается настройкой');
    assert.deepEqual(overridden.fromEnv, ['RATE_XP', 'RATE_DROP_CHANCE']);
    fs.writeFileSync(file, '{ это не json');
    const broken = loadRates({ RATE_XP: '2' }, file);
    assert.ok(isDefaultRates({ ...broken.rates, xp: 1 }), 'битый файл не ломает остальные коэффициенты');
    assert.equal(broken.rates.xp, 2, 'переменные окружения продолжают работать');
    assert.ok(broken.warnings.some(w => w.includes('rates.json')), 'битый файл виден в журнале');
    const missing = loadRates({}, path.join(dir, 'нет-такого.json'));
    assert.ok(isDefaultRates(missing.rates) && missing.warnings.length === 0, 'отсутствие файла — не ошибка');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('награда за моба и респавн берут рейты сервера, дележ в группе сходится без потери единиц', () => {
  const plain = createMobs(), rated = createMobs(ratesOf({ xp: 3, coins: 2, dropChance: 100, dropAmount: 2, respawn: 4 }));
  const mob = plain.list.find(m => m.kind === 'wolf'), ratedMob = rated.list.find(m => m.kind === 'wolf');
  assert.equal(rated.rewardFor(ratedMob, 3).xp, plain.rewardFor(mob, 3).xp * 3);
  const ratedCoins = rated.rewardFor(ratedMob, 3).coins;
  assert.ok(ratedCoins >= MOBS.wolf.coins[0] * 2 && ratedCoins <= MOBS.wolf.coins[1] * 2, `монеты с рейтом: ${ratedCoins}`);
  assert.deepEqual(rated.rewardFor(ratedMob, 3).drops, ['pelt', 'pelt'], 'поднятый шанс и количество дропа');
  plain.kill(mob, 1000); rated.kill(ratedMob, 1000);
  assert.equal(mob.respawnAt - 1000, (MOBS.wolf.respawn || 25) * 1000);
  assert.equal(ratedMob.respawnAt - 1000, (MOBS.wolf.respawn || 25) * 1000 / 4, 'респавн ускоряется');

  const players = new Map();
  for (let i = 1; i <= 3; i++) {
    const name = 'Рейт' + i, a = newActor(i, name, newChar(name, 'warrior'));
    a.x = -285; a.z = 387; a.y = 0; players.set(i, { id: i, name, key: name.toLowerCase(), a });
  }
  const rates = ratesOf({ xp: 3, sp: 3 });
  const parties = createParties(players, () => {}, rates);
  parties.command(players.get(1), { action: 'invite', name: 'Рейт2' }, 10000);
  parties.command(players.get(2), { action: 'accept', from: 1 }, 10001);
  parties.command(players.get(1), { action: 'invite', name: 'Рейт3' }, 12000);
  parties.command(players.get(3), { action: 'accept', from: 1 }, 12001);
  const target = { x: -285, z: 387, def: MOBS.goblin };
  const plan = parties.rewardPlan(players.get(1), players.get(2), target, () => 0.5);
  const base = xpForKill(MOBS.goblin, 1);
  assert.equal(plan.shares.length, 3);
  assert.equal(plan.shares.reduce((n, s) => n + s.xp, 0), base * 3, 'сумма долей равна награде с рейтом');
  assert.equal(plan.shares.reduce((n, s) => n + s.sp, 0), spForKill(base) * 3, 'SP тоже сходятся');
  assert.ok(plan.shares.every(s => Number.isInteger(s.xp) && Number.isInteger(s.sp)), 'доли целые');

  const bonus = createParties(players, () => {}, ratesOf({ partyBonus: 1.2 }));
  bonus.command(players.get(1), { action: 'invite', name: 'Рейт2' }, 20000);
  bonus.command(players.get(2), { action: 'accept', from: 1 }, 20001);
  const paired = bonus.rewardPlan(players.get(1), players.get(2), target, () => 0.5);
  assert.equal(partyMultiplier(2, ratesOf({ partyBonus: 1.2 })), 1.2);
  assert.equal(paired.shares.reduce((n, s) => n + s.xp, 0), Math.round(base * 1.2), 'надбавка группы применяется до дележа');
});

test('ступени разницы уровней: до 3 полная награда, 4–9 штраф, с 10 — ноль, симметрично', () => {
  assert.equal(LEVEL_GAP_FULL, 3); assert.equal(LEVEL_GAP_NONE, 10);
  for (let gap = 0; gap <= LEVEL_GAP_FULL; gap++) {
    assert.equal(levelFactor(20 - gap, 20), 1, `разница ${gap} вниз`);
    assert.equal(levelFactor(20 + gap, 20), 1, `разница ${gap} вверх`);
  }
  assert.equal(levelFactor(16, 20), 0.9, 'граница 3/4: штраф начинается с четвёртого уровня');
  assert.equal(levelFactor(14, 20), 0.55); assert.equal(levelFactor(13, 20), 0.35, 'граница 6/7');
  assert.equal(levelFactor(11, 20), 0.08, 'девятый уровень — крохи');
  assert.equal(levelFactor(10, 20), 0, 'граница 9/10: награды нет');
  assert.equal(levelFactor(1, 20), 0, 'дальше тоже ноль');
  for (let gap = 0; gap <= 15; gap++) assert.equal(levelFactor(20 - gap, 20), levelFactor(20 + gap, 20), `симметрия на ${gap}`);
  assert.deepEqual(levelCurve().map(step => step.factor), [1, 1, 1, 1, 0.9, 0.75, 0.55, 0.35, 0.2, 0.08, 0]);
  // кривая убывает и бонуса за сильного моба не даёт
  for (let gap = 1; gap <= LEVEL_GAP_NONE; gap++) assert.ok(levelFactor(20 + gap, 20) <= levelFactor(20 + gap - 1, 20), `ступень ${gap}`);
  // опыт и SP обнуляются вместе с множителем, а не превращаются в единицу
  assert.equal(xpForKill(MOBS.golem, MOBS.golem.lvl + 10), 0);
  assert.equal(rateXp(0, ratesOf({ xp: 100 })), 0, 'рейт не оживляет нулевую награду');
  assert.equal(rateSp(0, ratesOf({ sp: 100 })), 0);
  // сервер может задать свою кривую
  const soft = ratesOf({ levelGap4: 1, levelGap5: 1, levelGap9: 0.5 });
  assert.equal(levelFactor(15, 20, soft), 1); assert.equal(levelFactor(11, 20, soft), 0.5);
  assert.equal(levelFactor(10, 20, soft), 0, 'ноль с десятого уровня не настраивается');
  assert.equal(levelFactor(20, 20, ratesOf({ levelGap4: 0 })), 1, 'полная награда до трёх тоже не настраивается');
});

test('штраф за разницу уровней режет монеты и дроп вместе с опытом, переключатели его снимают', () => {
  const gapRates = DEFAULT_RATES, off = ratesOf({ levelGapAffectsCoins: false, levelGapAffectsDrop: false });
  assert.equal(coinLevelFactor(23, 30, gapRates), levelFactor(23, 30));
  assert.equal(dropLevelFactor(23, 30, gapRates), levelFactor(23, 30));
  assert.equal(coinLevelFactor(23, 40, off), 1, 'переключатель возвращает прежние монеты');
  assert.equal(dropLevelFactor(23, 40, off), 1, 'переключатель возвращает прежний дроп');
  assert.ok(Math.abs(rateDropChance(0.35, gapRates, 0.2) - 0.07) < 1e-9, 'шанс режется множителем уровня');
  assert.equal(rateDropChance(1, gapRates, 1), 1, 'на полном множителе гарантия остаётся гарантией');
  assert.equal(rateDropChance(1, gapRates, 0.2), 0.2, 'при штрафе режется и гарантированная вещь');
  assert.equal(rateDropChance(1, gapRates, 0), 0, 'с десяти уровней разницы не падает ничего');
  assert.equal(rateDropChance(0.5, gapRates, 5), 0.5, 'множитель уровня не поднимает шанс выше своего');
  assert.deepEqual(rollDropsRated(MOBS.golem, gapRates, () => 0.2, 1), ['crystal']);
  assert.deepEqual(rollDropsRated(MOBS.golem, gapRates, () => 0.2, 0.2), [], 'при штрафе тот же бросок пустой');
  assert.deepEqual(rollDropsRated(MOBS.lich, gapRates, () => 0.5, 0), [], 'печать босса не падает при нулевом множителе');
  assert.ok(rollDropsRated(MOBS.lich, gapRates, () => 0.999, 1).includes('lich_seal'), 'без штрафа печать гарантирована');

  const world = createMobs(), free = createMobs(off);
  const golem = world.list.find(m => m.kind === 'golem'), sameGolem = free.list.find(m => m.kind === 'golem');
  assert.ok(golem && sameGolem, 'в мире есть големы');
  const lvl = MOBS.golem.lvl + 8, penalty = levelFactor(MOBS.golem.lvl, lvl);
  assert.equal(penalty, 0.2);
  for (let i = 0; i < 20; i++) {
    const cut = world.rewardFor(golem, lvl).coins, full = free.rewardFor(sameGolem, lvl).coins;
    assert.ok(cut >= Math.round(MOBS.golem.coins[0] * penalty) && cut <= Math.round(MOBS.golem.coins[1] * penalty), `монеты со штрафом: ${cut}`);
    assert.ok(full >= MOBS.golem.coins[0] && full <= MOBS.golem.coins[1], `монеты без штрафа: ${full}`);
    assert.ok(cut < MOBS.golem.coins[0], 'со штрафом монет меньше любого обычного броска');
  }
  assert.equal(world.rewardFor(golem, MOBS.golem.lvl).xp, MOBS.golem.xp, 'на своём уровне награда полная');
  assert.deepEqual(world.rewardFor(golem, MOBS.golem.lvl + 10), { xp: 0, coins: 0, drops: [] }, 'с десяти уровней разницы награды нет вовсе');
});

test('дележ по весам: суммы сходятся, доля растёт с уровнем, отставание режет её', () => {
  assert.deepEqual(splitByWeights(7, [1, 1]), [4, 3], 'остаток раздаётся по одной единице');
  assert.equal(splitByWeights(100, [3, 1]).reduce((n, v) => n + v, 0), 100);
  assert.deepEqual(splitByWeights(0, [1, 2]), [0, 0], 'нулевая награда делится в ноль');
  assert.deepEqual(splitByWeights(5, [0, 0]), [0, 0], 'нулевые веса не ломают дележ');
  for (const total of [1, 7, 13, 101, 999]) {
    const parts = splitByWeights(total, [1600, 918.75, 121]);
    assert.equal(parts.reduce((n, v) => n + v, 0), total, `сумма для ${total}`);
    assert.ok(parts.every(Number.isInteger), 'доли целые');
  }
  assert.equal(partyWeight(40, 40), 1600, 'вес — квадрат уровня');
  assert.equal(partyWeight(35, 40), 1225 * 0.75, 'отставание на 5 режет долю');
  assert.equal(partyWeight(30, 40), 0, 'отставший на 10 уровней веса не имеет');
  assert.ok(partyWeight(38, 40) > partyWeight(20, 20), 'старший участник получает больше');
});

test('группа: награда по старшему, доля по уровню, отставший больше чем на девять — ноль', () => {
  const build = (levels) => {
    const players = new Map();
    levels.forEach((lvl, i) => {
      const id = i + 1, name = 'Пара' + id, a = newActor(id, name, newChar(name, 'warrior'));
      a.x = -285; a.z = 387; a.y = 0; a.P.lvl = lvl; players.set(id, { id, name, key: name.toLowerCase(), a });
    });
    const parties = createParties(players, () => {});
    for (let id = 2; id <= levels.length; id++) {
      parties.command(players.get(1), { action: 'invite', name: 'Пара' + id }, 10000 * id);
      parties.command(players.get(id), { action: 'accept', from: 1 }, 10000 * id + 1);
    }
    return { players, parties };
  };
  const mobFor = (lvl) => ({ x: -285, z: 387, def: { ...MOBS.golem, lvl, name: 'мишень' } });
  const planOf = (levels, mobLvl) => {
    const { players, parties } = build(levels);
    return parties.rewardPlan(players.get(1), players.get(1), mobFor(mobLvl), () => 0.5);
  };

  const even = planOf([20, 20], 20);
  assert.equal(even.level, 20);
  assert.equal(even.shares.reduce((n, s) => n + s.xp, 0), xpForKill(mobFor(20).def, 20), 'сумма равна награде');
  assert.ok(Math.abs(even.shares[0].xp - even.shares[1].xp) <= 1, 'при равных уровнях доли равные');

  const mixed = planOf([40, 35], 40);
  assert.equal(mixed.shares.length, 2);
  assert.ok(mixed.shares[0].xp > mixed.shares[1].xp, 'старший забирает большую часть');
  assert.equal(mixed.shares.reduce((n, s) => n + s.xp, 0), xpForKill(mobFor(40).def, 40), 'сумма сходится');
  assert.equal(mixed.shares.reduce((n, s) => n + s.sp, 0), spForKill(xpForKill(mobFor(40).def, 40)), 'SP тоже сходятся');

  const far = planOf([40, 30], 40);
  assert.equal(far.level, 40, 'награда считается по старшему');
  assert.equal(far.shares.length, 1, 'отставший на десять уровней не получает ничего');
  assert.equal(far.shares[0].player.a.P.lvl, 40);
  assert.equal(far.shares[0].xp, xpForKill(mobFor(40).def, 40), 'вся награда уходит старшему');

  // надбавка за размер группы не учитывает тех, кому ничего не положено
  const bonusRates = ratesOf({ partyBonus: 1.5 });
  const { players, parties } = build([40, 30]);
  const withBonus = createParties(players, () => {}, bonusRates);
  withBonus.command(players.get(1), { action: 'invite', name: 'Пара2' }, 30000);
  withBonus.command(players.get(2), { action: 'accept', from: 1 }, 30001);
  const plan = withBonus.rewardPlan(players.get(1), players.get(1), mobFor(40), () => 0.5);
  assert.equal(plan.shares.reduce((n, s) => n + s.xp, 0), xpForKill(mobFor(40).def, 40), 'надбавка за второго участника не начисляется');
  assert.ok(parties.rewardPlan(players.get(1), players.get(1), mobFor(40), () => 0.5).shares.length === 1);

  // моб далеко по уровню от старшего — ноль всей группе
  const useless = planOf([40, 38], 25);
  assert.equal(useless.shares.reduce((n, s) => n + s.xp, 0), 0, 'моб на 15 уровней ниже старшего не даёт ничего');
});
