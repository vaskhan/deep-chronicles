import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newChar, loadChar, newActor, cmdLearn, creditLoot, cmdCraft, cmdBuy, skillError } from '../server/sim/player.js';
import { skillRanks, spForKill, effectiveSkill } from '../src/progression.js';
import { ITEMS, SETS, RECIPES, MOBS } from '../src/data.js';
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
  assert.deepEqual(migrated.skills, { fire_bolt: 1, heal: 1, ice_nova: 1 });
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
