// WS-сервер «Хроник Глубин»: авторитетная симуляция мира.
// Сервер владеет прогрессом, мобами и боем; клиент присылает намерения и рисует результат.
// Запуск: node server/server.js (PORT — 8790, DB — файл SQLite). Прод: systemd realms-ws, nginx /ws.
import { WebSocketServer } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './accounts.js';
import { zoneAt, TOWNS, DUNGEON, CRYPT, heightAt, obstacles } from '../src/world-core.js';
import { PVP, karmaForPk, karmaWashCost } from '../src/pvp.js';
import { effectiveSkill, spForKill } from '../src/progression.js';
import { MAX_LEVEL, CLASSES, SKILLS, ITEMS } from '../src/data.js';
import { BASIC_ATTACK_POWER, skillActionTiming, heroAttackTiming, calcDmg, missChance, evaChance, flatDist, clamp, mobAtk, mobPdef, mobCrit, MOB_SPREAD } from '../src/sim.js';
import { mobHitEffects, guardTrigger } from '../src/mob-skills.js';
import { applyEffect, tickEffects, snapshotEffects, drainMul, drainHeal, makeBuff, makeDebuff, makeSlow, makeDot, makeHot, makeDrain } from '../src/effects.js';
import { createParties } from './sim/party.js';
import { createGroundLoot } from './sim/loot.js';
import { createMovement } from './sim/movement.js';
import { createMobs } from './sim/mobs.js';
import { loadRates, logRates } from './rates.js';
import * as PL from './sim/player.js';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { createLimiter } from './guard.js';
import { createSaveQueue } from './save-queue.js';

const acc = openDb(process.env.DB || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'realms.db'));

const PORT = Number(process.env.PORT) || 8790;
const VIEW = 220;  // м — кого видно
const NEAR = 60;   // м — канал «Рядом»
const TICK = 100;  // мс — шаг симуляции
// клиент видит мир на ~250 мс в прошлом (снапшот + интерполяция), поэтому по движущейся цели
// его оценка расстояния отстаёт на несколько метров. Допуск, чтобы честные удары не пропадали.
const LAG_M = 0.75;
// отладочные команды для автотестов: включаются только переменной окружения, в проде их нет
const DEV_CMD = process.env.DEV_CMD === '1';
// фаззинг в автотестах шлёт сотни пакетов разом: лимиты снимаются только вместе с DEV_CMD
const NO_LIMITS = DEV_CMD && process.env.NO_LIMITS === '1';
const CHAT = { party: { cd: 800 }, all: { cd: 3000 }, trade: { cd: 10000 }, near: { cd: 800 } };
// По умолчанию только локальный интерфейс: снаружи мир доступен через nginx. В контейнере HOST=0.0.0.0
// задан явно (Dockerfile/docker-compose), а наружу порт публикуется только на 127.0.0.1 хоста.
const HOST = process.env.HOST || '127.0.0.1';
const wss = new WebSocketServer({ port: PORT, host: HOST, maxPayload: 8000 });
// Heartbeat: ping раз в HEARTBEAT_MS; кто не ответил pong (и не прислал ни одного пакета) до
// следующего цикла — terminate. Соединение без входа закрывается после ANON_IDLE_MS тишины
// (сайт и экран входа шлют JSON ping раз в 10 с), и их не больше ANON_PER_IP с одного адреса.
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS) || 25_000;
const ANON_IDLE_MS = Number(process.env.ANON_IDLE_MS) || 60_000;
const ANON_PER_IP = Number(process.env.ANON_PER_IP) || 32;
// X-Forwarded-For принимается только от доверенного прокси: TRUST_PROXY=1 — всегда (контейнер за
// nginx), 0 — никогда, по умолчанию — только с loopback (nginx на том же хосте).
const TRUST_PROXY = process.env.TRUST_PROXY;
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
function clientIp(req) {
  const remote = String(req.socket.remoteAddress || '');
  const trusted = TRUST_PROXY === '1' || (TRUST_PROXY !== '0' && LOOPBACK.has(remote));
  const forwarded = trusted ? String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean).at(-1) : '';
  return forwarded || remote;
}
const players = new Map();
let seq = 0;

// Рейты читаются один раз при старте: server/rates.json + переменные RATE_*. См. docs/RATES.md.
const RATES_INFO = loadRates(), RATES = RATES_INFO.rates;
PL.setRates(RATES);
const world = createMobs(RATES);
const movement = createMovement([...obstacles, ...world.npcs.filter(n => n.role !== 'guard').map(n => ({ x: n.x, z: n.z, r: 0.9 }))]);
const groundLoot = createGroundLoot();
const cryptDoor = { x: CRYPT.x, z: CRYPT.z + 8.5 };
const dungeonExit = { x: DUNGEON.x0 + DUNGEON.cell / 2, z: DUNGEON.z0 + DUNGEON.cell / 2 };

// Ключи, которые меняют приведение объекта к строке/числу: {"toString":1} ронял String(), |0 и +v
// во всех командах. Отбрасываем их при разборе пакета — дальше любой объект приводится безопасно.
const UNSAFE_KEYS = new Set(['toString', 'valueOf', 'toJSON', '__proto__', 'constructor', 'prototype']);
const safeKeys = (k, v) => (UNSAFE_KEYS.has(k) ? undefined : v);
const num = (v, lim = 1e5) => (Number.isFinite(+v) ? Math.max(-lim, Math.min(lim, +v)) : 0);
const cleanText = (s) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 160);
// Потолок исходящего буфера: клиент, который не успевает читать, отключается, а не копит память
// сервера. Порог — несколько секунд обычного потока снапшотов.
const OUT_MAX_BYTES = Number(process.env.OUT_MAX_BYTES) || 2_000_000;
// Потолок событий `ev` за тик: при переполнении остаются последние (самые свежие) события.
const OUT_EVENTS_MAX = 400;
const send = (p, m) => {
  const ws = p.ws;
  if (ws.readyState !== 1) return;
  if (ws.bufferedAmount > OUT_MAX_BYTES) {
    if (!p.slow) { p.slow = true; console.warn(`SLOW_CLIENT player=${p.id} buffered=${ws.bufferedAmount}`); ws.terminate(); }
    return;
  }
  ws.send(typeof m === 'string' ? m : JSON.stringify(m));
};
// Ответ-отказ (pickup_err, chatwait, pmerr, washerr, autherr): ограничен отдельно, чтобы поток
// неверных команд не превращался в поток ответов.
const refuse = (p, m) => { if (p.limiter.refusal()) send(p, m); };
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
const parties = createParties(players, send, RATES);
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

// Единая точка записи профиля. false — запись не прошла: вызывающий откатывает изменение.
// DEV_CMD-тесты могут включить сбой записи игроку (dev {failStore}), чтобы проверить откаты.
function storeNow(p) {
  if (!p.key || !p.a) return false;
  const started = performance.now();
  try {
    const ok = !(DEV_CMD && p.a.devFailStore) && acc.store(p.key, PL.profileOf(p.a));
    if (!ok) console.warn(`SAVE_FAIL player=${p.id} bytes=${JSON.stringify(PL.profileOf(p.a)).length}`);
    return ok;
  } finally { perf.stores++; perf.storeMs += performance.now() - started; }
}
// Критичная запись (торговля, заточка, изготовление, обучение): сразу, своей транзакцией.
// После неё очередь игрока уже в базе.
const saver = (p) => () => { const ok = storeNow(p); if (ok) saves.settle(p); return ok; };
const store = (p) => { if (p.key && p.a && storeNow(p)) saves.settle(p); };

// Очередь сохранений (server/save-queue.js): подбор, автолут и периодическое сохранение пишутся
// одной транзакцией в тике перед рассылкой — клиент видит результат только после фиксации.
// Раз в SAVE_EVERY_MS в очередь попадают все игроки; неизменившийся профиль не переписывается.
const SAVE_EVERY_MS = Number(process.env.SAVE_EVERY_MS) || 10_000;
const saves = createSaveQueue({
  write(list) {
    const started = performance.now(), rejected = new Set(), rows = [], byKey = new Map();
    for (const p of list) {
      if (DEV_CMD && p.a.devFailStore) { rejected.add(p); continue; }
      const profile = PL.profileOf(p.a), json = JSON.stringify(profile);
      if (json === p.savedJson && !p.stagedSince) continue;
      rows.push([p.key, profile]); byKey.set(p.key, [p, json]);
    }
    try {
      const res = acc.storeBatch(rows);
      for (const [key, [p, json]] of byKey) { if (res.rejected.has(key)) rejected.add(p); else p.savedJson = json; p.stagedSince = 0; }
      return { rejected };
    } finally { perf.stores += rows.length; perf.storeMs += performance.now() - started; perf.batches = (perf.batches || 0) + 1; }
  },
  onRejected(p, error) {
    console.warn(`SAVE_FAIL batch player=${p.id}${error ? ` ${oneLine(error).slice(0, 200)}` : ''}`);
  },
});
// Выдача добычи через очередь: применяется сразу, пишется пачкой перед рассылкой тика.
// При сбое записи выдача отменяется обратным действием, её события не уходят клиенту.
function creditQueued(p, drops, onUndo) {
  const a = p.a, mark = a.out.length;
  if (!PL.creditLoot(a, drops, () => true)) return false;
  const events = a.out.slice(mark);
  p.stagedSince ||= Date.now();
  saves.stage(p, { events, undo() {
    for (const d of drops) {
      if (d.item === 'coins') a.P.coins = Math.max(0, a.P.coins - d.n);
      else PL.takeItem(a.P, d.item, d.n);
    }
    a.dirty = true;
    onUndo();
  } });
  return true;
}

// ===== надёжность: границы операций, журнал сбоев, учёт времени =====
// Исключение в одной команде или у одного игрока не должно останавливать мир для остальных.
// Команда, меняющая профиль, выполняется над копией-страховкой: при сбое профиль откатывается,
// игрок получает отказ, причина пишется в журнал одной строкой. Повторяющиеся сбои одного
// игрока отключают только его; сбой общего шага мира много тиков подряд или необработанное
// исключение процесса — контролируемый перезапуск: профили сохраняются, процесс выходит с кодом 1,
// Docker/systemd поднимает его заново (restart: unless-stopped).
const perf = { ticks: [], handlerMs: 0, messages: 0, faults: 0, storeMs: 0, stores: 0, since: Date.now() };
// задержка цикла событий: синхронная запись в SQLite или долгий обработчик видны здесь, даже вне тика
const loopDelay = monitorEventLoopDelay({ resolution: 5 }); loopDelay.enable();
const MUTATING = new Set(['autoloot', 'learn', 'prof', 'skill', 'pickup', 'use', 'equip', 'unequip', 'craft', 'buy', 'sell', 'ench', 'tp', 'respawn', 'dev', 'wash', 'party']);
const FAULT_KICK = 5, FAULT_WINDOW = 60_000, WORLD_FAULT_LIMIT = 50;
const oneLine = (error) => String(error?.stack || error).replace(/\s*\n\s*/g, ' | ').slice(0, 2000);
function logFault(where, p, error) {
  perf.faults++;
  console.error(`SERVER_FAULT ${where} player=${p?.id ?? '-'} ${oneLine(error)}`);
}
// Считает сбои игрока в окне; после FAULT_KICK отключает его, сохранив профиль.
function noteFault(p) {
  if (!p) return;
  const now = Date.now();
  p.faults = (p.faults || []).filter((t) => now - t < FAULT_WINDOW); p.faults.push(now);
  if (p.faults.length < FAULT_KICK || p.faultKicked) return;
  p.faultKicked = true;
  console.error(`SERVER_FAULT_KICK player=${p.id}`);
  try { p.ws.close(1011, 'server error'); } catch { p.ws.terminate(); }
}
function guardedCommand(p, m, run) {
  const a = p.a;
  const backup = a && MUTATING.has(m.t) ? { P: structuredClone(a.P), karma: a.karma, dead: a.dead, x: a.x, z: a.z, y: a.y } : null;
  try { run(); } catch (error) {
    logFault(`cmd:${String(m.t).slice(0, 16)}`, p, error);
    if (backup && p.a === a) {
      for (const k of Object.keys(a.P)) delete a.P[k];
      Object.assign(a.P, backup.P);
      a.karma = backup.karma; a.dead = backup.dead; a.x = backup.x; a.z = backup.z; a.y = backup.y;
    }
    if (p.a) { p.a.dirty = true; PL.say(p.a, 'Команда отклонена из-за ошибки сервера, состояние восстановлено', 'bad'); }
    noteFault(p);
  }
}
// Шаг мира (мобы, эффекты, стражи): при сбое пропускается один тик; подряд много сбоев — перезапуск.
let worldFaults = 0;
function worldStep(name, run) {
  try { run(); return true; } catch (error) { logFault(`world:${name}`, null, error); return false; }
}
function playerStep(p, name, run) {
  try { run(); } catch (error) { logFault(`tick:${name}`, p, error); noteFault(p); }
}
const percentile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);
function perfReport() {
  const t = [...perf.ticks].sort((x, y) => x - y), secs = Math.max(0.001, (Date.now() - perf.since) / 1000);
  const r = (v) => Math.round(v * 1000) / 1000;
  return { ticks: t.length, p50: r(percentile(t, 0.5)), p95: r(percentile(t, 0.95)), p99: r(percentile(t, 0.99)), max: r(t.at(-1) || 0),
    handlerMsPerSec: r(perf.handlerMs / secs), messages: perf.messages, stores: perf.stores, storeMs: r(perf.storeMs), batches: perf.batches || 0, faults: perf.faults, seconds: r(secs),
    loopDelayMs: { p50: r(loopDelay.percentile(50) / 1e6), p99: r(loopDelay.percentile(99) / 1e6), max: r(loopDelay.max / 1e6) } };
}
function perfReset() { loopDelay.reset(); Object.assign(perf, { ticks: [], handlerMs: 0, messages: 0, storeMs: 0, stores: 0, batches: 0, since: Date.now() }); }

wss.on('connection', (ws, req) => {
  const ip = clientIp(req);
  let anon = 0; for (const q of players.values()) if (!q.key && q.ip === ip) anon++;
  if (anon >= ANON_PER_IP) { console.warn(`ANON_LIMIT ip=${ip}`); ws.on('error', () => {}); ws.close(1013, 'too many connections'); return; }
  const p = { id: ++seq, ws, name: null, key: null, a: null, known: new Set(), knownMobs: new Set(), lastChat: {}, stN: 0, stT: 0, limiter: createLimiter(), ip, alive: true, lastIn: Date.now() };
  players.set(p.id, p);
  send(p, { t: 'hi', online: online(), features: { groundLoot: 1, progression: 1, autoloot: 1, crafting: 1, nativeOnly: 1, heartbeat: 1, combatTelegraphs: 1, party: 1, professions: 1, timedEffects: 1, eliteMobs: 1, mobPacks: 1, rates: 1 }, rates: RATES });
  ws.on('pong', () => { p.alive = true; });
  ws.on('message', (raw) => {
    p.alive = true; p.lastIn = Date.now();
    let m = null; try { m = JSON.parse(raw, safeKeys); } catch { /* нечитаемый пакет тоже считается */ }
    const kind = m && typeof m === 'object' && typeof m.t === 'string' ? m.t : 'invalid';
    // Лимит на вид команды и общий бюджет соединения; отладочные команды автотестов — без лимита.
    if (!(DEV_CMD && (kind === 'dev' || NO_LIMITS)) && !p.limiter.allow(kind)) {
      if (p.limiter.flooding() && !p.flood) {
        p.flood = true;
        console.warn(`FLOOD player=${p.id} dropped=${p.limiter.dropped}`);
        ws.close(1008, 'too many commands');
      }
      return;
    }
    if (kind === 'invalid') return;
    const started = performance.now();
    guardedCommand(p, m, () => onMessage(p, m, ip));
    perf.handlerMs += performance.now() - started; perf.messages++;
  });
  ws.on('close', () => {
    // Сбой сохранения или группы не должен оставить «призрака» в списке игроков.
    playerStep(p, 'close-store', () => store(p));
    playerStep(p, 'close-party', () => parties.remove(p));
    players.delete(p.id);
    if (p.name) { broadcast({ t: 'leave', id: p.id }); broadcast({ t: 'online', n: online() }); }
    p.key = null;
  });
  // A reset TCP socket must not become an unhandled EventEmitter error.
  ws.on('error', error => console.warn('WS_ERROR', error.code || 'transport'));
});

// Один входящий пакет. Исключение внутри не выходит за пределы этой функции (guardedCommand).
function onMessage(p, m, ip) {
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
      // Клиент предсказывает движение; сервер проверяет длину пути и препятствия.
      case 'st': {
        if (now - p.stT > 1000) { p.stT = now; p.stN = 0; }
        if (++p.stN > 25) return;
        const s = PL.statsOf(a, now);
        if (!movement.accept(a, { x: m.x, z: m.z, path: m.path }, s.speed, now)) {
          send(p, { t: 'fix', x: a.x, z: a.z });
          return;
        }
        a.r = num(m.r, 10); a.anim = num(m.a, 255) | 0;
        checkDoors(p, a);
        return;
      }
      // выбор цели и автоатака: hold — просто взять на прицел, не нападая
      case 'atk': {
        if (a.dead) return;
        if (m.id == null) { a.queuedSkill = null; a.swing = null; a.attacking = false; a.target = null; return; }
        a.target = m.kind === 'p' ? { p: m.id | 0 } : { m: m.id | 0 };
        a.attacking = !m.hold;
        return;
      }
      case 'autoloot': {
        if (typeof m.enabled !== 'boolean') return;
        const before = a.P.autoloot; a.P.autoloot = m.enabled;
        try { if (!storeNow(p)) throw Error('save failed'); }
        catch { a.P.autoloot = before; PL.say(a, 'Не удалось сохранить автолут', 'bad'); }
        a.dirty = true; return;
      }
      case 'learn': return PL.cmdLearn(a, String(m.id || ''), m.rank, saver(p));
      case 'prof': return PL.cmdProf(a, String(m.id || ''), saver(p));
      case 'skill': return onSkill(p, a, String(m.id || ''), now);
      case 'pickup': {
        const result = groundLoot.claim(String(m.id || ''), a, p.key, now);
        if (result.error) return refuse(p, { t: 'pickup_err', id: m.id, reason: result.error });
        const d = result.drop;
        const full = PL.bagError(a.P, [d]);
        if (full) { groundLoot.restore(d); return refuse(p, { t: 'pickup_err', id: d.id, reason: `${full}. Добыча осталась на земле.` }); }
        const failed = () => { groundLoot.restore(d); refuse(p, { t: 'pickup_err', id: d.id, reason: 'Не удалось сохранить подбор. Добыча осталась на земле.' }); };
        if (!creditQueued(p, [d], failed)) failed();
        return;
      }
      case 'use': return PL.cmdUse(a, String(m.id || ''));
      case 'equip': return PL.cmdEquip(a, m.idx | 0, m.slot);
      case 'unequip': return PL.cmdUnequip(a, String(m.slot || ''));
      case 'craft': return PL.cmdCraft(a, world.npcs, String(m.id || ''), m.request, saver(p));
      case 'buy': return PL.cmdBuy(a, world.npcs, String(m.id || ''), m.n, saver(p));
      case 'sell': return PL.cmdSell(a, world.npcs, m.idx | 0, m.n, saver(p));
      case 'ench': return PL.cmdEnch(a, String(m.scroll || ''), m.ref && typeof m.ref === 'object' ? m.ref : {}, saver(p));
      case 'tp': return PL.cmdTeleport(a, world.npcs, String(m.id || ''));
      case 'respawn': return PL.respawn(a);
      case 'dev': {
        if (!DEV_CMD) return;
        if (m.x != null) { PL.place(a, num(m.x), num(m.z)); }
        if (m.sp != null) a.P.sp = Math.max(0, num(m.sp, 1e9) | 0);
        if (m.coins != null) a.P.coins = Math.max(0, num(m.coins, 1e9) | 0);
        if (m.lvl != null) a.P.lvl = clamp(m.lvl | 0, 1, MAX_LEVEL);
        if (m.hp != null) a.P.hp = num(m.hp, 1e6);
        if (m.mp != null) a.P.mp = num(m.mp, 1e6);
        if (m.item) PL.addItem(a.P, String(m.item), Math.max(1, m.n | 0));
        if (m.drop && ITEMS[m.drop]) groundLoot.spawn(a, { coins: 17, drops: [m.drop] }, p.key, p.name, now);
        if (m.xp != null) PL.gainXp(a, num(m.xp, 1e7) | 0);
        a.dirty = true;
        if (m.failStore != null) a.devFailStore = !!m.failStore;
        if (m.stats) { send(p, { t: 'devstats', perf: perfReport() }); if (m.stats === 'reset') perfReset(); }
        // Проверка изоляции сбоев: исключение в команде (после правки профиля) или в тике игрока.
        if (m.fault === 'tick') a.devFault = true;
        if (m.fault === 'cmd') throw Error('проверочный сбой команды');
        return;
      }
      case 'wash': return onWash(p, a);
      case 'pm': return onPm(p, m);
      case 'chat': return onChat(p, m);
    }
}

function onAuth(p, m, ip) {
  if (p.key) return;
  if (m.t !== 'auth' && tooMany(ip)) return refuse(p, { t: 'autherr', reason: 'Слишком много попыток, подождите минуту' });
  const r = m.t === 'auth' ? acc.byToken(m.token) : m.t === 'login' ? acc.login(m.name, m.pass) : acc.register(m.name, m.pass, m.cls);
  if (r.err) return refuse(p, { t: 'autherr', reason: r.err, kind: m.t });
  // тот же аккаунт с другого устройства — старое соединение закрываем
  for (const q of players.values()) if (q !== p && q.key === r.key) {
    // Вход прочитал БД до сохранения активной сессии. Передаем ее текущий
    // профиль, чтобы новое устройство не получило устаревший снимок.
    r.save = structuredClone(PL.profileOf(q.a));
    store(q); parties.remove(q); send(q, { t: 'kicked' }); q.key = null; q.ws.close(4001, 'session replaced');
  }
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
    PL.place(a, dungeonExit.x + 6, dungeonExit.z + 6);
    PL.say(a, 'Вы спустились в катакомбы. Здесь нежить нападает первой.', 'bad');
  } else if (a.x > DUNGEON.x0 - 100 && flatDist(a, dungeonExit) < 2) {
    PL.place(a, cryptDoor.x, cryptDoor.z + 5);
    PL.say(a, 'Вы выбрались на поверхность.');
  }
}

// ===== бой =====
const mobOf = (ref) => (ref?.m != null ? world.byId.get(ref.m) : null);
const actorOf = (ref) => (ref?.p != null ? players.get(ref.p)?.a : null);
const targetPos = (ref) => mobOf(ref) || actorOf(ref);
const targetRadius = (ref) => (ref?.m != null ? world.radiusOf(mobOf(ref)) : 0.6);
const alive = (t) => t && !t.dead;

// ===== эффекты во времени =====
// Событие наложения и спада: его видят все в радиусе видимости, включая самого носителя.
function fxEvent(pos, who, eff, up, now = Date.now()) {
  const e = { k: 'fx', id: eff.id, kind: eff.kind, up, ...who };
  if (up) e.dur = Math.max(0, Math.round(eff.until - now));
  for (const q of players.values()) if (q.a && flatDist(q.a, pos) < VIEW) q.a.out.push(e);
}
// Наложить эффект на игрока: одинаковый id продлевает действие, а не суммируется.
function affectActor(v, eff, now) {
  if (v.dead) return;
  v.effects = applyEffect(v.effects, eff); v.dirty = true;
  fxEvent(v, { p: v.id }, eff, true, now);
}
// Наложить эффект на цель умения — моба или игрока.
function affectTarget(ref, eff, now) {
  const mb = mobOf(ref);
  if (mb) { if (mb.dead) return; world.affect(mb, eff); return fxEvent(mb, { m: mb.id }, eff, true, now); }
  const v = actorOf(ref);
  // Замедление игрока сервер пока не накладывает: клиент ведёт собственное движение и
  // получил бы ложный откат `fix`. Мобам замедление считает сервер целиком.
  if (v && eff.kind !== 'slow') affectActor(v, eff, now);
}
// Эффекты умения на цель: урон со временем, ослабление характеристики, замедление.
function skillEffects(a, ref, sk, id, atk, now) {
  const t = targetPos(ref);
  if (!alive(t)) return;
  if (sk.dot) affectTarget(ref, makeDot(`${id}:dot`, sk.dot, atk * (ref.p != null ? PVP.damageScale : 1), now, a.id), now);
  if (sk.debuff) affectTarget(ref, makeDebuff(`${id}:weak`, { ...sk.debuff, name: sk.name }, now, a.id), now);
  if (sk.slow) affectTarget(ref, makeSlow(`${id}:slow`, { ...sk.slow, name: sk.name }, now, a.id), now);
}
// Вампиризм: доля нанесённого урона возвращается атакующему здоровьем.
function drain(a, dmg, now) {
  const gain = drainHeal(dmg, drainMul(a.effects, now));
  if (!gain) return;
  const s = PL.statsOf(a, now);
  a.P.hp = Math.min(s.maxHp, a.P.hp + gain); a.dirty = true;
  a.out.push({ k: 'heal', kind: 'hp', amount: gain, drain: 1 });
}

// урон мобу от игрока; событие видят все вокруг
function damageMob(a, mb, dmg, crit, now, dot = false) {
  const died = world.hit(mb, dmg, a);
  pushNear(a, dot ? { k: 'hit', m: mb.id, dmg, crit, dot: 1 } : { k: 'hit', m: mb.id, dmg, crit });
  drain(a, dmg, now);
  if (!died) {
    // страж прикрывается щитом, когда здоровье падает ниже порога (src/mob-skills.js)
    const shield = guardTrigger(mb, now);
    if (shield) affectTarget({ m: mb.id }, shield, now);
    return;
  }
  const topId = world.kill(mb, now);
  // Лидер по урону мог выйти или быть вытеснен вторым устройством: тогда награда — добившему,
  // а если нет и его (источник урона со временем ушёл) — моб умирает без награды.
  const top = players.get(topId), finisher = players.get(a.id);
  const winner = top?.key && top.a ? top : finisher?.key && finisher.a ? finisher : null;
  if (!winner) {
    pushNear(a, { k: 'mdie', m: mb.id });
    for (const q of players.values()) if (q.a && q.a.target?.m === mb.id) q.a.attacking = false;
    return;
  }
  const plan = parties.rewardPlan(winner, players.get(a.id), mb);
  const rw = world.rewardFor(mb, plan.level ?? winner.a.P.lvl);
  for (const share of plan.shares) {
    const actor = share.player.a;
    PL.gainXp(actor, share.xp); actor.P.sp += share.sp; actor.P.kills++; actor.dirty = true;
    if (actor.karma > 0) { actor.karma = Math.max(0, actor.karma - Math.ceil(share.xp / PVP.karmaPerXp)); sendMe(actor); }
  }
  const recipient = plan.recipient;
  const drops = [{ item: 'coins', n: rw.coins }, ...rw.drops.map(item => ({ item, n: 1 }))];
  // Pickup mode deliberately leaves the reward on the ground; autoloot cannot win the race.
  const auto = plan.mode !== 'pickup' && recipient.a.P.autoloot && creditQueued(recipient, drops, () => {
    groundLoot.spawn(mb, rw, recipient.key, recipient.name, Date.now(), plan.allowed);
    PL.say(recipient.a, 'Не удалось сохранить автолут — добыча осталась на земле', 'bad');
  });
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
  // Та же формула, что у игрока: шире разброс и собственный крит моба (src/sim.js).
  const { d, crit } = calcDmg(mobAtk(mb, now), s.pdef, 1, mobCrit(mb.def), Math.random, MOB_SPREAD, mb.def.critPower ?? 1.5);
  a.P.hp -= d;
  a.out.push({ k: 'hurt', dmg: d, from: mb.id, crit });
  if (a.P.hp <= 0) { PL.killPlayer(a, mb.def.name); onPlayerDied(a, null); return; }
  // умение удара: яд, замедление атаки, проклятие защиты (src/mob-skills.js)
  for (const eff of mobHitEffects(mb.kind, mb.def, mobAtk(mb, now), now)) affectActor(a, eff, now);
}

// PvP: сервер сам считает урон по защите жертвы
function damageActor(a, v, atk, mul, school, critChance, now) {
  if (v.dead || a.dead) return;
  if (PL.inTown(a) || PL.inTown(v)) return PL.say(a, 'В городе сражаться нельзя', 'bad');
  const vs = PL.statsOf(v, now);
  const { d, crit } = calcDmg(atk, school === 'm' ? vs.mdef : vs.pdef, mul * PVP.damageScale, critChance, Math.random, 0.2, PL.statsOf(a, now).critPower);
  v.P.hp -= d; v.dirty = true;
  v.hitBy.set(a.id, now);
  // напал на белого — флаг (у PK флаг не нужен, он и так красный)
  if (status(v) === 0 && a.karma <= 0) { const was = flagged(a); a.flagUntil = now + PVP.flagMs; if (!was) sendMe(a); }
  pushNear(a, { k: 'hit', p: v.id, dmg: d, crit });
  v.out.push({ k: 'hurt', dmg: d, fromP: a.id, name: a.name });
  drain(a, d, now);
  if (v.P.hp <= 0) { PL.killPlayer(v, a.name, a.karma > 0); onPlayerDied(v, a); }
}

function onSkill(p, a, id, now) {
  // A skill preempts a normal swing/recovery, but never another skill's action lock.
  if (a.cast || (a.actionKind !== 'attack' && (a.actionUntil || 0) > now)) {
    const err = PL.skillError(a, id, now, true);
    if (err) return PL.say(a, err, 'bad');
    a.queuedSkill = { id, target: a.target ? { ...a.target } : null };
    return;
  }
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
  const timing = skillActionTiming(sk, s);
  a.swing = null; a.queuedSkill = null;
  a.attacking = a.P.cls === 'warrior' && (a.attacking || (['dmg','aoe'].includes(sk.kind) && alive(targetPos(a.target))));
  a.actionKind = 'skill';
  a.actionUntil = now + timing.cooldown * 1000;
  a.atkTimer = timing.cooldown;
  a.cast = { id, t: timing.windup, target: a.target ? { ...a.target } : null };
  a.out.push({ k: 'action_cd', t: timing.cooldown, kind: a.actionKind });
  if (sk.school === 'p') {
    pushNear(a, { k: 'skill_start', id, t: timing.cooldown, windup: timing.windup, autoAttack: a.attacking });
  } else {
    a.out.push({ k: 'cast', id, t: timing.windup, autoAttack: a.attacking });
    pushNear(a, { k: 'cast_start', id, t: timing.windup }, true);
  }
}

function applySkill(a, id, ref, now) {
  const sk = effectiveSkill(a.P, id), s = PL.statsOf(a, now);
  if (sk.kind === 'dmg') {
    const t = targetPos(ref);
    if (!alive(t) || flatDist(a, t) > sk.range + targetRadius(ref) + LAG_M + 2) return;
    const atk = sk.school === 'm' ? s.matk : s.patk, crit = Math.random() < s.crit + 0.05 ? 1 : 0;
    pushNear(a, { k: 'cast_fx', id, to: ref });
    if (ref.m != null) { const r = calcDmg(atk, mobPdef(t, now) * (sk.school === 'm' ? 0.8 : 1), sk.mul, crit, Math.random, 0.2, s.critPower); damageMob(a, t, r.d, r.crit, now); }
    else damageActor(a, t, atk, sk.mul, sk.school, crit, now);
    skillEffects(a, ref, sk, id, atk, now);
    // Warrior autoattack resumes after the skill recovery, if the target survives.
  } else if (sk.kind === 'heal') {
    // Часть возвращается сразу, часть — лечением со временем: лечение стало растянутым.
    const amt = Math.round(s.maxHp * sk.amount);
    a.P.hp = Math.min(s.maxHp, a.P.hp + amt); a.dirty = true;
    a.out.push({ k: 'heal', kind: 'hp', amount: amt, skill: id });
    if (sk.hot) affectActor(a, makeHot(`${id}:hot`, sk.hot, s.maxHp, now, a.id), now);
    pushNear(a, { k: 'cast_fx', id });
  } else if (sk.kind === 'buff') {
    // Усиление характеристики и вампиризм — один и тот же механизм эффектов во времени.
    if (sk.stat) {
      affectActor(a, makeBuff(id, { stat: sk.stat, mul: sk.mul, dur: sk.dur, name: sk.name }, now, a.id), now);
      a.out.push({ k: 'buff', id, dur: sk.dur, stat: sk.stat, mul: sk.mul });
    }
    if (sk.drain) affectActor(a, makeDrain(`${id}:drain`, { ...sk.drain, name: sk.name }, now, a.id), now);
    pushNear(a, { k: 'cast_fx', id });
  } else if (sk.kind === 'aoe') {
    const atk = sk.school === 'm' ? s.matk : s.patk;
    let n = 0;
    pushNear(a, { k: 'cast_fx', id });
    for (const mb of world.list) {
      if (mb.dead || flatDist(mb, a) > sk.radius + world.radiusOf(mb)) continue;
      const r = calcDmg(atk, mobPdef(mb, now) * (sk.school === 'm' ? 0.8 : 1), sk.mul, s.crit, Math.random, 0.2, s.critPower);
      damageMob(a, mb, r.d, r.crit, now);
      skillEffects(a, { m: mb.id }, sk, id, atk, now); n++;
    }
    // по площади задеваем только флагнутых и PK (или того, кого бьём)
    for (const v of actors()) {
      if (v === a || v.dead || flatDist(v, a) > sk.radius + 0.6) continue;
      if (status(v) === 0 && a.target?.p !== v.id) continue;
      damageActor(a, v, atk, sk.mul, sk.school, Math.random() < s.crit ? 1 : 0, now);
      skillEffects(a, { p: v.id }, sk, id, atk, now); n++;
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
    if (a.atkTimer > 0 || (a.actionUntil || 0) > now) return;
    const timing = heroAttackTiming(s.aspd);
    a.atkTimer = timing.cooldown; a.actionKind = 'attack';
    a.actionUntil = now + timing.cooldown * 1000;
    a.out.push({ k: 'action_cd', t: timing.cooldown, kind: a.actionKind });
    const windup = timing.windup;
    a.swing = { target: targetKey, remaining: windup };
    pushNear(a, { k: 'attack_start', t: timing.duration, windup, to: { ...a.target } });
    return;
  }
  a.swing.remaining -= dt;
  if (a.swing.remaining > 0) return;
  a.swing = null;
  const mage = a.P.cls === 'mage';
  if (mage) a.attacking = false; // A deliberate single staff swing, never a magic autoattack.
  pushNear(a, { k: 'attack_release', to: { ...a.target } });
  if (a.target.p != null) {
    const crit = Math.random() < s.crit ? 1 : 0;
    damageActor(a, t, s.patk, BASIC_ATTACK_POWER, 'p', crit, now);
    return;
  }
  if (Math.random() < missChance(t.def.lvl, s.acc)) return pushNear(a, { k: 'miss', m: t.id });
  const r = calcDmg(s.patk, mobPdef(t, now), BASIC_ATTACK_POWER, s.crit, Math.random, 0.2, s.critPower);
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

// Тик эффектов во времени: сначала мобы, потом игроки. Урон и лечение считает только сервер.
function effectsTick(now) {
  world.effectsTick(now, (mb, h) => {
    if (h.kind !== 'dot') return;
    const src = players.get(h.from)?.a;
    if (src) damageMob(src, mb, h.perTick * h.n, false, now, true); // источник ушёл — тик пропадает
  }, (mb, eff) => fxEvent(mb, { m: mb.id }, eff, false, now));
  for (const a of actors()) {
    if (!a.effects.length) continue;
    const r = tickEffects(a.effects, now);
    a.effects = r.list;
    if (!a.dead) for (const h of r.hits) {
      if (h.kind === 'hot') {
        const s = PL.statsOf(a, now), amount = Math.min(h.perTick * h.n, Math.round(s.maxHp - a.P.hp));
        if (amount > 0) { a.P.hp += amount; a.dirty = true; a.out.push({ k: 'heal', kind: 'hp', amount, hot: 1 }); }
      } else if (h.kind === 'dot') dotDamage(a, h, now);
    }
    for (const eff of r.expired) fxEvent(a, { p: a.id }, eff, false, now);
  }
}
// Урон со временем по игроку: право на добивание и карму считает тот же путь, что и обычный удар.
function dotDamage(v, h, now) {
  const src = players.get(h.from)?.a || null;
  const d = h.perTick * h.n;
  v.P.hp -= d; v.dirty = true;
  if (src && src !== v) v.hitBy.set(src.id, now);
  v.out.push({ k: 'hurt', dmg: d, dot: 1, ...(src && src !== v ? { fromP: src.id, name: src.name } : {}) });
  if (v.P.hp <= 0) { PL.killPlayer(v, src ? src.name : (h.src || 'Яд'), src ? src.karma > 0 : false); onPlayerDied(v, src && src !== v ? src : null); }
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
// PK умер: с шансом теряет вещь; убийце-игроку она достаётся. Передача пишется одной транзакцией
// у обоих: при сбое записи вещь остаётся у PK. Полная сумка убийцы — вещь не выпадает.
function pkDrop(v, killer) {
  if (Math.random() > PVP.dropChance) return;
  const P = v.P;
  const bag = P.inv.map((e, i) => ({ i, e })).filter(({ e }) => !ITEMS[e.id].loot || Math.random() < 0.3);
  const worn = Object.entries(P.equip).filter(([, id]) => id && ITEMS[id].grade !== 'none');
  const vp = players.get(v.id), kp = killer ? players.get(killer.id) : null;
  const beforeV = structuredClone(P), beforeK = killer ? structuredClone(killer.P) : null;
  let item = null;
  if (worn.length && Math.random() < 0.35) {
    const [sl, id] = worn[Math.floor(Math.random() * worn.length)];
    item = { id, n: 1, e: P.enc[sl] || 0 };
    if (killer && PL.bagError(killer.P, [{ item: id, n: 1 }])) return PL.say(killer, 'Сумка полна — вещь с PK не выпала', 'bad');
    P.equip[sl] = null; delete P.enc[sl];
  } else if (bag.length) {
    const { i, e } = bag[Math.floor(Math.random() * bag.length)];
    item = { ...e };
    if (killer && PL.bagError(killer.P, [{ item: e.id, n: e.n }])) return PL.say(killer, 'Сумка полна — вещь с PK не выпала', 'bad');
    P.inv.splice(i, 1);
  }
  if (!item) return;
  if (killer) PL.addItem(killer.P, item.id, item.n, item.e);
  const saved = (() => {
    if (!vp?.key) return true; // сессия уже закрывается: запишет обычное сохранение при выходе
    if (DEV_CMD && (v.devFailStore || killer?.devFailStore)) return false;
    try { return acc.storeMany([[vp.key, PL.profileOf(v)], ...(kp?.key ? [[kp.key, PL.profileOf(killer)]] : [])]); }
    catch (error) { logFault('pk-drop-store', vp, error); return false; }
  })();
  if (!saved) {
    Object.assign(v.P, beforeV); if (killer) Object.assign(killer.P, beforeK);
    console.warn(`SAVE_FAIL pk-drop victim=${v.id}`);
    return;
  }
  v.dirty = true;
  PL.say(v, `Вы потеряли: ${ITEMS[item.id].name}${item.n > 1 ? ` ×${item.n}` : ''}`, 'bad');
  if (!killer) return;
  killer.dirty = true;
  PL.say(killer, `Вы подобрали с ${v.name}: ${ITEMS[item.id].name}`, 'rare');
  broadcast({ t: 'announce', text: `С PK ${v.name} упала вещь — её подобрал ${killer.name}` });
}
function onWash(p, a) {
  if (a.karma <= 0) return;
  const cost = karmaWashCost(a.karma);
  if (!world.npcs.some((n) => n.role === 'priest' && flatDist(a, n) < 8)) return PL.say(a, 'Жрец далеко', 'bad');
  if (a.P.coins < cost) return refuse(p, { t: 'washerr', cost });
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
  if (!q) return refuse(p, { t: 'pmerr', to: String(m.to || '').slice(0, 16), reason: 'не в сети' });
  const msg = JSON.stringify({ t: 'pm', from: p.name, to: q.name, text });
  send(q, msg);
  if (q !== p) send(p, msg);
}
function onChat(p, m) {
  const ch = Object.hasOwn(CHAT, m.ch) ? m.ch : 'all';
  const text = cleanText(m.text);
  if (!text) return;
  const wait = (p.lastChat[ch] || 0) + CHAT[ch].cd - Date.now();
  if (wait > 0) return refuse(p, { t: 'chatwait', ch, wait });
  p.lastChat[ch] = Date.now();
  if (ch === 'party' && !parties.groupOf(p.id)) return refuse(p, { t: 'party_err', reason: 'Вы не в группе.' });
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
// Шаг рассылки одному игроку: снапшот, события, профиль.
function broadcastTo(p, list, now) {
  const a = p.a;
  const o = [];
  for (const q of list) {
    if (q === a || flatDist(a, q) > VIEW) continue;
    if (!p.known.has(q.id)) { p.known.add(q.id); send(p, { t: 'look', id: q.id, name: q.name, look: q.look }); }
    const row = [q.id, +q.x.toFixed(2), +q.y.toFixed(2), +q.z.toFixed(2), +q.r.toFixed(2), (q.anim & ~24) | (q.dead ? 8 : 0) | (q.attacking && !q.dead ? 16 : 0), Math.round((q.P.hp / PL.statsOf(q, now).maxHp) * 100), status(q)];
    // девятый столбец появляется только у игроков с активными эффектами
    if (q.effects.length) row.push(snapshotEffects(q.effects, now));
    o.push(row);
  }
  for (const id of p.known) if (!players.has(id)) p.known.delete(id);
  const mobs = world.snapshotFor(a, VIEW, now);
  // впервые увиденный моб: клиенту нужен его вид, чтобы построить модель
  const fresh = [];
  // элите и чемпиону клиенту нужны ранг и готовое имя: подпись и ауру рисует он
  for (const row of mobs) if (!p.knownMobs.has(row[0])) {
    p.knownMobs.add(row[0]);
    const mb = world.byId.get(row[0]);
    fresh.push(mb.def.rank ? [mb.id, mb.kind, mb.def.rank, mb.def.name, mb.def.size] : [mb.id, mb.kind]);
  }
  if (fresh.length) send(p, { t: 'mobs', n: fresh });
  send(p, { t: 'snap', ts: now, o, m: mobs, g: groundLoot.snapshotFor(a, VIEW, p.key, now), me: { hp: Math.round(a.P.hp), mp: Math.round(a.P.mp), x: +a.x.toFixed(2), z: +a.z.toFixed(2), dead: a.dead, ...(a.effects.length ? { fx: snapshotEffects(a.effects, now) } : {}) } });
  if (a.out.length > OUT_EVENTS_MAX) { perf.outTrimmed = (perf.outTrimmed || 0) + a.out.length - OUT_EVENTS_MAX; a.out = a.out.slice(-OUT_EVENTS_MAX); }
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
function tick() {
  const now = Date.now(), dt = Math.min(0.5, (now - last) / 1000); last = now;
  let ok = worldStep('loot', () => groundLoot.expire(now));
  if (now >= partyTick) {
    partyTick = now + 1000;
    for (const p of players.values()) if (p.a && p.key) playerStep(p, 'party', () => { p.a.partyMaxHp = PL.statsOf(p.a, now).maxHp; });
    ok = worldStep('party', () => parties.tick(now)) && ok;
  }
  const list = actors();
  // мобы
  ok = worldStep('mobs', () => {
    const view = list.map((a) => ({ id: a.id, x: a.x, z: a.z, dead: a.dead, inTown: PL.inTown(a) }));
    world.tick(dt, view, now, (mb, pv) => {
      const p = players.get(pv.id);
      if (p?.a) playerStep(p, 'mob-hit', () => damagePlayer(mb, p.a, now));
    }, (mb, phase, attack, landed) => {
      const event = { k: `mob_${phase}`, m: mb.id, p: attack.target, t: attack.duration, x: attack.x, z: attack.z, r: attack.r, reach: attack.reach, arc: attack.arc, landed };
      for (const a of list) if (flatDist(a, mb) < VIEW) a.out.push(event);
    });
  }) && ok;
  ok = worldStep('effects', () => effectsTick(now)) && ok;
  ok = worldStep('guards', () => guardsTick(now)) && ok;
  // Много тиков подряд с отказом общего шага: мир неконсистентен — перезапуск с сохранением.
  worldFaults = ok ? 0 : worldFaults + 1;
  if (worldFaults >= WORLD_FAULT_LIMIT) return shutdown(1, `world step failed ${worldFaults} ticks in a row`);
  // игроки: сбой одного не мешает остальным
  for (const a of list) {
    const p = players.get(a.id);
    playerStep(p, 'player', () => {
      if (DEV_CMD && a.devFault) { a.devFault = false; throw Error('проверочный сбой тика игрока'); }
      PL.regen(a, dt);
      if (a.flagUntil && a.flagUntil <= now) { a.flagUntil = 0; sendMe(a); }
      if (a.cast) {
        a.cast.t -= dt;
        if (a.cast.t <= 0) {
          const c = a.cast; a.cast = null;
          if (c.id === 'escape') { const t = TOWNS.find((x) => x.id === a.P.home) || TOWNS[0]; PL.place(a, t.x, t.z - 12); }
          else applySkill(a, c.id, c.target, now);
        }
      }
      if (a.queuedSkill && !a.cast && !a.dead && now >= (a.actionUntil || 0)) {
        const next = a.queuedSkill; a.queuedSkill = null;
        a.target = next.target;
        onSkill(p, a, next.id, now);
      }
      autoAttack(a, dt, now);
    });
  }
  // Очередь сохранений — одной транзакцией до рассылки: клиент не увидит незаписанную выдачу.
  worldStep('save', () => saves.flush());
  // рассылка
  for (const p of players.values()) {
    // вытесненная сессия ещё закрывается: события ей больше не нужны
    if (!p.key) { if (p.a) p.a.out.length = 0; continue; }
    if (!p.a) continue;
    playerStep(p, 'send', () => broadcastTo(p, list, now));
  }
}
setInterval(() => {
  const started = performance.now();
  try { tick(); } catch (error) { logFault('tick', null, error); }
  perf.ticks.push(performance.now() - started);
  if (perf.ticks.length > 6000) perf.ticks.splice(0, perf.ticks.length - 6000);
}, TICK);

// объявления: где сейчас PK
setInterval(() => worldStep('announce', () => {
  for (const a of actors()) if (a.karma > 0) broadcast({ t: 'announce', text: `PK ${a.name} (карма ${a.karma}) замечен: ${zoneAt(a.x, a.z).name}`, pk: a.id });
}), PVP.announceMs);
// периодическое сохранение
setInterval(() => { for (const p of players.values()) if (p.key && p.a) saves.mark(p); }, SAVE_EVERY_MS);
// пинг, чтобы nginx не рвал простаивающие соединения
setInterval(() => {
  for (const p of players.values()) {
    if (p.ws.readyState !== 1) continue;
    if (!p.alive) { console.warn(`DEAD_CLIENT player=${p.id}`); p.ws.terminate(); continue; }
    p.alive = false;
    try { p.ws.ping(); } catch { p.ws.terminate(); }
  }
}, HEARTBEAT_MS);
setInterval(() => {
  const now = Date.now();
  for (const p of players.values()) if (!p.key && p.ws.readyState === 1 && now - p.lastIn > ANON_IDLE_MS) p.ws.close(4000, 'idle without login');
}, Math.min(5000, ANON_IDLE_MS));
wss.on('listening', () => { console.log(`realms-ws ${HOST}:${PORT}, аккаунтов: ${acc.count()}, мобов: ${world.list.length}`); logRates(RATES_INFO); });

// Save active profiles before systemd or a local runner restarts the process.
let stopping = false;
function shutdown(code = 0, reason = '') {
  if (stopping) return;
  stopping = true;
  if (reason) console.error(`SERVER_RESTART ${reason}`);
  try { saves.flush(); } catch (error) { logFault('shutdown-flush', null, error); }
  for (const p of players.values()) { try { store(p); } catch (error) { logFault('shutdown-store', p, error); } }
  try { acc.close(); } catch { /* база уже закрыта */ }
  process.exit(code);
}
process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));
// Необработанное исключение оставляет процесс в неизвестном состоянии: сохраняем профили и
// выходим с кодом 1, чтобы супервизор поднял чистый процесс (restart: unless-stopped).
process.on('uncaughtException', (error) => { console.error(`SERVER_UNCAUGHT ${oneLine(error)}`); shutdown(1, 'uncaughtException'); });
process.on('unhandledRejection', (error) => { console.error(`SERVER_UNHANDLED_REJECTION ${oneLine(error)}`); shutdown(1, 'unhandledRejection'); });
