// Правила симуляции: урон, промахи, опыт, дроб, ИИ мобов, цены, заточка.
// Без DOM и three.js — один и тот же код считает бой на сервере и проверяется юнит-тестами.
// Случайность приходит аргументом rng, чтобы тесты были повторяемы.
import { MOVE_SCALE } from './movement.js';
import { MOBS, ITEMS, MAX_LEVEL, xpToNext } from './data.js';
import { MAX_ENCH, SAFE_ENCH, ENCH_CHANCE } from './stats.js';
import { heightAt, obstacles, MAP, DUNGEON } from './world-core.js';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const rand = (a, b, rng = Math.random) => a + rng() * (b - a);
export const irand = (a, b, rng = Math.random) => Math.floor(rand(a, b + 1, rng));

// ---------- бой ----------
export function calcDmg(atk, def, mul = 1, crit = 0, rng = Math.random) {
  let d = atk * mul * (70 / (70 + def)) * rand(0.9, 1.1, rng) * 3;
  const isCrit = rng() < crit; if (isCrit) d *= 2;
  return { d: Math.max(1, Math.round(d)), crit: isCrit };
}
// шанс промахнуться по мобу и шанс увернуться от моба — зеркальные формулы
export const missChance = (mobLvl, acc) => clamp(0.06 + (mobLvl + 33 - acc) * 0.01, 0.01, 0.3);
export const evaChance = (mobLvl, eva) => clamp(0.05 + (eva - (mobLvl + 33)) * 0.01, 0.02, 0.3);

export const MOB_ATK_CD = (def) => (def.boss ? 1.4 : 1.8);
export const MOB_SPEED = (def) => 12 * MOVE_SCALE * (def.boss || ['tree', 'golem'].includes(def.shape) ? 0.8 : 1);
export function heroAttackTiming(aspd) {
  const cooldown = 1 / aspd, duration = cooldown * .88;
  return { cooldown, duration, windup: duration * .35 };
}
export const CORPSE = { holdSeconds: 5, fadeSeconds: 1.5, lifetimeMs: 12000 };
export const leashDistance = (def) => def.boss ? 140 : 180;
export const mobRadius = (def) => (def.size || 1) * 0.9;
// Замах фиксирует направление. Игрок успевает выйти из сектора до удара;
// клиент рисует ровно эти параметры, но попадание проверяется только здесь.
export const mobAttack = (def) => ({
  duration: def.boss || ['tree', 'golem'].includes(def.shape) ? 0.9 : def.shape === 'humanoid' ? 0.7 : 0.55,
  reach: 2 + mobRadius(def) + 0.6,
  arc: 2.3,
});
export function mobAttackContains(attack, player) {
  const dx = player.x - attack.x, dz = player.z - attack.z, distance = Math.hypot(dx, dz);
  if (distance > attack.reach) return false;
  if (distance < 0.3) return true;
  const angle = Math.atan2(dx, dz) - attack.r;
  return Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) <= attack.arc / 2;
}

// опыт с понижением за мобов сильно ниже игрока
export function xpForKill(mobDef, heroLvl) {
  const diff = mobDef.lvl - heroLvl;
  return Math.round(mobDef.xp * (diff < -5 ? Math.max(0.1, 1 + (diff + 5) * 0.15) : 1));
}
export const rollCoins = (mobDef, rng = Math.random) => irand(mobDef.coins[0], mobDef.coins[1], rng);
export function rollDrops(mobDef, rng = Math.random) {
  const out = [];
  for (const [id, ch] of Object.entries(mobDef.drops || {})) if (rng() < ch) out.push(id);
  return out;
}
export const xpLossOnDeath = (lvl, isPk) => Math.round(xpToNext(lvl) * (isPk ? 0.12 : 0.04));

// ---------- движение ----------
// сетка препятствий: без неё каждый шаг перебирал бы все 3000+ кругов
const GRID = 24;
let grid = null;
function buildGrid() {
  grid = new Map();
  for (const o of obstacles) {
    const x0 = Math.floor((o.x - o.r) / GRID), x1 = Math.floor((o.x + o.r) / GRID);
    const z0 = Math.floor((o.z - o.r) / GRID), z1 = Math.floor((o.z + o.r) / GRID);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const k = `${i},${j}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(o);
    }
  }
}
let gridFor = -1; // на сколько препятствий построена сетка: мир строится лениво, после импорта
export function obstaclesNear(x, z) {
  if (gridFor !== obstacles.length) { buildGrid(); gridFor = obstacles.length; }
  return grid.get(`${Math.floor(x / GRID)},${Math.floor(z / GRID)}`) || [];
}

// шаг с выталкиванием из препятствий; pos — { x, y, z }, мутируется
export function moveEntity(pos, dirX, dirZ, dist, radius) {
  pos.x += dirX * dist; pos.z += dirZ * dist;
  for (const o of obstaclesNear(pos.x, pos.z)) {
    const dx = pos.x - o.x, dz = pos.z - o.z, d = Math.hypot(dx, dz), min = o.r + radius;
    if (d < min && d > 1e-4) { pos.x = o.x + dx / d * min; pos.z = o.z + dz / d * min; }
  }
  const lim = MAP / 2 - 20;
  if (pos.x < DUNGEON.x0 - 100) { pos.x = clamp(pos.x, -lim, lim); pos.z = clamp(pos.z, -lim, lim); }
  pos.y = heightAt(pos.x, pos.z);
  return pos;
}
export const flatDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------- мобы ----------
export function newMob(id, spawn, rng = Math.random) {
  const def = MOBS[spawn.mob];
  return {
    id, kind: spawn.mob, def,
    home: { x: spawn.x, z: spawn.z },
    x: spawn.x, y: heightAt(spawn.x, spawn.z), z: spawn.z, r: rand(0, 6.28, rng),
    hp: def.hp, recoverAfter: 0, state: 'idle', target: null, atkCd: 0, wanderT: rand(1, 6, rng), dest: null,
    dead: false, respawnAt: 0, diedAt: 0, moving: false, attackT: 0, windup: null, hitBy: new Map(),
  };
}

// один шаг ИИ моба. ctx: { players: [{id,x,z,dead,inTown}], onHit(mob, player), now }
// Возвращает true, если моб что-то делал (для отладки и тестов).
export function mobStep(m, ctx, dt) {
  if (m.dead) {
    if (ctx.now > m.respawnAt) {
      m.dead = false; m.hp = m.def.hp; m.recoverAfter = 0; m.state = 'idle'; m.target = null;
      m.windup = null; m.atkCd = 0; m.attackT = 0; m.moving = false;
      m.x = m.home.x; m.z = m.home.z; m.y = heightAt(m.x, m.z); m.hitBy.clear();
    }
    return false;
  }
  m.moving = false;
  m.attackT = Math.max(0, m.attackT - dt * 3);
  m.atkCd = Math.max(0, m.atkCd - dt);
  if (m.state === 'chase' || m.state === 'return') m.recoverAfter = ctx.now + 5000;
  if (m.windup) {
    const attack = m.windup;
    const victim = ctx.players.find(p => p.id === attack.target && !p.dead && !p.inTown);
    if (!victim || flatDist(m, m.home) > leashDistance(m.def) || flatDist(m, victim) > 220 || m.state !== 'chase') {
      m.windup = null; ctx.onAttack?.(m, 'cancel', attack, false);
    } else {
      attack.remaining -= dt;
      if (attack.remaining <= 1e-6) {
        m.windup = null; m.attackT = 1;
        const landed = mobAttackContains(attack, victim);
        ctx.onAttack?.(m, 'strike', attack, landed);
        if (landed) ctx.onHit(m, victim);
      }
      return true;
    }
  }
  const radius = mobRadius(m.def), speed = MOB_SPEED(m.def);
  // цель: та, что уже выбрана, иначе ближайший живой игрок вне города
  const cur = m.target != null ? ctx.players.find((p) => p.id === m.target) : null;
  let near = cur && !cur.dead && !cur.inTown ? cur : null, nd = near ? flatDist(m, near) : Infinity;
  if (!near) {
    m.target = null;
    for (const p of ctx.players) { if (p.dead || p.inTown) continue; const d = flatDist(m, p); if (d < nd) { nd = d; near = p; } }
  }
  if (m.state === 'idle' || m.state === 'wander') {
    if (m.def.aggro && near && nd < 14) {
      m.state = 'chase'; m.target = near.id; m.dest = null; m.recoverAfter = ctx.now + 5000; return true;
    }
    if (ctx.now >= m.recoverAfter && flatDist(m, m.home) <= 8) m.hp = Math.min(m.def.hp, m.hp + m.def.hp * .02 * dt);
    m.wanderT -= dt;
    if (m.wanderT <= 0) { m.wanderT = rand(5, 12); m.dest = { x: m.home.x + rand(-6, 6), z: m.home.z + rand(-6, 6) }; m.state = 'wander'; }
    if (m.state === 'wander' && m.dest) {
      const dx = m.dest.x - m.x, dz = m.dest.z - m.z, L = Math.hypot(dx, dz);
      if (L < 0.5) { m.state = 'idle'; m.dest = null; }
      else { moveEntity(m, dx / L, dz / L, Math.min(L, speed * 0.35 * dt), radius); m.r = Math.atan2(dx, dz); m.moving = true; }
    }
  } else if (m.state === 'chase') {
    if (!near || nd > 220 || flatDist(m, m.home) > leashDistance(m.def)) { m.state = 'return'; m.target = null; }
    else {
      m.target = near.id;
      const reach = 2 + radius;
      if (nd > reach) {
        const dx = near.x - m.x, dz = near.z - m.z, L = Math.hypot(dx, dz) || 1;
        moveEntity(m, dx / L, dz / L, Math.min(speed * dt, Math.max(0, L - reach * 0.95)), radius); m.r = Math.atan2(dx, dz); m.moving = true;
      } else {
        m.r = Math.atan2(near.x - m.x, near.z - m.z);
        if (m.atkCd <= 0) {
          const attack = mobAttack(m.def);
          m.atkCd = MOB_ATK_CD(m.def);
          m.windup = { ...attack, remaining: attack.duration, target: near.id, x: m.x, z: m.z, r: m.r };
          ctx.onAttack?.(m, 'windup', m.windup, false);
        }
      }
    }
  } else if (m.state === 'return') {
    const dx = m.home.x - m.x, dz = m.home.z - m.z, L = Math.hypot(dx, dz);
    if (L < 1) { m.state = 'idle'; m.dest = null; m.wanderT = 6; }
    else { moveEntity(m, dx / L, dz / L, Math.min(L, speed * 1.4 * dt), radius); m.r = Math.atan2(dx, dz); m.moving = true; }
  }
  return true;
}

// ---------- экономика ----------
export const sellPrice = (it) => Math.max(0, it.sell ?? Math.round((it.price ?? 0) * (it.loot ? 1 : 0.4)));
export const crystalsFor = (grade, cur) => ({ d: 2, c: 6, b: 15 }[grade] * (cur + 1));
// удачна ли попытка усиления: до SAFE_ENCH — всегда
export const enchSucceeds = (cur, rng = Math.random) => cur < SAFE_ENCH || rng() < ENCH_CHANCE;
export { MAX_ENCH, SAFE_ENCH, ENCH_CHANCE, MAX_LEVEL, xpToNext, ITEMS, MOBS };
