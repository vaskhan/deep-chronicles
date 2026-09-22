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
  describeRates, formatRate,
} from '../src/rates.js';
import { loadRates, envName } from '../server/rates.js';
import { createMobs } from '../server/sim/mobs.js';
import { createParties } from '../server/sim/party.js';
import { newActor, newChar } from '../server/sim/player.js';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
// повторяемый источник случайности: тот же поток чисел для «до» и «после»
const seeded = (seed) => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

test('рейты по умолчанию равны единице и ничего не меняют в наградах', () => {
  assert.deepEqual(DEFAULT_RATES, Object.fromEntries(RATE_NAMES.map(k => [k, 1])));
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
