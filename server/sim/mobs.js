// Мобы на сервере: спавн из мира, ИИ, урон, смерть, добыча, респавн.
// Клиент получает их готовыми в снапшоте и только рисует.
import { MOBS } from '../../src/data.js';
import { buildProps } from '../../src/world-core.js';
import { newMob, mobStep, mobRadius, xpForKill, rollCoins, flatDist } from '../../src/sim.js';
import { DEFAULT_RATES, rateXp, rateCoins, rollDropsRated, rateRespawnMs, coinLevelFactor, dropLevelFactor } from '../../src/rates.js';

// rates — серверные коэффициенты (src/rates.js); по умолчанию ×1, то есть прежний баланс.
export function createMobs(rates = DEFAULT_RATES) {
  const { spawns, npcs } = buildProps();
  const list = spawns.map((sp, i) => newMob(i + 1, sp));
  const byId = new Map(list.map((m) => [m.id, m]));

  // один шаг мира: ИИ всех мобов. onHit — «моб бьёт игрока», решает вызывающий.
  const tick = (dt, players, now, onHit, onAttack) => {
    const ctx = { players, now, onHit, onAttack };
    for (const m of list) mobStep(m, ctx, dt);
  };

  // урон мобу. by — актёр игрока; возвращает true, если моб умер.
  const hit = (m, dmg, by) => {
    if (m.dead) return false;
    m.hp -= dmg;
    m.hitBy.set(by.id, (m.hitBy.get(by.id) || 0) + dmg);
    if (m.state !== 'chase') { m.state = 'chase'; m.target = by.id; }
    return m.hp <= 0;
  };

  // смерть моба: опыт и добыча — тому, кто нанёс больше урона
  const kill = (m, now) => {
    m.dead = true; m.hp = 0; m.state = 'dead'; m.target = null;
    m.windup = null; m.attackT = 0; m.moving = false;
    m.respawnAt = now + rateRespawnMs((m.def.respawn || 25) * 1000, rates); m.diedAt = now;
    let top = null, best = 0;
    for (const [id, d] of m.hitBy) if (d > best) { best = d; top = id; }
    m.hitBy.clear();
    return top;
  };

  // Точка выдачи награды: здесь и только здесь работают рейты монет и дропа.
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
      if (m.dead && now > m.diedAt + 4000) continue;
      o.push([m.id, +m.x.toFixed(2), +m.y.toFixed(2), +m.z.toFixed(2), +m.r.toFixed(2),
        (m.moving ? 1 : 0) | (m.attackT > 0 ? 2 : 0) | (m.dead ? 8 : 0),
        Math.max(0, Math.round((m.hp / m.def.hp) * 100))]);
    }
    return o;
  };

  return { list, byId, npcs, tick, hit, kill, rewardFor, snapshotFor, radiusOf: (m) => mobRadius(m.def), defs: MOBS };
}
