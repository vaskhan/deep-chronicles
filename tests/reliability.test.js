// Надёжность сервера без сети: лимиты команд, очередь сохранений, предел сумки, откат при сбое записи.
// npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLimiter, bucket, take, COMMAND_LIMITS, TOTAL_LIMIT, FLOOD_DROPS } from '../server/guard.js';

test('лимит команд: всплеск в пределах запаса проходит, дальше — по темпу пополнения', () => {
  const t0 = 1_000_000, l = createLimiter({}, t0);
  const [cap, rate] = COMMAND_LIMITS.buy;
  let ok = 0;
  for (let i = 0; i < 100; i++) if (l.allow('buy', t0)) ok++;
  assert.equal(ok, cap, 'в один момент проходит ровно запас');
  // через секунду добавляется rate единиц
  ok = 0;
  for (let i = 0; i < 100; i++) if (l.allow('buy', t0 + 1000)) ok++;
  assert.equal(ok, rate);
  // виды независимы: исчерпанная покупка не мешает атаке
  assert.ok(l.allow('atk', t0 + 1000));
});

test('лимит команд: общий бюджет ограничивает смесь разных видов', () => {
  const t0 = 5_000, l = createLimiter({}, t0);
  let ok = 0;
  for (let i = 0; i < 20; i++) for (const k of Object.keys(COMMAND_LIMITS)) if (l.allow(k, t0)) ok++;
  assert.equal(ok, TOTAL_LIMIT[0], 'смесь видов упирается в общий запас');
  // честный темп: 20 перемещений и 5 атак в секунду в течение минуты — ни одного отказа
  const h = createLimiter({}, 0);
  let refused = 0;
  for (let ms = 0; ms < 60_000; ms += 50) { if (!h.allow('st', ms)) refused++; if (ms % 200 === 0 && !h.allow('atk', ms)) refused++; }
  assert.equal(refused, 0);
});

test('лимит команд: поток сброшенных пакетов распознаётся, неизвестные виды ограничены', () => {
  const l = createLimiter({}, 0);
  for (let i = 0; i < FLOOD_DROPS + 200; i++) l.allow('__proto__', 10);
  assert.ok(l.flooding(), 'поток должен быть распознан');
  assert.ok(l.dropped > FLOOD_DROPS);
  const quiet = createLimiter({}, 0);
  for (let i = 0; i < 50; i++) quiet.allow('chat', i * 600);
  assert.equal(quiet.flooding(), false, 'редкие отказы — не поток');
});

test('ответы-отказы ограничены отдельно от команд', () => {
  const l = createLimiter({}, 0);
  let n = 0;
  for (let i = 0; i < 1000; i++) if (l.refusal(0)) n++;
  assert.equal(n, 10);
  const b = bucket([2, 1], 0);
  assert.equal(take(b, 0) && take(b, 0), true);
  assert.equal(take(b, 0), false);
  assert.equal(take(b, 1000), true);
});

// ===== сумка и откаты при сбое записи =====
import { newChar, newActor, creditLoot, cmdBuy, cmdSell, cmdEnch, cmdCraft, cmdLearn, cmdEquip, cmdUnequip, bagError, slotsFor, addItem } from '../server/sim/player.js';
import { BAG_SLOTS, ITEMS, RECIPES } from '../src/data.js';
import { openDb } from '../server/accounts.js';
import { learnError, skillsOf } from '../src/progression.js';

const hero = (cls = 'warrior') => { const P = newChar('Проверка', cls); return newActor(1, 'Проверка', P); };
const fill = (a, left = 0) => { while (a.P.inv.length < BAG_SLOTS - left) a.P.inv.push({ id: 'sword_long', n: 1 }); };
const lastMsg = (a) => a.out.filter((e) => e.k === 'msg').at(-1)?.text || '';
const shopAt = (a) => [{ role: 'merchant', x: a.x, z: a.z }];
const failing = () => false, throwing = () => { throw Error('SQLITE_IOERR'); };

test('сумка: стопка к существующей не занимает ячейку, новые вещи — занимают', () => {
  const a = hero();
  assert.equal(slotsFor(a.P, [{ item: 'potion_hp', n: 50 }]), 0, 'зелья уже лежат стопкой');
  assert.equal(slotsFor(a.P, [{ item: 'pelt', n: 3 }, { item: 'pelt', n: 2 }]), 1);
  assert.equal(slotsFor(a.P, [{ item: 'sword_long', n: 3 }, { item: 'coins', n: 100 }]), 3);
  fill(a);
  assert.equal(bagError(a.P, [{ item: 'potion_hp', n: 1 }]), null);
  assert.match(bagError(a.P, [{ item: 'pelt', n: 1 }]), new RegExp(`Сумка полна \\(${BAG_SLOTS}/${BAG_SLOTS}\\)`));
});

test('сумка: переполнение даёт понятный отказ, а не тихую потерю', () => {
  const a = hero(); fill(a);
  a.P.coins = 100000;
  assert.equal(creditLoot(a, [{ item: 'coins', n: 5 }, { item: 'pelt', n: 1 }], () => true), false);
  assert.match(lastMsg(a), /Сумка полна.*Добыча осталась на земле/);
  assert.equal(a.P.coins, 100000, 'монеты из той же награды не зачислены частично');
  cmdBuy(a, shopAt(a), 'potion_mp', 1, () => true);
  assert.match(lastMsg(a), /Сумка полна/);
  assert.equal(a.P.coins, 100000, 'покупка в полную сумку не списывает монеты');
  cmdBuy(a, shopAt(a), 'potion_hp', 3, () => true);
  assert.equal(a.P.coins, 100000 - ITEMS.potion_hp.price * 3, 'стопка к существующей покупается и в полную сумку');
  const inv = a.P.inv.length;
  cmdUnequip(a, 'weapon');
  assert.match(lastMsg(a), /некуда снять/);
  assert.equal(a.P.inv.length, inv); assert.ok(a.P.equip.weapon);
});

test('сбой записи: покупка, продажа, подбор, изготовление, обучение и заточка откатываются', () => {
  for (const save of [failing, throwing]) {
    const a = hero(); a.P.coins = 50000;
    const before = structuredClone(a.P);
    cmdBuy(a, shopAt(a), 'potion_mp', 2, save);
    assert.deepEqual(a.P, before, 'покупка'); assert.match(lastMsg(a), /Не удалось сохранить покупку/);
    cmdSell(a, shopAt(a), 0, 1, save);
    assert.deepEqual(a.P, before, 'продажа'); assert.match(lastMsg(a), /Не удалось сохранить продажу/);
    assert.equal(creditLoot(a, [{ item: 'coins', n: 7 }, { item: 'pelt', n: 2 }], save), false);
    assert.deepEqual(a.P, before, 'подбор');
    assert.equal(a.out.some((e) => e.k === 'pickup'), false, 'событие подбора при сбое не уходит клиенту');
    // заточка надетого оружия D-грейда
    a.P.equip.weapon = 'sword_long'; addItem(a.P, 'scroll_ench_w', 1);
    const ench = structuredClone(a.P);
    cmdEnch(a, 'scroll_ench_w', { slot: 'weapon' }, save);
    assert.deepEqual(a.P, ench, 'заточка'); assert.match(lastMsg(a), /Не удалось сохранить усиление/);
  }
  // изготовление и обучение уже имели откат: проверяем, что исключение записи тоже откатывает
  const c = hero(); c.P.lvl = 40; c.P.coins = 1e6;
  const [id, recipe] = Object.entries(RECIPES)[0];
  for (const [part, n] of Object.entries(recipe.materials)) addItem(c.P, part, n);
  const craft = structuredClone(c.P);
  cmdCraft(c, shopAt(c), id, 'reliability-order', throwing);
  assert.deepEqual(c.P, { ...craft, craftReceipts: craft.craftReceipts || [] });
  c.P.sp = 1e6; const sp = c.P.sp, skills = { ...c.P.skills };
  const learnable = skillsOf(c.P).flatMap((sk) => [1, 2, 3].map((rank) => [sk, rank])).find(([sk, rank]) => !learnError(c.P, sk, rank));
  assert.ok(learnable, 'нашёлся доступный для изучения ранг');
  cmdLearn(c, learnable[0], learnable[1], throwing);
  assert.equal(c.P.sp, sp); assert.deepEqual(c.P.skills, skills);
  assert.match(lastMsg(c), /Не удалось сохранить обучение/);
});

test('двуручное оружие не надевается, если снятым вещам некуда лечь', () => {
  const a = hero('mage');
  a.P.lvl = 40; a.P.equip.shield = null;
  a.P.equip.weapon = 'sword_long';
  // посох двуручный: снимает оружие; со щитом снимает два предмета
  const shield = Object.keys(ITEMS).find((k) => ITEMS[k].slot === 'shield' && !ITEMS[k].lvl);
  if (shield) a.P.equip.shield = shield;
  fill(a, 1);
  a.P.inv.push({ id: 'staff_crystal', n: 1 });
  const idx = a.P.inv.length - 1;
  cmdEquip(a, idx);
  if (shield) { assert.match(lastMsg(a), /Сумка полна/); assert.equal(a.P.equip.weapon, 'sword_long'); }
  else assert.equal(a.P.equip.weapon, 'staff_crystal');
});

test('storeMany пишет несколько профилей одной транзакцией', () => {
  const acc = openDb(':memory:');
  const x = acc.register('Первый', 'secret1', 'warrior'), y = acc.register('Второй', 'secret2', 'mage');
  assert.equal(acc.storeMany([[x.key, { v: 3, coins: 1 }], [y.key, { v: 3, coins: 2 }]]), true);
  assert.equal(acc.load(x.key).coins, 1); assert.equal(acc.load(y.key).coins, 2);
  // один профиль не прошёл проверку — не записан ни один
  assert.equal(acc.storeMany([[x.key, { v: 3, coins: 5 }], [y.key, { big: 'x'.repeat(70_000) }]]), false);
  assert.equal(acc.load(x.key).coins, 1);
  acc.close();
});

// ===== очередь сохранений =====
import { createSaveQueue } from '../server/save-queue.js';

test('очередь сохранений: много операций — одна запись пачкой, игрок в пачке один раз', () => {
  const calls = [];
  const q = createSaveQueue({ write: (list) => { calls.push(list.map((p) => p.id)); return { rejected: new Set() }; } });
  const p1 = { id: 1, key: 'a', a: { out: [] } }, p2 = { id: 2, key: 'b', a: { out: [] } };
  for (let i = 0; i < 50; i++) q.stage(i % 2 ? p1 : p2, { undo() { throw Error('не должен вызываться'); } });
  q.mark(p1);
  assert.equal(q.flush(), true);
  assert.deepEqual(calls, [[2, 1]]);
  assert.equal(q.pending(), 0);
  assert.equal(q.flush(), true); assert.equal(calls.length, 1, 'пустая очередь не пишет');
});

test('очередь сохранений: сбой пачки откатывает операции в обратном порядке и убирает их события', () => {
  const order = [], p = { id: 1, key: 'a', a: { out: [] } };
  const q = createSaveQueue({ write: () => { throw Error('SQLITE_IOERR'); } });
  for (const n of [1, 2, 3]) { const e = { k: 'pickup', n }; p.a.out.push(e); q.stage(p, { events: [e], undo: () => order.push(n) }); }
  p.a.out.push({ k: 'msg', text: 'чужое событие' });
  assert.equal(q.flush(), false);
  assert.deepEqual(order, [3, 2, 1]);
  assert.deepEqual(p.a.out, [{ k: 'msg', text: 'чужое событие' }]);
  // отвергнутый игрок откатывается один, остальные записаны
  const good = { id: 2, key: 'g', a: { out: [] } }, bad = { id: 3, key: 'x', a: { out: [] } };
  let undone = 0;
  const q2 = createSaveQueue({ write: () => ({ rejected: new Set([bad]) }), onRejected: () => {} });
  q2.stage(good, { undo: () => undone++ }); q2.stage(bad, { undo: () => undone += 10 });
  assert.equal(q2.flush(), false);
  assert.equal(undone, 10);
  // критичная запись игрока закрывает его очередь
  const q3 = createSaveQueue({ write: () => { throw Error('не должен писать'); } });
  q3.stage(good, {}); q3.settle(good);
  assert.equal(q3.flush(), true);
});
