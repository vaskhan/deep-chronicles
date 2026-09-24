import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newChar, newActor, skillError } from '../server/sim/player.js';
import { calcStats } from '../src/stats.js';
import { MOBS, ITEMS, SETS } from '../src/data.js';
import { PVP } from '../src/pvp.js';
import { effectiveSkill, skillRanks } from '../src/progression.js';
import { BASIC_ATTACK_POWER, calcDmg, heroAttackTiming, skillActionTiming, mobAttack, MOB_ATK_CD } from '../src/sim.js';

test('attack speed progresses with level and profession without a machine-gun cadence', () => {
  const p = newChar('Pacing', 'warrior');
  const first = calcStats(p).aspd;
  assert.ok(1 / first >= 1.5);
  p.lvl = 40;
  const veteran = calcStats(p).aspd;
  assert.ok(veteran > first);
  p.prof = 'berserker';
  assert.ok(calcStats(p).aspd > veteran);
  assert.ok(heroAttackTiming(calcStats(p).aspd).cooldown > 1);
});

test('weapon and skill actions have wind-up, recovery, and one shared lock', () => {
  const p = newChar('Pacing', 'warrior');
  const a = newActor(1, p.name, p); a.x = -620; a.z = 400;
  const timing = skillActionTiming(effectiveSkill(p, 'power_strike'), calcStats(p));
  assert.ok(timing.windup >= .6 && timing.recovery >= .45);
  a.actionUntil = 1000 + timing.cooldown * 1000;
  assert.match(skillError(a, 'power_strike', 1001), /предыдущего действия/);
  assert.equal(skillError(a, 'power_strike', a.actionUntil), null);
  a.actionKind = 'attack';
  assert.equal(skillError(a, 'power_strike', 1001), null, 'a ready skill may interrupt an ordinary attack');
  a.cds.power_strike = 5000;
  assert.match(skillError(a, 'power_strike', 1001), /не готово/, 'preemption cannot bypass the skill cooldown');
  a.cds.power_strike = 0; a.P.mp = 0;
  assert.match(skillError(a, 'power_strike', 1001), /маны/, 'preemption cannot bypass mana');
  for (const mob of Object.values(MOBS)) assert.ok(MOB_ATK_CD(mob) - mobAttack(mob).duration >= 1.2);
});

test('power strike cannot one-shot a full-health ordinary mob within three levels with level-appropriate unenchanted gear, on a maximum noncritical roll', () => {
  let comparisons = 0;
  for (let level = 1; level <= 40; level++) {
    const p = newChar('Balance', 'warrior'); p.lvl = level;
    p.equip.weapon = level >= 25 ? 'sword_dragon' : level >= 18 ? 'sword_crystal' : level >= 8 ? 'sword_long' : 'sword_novice';
    p.skills.power_strike = skillRanks('power_strike').filter(s => s.lvl <= level).length;
    const stats = calcStats(p), skill = effectiveSkill(p, 'power_strike');
    for (const [id, mob] of Object.entries(MOBS)) {
      if (mob.boss || Math.abs(level - mob.lvl) > 3) continue;
      const hit = calcDmg(stats.patk, mob.pdef, skill.mul, 0, () => .99999).d;
      assert.ok(hit < mob.hp, `${level} vs ${id}: ${hit}/${mob.hp}`); comparisons++;
    }
  }
  assert.ok(comparisons > 100);
});


test('critical power is independent from chance; a strong critical can kill outright', () => {
  const p = newChar('Critical', 'warrior'); p.lvl = 4;
  const stats = calcStats(p), skill = effectiveSkill(p, 'power_strike');
  const normal = calcDmg(stats.patk, MOBS.rabbit.pdef, skill.mul, 0, () => .99999, .2, stats.critPower);
  const critical = calcDmg(stats.patk, MOBS.rabbit.pdef, skill.mul, 1, () => .99999, .2, stats.critPower);
  assert.ok(normal.d < MOBS.rabbit.hp && critical.d >= MOBS.rabbit.hp);
  assert.ok(Math.abs(critical.d / normal.d - 1.75) < .02);
  const berserker = calcStats({ ...p, lvl: 20, prof: 'berserker' });
  assert.ok(berserker.critPower > stats.critPower && berserker.critPower < 2);
  assert.equal(calcDmg(100, 70, 1, 1, () => .5, .3, 1.5).d, 225);
});


test('power strike clearly exceeds a normal swing while faster animation preserves attack cadence', () => {
  const p = newChar('Contrast', 'warrior'), stats = calcStats(p);
  const basic = calcDmg(stats.patk, MOBS.wolf.pdef, BASIC_ATTACK_POWER, 0, () => .5).d;
  const skill = calcDmg(stats.patk, MOBS.wolf.pdef, effectiveSkill(p,'power_strike').mul, 0, () => .5).d;
  assert.ok(skill >= basic*1.8 && skill <= basic*2, `${basic} vs ${skill}`);
  const timing = heroAttackTiming(stats.aspd);
  assert.equal(timing.cooldown, 1/stats.aspd);
  assert.ok(Math.abs(timing.duration/timing.cooldown - .8) < .00001);
});

function comparableBuild(cls, level) {
  const p = newChar('Comparison', cls); p.lvl = level;
  const tier = level >= 25 ? 3 : level >= 18 ? 2 : level >= 8 ? 1 : 0;
  const sets = cls === 'warrior' ? ['', 'leather', 'chain', 'bone'] : ['', 'apprentice', 'mystic', 'abyss'];
  const weapons = cls === 'warrior' ? ['sword_novice','sword_long','sword_crystal','sword_dragon'] : ['staff_novice','staff_oak','staff_crystal','staff_abyss'];
  if (tier) { p.equip = {}; for (const id of SETS[sets[tier]].parts) p.equip[ITEMS[id].slot] = id; }
  p.equip.weapon = weapons[tier];
  for (const id of ['power_strike', 'fire_bolt']) p.skills[id] = skillRanks(id).filter(s => s.lvl <= level).length;
  return p;
}

test('equivalent gear preserves class resources and spell-to-swing contrast across all levels', () => {
  for (let level = 1; level <= 40; level++) {
    const wp = comparableBuild('warrior', level), mp = comparableBuild('mage', level);
    const w = calcStats(wp), m = calcStats(mp);
    assert.ok(w.maxHp > m.maxHp && w.maxHp < m.maxHp * 2, `HP level ${level}`);
    assert.ok(m.maxMp > w.maxMp * 3, `MP level ${level}`);
    const basic = calcDmg(w.patk, 100, BASIC_ATTACK_POWER, 0, () => .5).d;
    const physical = calcDmg(w.patk, 100, effectiveSkill(wp,'power_strike').mul, 0, () => .5).d;
    const magic = calcDmg(m.matk, 80, effectiveSkill(mp,'fire_bolt').mul, 0, () => .5).d;
    assert.ok(magic/basic >= 3 && magic/basic <= 4.3, `spell ratio level ${level}: ${magic/basic}`);
    assert.ok(magic/physical >= 1.55 && magic/physical <= 2.2, `skill ratio level ${level}: ${magic/physical}`);
  }
});

test('level 20 PvP requires repeated actions and mage spells retain distinct cast windows', () => {
  const wp = comparableBuild('warrior', 20), mp = comparableBuild('mage', 20);
  const w = calcStats(wp), m = calcStats(mp), fire = effectiveSkill(mp,'fire_bolt');
  const damage = calcDmg(m.matk, w.mdef, fire.mul * PVP.damageScale, 0, () => .5).d;
  const casts = Math.ceil(w.maxHp/damage);
  const elapsed = skillActionTiming(fire,m).windup + (casts-1)*Math.max(fire.cd,skillActionTiming(fire,m).cooldown);
  assert.ok(casts >= 6 && elapsed >= 12 && elapsed <= 25, `${casts} casts, ${elapsed}s`);
  const critical = calcDmg(w.patk,m.pdef,effectiveSkill(wp,'power_strike').mul*PVP.damageScale,1,()=>.99999,.2,w.critPower).d;
  assert.ok(critical < m.maxHp/2, 'one lucky skill cannot decide the entire duel');
  const time = id => skillActionTiming(skillRanks(id)[0],m).windup;
  assert.ok(time('ice_nova') < time('curse') && time('curse') < time('fire_bolt'));
  assert.ok(time('fire_bolt') < time('lightning') && time('lightning') < time('meteor'));
  mp.prof='sorcerer'; const fast=calcStats(mp);
  assert.ok(skillActionTiming(fire,fast).windup < time('fire_bolt'));
  assert.ok(skillActionTiming(fire,fast).windup > 1, 'cast speed must not erase the windup');
});
