// Мобы на сервере: спавн из мира, ранги (элиты/чемпионы), ИИ, стаи, эффекты во времени,
// урон, смерть, добыча, респавн. Клиент получает их готовыми в снапшоте и только рисует.
import { MOBS } from '../../src/data.js';
import { buildProps } from '../../src/world-core.js';
import { CORPSE, newMob, mobStep, mobRadius, xpForKill, rollCoins, flatDist } from '../../src/sim.js';
import { rankedDef } from '../../src/elites.js';
import { socialAllies } from '../../src/pack.js';
import { tickEffects, applyEffect, snapshotEffects } from '../../src/effects.js';
import { DEFAULT_RATES, rateXp, rateCoins, rollDropsRated, rateRespawnMs, coinLevelFactor, dropLevelFactor } from '../../src/rates.js';

// rates — серверные коэффициенты (src/rates.js); по умолчанию ×1, то есть прежний баланс.
export function createMobs(rates = DEFAULT_RATES) {
  const { spawns, npcs } = buildProps();
  // Ранг точки спавна детерминирован (src/elites.js): один и тот же мир при каждом запуске.
  const list = spawns.map((sp, i) => newMob(i + 1, sp, Math.random, rankedDef(MOBS[sp.mob], sp, i + 1)));
  const byId = new Map(list.map((m) => [m.id, m]));

  // один шаг мира: ИИ всех мобов. onHit — «моб бьёт игрока», решает вызывающий.
  const tick = (dt, players, now, onHit, onAttack) => {
    const ctx = { players, now, onHit, onAttack };
    for (const m of list) mobStep(m, ctx, dt);
  };

  // Такт эффектов во времени: сервер сам решает, что делать с уроном и лечением.
  // onTick(m, hit) — сработавший тик, onExpire(m, eff) — спад эффекта.
  const effectsTick = (now, onTick, onExpire) => {
    for (const m of list) {
      if (!m.effects.length) continue;
      const r = tickEffects(m.effects, now);
      m.effects = r.list;
      if (!m.dead) for (const h of r.hits) onTick(m, h);
      for (const e of r.expired) onExpire(m, e);
    }
  };

  // наложить эффект на моба: одинаковый id продлевает действие, а не суммируется
  const affect = (m, eff) => { if (!m.dead) m.effects = applyEffect(m.effects, eff); };

  // урон мобу. by — актёр игрока; возвращает true, если моб умер.
  // Сородичи того же семейства рядом вступаются за своего (src/pack.js).
  const hit = (m, dmg, by) => {
    if (m.dead) return false;
    m.hp -= dmg;
    m.hitBy.set(by.id, (m.hitBy.get(by.id) || 0) + dmg);
    if (m.state !== 'chase') { m.state = 'chase'; m.target = by.id; }
    for (const ally of socialAllies(m, list)) { ally.state = 'chase'; ally.target = by.id; }
    return m.hp <= 0;
  };

  // смерть моба: опыт и добыча — тому, кто нанёс больше урона
  const kill = (m, now) => {
    m.dead = true; m.hp = 0; m.state = 'dead'; m.target = null;
    m.windup = null; m.attackT = 0; m.moving = false; m.effects = [];
    m.respawnAt = now + rateRespawnMs((m.def.respawn || 25) * 1000, rates); m.diedAt = now;
    let top = null, best = 0;
    for (const [id, d] of m.hitBy) if (d > best) { best = d; top = id; }
    m.hitBy.clear();
    return top;
  };

  // Точка выдачи награды: здесь и только здесь работают рейты монет и дропа.
  // Ранг (элита/чемпион) уже вшит в `m.def` при спавне (src/elites.js): опыт, монеты и
  // `dropMul` умножены один раз там, штраф за разницу уровней — один раз здесь.
  // Фактический опыт делит server/sim/party.js — там же применяется рейт опыта.
  // lvl — уровень, по которому считается награда (в группе это максимальный среди имеющих право),
  // поэтому штраф за разницу уровней одинаков для опыта, монет и дропа.
  const rewardFor = (m, lvl) => ({
    xp: rateXp(xpForKill(m.def, lvl, rates), rates),
    coins: rateCoins(rollCoins(m.def) * coinLevelFactor(m.def.lvl, lvl, rates), rates),
    drops: rollDropsRated(m.def, rates, Math.random, dropLevelFactor(m.def.lvl, lvl, rates)),
  });

  // кого видно игроку: живые и недавно умершие (чтобы клиент доиграл падение)
  const snapshotFor = (a, view, now) => {
    const o = [];
    for (const m of list) {
      if (flatDist(m, a) > view) continue;
      if (m.dead && now > m.diedAt + CORPSE.lifetimeMs) continue;
      // Восьмой столбец (индекс 7) — возраст смерти: по нему клиент держит и растворяет тело.
      const row = [m.id, +m.x.toFixed(2), +m.y.toFixed(2), +m.z.toFixed(2), +m.r.toFixed(2),
        (m.moving ? 1 : 0) | (m.attackT > 0 ? 2 : 0) | (m.dead ? 8 : 0),
        Math.max(0, Math.round((m.hp / m.def.hp) * 100)), m.dead ? Math.max(0, now - m.diedAt) : 0];
      // девятый столбец (индекс 8) появляется только с эффектами — обычный снапшот не растёт
      if (m.effects.length) row.push(snapshotEffects(m.effects, now));
      o.push(row);
    }
    return o;
  };

  return { list, byId, npcs, tick, effectsTick, affect, hit, kill, rewardFor, snapshotFor, radiusOf: (m) => mobRadius(m.def), defs: MOBS };
}
