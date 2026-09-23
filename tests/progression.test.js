import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newChar, loadChar, newActor, cmdLearn, cmdProf, creditLoot, cmdCraft, cmdBuy, skillError } from '../server/sim/player.js';
import { skillRanks, spForKill, effectiveSkill, profsFor, profError, applyProf, skillsOf, trainingCost, trainingLevels, learnError, migrateProgression } from '../src/progression.js';
import { xpForKill } from '../src/sim.js';
import { calcStats } from '../src/stats.js';
import { CLASSES, MAX_LEVEL, ITEMS, SETS, RECIPES, MOBS, PROFESSIONS, PROF_LVL, SKILLS, xpToNext } from '../src/data.js';
import { sellPrice } from '../src/sim.js';
import { buildProps, TOWNS, CRYPT } from '../src/world-core.js';
import { artPlacements, presentationHeightAt } from '../tools/godot/placements.mjs';

const actor = () => newActor(1, 'Тест', newChar('Тест', 'warrior'));
const merchant = [{ role: 'merchant', x: -430, z: 388 }];
test('миграция v3 сохраняет вещи/монеты и открытые раньше базовые навыки, SP не выдумываются', () => {
  const original = newChar('Тест', 'mage'); original.lvl = 18; original.coins = 9876;
  delete original.skills; delete original.sp; delete original.autoloot;
  const migrated = loadChar('Тест', original);
  assert.equal(migrated.coins, 9876); assert.deepEqual(migrated.equip, original.equip);
  // Старый сейв без skills открывает первый ранг всех доступных по уровню умений класса, включая новые.
  assert.deepEqual(Object.keys(migrated.skills).sort(), CLASSES.mage.skills.filter(id=>SKILLS[id].lvl<=18).sort());
  assert.equal(migrated.sp, 0); assert.equal(migrated.autoloot, true);
  migrated.skills.fire_bolt = 2; migrated.sp = 222; migrated.autoloot = false;
  const second = loadChar('Тест', migrated);
  assert.equal(second.skills.fire_bolt, 2); assert.equal(second.sp, 222); assert.equal(second.autoloot, false);
});
test('обучение требует класс, уровень, SP и ожидаемый ранг; повтор не оплачивается', () => {
  const a = actor(); a.P.sp = 100000;
  cmdLearn(a, 'heal', 1, () => true); assert.equal(a.P.skills.heal, undefined);
  cmdLearn(a, 'battle_cry', 1, () => true); assert.equal(a.P.skills.battle_cry, undefined);
  a.P.lvl = 8; a.P.sp = 0;
  assert.match(skillError(a, 'battle_cry', Date.now()), /изучите/);
  cmdLearn(a, 'battle_cry', 1, () => true); assert.equal(a.P.skills.battle_cry, undefined);
  const cost = skillRanks('battle_cry')[0].sp; a.P.sp = cost;
  cmdLearn(a, 'battle_cry', 1, () => true); assert.equal(a.P.skills.battle_cry, 1); assert.equal(a.P.sp, 0);
  cmdLearn(a, 'battle_cry', 1, () => true); assert.equal(a.P.sp, 0);
  assert.equal(skillError(a, 'battle_cry', Date.now()), null);
});
test('новый ранг действительно усиливает навык; SP на максимальном уровне считаются независимо от роста уровня', () => {
  const a = actor(); a.P.lvl = 40; a.P.sp = 100000;
  const before = effectiveSkill(a.P, 'power_strike');
  cmdLearn(a, 'power_strike', 2, () => true);
  assert.ok(effectiveSkill(a.P,'power_strike').mul > before.mul);
  assert.ok(effectiveSkill(a.P,'power_strike').mp > before.mp);
  assert.equal(spForKill(100), 12); assert.equal(spForKill(1), 1);
});
test('ошибка SQLite откатывает обучение, ручную награду и пакет автолута', () => {
  const a = actor(); a.P.lvl = 8; a.P.sp = 5000;
  const before = structuredClone(a.P);
  cmdLearn(a, 'battle_cry', 1, () => { throw Error('disk'); }); assert.deepEqual(a.P, before);
  assert.equal(creditLoot(a,[{item:'coins',n:55},{item:'pelt',n:2}],()=>false),false);
  assert.deepEqual(a.P,before);
  assert.equal(creditLoot(a,[{item:'coins',n:55},{item:'pelt',n:2}],()=>true),true);
  assert.equal(a.P.coins,before.coins+55); assert.equal(a.P.inv.find(e=>e.id==='pelt').n,2);
});
test('рецепт не создаёт вещь без материалов/дистанции и сохраняет заказ ровно один раз', () => {
  const a=actor(); a.P.lvl=8; a.P.coins=1000;
  cmdCraft(a,merchant,'sword_long','test-craft-1',()=>true); assert.equal(a.P.coins,1000);
  a.P.inv.push({id:'pelt',n:10},{id:'pelt',n:30},{id:'bone',n:40});
  cmdCraft(a,[],'sword_long','test-craft-1',()=>true); assert.equal(a.P.coins,1000);
  const before=structuredClone(a.P);
  cmdCraft(a,merchant,'sword_long','test-craft-1',()=>false); assert.deepEqual(a.P,{...before,craftReceipts:[]});
  cmdCraft(a,merchant,'sword_long','test-craft-1',()=>true);
  assert.equal(a.P.coins,700); assert.equal(a.P.inv.filter(e=>e.id==='sword_long').length,1);
  cmdCraft(a,merchant,'sword_long','test-craft-1',()=>true);
  assert.equal(a.P.coins,700); assert.equal(a.P.inv.filter(e=>e.id==='sword_long').length,1);
  assert.equal(a.P.inv.filter(e=>e.id==='pelt').reduce((n,e)=>n+e.n,0),20);
});
test('нет выкупа стартовых вещей за 1600 и циклов прибыльного изготовления/продажи', () => {
  for(const id of ['sword_novice','staff_novice','armor_cloth','legs_cloth','lich_seal']) assert.equal(sellPrice(ITEMS[id]),0,id);
  for(const [id,r] of Object.entries(RECIPES)) {
    const cost=r.coins+Object.entries(r.materials).reduce((sum,[item,n])=>sum+sellPrice(ITEMS[item])*n,0);
    assert.ok(cost>sellPrice(ITEMS[id]),id);
  }
});
test('у двух классов есть B-оружие и равная гарантированная стоимость комплектов', () => {
  assert.equal(ITEMS.staff_abyss.grade,ITEMS.sword_dragon.grade);
  assert.deepEqual(RECIPES.staff_abyss,RECIPES.sword_dragon);
  const totals=set=>SETS[set].parts.reduce((t,id)=>{const r=RECIPES[id];for(const [k,n]of Object.entries({coins:r.coins,...r.materials}))t[k]=(t[k]||0)+n;return t;},{});
  assert.deepEqual(totals('abyss'),totals('bone'));
  assert.equal(MOBS.lich.drops.lich_seal,1);
  for(const [id,r]of Object.entries(RECIPES))for(const [part,n]of Object.entries(r.materials)) assert.ok(ITEMS[part]&&Number.isInteger(n)&&n>0,`${id}:${part}`);
});
test('все декорации стоят на точной поверхности Godot, без положительного зазора', () => {
  const shapes=[];let kind='plain';
  buildProps({use(k){kind=k;},add(shape,color,x,y,z,ry=0,sx=1,sy=1,sz=1){shapes.push([shape,color,x,y,z,ry,sx,sy,sz,kind]);}});
  const {modelPlacements}=artPlacements(shapes,TOWNS,CRYPT);
  assert.ok(modelPlacements.length>2000);
  for(const r of modelPlacements) {
    assert.ok(r.every((x,i)=>i===0||Number.isFinite(x)),r[0]);
    const gap=r[2]-presentationHeightAt(r[1],r[3]);
    assert.ok(gap<=0.001,`${r[0]} at ${r[1]},${r[3]} floats by ${gap}`);
  }
});

test('неизвестные и прототипные ID навыков/рецептов не роняют обработчик', () => {
  const a=actor();
  for(const id of ['missing','__proto__','constructor','toString']) {
    assert.equal(skillError(a,id,Date.now()),'Нет такого умения');
    assert.doesNotThrow(()=>cmdCraft(a,merchant,id,'invalid-order',()=>true));
  }
  assert.equal(newChar('Тест','__proto__').cls,'warrior');
});

test('смерть и нулевая мана сохраняются при загрузке, оживляет только respawn', async () => {
  const { killPlayer, profileOf, respawn } = await import('../server/sim/player.js');
  const a = actor(); a.P.mp = 0; killPlayer(a, 'Тестовый моб');
  const saved = profileOf(a);
  const restored = newActor(2, a.name, loadChar(a.name, saved));
  assert.equal(restored.dead, true);
  assert.equal(restored.P.hp, 0);
  assert.equal(restored.P.mp, 0);
  const xp = restored.P.xp;
  respawn(restored);
  assert.equal(restored.dead, false);
  assert.ok(restored.P.hp > 0);
  assert.equal(restored.P.xp, xp, 'повторный вход не должен повторять штраф смерти');
  const legacy = newChar('Старый', 'warrior'); delete legacy.hp; delete legacy.mp; delete legacy.dead;
  const old = newActor(3, 'Старый', loadChar('Старый', legacy));
  assert.equal(old.dead, false); assert.ok(old.P.hp > 0 && old.P.mp > 0);
});


test('стационарные лавки продают только свой ассортимент', () => {
  const a=actor();a.P.coins=10000;
  const npcs=[{role:'merchant',shop:'clothes',x:a.x,z:a.z}];
  cmdBuy(a,npcs,'sword_long',1);assert.equal(a.P.coins,10000);
  cmdBuy(a,npcs,'helm_leather',1);assert.equal(a.P.coins,10000-ITEMS.helm_leather.price);
  npcs[0].shop='weapons'; const before=a.P.coins;
  cmdBuy(a,npcs,'potion_hp',1);assert.equal(a.P.coins,before);
  cmdBuy(a,npcs,'sword_long',1);assert.equal(a.P.coins,before-ITEMS.sword_long.price);
});


// ===== профессии =====
test('профессия: по две на класс, выбор только с 20 уровня, свой класс и один раз', () => {
  assert.deepEqual(profsFor('warrior').map(p => p.id), ['knight', 'berserker']);
  assert.deepEqual(profsFor('mage').map(p => p.id), ['sorcerer', 'healer']);
  const P = newChar('Тест', 'warrior');
  assert.equal(P.prof, null);
  assert.match(profError(P, 'knight'), new RegExp(`с ${PROF_LVL} уровня`));
  assert.match(profError(P, 'sorcerer'), /недоступна вашему классу/);
  for (const id of ['', 'missing', '__proto__', 'constructor']) assert.match(profError(P, id), /недоступна вашему классу/);
  P.lvl = PROF_LVL - 1;
  assert.ok(profError(P, 'knight'));
  P.lvl = PROF_LVL;
  assert.equal(profError(P, 'knight'), null);
  assert.equal(applyProf(P, 'knight'), null);
  assert.equal(P.prof, 'knight');
  assert.match(applyProf(P, 'berserker'), /уже выбрана/);
  assert.equal(P.prof, 'knight');
});

test('профессия: множители доходят до calcStats и не трогают чужие характеристики', () => {
  const base = newChar('Тест', 'warrior'); base.lvl = 20;
  const plain = calcStats(base);
  for (const [id, expected] of Object.entries({ knight: { maxHp: 1.15, pdef: 1.15, aspd: 1.04 }, berserker: { patk: 1.12, crit: 1.25, pdef: 0.95, aspd: 1.12, critPower: 1.08 } })) {
    const P = { ...structuredClone(base), prof: id };
    const s = calcStats(P);
    assert.deepEqual(PROFESSIONS[id].bonus, expected, id);
    for (const [key, mul] of Object.entries(expected)) {
      const want = key === 'maxHp' || key === 'maxMp' ? Math.round(plain[key] * mul) : plain[key] * mul;
      assert.ok(Math.abs(s[key] - want) < 1e-9, `${id}.${key}: ${s[key]} != ${want}`);
    }
    for (const key of ['matk', 'mdef', 'acc', 'eva', 'maxMp']) {
      if (Object.hasOwn(expected, key)) continue;
      assert.equal(s[key], plain[key], `${id}.${key} не должен меняться`);
    }
  }
  const mage = newChar('Маг', 'mage'); mage.lvl = 20;
  const mageStats = calcStats(mage);
  assert.ok(Math.abs(calcStats({ ...structuredClone(mage), prof: 'sorcerer' }).matk - mageStats.matk * 1.15) < 1e-9);
  assert.ok(Math.abs(calcStats({ ...structuredClone(mage), prof: 'sorcerer' }).cast - mageStats.cast * 1.1) < 1e-9);
  assert.equal(calcStats({ ...structuredClone(mage), prof: 'healer' }).maxMp, Math.round(mageStats.maxMp * 1.2));
  assert.ok(Math.abs(calcStats({ ...structuredClone(mage), prof: 'healer' }).mdef - mageStats.mdef * 1.1) < 1e-9);
});

test('ранги умений профессии: открыты с 20+, стоят SP и учатся только после выбора', () => {
  for (const prof of Object.values(PROFESSIONS)) for (const id of prof.skills) {
    const ranks = skillRanks(id);
    assert.ok(ranks.length >= 4, `${id}: мало рангов`);
    assert.equal(ranks[0].lvl, SKILLS[id].lvl, `${id}: первый ранг не на уровне умения`);
    assert.ok(ranks[0].lvl >= PROF_LVL, `${id}: доступен раньше профессии`);
    assert.ok(ranks[0].sp > 0, `${id}: первый ранг бесплатный`);
    for (let i = 1; i < ranks.length; i++) {
      const waves=trainingLevels(prof.base);
      assert.equal(ranks[i].lvl, waves[waves.indexOf(ranks[i-1].lvl)+1], `${id}: шаг уровня`);
      assert.ok(ranks[i].sp > ranks[i - 1].sp, `${id}: цена не растёт`);
      if (SKILLS[id].mp > 0) assert.ok(ranks[i].mp > ranks[i - 1].mp, `${id}: расход маны не растёт`);
      else assert.equal(ranks[i].mp,0);
      if (ranks[i].mul) assert.ok(ranks[i].mul > ranks[i - 1].mul, `${id}: сила не растёт`);
    }
  }
  const a = newActor(1, 'Тест', newChar('Тест', 'warrior'));
  a.P.lvl = 25; a.P.sp = 100000;
  assert.deepEqual(skillsOf(a.P), CLASSES.warrior.skills);
  cmdLearn(a, 'shield_bash', 1, () => true);
  assert.equal(a.P.skills.shield_bash, undefined, 'без профессии умение не учится');
  cmdProf(a, 'knight', () => true);
  assert.equal(a.P.prof, 'knight');
  assert.deepEqual(skillsOf(a.P), [...CLASSES.warrior.skills, ...PROFESSIONS.knight.skills]);
  const cost = skillRanks('shield_bash')[0].sp, sp = a.P.sp;
  cmdLearn(a, 'shield_bash', 1, () => true);
  assert.equal(a.P.skills.shield_bash, 1); assert.equal(a.P.sp, sp - cost);
  // умение чужой профессии того же класса недоступно
  cmdLearn(a, 'frenzy', 1, () => true); assert.equal(a.P.skills.frenzy, undefined);
});

test('удар щитом требует щит, ошибка записи откатывает профессию, повтор не проходит дважды', () => {
  const a = newActor(1, 'Тест', newChar('Тест', 'warrior'));
  a.P.lvl = 25; a.P.sp = 100000;
  cmdProf(a, 'knight', () => { throw Error('disk'); });
  assert.equal(a.P.prof, null, 'сбой записи не оставляет профессию');
  a.profAt = 0;
  cmdProf(a, 'knight', () => true); assert.equal(a.P.prof, 'knight');
  cmdLearn(a, 'shield_bash', 1, () => true);
  a.x = 0; a.z = 0; // проверяем оружие, а не запрет боя в городе
  assert.match(skillError(a, 'shield_bash', Date.now()), /нужен щит/);
  a.P.equip.shield = 'shield_iron';
  assert.equal(skillError(a, 'shield_bash', Date.now()), null);
  // частота: второй пакет подряд отбрасывается молча
  const b = newActor(2, 'Тест2', newChar('Тест2', 'mage'));
  b.P.lvl = 25;
  cmdProf(b, 'sorcerer', () => true);
  cmdProf(b, 'healer', () => true);
  assert.equal(b.P.prof, 'sorcerer');
});

test('миграция: профессия переживает перезаход, чужая и неизвестная сбрасываются без потери прогресса', () => {
  const original = newChar('Тест', 'warrior');
  original.lvl = 25; original.coins = 4321; original.sp = 777;
  assert.equal(loadChar('Тест', original).prof, null);
  original.prof = 'knight'; original.skills = { power_strike: 2, shield_bash: 1 };
  const saved = loadChar('Тест', original);
  assert.equal(saved.prof, 'knight');
  assert.deepEqual(saved.skills, { power_strike: 2, shield_bash: 1 });
  assert.equal(saved.coins, 4321); assert.equal(saved.sp, 777);
  // профессия мага у воина: сбрасывается вместе с её умениями, всё остальное цело
  const broken = loadChar('Тест', { ...structuredClone(original), prof: 'sorcerer', skills: { power_strike: 2, lightning: 3 } });
  assert.equal(broken.prof, null);
  assert.deepEqual(broken.skills, { power_strike: 2 });
  assert.equal(broken.coins, 4321);
  assert.equal(loadChar('Тест', { ...structuredClone(original), prof: '__proto__' }).prof, null);
  // ранг выше доступного по уровню обрезается
  const early = loadChar('Тест', { ...structuredClone(original), lvl: 20, skills: { shield_bash: 5 } });
  assert.equal(early.skills.shield_bash, 1);
});

test('training is affordable and follows class waves through level 60', () => {
  assert.equal(MAX_LEVEL,60);
  assert.deepEqual(trainingLevels('warrior'),[1,5,10,15,20,24,28,32,36,40,43,46,49,52,55,58]);
  assert.deepEqual(trainingLevels('mage'),[1,7,14,20,25,30,35,40,44,48,52,56,60]);
  for(const [id,base] of Object.entries(SKILLS)) {
    const ranks=skillRanks(id);assert.ok(ranks.length);assert.equal(ranks[0].lvl,base.lvl);
    for(const r of ranks) assert.equal(r.sp,trainingCost(r.lvl));
  }
  const nearby=Object.values(MOBS).filter(m=>!m.boss&&Math.abs(m.lvl-20)<=1);
  const perKill=Math.max(...nearby.map(m=>spForKill(xpForKill(m,20))));
  assert.ok(trainingCost(20)/perKill<5);
  assert.ok(trainingCost(40)<Math.round(xpToNext(40)*0.18)/20);
});

test('promotion gates level 20 and 40 ranks, second profession is parent-specific and persistent', () => {
  const a=actor();a.P.lvl=60;a.P.sp=1000000;
  a.P.skills.power_strike=4;
  assert.match(learnError(a.P,'power_strike',5),/профессию/);
  assert.equal(applyProf(a.P,'knight'),null);
  assert.equal(learnError(a.P,'power_strike',5),null);
  a.P.skills.power_strike=9;
  assert.match(learnError(a.P,'power_strike',10),/вторую/);
  assert.match(applyProf(a.P,'archmage'),/классу/);
  a.P.lvl=39;assert.match(applyProf(a.P,'paladin'),/40/);a.P.lvl=60;
  assert.equal(applyProf(a.P,'paladin'),null);
  assert.equal(learnError(a.P,'power_strike',10),null);
  assert.match(applyProf(a.P,'dark_guard'),/уже выбрана/);
  const saved=loadChar('Тест',a.P);assert.equal(saved.prof2,'paladin');
  assert.ok(skillsOf(saved).includes('sacred_guard'));
  assert.equal(loadChar('Тест',{...saved,prof2:'archmage'}).prof2,null);
});

test('passives modify only their owner, require learning, and cannot be cast', () => {
  const p=newChar('Passive','warrior');p.lvl=15;const before=calcStats(p);
  p.skills.weapon_mastery=1;
  assert.ok(calcStats(p).patk>before.patk);
  p.skills.magic_mastery=1;assert.equal(calcStats(p).matk,before.matk);
  const a=newActor(10,p.name,p);assert.match(skillError(a,'weapon_mastery',Date.now()),/Пассивное/);
  assert.equal(skillsOf(p).filter(id=>SKILLS[id].kind==='passive').length,3);
  for(const [id,prof] of Object.entries(PROFESSIONS).filter(([,pr])=>pr.parent)) {
    const c=newChar('Branch',prof.base);c.lvl=60;c.prof=prof.parent;c.prof2=id;
    assert.equal(skillsOf(c).length,20);
    assert.ok(skillsOf(c).filter(id=>SKILLS[id].kind==='passive').length>=6);
  }
});

test('old paid ranks migrate once and return the SP overpayment without resetting inventory', () => {
  const p=newChar('Old','warrior');p.lvl=40;p.prof='knight';p.skills={power_strike:6};p.sp=17;delete p.trainingVersion;
  const inv=structuredClone(p.inv);migrateProgression(p);
  assert.equal(p.skills.power_strike,9);assert.ok(p.sp>17);assert.deepEqual(p.inv,inv);
  const once=structuredClone(p);migrateProgression(p);assert.deepEqual(p,once);
});
