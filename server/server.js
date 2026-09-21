// WS-сервер «Хроник Глубин»: авторитетная симуляция мира.
// Сервер владеет прогрессом, мобами и боем; клиент присылает намерения и рисует результат.
// Запуск: node server/server.js (PORT — 8790, DB — файл SQLite). Прод: systemd realms-ws, nginx /ws.
import { WebSocketServer } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './accounts.js';
import { zoneAt, TOWNS, DUNGEON, CRYPT, heightAt } from '../src/world-core.js';
import { PVP, karmaForPk, karmaWashCost } from '../src/pvp.js';
import { effectiveSkill, spForKill } from '../src/progression.js';
import { CLASSES, SKILLS, ITEMS } from '../src/data.js';
import { calcDmg, missChance, evaChance, flatDist, clamp } from '../src/sim.js';
import { createParties } from './sim/party.js';
import { createGroundLoot } from './sim/loot.js';
import { createMobs } from './sim/mobs.js';
import * as PL from './sim/player.js';

const acc = openDb(process.env.DB || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'realms.db'));

const PORT = Number(process.env.PORT) || 8790;
const VIEW = 220;  // м — кого видно
const NEAR = 60;   // м — канал «Рядом»
const TICK = 100;  // мс — шаг симуляции
// клиент видит мир на ~250 мс в прошлом (снапшот + интерполяция), поэтому по движущейся цели
// его оценка расстояния отстаёт на несколько метров. Допуск, чтобы честные удары не пропадали.
const LAG_M = 4;
// отладочные команды для автотестов: включаются только переменной окружения, в проде их нет
const DEV_CMD = process.env.DEV_CMD === '1';
const CHAT = { party: { cd: 800 }, all: { cd: 3000 }, trade: { cd: 10000 }, near: { cd: 800 } };
const wss = new WebSocketServer({ port: PORT, host: process.env.HOST, maxPayload: 8000 });
const players = new Map();
let seq = 0;

const world = createMobs();
const groundLoot = createGroundLoot();
const cryptDoor = { x: CRYPT.x, z: CRYPT.z + 8.5 };
const dungeonExit = { x: DUNGEON.x0 + DUNGEON.cell / 2, z: DUNGEON.z0 + DUNGEON.cell / 2 };

const num = (v, lim = 1e5) => (Number.isFinite(+v) ? Math.max(-lim, Math.min(lim, +v)) : 0);
const cleanText = (s) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 160);
const send = (p, m) => { if (p.ws.readyState === 1) p.ws.send(typeof m === 'string' ? m : JSON.stringify(m)); };
const d2 = (a, b) => Math.hypot(a.a.x - b.a.x, a.a.z - b.a.z);
const actors = () => [...players.values()].filter((p) => p.key).map((p) => p.a);
// внешний вид: сервер собирает его сам из экипировки — клиент на него не влияет
const matKind = (it) => (!it ? 'cloth' : it.set === 'chain' ? 'chain' : it.set === 'bone' ? 'plate' : it.set === 'leather' ? 'leather' : 'cloth');
function lookOf(P) {
  const g = (sl) => ITEMS[P.equip[sl]], w = g('weapon'), a = g('armor');
  return {
    cls: P.cls, lvl: P.lvl, w: w ? w.color : null, staff: !!w?.twoHand, ench: P.enc.weapon || 0,
    body: a && a.grade !== 'none' ? a.color : CLASSES[P.cls].color, robe: !!a?.robe || (P.cls === 'mage' && !a), mat: matKind(a),
    gear: { head: g('head')?.color ?? null, legs: g('legs')?.color ?? null, gloves: g('gloves')?.color ?? null, feet: g('feet')?.color ?? null, shield: g('shield')?.color ?? null,
      helmKind: g('head')?.set ?? null, shieldKind: g('shield') ? (g('shield').grade === 'd' ? 'wood' : 'plate') : null, legKind: matKind(g('legs')) },
  };
}
const parties = createParties(players, send);
const online = () => [...players.values()].filter((p) => p.key).length;
const broadcast = (m) => { const s = JSON.stringify(m); for (const p of players.values()) if (p.key || m.t === 'online') send(p, s); };

// попытки входа: не больше 12 в минуту с адреса (в автотестах лимит поднимают)
const TRY_MAX = Number(process.env.AUTH_TRIES) || 12;
const tries = new Map();
const tooMany = (ip) => {
  const now = Date.now(), t = tries.get(ip) || { n: 0, at: now };
  if (now - t.at > 60_000) { t.n = 0; t.at = now; }
  tries.set(ip, t);
  return ++t.n > TRY_MAX;
};
setInterval(() => { const now = Date.now(); for (const [ip, t] of tries) if (now - t.at > 60_000) tries.delete(ip); }, 60_000);

const store = (p) => { if (p.key && p.a) acc.store(p.key, PL.profileOf(p.a)); };

wss.on('connection', (ws, req) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const p = { id: ++seq, ws, name: null, key: null, a: null, known: new Set(), knownMobs: new Set(), lastChat: {}, stN: 0, stT: 0 };
  players.set(p.id, p);
  send(p, { t: 'hi', online: online(), features: { groundLoot: 1, progression: 1, autoloot: 1, crafting: 1, nativeOnly: 1, heartbeat: 1, combatTelegraphs: 1, party: 1 } });
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'ping') {
      if (Date.now() - (p.lastPing || 0) >= 1000) { p.lastPing = Date.now(); send(p, { t: 'pong' }); }
      return;
    }
    if (m.t === 'auth' || m.t === 'login' || m.t === 'register') return onAuth(p, m, ip);
    if (!p.key) return;
    const a = p.a, now = Date.now();
    switch (m.t) {
      case 'party': return parties.command(p, m, now);
      case 'logout': if (m.token) acc.logout(m.token); return;
      // положение по-прежнему ведёт клиент — но сервер проверяет скорость
      case 'st': {
        if (now - p.stT > 1000) { p.stT = now; p.stN = 0; }
        if (++p.stN > 25) return;
        const x = num(m.x), z = num(m.z);
        const s = PL.statsOf(a, now), dt = Math.min(1, (now - (a.stAt || now)) / 1000) + 0.15;
        if (now > (a.warpUntil || 0) && flatDist(a, { x, z }) > s.speed * 1.8 * dt + 2) {
          send(p, { t: 'fix', x: a.x, z: a.z }); // рывок быстрее бега — возвращаем назад
          return;
        }
        a.stAt = now; a.x = x; a.z = z; a.y = heightAt(x, z); a.r = num(m.r, 10); a.anim = num(m.a, 255) | 0;
        checkDoors(p, a);
        return;
      }
      // выбор цели и автоатака: hold — просто взять на прицел, не нападая
      case 'atk': {
        if (a.dead) return;
        if (m.id == null) { a.swing = null; a.attacking = false; a.target = null; return; }
        a.target = m.kind === 'p' ? { p: m.id | 0 } : { m: m.id | 0 };
        a.attacking = !m.hold;
        return;
      }
      case 'autoloot': {
        if (typeof m.enabled !== 'boolean') return;
        const before = a.P.autoloot; a.P.autoloot = m.enabled;
        try { if (!acc.store(p.key, PL.profileOf(a))) throw Error('save failed'); }
        catch { a.P.autoloot = before; PL.say(a, 'Не удалось сохранить автолут', 'bad'); }
        a.dirty = true; return;
      }
      case 'learn': return PL.cmdLearn(a, String(m.id || ''), m.rank, () => acc.store(p.key, PL.profileOf(a)));
      case 'skill': return onSkill(p, a, String(m.id || ''), now);
      case 'pickup': {
        const result = groundLoot.claim(String(m.id || ''), a, p.key, now);
        if (result.error) return send(p, { t: 'pickup_err', id: m.id, reason: result.error });
        const d = result.drop;
        if (!PL.creditLoot(a, [d], () => acc.store(p.key, PL.profileOf(a)))) {
          groundLoot.restore(d);
          return send(p, { t: 'pickup_err', id: d.id, reason: 'Не удалось сохранить подбор. Добыча осталась на земле.' });
        }
        return;
      }
      case 'use': return PL.cmdUse(a, String(m.id || ''));
      case 'equip': return PL.cmdEquip(a, m.idx | 0, m.slot);
      case 'unequip': return PL.cmdUnequip(a, String(m.slot || ''));
      case 'craft': return PL.cmdCraft(a, world.npcs, String(m.id || ''), m.request, () => acc.store(p.key, PL.profileOf(a)));
      case 'buy': return PL.cmdBuy(a, world.npcs, String(m.id || ''), m.n);
      case 'sell': return PL.cmdSell(a, world.npcs, m.idx | 0, m.n);
      case 'ench': return PL.cmdEnch(a, String(m.scroll || ''), m.ref || {});
      case 'tp': { PL.cmdTeleport(a, world.npcs, String(m.id || '')); a.warpUntil = now + 2000; return; }
      case 'respawn': { PL.respawn(a); a.warpUntil = now + 2000; return; }
      case 'dev': {
        if (!DEV_CMD) return;
        if (m.x != null) { PL.place(a, num(m.x), num(m.z)); a.warpUntil = now + 2000; }
        if (m.sp != null) a.P.sp = Math.max(0, num(m.sp, 1e9) | 0);
        if (m.coins != null) a.P.coins = Math.max(0, num(m.coins, 1e9) | 0);
        if (m.lvl != null) a.P.lvl = clamp(m.lvl | 0, 1, 40);
        if (m.hp != null) a.P.hp = num(m.hp, 1e6);
        if (m.item) PL.addItem(a.P, String(m.item), Math.max(1, m.n | 0));
        if (m.drop && ITEMS[m.drop]) groundLoot.spawn(a, { coins: 17, drops: [m.drop] }, p.key, p.name, now);
        if (m.xp != null) PL.gainXp(a, num(m.xp, 1e7) | 0);
        a.dirty = true;
        return;
      }
      case 'wash': return onWash(p, a);
      case 'pm': return onPm(p, m);
      case 'chat': return onChat(p, m);
    }
  });
  ws.on('close', () => {
    store(p);
    parties.remove(p);
    players.delete(p.id);
    if (p.name) { broadcast({ t: 'leave', id: p.id }); broadcast({ t: 'online', n: online() }); }
    p.key = null;
  });
  // A reset TCP socket must not become an unhandled EventEmitter error.
  ws.on('error', error => console.warn('WS_ERROR', error.code || 'transport'));
});

function onAuth(p, m, ip) {
  if (p.key) return;
  if (m.t !== 'auth' && tooMany(ip)) return send(p, { t: 'autherr', reason: 'Слишком много попыток, подождите минуту' });
  const r = m.t === 'auth' ? acc.byToken(m.token) : m.t === 'login' ? acc.login(m.name, m.pass) : acc.register(m.name, m.pass, m.cls);
  if (r.err) return send(p, { t: 'autherr', reason: r.err, kind: m.t });
  // тот же аккаунт с другого устройства — старое соединение закрываем
  for (const q of players.values()) if (q !== p && q.key === r.key) { store(q); parties.remove(q); send(q, { t: 'kicked' }); q.key = null; q.ws.close(4001, 'session replaced'); }
  p.key = r.key; p.name = r.name;
  const P = PL.loadChar(r.name, r.save);
  p.a = PL.newActor(p.id, r.name, P);
  p.a.karma = Math.max(0, r.save?.karma | 0); p.a.pk = r.save?.pk | 0;
  p.a.look = lookOf(P);
  send(p, { t: 'authok', id: p.id, name: r.name, token: r.token, p: PL.profileOf(p.a), online: online() });
  sendMe(p.a);
  broadcast({ t: 'online', n: online() });
}

// переходы в катакомбы и обратно
function checkDoors(p, a) {
  if (a.x < DUNGEON.x0 - 100 && flatDist(a, cryptDoor) < 2.2) {
    PL.place(a, dungeonExit.x + 6, dungeonExit.z + 6); a.warpUntil = Date.now() + 2000;
    PL.say(a, 'Вы спустились в катакомбы. Здесь нежить нападает первой.', 'bad');
  } else if (a.x > DUNGEON.x0 - 100 && flatDist(a, dungeonExit) < 2) {
    PL.place(a, cryptDoor.x, cryptDoor.z + 5); a.warpUntil = Date.now() + 2000;
    PL.say(a, 'Вы выбрались на поверхность.');
  }
}

// ===== бой =====
const mobOf = (ref) => (ref?.m != null ? world.byId.get(ref.m) : null);
const actorOf = (ref) => (ref?.p != null ? players.get(ref.p)?.a : null);
const targetPos = (ref) => mobOf(ref) || actorOf(ref);
const targetRadius = (ref) => (ref?.m != null ? world.radiusOf(mobOf(ref)) : 0.6);
const alive = (t) => t && !t.dead;

// урон мобу от игрока; событие видят все вокруг
function damageMob(a, mb, dmg, crit, now) {
  const died = world.hit(mb, dmg, a);
  pushNear(a, { k: 'hit', m: mb.id, dmg, crit });
  if (!died) return;
  const topId = world.kill(mb, now);
  const winner = players.get(topId)?.key ? players.get(topId) : players.get(a.id);
  const plan = parties.rewardPlan(winner, players.get(a.id), mb);
  const rw = world.rewardFor(mb, winner.a.P.lvl);
  for (const share of plan.shares) {
    const actor = share.player.a;
    PL.gainXp(actor, share.xp); actor.P.sp += share.sp; actor.P.kills++; actor.dirty = true;
    if (actor.karma > 0) { actor.karma = Math.max(0, actor.karma - Math.ceil(share.xp / PVP.karmaPerXp)); sendMe(actor); }
  }
  const recipient = plan.recipient;
  const drops = [{ item: 'coins', n: rw.coins }, ...rw.drops.map(item => ({ item, n: 1 }))];
  // Pickup mode deliberately leaves the reward on the ground; autoloot cannot win the race.
  const auto = plan.mode !== 'pickup' && recipient.a.P.autoloot && PL.creditLoot(recipient.a, drops, () => acc.store(recipient.key, PL.profileOf(recipient.a)));
  if (!auto) groundLoot.spawn(mb, rw, recipient.key, plan.mode === 'pickup' ? 'участникам группы' : recipient.name, now, plan.allowed);
  for (const share of plan.shares) share.player.a.out.push({ k: 'kill', mob: mb.kind, name: mb.def.name, xp: share.xp, coins: share.player === recipient ? rw.coins : 0, sp: share.sp, ground: share.player === recipient && !auto, boss: !!mb.def.boss });
  if (plan.shares.length > 1) for (const share of plan.shares) PL.say(share.player.a, plan.mode === 'pickup' ? 'Добыча на земле: подбирает первый участник группы.' : `Добыча: ${recipient.name}${auto ? ' (автолут)' : ' — на земле'}.`);
  pushNear(a, { k: 'mdie', m: mb.id });
  for (const q of players.values()) if (q.a && q.a.target?.m === mb.id) { q.a.attacking = false; }
}

// урон игроку от моба
function damagePlayer(mb, a, now) {
  if (a.dead) return;
  const s = PL.statsOf(a, now);
  if (Math.random() < evaChance(mb.def.lvl, s.eva)) return a.out.push({ k: 'hurt', dodge: true, from: mb.id });
  const { d } = calcDmg(mb.def.patk, s.pdef, 1, 0.05);
  a.P.hp -= d;
  a.out.push({ k: 'hurt', dmg: d, from: mb.id });
  if (a.P.hp <= 0) { PL.killPlayer(a, mb.def.name); onPlayerDied(a, null); }
}

// PvP: сервер сам считает урон по защите жертвы
function damageActor(a, v, atk, mul, school, critChance, now) {
  if (v.dead || a.dead) return;
  if (PL.inTown(a) || PL.inTown(v)) return PL.say(a, 'В городе сражаться нельзя', 'bad');
  const vs = PL.statsOf(v, now);
  const { d, crit } = calcDmg(atk, school === 'm' ? vs.mdef : vs.pdef, mul, critChance);
  v.P.hp -= d; v.dirty = true;
  v.hitBy.set(a.id, now);
  // напал на белого — флаг (у PK флаг не нужен, он и так красный)
  if (status(v) === 0 && a.karma <= 0) { const was = flagged(a); a.flagUntil = now + PVP.flagMs; if (!was) sendMe(a); }
  pushNear(a, { k: 'hit', p: v.id, dmg: d, crit });
  v.out.push({ k: 'hurt', dmg: d, fromP: a.id, name: a.name });
  if (v.P.hp <= 0) { PL.killPlayer(v, a.name, a.karma > 0); onPlayerDied(v, a); }
}

function onSkill(p, a, id, now) {
  const err = PL.skillError(a, id, now);
  if (err) return PL.say(a, err, 'bad');
  const sk = effectiveSkill(a.P, id), s = PL.statsOf(a, now);
  if (sk.kind === 'dmg') {
    const t = targetPos(a.target);
    if (!alive(t)) return PL.say(a, 'Нет цели', 'bad');
    if (flatDist(a, t) > sk.range + targetRadius(a.target) + LAG_M) return PL.say(a, 'Цель слишком далеко', 'bad');
  }
  a.P.mp -= sk.mp; a.cds[id] = now + sk.cd * 1000; a.dirty = true;
  a.out.push({ k: 'cd', id, cd: sk.cd });
  if (sk.cast) {
    a.cast = { id, t: sk.cast / s.cast, target: a.target };
    a.out.push({ k: 'cast', id, t: sk.cast / s.cast });
    // Old clients treat `cast` as their own cast bar. New nearby-only cue is
    // safely ignored by those builds instead of blocking their movement.
    pushNear(a, { k: 'cast_start', id, t: sk.cast / s.cast }, true); return;
  }
  applySkill(a, id, a.target, now);
}

function applySkill(a, id, ref, now) {
  const sk = effectiveSkill(a.P, id), s = PL.statsOf(a, now);
  if (sk.kind === 'dmg') {
    const t = targetPos(ref);
    if (!alive(t) || flatDist(a, t) > sk.range + targetRadius(ref) + LAG_M + 2) return;
    const atk = sk.school === 'm' ? s.matk : s.patk, crit = Math.random() < s.crit + 0.05 ? 1 : 0;
    pushNear(a, { k: 'cast_fx', id, to: ref });
    if (ref.m != null) { const r = calcDmg(atk, t.def.pdef * (sk.school === 'm' ? 0.8 : 1), sk.mul, crit); damageMob(a, t, r.d, r.crit, now); }
    else damageActor(a, t, atk, sk.mul, sk.school, crit, now);
    a.attacking = true;
  } else if (sk.kind === 'heal') {
    const amt = Math.round(s.maxHp * sk.amount);
    a.P.hp = Math.min(s.maxHp, a.P.hp + amt); a.dirty = true;
    a.out.push({ k: 'heal', kind: 'hp', amount: amt, skill: id });
    pushNear(a, { k: 'cast_fx', id });
  } else if (sk.kind === 'buff') {
    a.buffs.push({ stat: sk.stat, mul: sk.mul, until: now + sk.dur * 1000, name: sk.name });
    a.out.push({ k: 'buff', id, dur: sk.dur, stat: sk.stat, mul: sk.mul });
    pushNear(a, { k: 'cast_fx', id });
  } else if (sk.kind === 'aoe') {
    const atk = sk.school === 'm' ? s.matk : s.patk;
    let n = 0;
    pushNear(a, { k: 'cast_fx', id });
    for (const mb of world.list) {
      if (mb.dead || flatDist(mb, a) > sk.radius + world.radiusOf(mb)) continue;
      const r = calcDmg(atk, mb.def.pdef * (sk.school === 'm' ? 0.8 : 1), sk.mul, s.crit);
      damageMob(a, mb, r.d, r.crit, now); n++;
    }
    // по площади задеваем только флагнутых и PK (или того, кого бьём)
    for (const v of actors()) {
      if (v === a || v.dead || flatDist(v, a) > sk.radius + 0.6) continue;
      if (status(v) === 0 && a.target?.p !== v.id) continue;
      damageActor(a, v, atk, sk.mul, sk.school, Math.random() < s.crit ? 1 : 0, now); n++;
    }
    if (!n) PL.say(a, `${sk.name}: никого рядом`);
  }
}

// автоатака: сервер сам отбивает удары, пока цель в радиусе
function autoAttack(a, dt, now) {
  a.atkTimer -= dt;
  if (!a.attacking || a.dead || a.cast) { a.swing = null; return; }
  const t = targetPos(a.target);
  if (!alive(t)) { a.attacking = false; a.swing = null; return; }
  const s = PL.statsOf(a, now);
  if (flatDist(a, t) > s.range + targetRadius(a.target) + LAG_M) { a.swing = null; return; } // клиент ещё идёт к цели
  if (PL.inTown(a)) { a.swing = null; a.attacking = false; return PL.say(a, 'В городе сражаться нельзя', 'bad'); }
  const targetKey = JSON.stringify(a.target);
  if (a.swing && a.swing.target !== targetKey) a.swing = null;
  if (!a.swing) {
    if (a.atkTimer > 0) return;
    a.atkTimer = 1 / s.aspd;
    const windup = Math.min(0.32, a.atkTimer * 0.32);
    a.swing = { target: targetKey, remaining: windup };
    pushNear(a, { k: 'attack_start', t: Math.min(0.75, a.atkTimer * 0.88), to: { ...a.target } });
    return;
  }
  a.swing.remaining -= dt;
  if (a.swing.remaining > 0) return;
  a.swing = null;
  const mage = a.P.cls === 'mage';
  pushNear(a, { k: 'attack_release', to: { ...a.target } });
  if (a.target.p != null) {
    const crit = Math.random() < s.crit ? 1 : 0;
    damageActor(a, t, mage ? s.matk * 0.6 : s.patk, 1, mage ? 'm' : 'p', crit, now);
    return;
  }
  if (mage) { const r = calcDmg(s.matk * 0.6, t.def.pdef, 1, s.crit); return damageMob(a, t, r.d, r.crit, now); }
  if (Math.random() < missChance(t.def.lvl, s.acc)) return pushNear(a, { k: 'miss', m: t.id });
  const r = calcDmg(s.patk, t.def.pdef, 1, s.crit);
  damageMob(a, t, r.d, r.crit, now);
}

// стражи у ворот бьют PK: позиции постов известны из расстановки мира
const GUARDS = () => world.npcs.filter((n) => n.role === 'guard');
const guards = GUARDS();
function guardsTick(now) {
  for (const a of actors()) {
    if (a.karma <= 0 || a.dead) continue;
    for (const g of guards) {
      if (flatDist(a, g) > PVP.guardRange) continue;
      if (now - (a.guardT || 0) < 1300) break;
      a.guardT = now;
      const s = PL.statsOf(a, now), d = Math.round(s.maxHp * PVP.guardHit);
      a.P.hp -= d; a.dirty = true;
      a.out.push({ k: 'hurt', dmg: d, guard: true });
      if (a.P.hp <= 0) { PL.killPlayer(a, 'Страж'); pkDrop(a, null); }
      break;
    }
  }
}

// ===== PvP: флаг, PK, карма =====
const flagged = (a) => a.flagUntil > Date.now();
const status = (a) => (a.karma > 0 ? 2 : flagged(a) ? 1 : 0); // 0 — белый, 1 — фиолетовый, 2 — красный
const sendMe = (a) => { const p = players.get(a.id); if (p) send(p, { t: 'me', karma: a.karma, pk: a.pk, pvp: a.P.pvp, flag: Math.max(0, a.flagUntil - Date.now()) }); };
function onPlayerDied(v, killer) {
  const now = Date.now();
  if (!killer || !(now - (v.hitBy.get(killer.id) || 0) < 10_000)) { v.hitBy.clear(); return; }
  v.hitBy.clear();
  const victimWasRed = v.karma > 0, victimFlag = flagged(v);
  if (victimWasRed || victimFlag) {
    killer.P.pvp++; killer.dirty = true;
    if (victimWasRed) broadcast({ t: 'announce', text: `${killer.name} победил PK ${v.name}` });
  } else {
    killer.pk++; killer.karma += karmaForPk(killer.pk); killer.flagUntil = 0;
    broadcast({ t: 'announce', text: `${killer.name} убил ${v.name} и стал PK! Зона: ${zoneAt(killer.x, killer.z).name}`, pk: killer.id });
  }
  sendMe(killer);
  // с умершего PK падает вещь — достаётся убийце
  if (victimWasRed) pkDrop(v, killer);
}
// PK умер: с шансом теряет вещь; убийце-игроку она достаётся
function pkDrop(v, killer) {
  if (Math.random() > PVP.dropChance) return;
  const P = v.P;
  const bag = P.inv.map((e, i) => ({ i, e })).filter(({ e }) => !ITEMS[e.id].loot || Math.random() < 0.3);
  const worn = Object.entries(P.equip).filter(([, id]) => id && ITEMS[id].grade !== 'none');
  let item = null;
  if (worn.length && Math.random() < 0.35) {
    const [sl, id] = worn[Math.floor(Math.random() * worn.length)];
    item = { id, n: 1, e: P.enc[sl] || 0 }; P.equip[sl] = null; delete P.enc[sl];
  } else if (bag.length) {
    const { i, e } = bag[Math.floor(Math.random() * bag.length)];
    item = { ...e }; P.inv.splice(i, 1);
  }
  if (!item) return;
  v.dirty = true;
  PL.say(v, `Вы потеряли: ${ITEMS[item.id].name}${item.n > 1 ? ` ×${item.n}` : ''}`, 'bad');
  if (!killer) return;
  PL.addItem(killer.P, item.id, item.n, item.e);
  killer.dirty = true;
  PL.say(killer, `Вы подобрали с ${v.name}: ${ITEMS[item.id].name}`, 'rare');
  broadcast({ t: 'announce', text: `С PK ${v.name} упала вещь — её подобрал ${killer.name}` });
}
function onWash(p, a) {
  if (a.karma <= 0) return;
  const cost = karmaWashCost(a.karma);
  if (!world.npcs.some((n) => n.role === 'priest' && flatDist(a, n) < 8)) return PL.say(a, 'Жрец далеко', 'bad');
  if (a.P.coins < cost) return send(p, { t: 'washerr', cost });
  a.P.coins -= cost; a.karma = 0; a.dirty = true;
  sendMe(a); send(p, { t: 'washok', cost });
}

// ===== чат =====
function onPm(p, m) {
  const text = cleanText(m.text);
  if (!text || Date.now() - (p.lastPm || 0) < 400) return;
  p.lastPm = Date.now();
  const key = String(m.to || '').trim().toLowerCase();
  let q = null;
  for (const x of players.values()) if (x.key === key) q = x;
  if (!q) return send(p, { t: 'pmerr', to: String(m.to || '').slice(0, 16), reason: 'не в сети' });
  const msg = JSON.stringify({ t: 'pm', from: p.name, to: q.name, text });
  send(q, msg);
  if (q !== p) send(p, msg);
}
function onChat(p, m) {
  const ch = Object.hasOwn(CHAT, m.ch) ? m.ch : 'all';
  const text = cleanText(m.text);
  if (!text) return;
  const wait = (p.lastChat[ch] || 0) + CHAT[ch].cd - Date.now();
  if (wait > 0) return send(p, { t: 'chatwait', ch, wait });
  p.lastChat[ch] = Date.now();
  if (ch === 'party' && !parties.groupOf(p.id)) return send(p, { t: 'party_err', reason: 'Вы не в группе.' });
  const s = JSON.stringify({ t: 'chat', ch, from: p.name, id: p.id, text });
  for (const q of players.values()) {
    if (!q.key) continue;
    if (ch === 'party' && parties.groupOf(q.id) !== parties.groupOf(p.id)) continue;
    if (ch === 'near' && q !== p && (!q.a || !p.a || d2(p, q) > NEAR)) continue;
    send(q, s);
  }
}

// событие видят все рядом: у себя — всегда, у соседей — если близко
function pushNear(a, e, remoteOnly = false) {
  if (!remoteOnly) a.out.push(e);
  for (const p of players.values()) if (p.a && p.a !== a && flatDist(p.a, a) < VIEW) p.a.out.push({ ...e, by: a.id });
}

// ===== главный цикл =====
let last = Date.now(), partyTick = 0;
setInterval(() => {
  const now = Date.now(), dt = Math.min(0.5, (now - last) / 1000); last = now;
  groundLoot.expire(now);
  if (now >= partyTick) { for (const p of players.values()) if (p.a && p.key) p.a.partyMaxHp = PL.statsOf(p.a, now).maxHp; parties.tick(now); partyTick = now + 1000; }
  const list = actors();
  // мобы
  const view = list.map((a) => ({ id: a.id, x: a.x, z: a.z, dead: a.dead, inTown: PL.inTown(a) }));
  world.tick(dt, view, now, (mb, pv) => { const a = players.get(pv.id)?.a; if (a) damagePlayer(mb, a, now); }, (mb, phase, attack, landed) => {
    const event = { k: `mob_${phase}`, m: mb.id, p: attack.target, t: attack.duration, x: attack.x, z: attack.z, r: attack.r, reach: attack.reach, arc: attack.arc, landed };
    for (const a of list) if (flatDist(a, mb) < VIEW) a.out.push(event);
  });
  guardsTick(now);
  // игроки
  for (const a of list) {
    PL.regen(a, dt);
    if (a.flagUntil && a.flagUntil <= now) { a.flagUntil = 0; sendMe(a); }
    if (a.cast) {
      a.cast.t -= dt;
      if (a.cast.t <= 0) {
        const c = a.cast; a.cast = null;
        if (c.id === 'escape') { const t = TOWNS.find((x) => x.id === a.P.home) || TOWNS[0]; PL.place(a, t.x, t.z - 12); a.warpUntil = now + 2000; }
        else applySkill(a, c.id, c.target, now);
      }
    }
    autoAttack(a, dt, now);
  }
  // рассылка
  for (const p of players.values()) {
    const a = p.a; if (!p.key || !a) continue;
    const o = [];
    for (const q of list) {
      if (q === a || flatDist(a, q) > VIEW) continue;
      if (!p.known.has(q.id)) { p.known.add(q.id); send(p, { t: 'look', id: q.id, name: q.name, look: q.look }); }
      o.push([q.id, +q.x.toFixed(2), +q.y.toFixed(2), +q.z.toFixed(2), +q.r.toFixed(2), q.anim | 0, Math.round((q.P.hp / PL.statsOf(q, now).maxHp) * 100), status(q)]);
    }
    for (const id of p.known) if (!players.has(id)) p.known.delete(id);
    const mobs = world.snapshotFor(a, VIEW, now);
    // впервые увиденный моб: клиенту нужен его вид, чтобы построить модель
    const fresh = [];
    for (const row of mobs) if (!p.knownMobs.has(row[0])) { p.knownMobs.add(row[0]); fresh.push([row[0], world.byId.get(row[0]).kind]); }
    if (fresh.length) send(p, { t: 'mobs', n: fresh });
    send(p, { t: 'snap', ts: now, o, m: mobs, g: groundLoot.snapshotFor(a, VIEW, p.key, now), me: { hp: Math.round(a.P.hp), mp: Math.round(a.P.mp), x: +a.x.toFixed(2), z: +a.z.toFixed(2), dead: a.dead } });
    if (a.out.length) { send(p, { t: 'ev', e: a.out }); a.out = []; }
    if (a.dirty) {
      a.dirty = false;
      const look = lookOf(a.P);
      if (JSON.stringify(look) !== JSON.stringify(a.look)) {
        a.look = look;
        const s = JSON.stringify({ t: 'look', id: a.id, name: a.name, look });
        for (const q of players.values()) if (q.known.has(a.id)) send(q, s);
      }
      send(p, { t: 'you', p: PL.profileOf(a) });
    }
  }
}, TICK);

// объявления: где сейчас PK
setInterval(() => {
  for (const a of actors()) if (a.karma > 0) broadcast({ t: 'announce', text: `PK ${a.name} (карма ${a.karma}) замечен: ${zoneAt(a.x, a.z).name}`, pk: a.id });
}, PVP.announceMs);
// периодическое сохранение
setInterval(() => { for (const p of players.values()) store(p); }, 30_000);
// пинг, чтобы nginx не рвал простаивающие соединения
setInterval(() => { for (const p of players.values()) if (p.ws.readyState === 1) p.ws.ping(); }, 25000);
wss.on('listening', () => console.log(`realms-ws :${PORT}, аккаунтов: ${acc.count()}, мобов: ${world.list.length}`));

// Save active profiles before systemd or a local runner restarts the process.
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const p of players.values()) store(p);
  acc.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
