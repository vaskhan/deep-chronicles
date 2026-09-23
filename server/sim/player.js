// Персонаж на сервере: профиль, сумка, экипировка, магазин, заточка, опыт и смерть.
// Клиент ничего из этого не считает — он только присылает команды и рисует события.
import { resetMovement } from './movement.js';
import { migrateProgression, effectiveSkill, learnError, promotionError, skillRanks, applyProf, skillsOf } from '../../src/progression.js';
import { CLASSES, ITEMS, PROFESSIONS, SKILLS, SHOP, SHOP_STOCK, RECIPES, MAX_LEVEL, BAG_SLOTS, xpToNext } from '../../src/data.js';
import { calcStats, equipFromBag, unequipSlot, migrate, MAX_ENCH } from '../../src/stats.js';
import { TOWNS, TELEPORTS, heightAt, zoneAt } from '../../src/world-core.js';
import { sellPrice, crystalsFor, xpLossOnDeath, flatDist, clamp } from '../../src/sim.js';
import { DEFAULT_RATES, rateSellPrice, rateBuyPrice, rateRecipe, enchSucceedsRated } from '../../src/rates.js';

// Рейты задаются один раз при старте сервера (server/rates.js); по умолчанию ×1 — прежний баланс.
let RATES = DEFAULT_RATES;
export const setRates = (rates) => { RATES = rates || DEFAULT_RATES; };
export const SAVE_VERSION = 3; // всё, что старее, пересоздаётся (v2 выдавала новичку оружие 8 уровня, надеть его было нельзя)
const NPC_RANGE = 8; // на каком расстоянии можно говорить с NPC
const PROF_CD = 1000; // мс между попытками выбрать профессию: повтор пакета не проходит дважды

export function newChar(name, cls) {
  const c = typeof cls === 'string' && Object.hasOwn(CLASSES, cls) ? cls : 'warrior';
  const t = TOWNS[0];
  const P = {
    v: SAVE_VERSION, name, cls: c, lvl: 1, xp: 0, coins: 150, kills: 0, pvp: 0,
    inv: [{ id: 'potion_hp', n: 5 }, { id: 'scroll_escape', n: 1 }],
    // новичковый комплект сразу надет: без оружия первые мобы непроходимы
    equip: { weapon: c === 'mage' ? 'staff_novice' : 'sword_novice', armor: 'armor_cloth', legs: 'legs_cloth' },
    enc: {}, home: t.id, x: t.x, z: t.z - 12,
  };
  migrate(P); migrateProgression(P);
  const s = calcStats(P);
  P.hp = s.maxHp; P.mp = s.maxMp;
  return P;
}

// сейв из базы → рабочий профиль. Всё, что не проходит проверку, заменяется новым персонажем.
export function loadChar(name, save) {
  if (!save || typeof save !== 'object' || save.v !== SAVE_VERSION || !Object.hasOwn(CLASSES, save.cls)) return newChar(name, save?.cls);
  const P = migrate({ ...save, name });
  P.lvl = clamp(P.lvl | 0 || 1, 1, MAX_LEVEL);
  migrateProgression(P);
  P.craftReceipts = Array.isArray(P.craftReceipts) ? P.craftReceipts.filter(x => typeof x === 'string').slice(-32) : [];
  P.xp = Math.max(0, +P.xp || 0);
  P.coins = Math.max(0, Math.round(+P.coins || 0));
  P.inv = (Array.isArray(P.inv) ? P.inv : []).filter((e) => ITEMS[e?.id]).map((e) => ({
    id: e.id, n: clamp(e.n | 0 || 1, 1, 9999), ...(e.e ? { e: clamp(e.e | 0, 0, MAX_ENCH) } : {}),
  }));
  for (const [sl, id] of Object.entries(P.equip)) if (id && !ITEMS[id]) P.equip[sl] = null;
  for (const sl of Object.keys(P.enc)) P.enc[sl] = clamp(P.enc[sl] | 0, 0, MAX_ENCH);
  const s = calcStats(P);
  // Ноль — сохраненное значение ресурса, а не отсутствие поля.
  P.hp = clamp(Number.isFinite(P.hp) ? P.hp : s.maxHp, 0, s.maxHp);
  P.mp = clamp(Number.isFinite(P.mp) ? P.mp : s.maxMp, 0, s.maxMp);
  P.dead = P.dead === true || P.hp === 0;
  if (P.dead) P.hp = 0;
  return P;
}

// игрок на сервере: профиль + всё, что живёт только в сессии
export function newActor(id, name, P) {
  return {
    id, name, P, movement: { at: Date.now(), credit: 0, fresh: true },
    x: P.x, y: heightAt(P.x, P.z), z: P.z, r: 0,
    target: null,        // { m: mobId } | { p: playerId }
    attacking: false, actionUntil: 0, atkTimer: 0, swing: null, queuedSkill: null, cds: {}, effects: [], cast: null,
    dead: P.dead === true || P.hp === 0, dirty: true, out: [],
    hitBy: new Map(), karma: 0, pk: 0, flagUntil: 0, profAt: 0,
  };
}

// Эффекты во времени (усиления, ослабления, замедление) считает calcStats — src/effects.js.
export const statsOf = (a, now) => calcStats(a.P, a.effects, now);
export const inTown = (a) => !!zoneAt(a.x, a.z).town;
const ev = (a, e) => { a.out.push(e); };
export const say = (a, text, cls) => ev(a, { k: 'msg', text, cls });

// ---------- сумка ----------
export function addItem(P, id, n = 1, ench = 0) {
  const it = ITEMS[id]; if (!it) return;
  const e = it.stack && P.inv.find((i) => i.id === id);
  if (e) e.n += n;
  else for (let k = 0; k < (it.stack ? 1 : n); k++) P.inv.push(ench ? { id, n: 1, e: ench } : { id, n: it.stack ? n : 1 });
}
// Сколько новых ячеек займут вещи: стопка к уже лежащей — ни одной, иначе одна на стопку
// или по одной на каждую нестопочную вещь.
export function slotsFor(P, drops) {
  let need = 0; const fresh = new Set();
  for (const d of drops) {
    const it = ITEMS[d.item]; if (!it || d.item === 'coins') continue;
    if (it.stack) { if (!P.inv.some((e) => e.id === d.item) && !fresh.has(d.item)) { fresh.add(d.item); need++; } }
    else need += Math.max(1, d.n | 0);
  }
  return need;
}
// Отказ по месту в сумке с понятным текстом или null.
export function bagError(P, drops) {
  const need = slotsFor(P, drops);
  if (need && P.inv.length + need > BAG_SLOTS) return `Сумка полна (${P.inv.length}/${BAG_SLOTS}), нужно свободных ячеек: ${P.inv.length + need - BAG_SLOTS}`;
  return null;
}
// Записать изменение профиля или откатить его: сбой записи не должен выглядеть успешной выдачей.
function commit(a, save, before, fail) {
  try { if (save()) return true; } catch { /* ниже — откат */ }
  Object.assign(a.P, before);
  say(a, fail, 'bad');
  return false;
}
const snapshot = (P) => ({ coins: P.coins, inv: structuredClone(P.inv), equip: { ...P.equip }, enc: { ...P.enc } });
export function takeItem(P, id, n = 1) {
  let idx = P.inv.findIndex((i) => i.id === id && !i.e); if (idx < 0) idx = P.inv.findIndex((i) => i.id === id);
  if (idx < 0) return false;
  const e = P.inv[idx]; if (e.n < n) return false;
  e.n -= n; if (e.n <= 0) P.inv.splice(idx, 1);
  return true;
}

// ---------- опыт, смерть ----------
export function gainXp(a, xp) {
  const P = a.P;
  if (P.lvl >= MAX_LEVEL) return;
  P.xp += xp;
  while (P.lvl < MAX_LEVEL && P.xp >= xpToNext(P.lvl)) {
    P.xp -= xpToNext(P.lvl); P.lvl++;
    const s = statsOf(a); P.hp = s.maxHp; P.mp = s.maxMp;
    ev(a, { k: 'lvl', lvl: P.lvl });
  }
  a.dirty = true;
}
export function killPlayer(a, byName, byPk) {
  a.dead = true; a.queuedSkill = null; a.swing = null; a.P.hp = 0; a.attacking = false; a.target = null; a.cast = null;
  a.effects = [];
  const loss = xpLossOnDeath(a.P.lvl, a.karma > 0);
  a.P.xp = Math.max(0, a.P.xp - loss);
  ev(a, { k: 'dead', by: byName, loss, pk: !!byPk });
  a.dirty = true;
}
export function respawn(a) {
  if (!a.dead) return;
  a.effects = [];
  const t = TOWNS.find((x) => x.id === a.P.home) || TOWNS[0];
  const s = statsOf(a);
  a.dead = false; a.P.hp = Math.round(s.maxHp * 0.7); a.P.mp = Math.round(s.maxMp * 0.7);
  place(a, t.x, t.z - 12);
  a.dirty = true;
}
export function place(a, x, z) {
  a.queuedSkill = null; a.swing = null; a.attacking = false; a.target = null; a.cast = null;
  a.x = x; a.z = z; a.y = heightAt(x, z);
  // Сервер уже перенес героя: новые позиции проверяются относительно места
  // назначения. На запоздавшие старые координаты клиент получает обычный fix.
  resetMovement(a);
  ev(a, { k: 'move', x, z });
}

// ---------- команды ----------
// Каждая возвращает void: результат уходит игроку событиями, отказ — строкой в лог.
export function cmdEquip(a, idx, want) {
  const it = ITEMS[a.P.inv[idx | 0]?.id];
  if (!it) return say(a, 'Нет такой вещи', 'bad');
  // Двуручное оружие или полный доспех снимают до двух вещей в сумку: проверяем место заранее.
  const trial = structuredClone(a.P);
  const err = equipFromBag(trial, idx | 0, typeof want === 'string' ? want : undefined);
  if (err) return say(a, err, 'bad');
  if (trial.inv.length > BAG_SLOTS && trial.inv.length > a.P.inv.length) return say(a, `Сумка полна (${a.P.inv.length}/${BAG_SLOTS}): некуда снять надетое`, 'bad');
  equipFromBag(a.P, idx | 0, typeof want === 'string' ? want : undefined);
  a.dirty = true; say(a, `Экипировано: ${it.name}`, 'good');
}
export function cmdUnequip(a, sl) {
  // Имя слота приходит от клиента: 'constructor'/'toString' находились в прототипе объекта
  // и роняли обработчик пакета. Снимаем только собственный слот с настоящим предметом.
  if (!Object.hasOwn(a.P.equip, sl) || !ITEMS[a.P.equip[sl]]) return;
  const it = ITEMS[a.P.equip[sl]];
  if (a.P.inv.length >= BAG_SLOTS) return say(a, `Сумка полна (${a.P.inv.length}/${BAG_SLOTS}): некуда снять`, 'bad');
  unequipSlot(a.P, sl);
  a.dirty = true; say(a, `Снято: ${it.name}`);
}
export function cmdUse(a, id) {
  const it = ITEMS[id]; if (!it?.use || a.dead) return;
  const s = statsOf(a);
  if (it.use === 'hp' || it.use === 'mp') {
    if (!takeItem(a.P, id)) return;
    const key = it.use === 'hp' ? 'hp' : 'mp', max = it.use === 'hp' ? s.maxHp : s.maxMp;
    a.P[key] = Math.min(max, a.P[key] + it.amount);
    ev(a, { k: 'heal', kind: it.use, amount: it.amount });
    a.dirty = true;
  } else if (it.use === 'escape') {
    if (a.cast) return;
    if (!takeItem(a.P, id)) return;
    a.cast = { id: 'escape', t: 3 };
    a.dirty = true; ev(a, { k: 'cast', id: 'escape', t: 3 });
  }
}
// усиление: ref = { bag: индекс } | { slot: id }
export function cmdEnch(a, scrollId, ref, save = () => true) {
  const sc = ITEMS[scrollId];
  if (sc?.use !== 'ench') return say(a, 'Нужен свиток усиления', 'bad');
  const entry = ref?.slot ? null : a.P.inv[ref?.bag | 0];
  const id = ref?.slot ? a.P.equip[ref.slot] : entry?.id, it = ITEMS[id];
  if (!it?.slot) return say(a, 'Выберите снаряжение', 'bad');
  if ((sc.ench === 'w') !== (it.slot === 'weapon')) return say(a, `${sc.name} не подходит для «${it.name}»`, 'bad');
  if (it.grade === 'none') return say(a, 'Вещь без грейда нельзя усилить', 'bad');
  const cur = ref.slot ? a.P.enc[ref.slot] || 0 : entry.e || 0;
  if (cur >= MAX_ENCH) return say(a, 'Максимальное усиление', 'bad');
  // При неудаче надетая вещь превращается в кристаллы: им нужна ячейка, если стопки ещё нет.
  if (ref.slot && bagError(a.P, [{ item: 'crystal', n: 1 }])) return say(a, `${bagError(a.P, [{ item: 'crystal', n: 1 }])} — для кристаллов на случай неудачи`, 'bad');
  const before = snapshot(a.P);
  if (!takeItem(a.P, scrollId)) return say(a, 'Нет свитка', 'bad');
  a.dirty = true;
  if (enchSucceedsRated(cur, RATES)) {
    if (ref.slot) a.P.enc[ref.slot] = cur + 1; else entry.e = cur + 1;
    if (!commit(a, save, before, 'Не удалось сохранить усиление. Свиток и вещь не изменились')) return;
    say(a, `Усиление удалось: ${it.name} +${cur + 1}`, 'rare');
    ev(a, { k: 'ench', ok: true, color: sc.color });
  } else {
    if (ref.slot) { a.P.equip[ref.slot] = null; delete a.P.enc[ref.slot]; }
    else a.P.inv.splice(a.P.inv.indexOf(entry), 1);
    const n = crystalsFor(it.grade, cur);
    addItem(a.P, 'crystal', n);
    if (!commit(a, save, before, 'Не удалось сохранить усиление. Свиток и вещь не изменились')) return;
    say(a, `Усиление не удалось — ${it.name} +${cur} рассыпается. Получено кристаллов: ${n}`, 'bad');
    ev(a, { k: 'ench', ok: false });
  }
}

// торговля — только рядом с торговцем
const npcNear = (a, npcs, role) => npcs.some((n) => n.role === role && flatDist(a, n) < NPC_RANGE);
export function cmdBuy(a, npcs, id, n, save = () => true) {
  if (!npcNear(a, npcs, 'merchant')) return say(a, 'Торговец далеко', 'bad');
  const it = ITEMS[id];
  if (!it || !SHOP.includes(id)) return say(a, 'Такого товара нет', 'bad');
  if (!npcs.some(npc => npc.role === 'merchant' && flatDist(a,npc) < NPC_RANGE && (!npc.shop || SHOP_STOCK[npc.shop]?.includes(id)))) return say(a, 'В этой лавке нет такого товара', 'bad');
  n = clamp(n | 0 || 1, 1, 99);
  const cost = rateBuyPrice(it.price, RATES) * n;
  if (a.P.coins < cost) return say(a, 'Недостаточно монет', 'bad');
  const full = bagError(a.P, [{ item: id, n }]); if (full) return say(a, full, 'bad');
  const before = snapshot(a.P);
  a.P.coins -= cost; addItem(a.P, id, n);
  if (!commit(a, save, before, 'Не удалось сохранить покупку. Монеты не списаны')) return;
  a.dirty = true; say(a, `Куплено: ${it.name}${n > 1 ? ` ×${n}` : ''} за ${cost} мон.`, 'good');
}
export function cmdSell(a, npcs, idx, n, save = () => true) {
  if (!npcNear(a, npcs, 'merchant')) return say(a, 'Торговец далеко', 'bad');
  const e = a.P.inv[idx | 0]; const it = ITEMS[e?.id];
  if (!it) return say(a, 'Нет такой вещи', 'bad');
  n = clamp(n | 0 || 1, 1, e.n);
  const gain = rateSellPrice(sellPrice(it), RATES) * n;
  if (gain <= 0) return say(a, 'Этот предмет нельзя продать', 'bad');
  const before = snapshot(a.P);
  e.n -= n; if (e.n <= 0) a.P.inv.splice(idx | 0, 1);
  a.P.coins += gain;
  if (!commit(a, save, before, 'Не удалось сохранить продажу. Вещь осталась в сумке')) return;
  a.dirty = true; say(a, `Продано: ${it.name}${n > 1 ? ` ×${n}` : ''} за ${gain} мон.`, 'good');
}
export function cmdTeleport(a, npcs, id) {
  if (!npcNear(a, npcs, 'gatekeeper')) return say(a, 'Хранитель врат далеко', 'bad');
  const t = TELEPORTS.find((x) => x.id === id);
  if (!t) return say(a, 'Нет такой точки', 'bad');
  if (a.P.coins < t.cost) return say(a, 'Недостаточно монет', 'bad');
  a.P.coins -= t.cost;
  place(a, t.x, t.z);
  a.dirty = true; say(a, `Перенос: ${t.name}`, 'good');
}

// ---------- умения ----------
// Проверки те же, что были на клиенте, но теперь решающие: мана, кулдаун, уровень, город.
export function skillError(a, id, now, ignoreBusy = false) {
  const sk = effectiveSkill(a.P, id);
  if (!sk) return 'Нет такого умения';
  if (sk.kind === 'passive') return 'Пассивное умение действует постоянно';
  if (promotionError(a.P,sk.lvl)) return promotionError(a.P,sk.lvl);
  if (a.dead || (a.cast && !ignoreBusy)) return 'Сейчас нельзя';
  if (!ignoreBusy && (a.actionUntil || 0) > now) return 'Дождитесь завершения предыдущего действия';
  if (!skillsOf(a.P).includes(id)) return 'Это умение не вашего класса';
  if (!a.P.skills[id]) return 'Сначала изучите умение за SP в карточке навыков';
  if (a.P.lvl < sk.lvl) return `${sk.name}: нужен уровень ${sk.lvl}`;
  if (sk.needShield && !a.P.equip.shield) return `${sk.name}: нужен щит`;
  if ((a.cds[id] || 0) > now) return 'Умение ещё не готово';
  if (a.P.mp < sk.mp) return 'Недостаточно маны';
  if (inTown(a) && sk.kind !== 'heal' && sk.kind !== 'buff') return 'В городе сражаться нельзя';
  return null;
}

// восстановление здоровья и маны; в городе быстрее
export function regen(a, dt) {
  if (a.dead) return;
  const s = statsOf(a), k = inTown(a) ? 4 : 1;
  a.P.hp = Math.min(s.maxHp, a.P.hp + s.maxHp * 0.006 * k * s.regen * dt);
  a.P.mp = Math.min(s.maxMp, a.P.mp + s.maxMp * 0.012 * k * s.regen * dt);
}

// профиль для клиента: сервер шлёт его целиком — так не бывает рассинхрона
export const profileOf = (a) => ({
  ...a.P, hp: Math.round(a.P.hp), mp: Math.round(a.P.mp),
  x: Math.round(a.x * 100) / 100, z: Math.round(a.z * 100) / 100,
  karma: a.karma, pk: a.pk, dead: a.dead,
});

// Ожидаемый ранг предотвращает повторную оплату при двойном клике/повторе пакета.
export function cmdLearn(a, id, rank, save) {
  if (a.dead || a.cast) return say(a, 'Сейчас нельзя изучать умение', 'bad');
  const error = learnError(a.P, id, rank);
  if (error) return say(a, error, 'bad');
  const next = skillRanks(id)[rank - 1], before = { sp: a.P.sp, skills: { ...a.P.skills } };
  a.P.sp -= next.sp; a.P.skills[id] = rank;
  try { if (!save()) throw Error('save failed'); }
  catch { Object.assign(a.P, before); return say(a, 'Не удалось сохранить обучение. SP возвращены', 'bad'); }
  a.dirty = true; say(a, `Изучено: ${next.name}, ранг ${rank}. Потрачено ${next.sp} SP`, 'good');
}
// Профессия выбирается один раз и навсегда: проверки, частота и сохранение — здесь, на сервере.
export function cmdProf(a, id, save) {
  if (a.dead || a.cast) return say(a, 'Сейчас нельзя выбрать профессию', 'bad');
  const now = Date.now();
  if (now - (a.profAt || 0) < PROF_CD) return say(a, 'Слишком часто. Подождите секунду', 'bad');
  a.profAt = now;
  const before = { prof: a.P.prof, prof2: a.P.prof2 };
  const error = applyProf(a.P, id);
  if (error) return say(a, error, 'bad');
  try { if (!save()) throw Error('save failed'); }
  catch { Object.assign(a.P,before); return say(a, 'Не удалось сохранить профессию. Попробуйте ещё раз', 'bad'); }
  a.dirty = true;
  const prof = PROFESSIONS[id];
  say(a, `Профессия выбрана: ${prof.name}. Новые умения ждут в карточке навыков (K)`, 'rare');
}

// Одна транзакционная точка выдачи для ручного подбора и автолута.
export function creditLoot(a, drops, save) {
  const full = bagError(a.P, drops);
  if (full) { say(a, `${full}. Добыча осталась на земле`, 'bad'); return false; }
  const before = { coins: a.P.coins, inv: structuredClone(a.P.inv) };
  for (const d of drops) {
    if (d.item === 'coins') a.P.coins += d.n;
    else addItem(a.P, d.item, d.n);
  }
  try { if (!save()) throw Error('save failed'); }
  catch { Object.assign(a.P, before); return false; }
  a.dirty = true;
  for (const d of drops) a.out.push({ k: 'pickup', id: d.id || '', item: d.item, n: d.n });
  return true;
}

export function cmdCraft(a, npcs, id, request, save) {
  if (a.dead || !npcNear(a, npcs, 'merchant')) return say(a, 'Для изготовления подойдите к торговцу живым', 'bad');
  if (typeof request !== 'string' || request.length < 8 || request.length > 80) return;
  if (a.P.craftReceipts?.includes(request)) return say(a, 'Этот заказ уже выполнен');
  const recipe = Object.hasOwn(RECIPES, id) ? rateRecipe(RECIPES[id], RATES) : null, item = ITEMS[id];
  if (!recipe || !item) return say(a, 'Нет такого рецепта', 'bad');
  if (a.P.lvl < item.lvl) return say(a, `Нужен уровень ${item.lvl}`, 'bad');
  if (a.P.coins < recipe.coins) return say(a, 'Недостаточно монет', 'bad');
  for (const [part, n] of Object.entries(recipe.materials)) {
    if (a.P.inv.filter(e => e.id === part).reduce((sum,e) => sum+e.n,0) < n) return say(a, `Не хватает: ${ITEMS[part].name} ×${n}`, 'bad');
  }
  const before = { coins: a.P.coins, inv: structuredClone(a.P.inv), craftReceipts: a.P.craftReceipts || [] };
  a.P.coins -= recipe.coins;
  for (const [part, amount] of Object.entries(recipe.materials)) {
    let remaining = amount;
    for (const entry of a.P.inv) if (entry.id === part) { const n = Math.min(entry.n, remaining); entry.n -= n; remaining -= n; }
  }
  a.P.inv = a.P.inv.filter(e => e.n > 0); addItem(a.P, id);
  if (a.P.inv.length > BAG_SLOTS && a.P.inv.length > before.inv.length) { Object.assign(a.P, before); return say(a, `Сумка полна (${a.P.inv.length}/${BAG_SLOTS}): некуда положить изделие`, 'bad'); }
  a.P.craftReceipts = [...before.craftReceipts, request].slice(-32);
  try { if (!save()) throw Error('save failed'); }
  catch { Object.assign(a.P, before); return say(a, 'Изготовление не сохранено. Материалы и монеты возвращены', 'bad'); }
  a.dirty = true; say(a, `Изготовлено: ${item.name}`, 'good');
}
