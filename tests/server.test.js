// Тесты сервера: аккаунты, авторитетный профиль, отказ читерским командам, PvP. npm run test:server
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import net from 'node:net';

const portProbe = net.createServer();
await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
const PORT = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'realms-')), DB = path.join(DIR, 'test.db');
let srv;
let serverOutput = '';
before(async () => {
  srv = spawn('node', ['--no-warnings', 'server/server.js'], { env: { ...process.env, PORT: String(PORT), DB, DEV_CMD: '1', AUTH_TRIES: '1000' }, stdio: 'pipe' });
  for (const stream of [srv.stdout, srv.stderr]) stream.on('data', chunk => { serverOutput += chunk; });
  await new Promise((r) => srv.stdout.once('data', r));
});
after(async () => {
  fs.mkdirSync('.native-run', { recursive: true });
  fs.writeFileSync('.native-run/server-integration.log', serverOutput);
  srv.kill();
  await new Promise(r => srv.exitCode !== null ? r() : srv.once('exit', r));
  fs.rmSync(DIR, { recursive: true, force: true });
  assert.doesNotMatch(serverOutput, /(?:^|\n)(?:Error:|TypeError:|ReferenceError:|FATAL)|UnhandledPromiseRejection|SQLITE_[A-Z]+/);
});

// клиент: ждёт сообщения нужного типа
function client() {
  const ws = new WebSocket(`ws://localhost:${PORT}`), inbox = [], waiters = [];
  ws.on('message', (d) => { const m = JSON.parse(d); const w = waiters.findIndex((x) => x.types.includes(m.t)); if (w >= 0) waiters.splice(w, 1)[0].res(m); else inbox.push(m); });
  return {
    ws, send: (m) => ws.send(JSON.stringify(m)),
    wait: (...types) => new Promise((res, rej) => {
      const i = inbox.findIndex((m) => types.includes(m.t)); if (i >= 0) return res(inbox.splice(i, 1)[0]);
      waiters.push({ types, res }); setTimeout(() => rej(new Error('нет ответа ' + types)), 5000);
    }),
    open: () => new Promise((r) => ws.once('open', r)),
    closed: () => new Promise((r) => (ws.readyState === 3 ? r() : ws.once('close', r))),
  };
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
// дождаться события с нужным текстом: в очереди могут лежать другие события
async function untilEv(c, re, what = String(re)) {
  for (let i = 0; i < 40; i++) { const m = await c.wait('ev'); if (re.test(JSON.stringify(m.e))) return m.e; }
  throw new Error('не дождались события: ' + what);
}
// дождаться профиля, удовлетворяющего условию (сервер шлёт его сам при каждом изменении)
async function untilP(c, cond, what = 'условие профиля') {
  for (let i = 0; i < 40; i++) { const m = await c.wait('you'); if (cond(m.p)) return m.p; }
  throw new Error('не дождались: ' + what);
}
// встать в точку и дать серверу её принять
const at = async (c, x, z) => { c.send({ t: 'dev', x, z }); await pause(250); c.send({ t: 'st', x, y: 0, z, r: 0, a: 0 }); await pause(150); };

test('heartbeat работает до входа и не создаёт аккаунт', async () => {
  const a = client(); await a.open();
  try {
    const hi = await a.wait('hi'); assert.equal(hi.features.heartbeat, 1);
    a.send({ t: 'ping' }); assert.equal((await a.wait('pong')).t, 'pong');
    a.send(null); await pause(30); assert.equal(a.ws.readyState, WebSocket.OPEN);
  } finally { a.ws.close(); await a.closed(); }
});

test('экран входа получает живой онлайн без игровых событий; каст виден только соседям', async () => {
  const lobby = client(), mage = client(), nearby = client(), far = client();
  await Promise.all([lobby.open(), mage.open(), nearby.open(), far.open()]);
  try {
    const initial = (await lobby.wait('hi')).online;
    const lobbyPackets = [], nearEvents = [], farEvents = [];
    lobby.ws.on('message', raw => lobbyPackets.push(JSON.parse(raw)));
    nearby.ws.on('message', raw => { const m = JSON.parse(raw); if (m.t === 'ev') nearEvents.push(...m.e); });
    far.ws.on('message', raw => { const m = JSON.parse(raw); if (m.t === 'ev') farEvents.push(...m.e); });
    mage.send({ t: 'register', name: 'МагЭффекты', pass: 'secret1', cls: 'mage' });
    const auth = await mage.wait('authok');
    assert.equal((await lobby.wait('online')).n, initial + 1);
    nearby.send({ t: 'register', name: 'РядомЭффекты', pass: 'secret1', cls: 'warrior' });
    far.send({ t: 'register', name: 'ДалекоЭффекты', pass: 'secret1', cls: 'warrior' });
    await Promise.all([nearby.wait('authok'), far.wait('authok')]);
    await at(far, 1100, 1000);
    mage.send({ t: 'dev', lvl: 10, sp: 1000, hp: 30 }); await pause(150);
    mage.send({ t: 'learn', id: 'heal', rank: 1 }); await untilP(mage, p => p.skills.heal === 1);
    mage.send({ t: 'skill', id: 'heal' });
    const cast = (await untilEv(mage, /"k":"cast"/)).find(e => e.k === 'cast');
    assert.equal(cast.id, 'heal'); assert.ok(cast.t > 0);
    await untilEv(mage, /"k":"heal"/); await pause(200);
    assert.ok(nearEvents.some(e => e.k === 'cast_start' && e.by === auth.id && e.id === 'heal'));
    assert.ok(!nearEvents.some(e => e.k === 'cast'), 'older clients must not mistake a remote cast for their own');
    assert.ok(nearEvents.some(e => e.k === 'cast_fx' && e.by === auth.id && e.id === 'heal'));
    assert.ok(!farEvents.some(e => ['cast', 'cast_start', 'cast_fx'].includes(e.k)));
    assert.ok(!lobbyPackets.some(m => ['ev', 'snap', 'you', 'look'].includes(m.t)));
    mage.ws.close(); await mage.closed(); await pause(150);
    assert.equal(lobbyPackets.filter(m => m.t === 'online').at(-1).n, initial + 2);
  } finally {
    for (const c of [lobby, mage, nearby, far]) c.ws.close();
    await Promise.all([lobby.closed(), mage.closed(), nearby.closed(), far.closed()]);
  }
});

test('Рядом ограничен расстоянием, Торг глобальный; каналы не принимают prototype-ключи', async () => {
  const a = client(), b = client(); await Promise.all([a.open(), b.open()]);
  try {
    a.send({ t: 'register', name: 'КаналыА', pass: 'secret1', cls: 'warrior' });
    b.send({ t: 'register', name: 'КаналыБ', pass: 'secret1', cls: 'warrior' });
    await Promise.all([a.wait('authok'), b.wait('authok')]);
    await at(a, -430, 400); await at(b, -230, 400);
    const messages = []; b.ws.on('message', raw => { const m = JSON.parse(raw); if (m.t === 'chat') messages.push(m); });
    a.send({ t: 'chat', ch: 'near', text: 'местный' }); await a.wait('chat'); await pause(150);
    assert.equal(messages.length, 0, 'далёкий игрок не должен слышать Рядом');
    a.send({ t: 'chat', ch: 'trade', text: 'торговля' });
    assert.equal((await b.wait('chat')).ch, 'trade');
    a.send({ t: 'chat', ch: 'trade', text: 'повтор' });
    assert.equal((await a.wait('chatwait')).ch, 'trade');
    a.send({ t: 'chat', ch: '__proto__', text: '[b]просто текст[/b]' });
    const fallback = await b.wait('chat'); assert.equal(fallback.ch, 'all'); assert.equal(fallback.text, '[b]просто текст[/b]');
  } finally { a.ws.close(); b.ws.close(); await Promise.all([a.closed(), b.closed()]); }
});

test('регистрация: персонажа создаёт сервер, класс — по выбору', async () => {
  const a = client(); await a.open();
  a.send({ t: 'register', name: 'Тестер', pass: 'secret1', cls: 'mage' });
  const ok = await a.wait('authok', 'autherr');
  assert.equal(ok.t, 'authok');
  assert.equal(ok.p.name, 'Тестер');
  assert.equal(ok.p.cls, 'mage');
  assert.equal(ok.p.lvl, 1);
  assert.ok(ok.p.hp > 0 && ok.p.coins > 0, 'сервер не выдал стартовое состояние');
  assert.ok(ok.token);
  a.ws.close(); await a.closed();
});

test('подложный профиль от клиента игнорируется', async () => {
  const a = client(); await a.open();
  a.send({ t: 'login', name: 'тестер', pass: 'secret1' });
  const ok = await a.wait('authok');
  const before = { lvl: ok.p.lvl, coins: ok.p.coins };
  // старая команда сохранения больше не существует
  a.send({ t: 'save', p: { lvl: 40, coins: 9999999, inv: [{ id: 'sword_crystal', n: 99, e: 16 }] } });
  a.send({ t: 'you', p: { lvl: 40 } });
  await pause(600);
  a.send({ t: 'dev', coins: before.coins }); // любое изменение заставит сервер прислать свой профиль
  const p = await untilP(a, () => true);
  assert.equal(p.lvl, before.lvl, 'сервер принял чужой уровень');
  assert.ok(p.coins <= before.coins, 'сервер принял чужие монеты');
  assert.ok(!p.inv.some((e) => e.id === 'sword_crystal'), 'сервер принял чужие вещи');
  a.ws.close(); await a.closed();
});

test('после перезахода профиль приходит из базы, а не от клиента', async () => {
  const a = client(); await a.open();
  a.send({ t: 'login', name: 'Тестер', pass: 'secret1' }); await a.wait('authok');
  a.send({ t: 'dev', coins: 777, item: 'potion_hp', n: 2 });
  await untilP(a, (p) => p.coins === 777, 'монеты не применились');
  a.ws.close(); await a.closed();
  await pause(300);

  const b = client(); await b.open();
  b.send({ t: 'login', name: 'Тестер', pass: 'secret1' });
  const ok = await b.wait('authok');
  assert.equal(ok.p.coins, 777, 'прогресс не сохранился на сервере');
  b.ws.close(); await b.closed();
});

test('покупка: без монет и вне досягаемости торговца — отказ', async () => {
  const a = client(); await a.open();
  a.send({ t: 'register', name: 'Купец', pass: 'secret1', cls: 'warrior' });
  const ok = await a.wait('authok');
  // далеко от города
  await at(a, -260, 180);
  a.send({ t: 'dev', coins: 100000 });
  await untilP(a, (p) => p.coins === 100000);
  a.send({ t: 'buy', id: 'sword_crystal', n: 1 });
  await pause(500);
  a.send({ t: 'dev', coins: 50 });
  let p = await untilP(a, (x) => x.coins === 50);
  assert.ok(!p.inv.some((e) => e.id === 'sword_crystal'), 'купил вдали от торговца');
  // рядом с торговцем, но денег не хватает
  await at(a, -450.5, 407);
  a.send({ t: 'buy', id: 'sword_crystal', n: 1 });
  await untilEv(a, /Недостаточно монет/);
  // и настоящая покупка
  a.send({ t: 'dev', coins: 1000 });
  await untilP(a, (x) => x.coins === 1000);
  a.send({ t: 'buy', id: 'potion_hp', n: 2 });
  p = await untilP(a, (x) => x.coins < 1000, 'покупка не прошла');
  assert.ok(p.inv.some((e) => e.id === 'potion_hp' && e.n >= 2), 'зелья не выданы');
  assert.equal(p.coins, 1000 - 60, 'списано не по прайсу');
  assert.ok(ok.p.name === 'Купец');
  a.ws.close(); await a.closed();
});

test('вещь не по уровню не надевается, заточка без свитка не проходит', async () => {
  const a = client(); await a.open();
  a.send({ t: 'register', name: 'Новичок', pass: 'secret1', cls: 'warrior' });
  await a.wait('authok');
  a.send({ t: 'dev', item: 'sword_crystal' });
  const p = await untilP(a, (x) => x.inv.some((e) => e.id === 'sword_crystal'));
  const idx = p.inv.findIndex((e) => e.id === 'sword_crystal');
  a.send({ t: 'equip', idx });
  await untilEv(a, /нужен уровень/, 'надел вещь не по уровню');
  // заточка без свитка в сумке
  a.send({ t: 'ench', scroll: 'scroll_ench_w', ref: { bag: idx } });
  await pause(400);
  a.send({ t: 'dev', coins: 5 });
  const p2 = await untilP(a, (x) => x.coins === 5);
  assert.ok(!p2.inv[idx]?.e, 'заточил без свитка');
  a.ws.close(); await a.closed();
});

test('рывок быстрее бега отклоняется', async () => {
  const a = client(); await a.open();
  a.send({ t: 'register', name: 'Бегун', pass: 'secret1', cls: 'warrior' });
  await a.wait('authok');
  await at(a, -260, 180);
  await pause(2200); // после отладочного переноса сервер две секунды не придирается к скорости
  a.send({ t: 'st', x: -260, y: 0, z: 180, r: 0, a: 1 });
  await pause(150);
  a.send({ t: 'st', x: 200, y: 0, z: 600, r: 0, a: 1 });
  const fix = await a.wait('fix');
  assert.ok(Math.hypot(fix.x + 260, fix.z - 180) < 5, `сервер увёл не туда: ${fix.x},${fix.z}`);
  a.ws.close(); await a.closed();
});

test('атака несуществующего моба и моба за горизонтом ничего не даёт', async () => {
  const a = client(); await a.open();
  a.send({ t: 'register', name: 'Мазила', pass: 'secret1', cls: 'warrior' });
  const ok = await a.wait('authok');
  await at(a, -260, 180);
  a.send({ t: 'atk', id: 999999, kind: 'm' });
  await pause(800);
  a.send({ t: 'dev', coins: 3 });
  const p = await untilP(a, (x) => x.coins === 3);
  assert.equal(p.xp, ok.p.xp, 'дали опыт за несуществующего моба');
  assert.equal(p.kills, ok.p.kills || 0, 'засчитали убийство');
  a.ws.close(); await a.closed();
});

test('мобы приходят с сервера и их можно убить', async () => {
  const a = client(); await a.open();
  a.send({ t: 'register', name: 'Охотник', pass: 'secret1', cls: 'warrior' });
  await a.wait('authok');
  a.send({ t: 'dev', lvl: 20, hp: 99999, x: -260, z: 180 });
  await pause(400);
  // ждём снапшот с мобами
  let mob = null;
  for (let i = 0; i < 40 && !mob; i++) {
    const s = await a.wait('snap');
    const alive = (s.m || []).filter((r) => !(r[5] & 8));
    if (alive.length) mob = alive.sort((x, y) => Math.hypot(x[1] + 260, x[3] - 180) - Math.hypot(y[1] + 260, y[3] - 180))[0];
    a.send({ t: 'st', x: -260, y: 0, z: 180, r: 0, a: 0 });
  }
  assert.ok(mob, 'сервер не прислал мобов');
  // подходим вплотную и бьём
  await at(a, mob[1] + 1, mob[3] + 1);
  a.send({ t: 'atk', id: mob[0], kind: 'm' });
  for (let i = 0; i < 80; i++) {
    a.send({ t: 'st', x: mob[1] + 1, y: 0, z: mob[3] + 1, r: 0, a: 0 });
    const m = await a.wait('ev', 'snap');
    if (m.t === 'ev' && m.e.some((e) => e.k === 'kill')) {
      const reward = m.e.find(e => e.k === 'kill');
      assert.equal(reward.ground, false, 'автолут включён для нового персонажа');
      assert.ok(reward.sp > 0);
      const p = await untilP(a, p => p.kills > 0 && p.sp > 0 && p.coins > 150);
      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(DB, { readOnly: true });
      const saved = JSON.parse(db.prepare('SELECT save FROM accounts WHERE key = ?').get('охотник').save); db.close();
      assert.equal(saved.coins,p.coins); assert.equal(saved.sp,p.sp);
      a.ws.close(); await a.closed(); return;
    }
  }
  throw new Error('моб не умер за отведённое время');
});

test('занятое имя, неверный пароль, плохой токен, слабые данные', async () => {
  const a = client(); await a.open();
  a.send({ t: 'register', name: 'ТЕСТЕР', pass: 'xxxx', cls: 'warrior' });
  assert.match((await a.wait('autherr')).reason, /занято/);
  a.send({ t: 'login', name: 'Тестер', pass: 'wrong' });
  assert.match((await a.wait('autherr')).reason, /Неверное/);
  a.send({ t: 'auth', token: 'deadbeef' });
  assert.match((await a.wait('autherr')).reason, /Сессия/);
  a.send({ t: 'register', name: 'a b', pass: 'xxxx', cls: 'warrior' });
  assert.match((await a.wait('autherr')).reason, /Имя/);
  a.send({ t: 'register', name: 'Норм', pass: '1', cls: 'warrior' });
  assert.match((await a.wait('autherr')).reason, /Пароль/);
  // без входа чат игнорируется
  a.send({ t: 'chat', ch: 'all', text: 'спам' });
  a.ws.close(); await a.closed();
});

test('вход с другого устройства вытесняет первое', async () => {
  const a = client(); await a.open();
  a.send({ t: 'login', name: 'Тестер', pass: 'secret1' }); await a.wait('authok');
  const b = client(); await b.open();
  const closedCode = new Promise(resolve => a.ws.once('close', resolve));
  b.send({ t: 'login', name: 'Тестер', pass: 'secret1' }); await b.wait('authok');
  assert.equal((await a.wait('kicked')).t, 'kicked');
  assert.equal(await closedCode, 4001, 'закрытие должно отличаться от временной потери сети');
  b.ws.close(); await b.closed();
});

test('личные сообщения: доставка, эхо отправителю, адресат не в сети', async () => {
  const a = client(); await a.open();
  a.send({ t: 'login', name: 'Тестер', pass: 'secret1' }); await a.wait('authok');
  const b = client(); await b.open();
  b.send({ t: 'register', name: 'Друг', pass: 'secret2', cls: 'warrior' }); await b.wait('authok');
  a.send({ t: 'pm', to: 'друг', text: 'привет' });
  const got = await b.wait('pm'), echo = await a.wait('pm');
  assert.deepEqual([got.from, got.to, got.text], ['Тестер', 'Друг', 'привет']);
  assert.equal(echo.text, 'привет');
  await pause(450);
  a.send({ t: 'pm', to: 'Никто', text: 'эй' });
  assert.match((await a.wait('pmerr')).reason, /не в сети/);
  a.ws.close(); b.ws.close(); await a.closed(); await b.closed();
});

test('PvP: урон считает сервер, в городе нельзя, за убийство белого — PK', async () => {
  const mk = async (name) => {
    const c = client(); await c.open();
    c.send({ t: 'register', name, pass: 'pvp12345', cls: 'warrior' });
    const ok = await c.wait('authok'); await c.wait('me');
    c.send({ t: 'dev', lvl: 20 });
    await untilP(c, (p) => p.lvl === 20);
    return { c, id: ok.id };
  };
  const A = await mk('Убийца'), B = await mk('Жертва');
  // в городе — отказ
  await at(A.c, -430, 400); await at(B.c, -428, 400);
  A.c.send({ t: 'atk', id: B.id, kind: 'p' });
  await untilEv(A.c, /городе/, 'в городе разрешили бой');
  // на лугу — удар доходит, атакующий флагнут
  await at(A.c, -260, 180); await at(B.c, -258.5, 180);
  A.c.send({ t: 'atk', id: B.id, kind: 'p' });
  const keep = setInterval(() => { A.c.send({ t: 'st', x: -260, y: 0, z: 180, r: 0, a: 0 }); B.c.send({ t: 'st', x: -258.5, y: 0, z: 180, r: 0, a: 0 }); }, 100);
  const hurt = await (async () => { for (let i = 0; i < 60; i++) { const m = await B.c.wait('ev'); const h = m.e.find((e) => e.k === 'hurt' && e.fromP === A.id); if (h) return h; } throw new Error('урон не дошёл'); })();
  assert.ok(hurt.dmg > 0 && hurt.dmg < 1e6, `странный урон: ${hurt.dmg}`);
  const me1 = await A.c.wait('me');
  assert.ok(me1.flag > 0 && me1.karma === 0, 'нет флага за удар по белому');
  // добиваем: жертва должна умереть, убийца стать PK
  B.c.send({ t: 'dev', hp: 1 });
  const me2 = await (async () => { for (let i = 0; i < 40; i++) { const m = await A.c.wait('me'); if (m.pk === 1) return m; } throw new Error('убийца не стал PK'); })();
  assert.ok(me2.karma > 0, 'карма не начислена');
  clearInterval(keep);
  A.c.ws.close(); B.c.ws.close(); await A.c.closed(); await B.c.closed();
});

test('дроп по WebSocket: два игрока видят награду, владелец подбирает один раз, профиль сохраняется', async () => {
  const a = client(), b = client(); await Promise.all([a.open(), b.open()]);
  try {
    a.send({ t: 'register', name: 'Добытчик', pass: 'loot-test', cls: 'warrior' });
    b.send({ t: 'register', name: 'Сосед', pass: 'loot-test', cls: 'mage' });
    const [auth] = await Promise.all([a.wait('authok'), b.wait('authok')]);
    a.send({ t: 'dev', x: -448, z: 418, drop: 'pelt' });
    b.send({ t: 'dev', x: -448, z: 418 });
    const snapWith = async (c, pred) => { for (let i = 0; i < 100; i++) { const m = await c.wait('snap'); if (pred(m.g || [])) return m.g; } throw Error('ground snapshot missing'); };
    const first = await snapWith(a, g => g.some(d => d.ownerName === 'Добытчик'));
    const coin = first.find(d => d.item === 'coins' && d.ownerName === 'Добытчик');
    const item = first.find(d => d.item === 'pelt' && d.ownerName === 'Добытчик');
    assert.ok(coin && item);
    const other = await snapWith(b, g => g.some(d => d.id === coin.id));
    assert.equal(other.find(d => d.id === coin.id).available, false);
    b.send({ t: 'pickup', id: coin.id, n: 999999 });
    assert.match((await b.wait('pickup_err')).reason, /принадлежит/);
    a.send({ t: 'dev', x: -460, z: 418 }); await untilP(a, p => p.x === -460);
    a.send({ t: 'pickup', id: coin.id }); assert.match((await a.wait('pickup_err')).reason, /ближе/);
    a.send({ t: 'dev', x: coin.x, z: coin.z }); await untilP(a, p => Math.abs(p.x - coin.x) < 0.1);
    a.send({ t: 'pickup', id: coin.id, n: 999999, item: 'sword_crystal' });
    a.send({ t: 'pickup', id: coin.id });
    assert.match((await a.wait('pickup_err')).reason, /уже/);
    const money = await untilP(a, p => p.coins === auth.p.coins + 17);
    assert.ok(!money.inv.some(e => e.id === 'sword_crystal'));
    a.send({ t: 'dev', x: item.x, z: item.z }); await untilP(a, p => Math.abs(p.x - item.x) < 0.1);
    a.send({ t: 'pickup', id: item.id });
    await untilP(a, p => p.inv.some(e => e.id === 'pelt' && e.n === 1));
    // Verify durability while the account is still connected, before disconnect autosave.
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(DB, { readOnly: true });
    const saved = JSON.parse(db.prepare('SELECT save FROM accounts WHERE key = ?').get('добытчик').save); db.close();
    assert.equal(saved.coins, auth.p.coins + 17); assert.equal(saved.inv.find(e => e.id === 'pelt').n, 1);
    await snapWith(b, g => !g.some(d => d.id === coin.id || d.id === item.id));
    a.ws.close(); await a.closed(); await pause(200);
    const resumed = client(); await resumed.open();
    try {
      resumed.send({ t: 'auth', token: auth.token }); const ok = await resumed.wait('authok');
      assert.equal(ok.p.coins, auth.p.coins + 17); assert.equal(ok.p.inv.find(e => e.id === 'pelt').n, 1);
    } finally { resumed.ws.close(); await resumed.closed(); }
  } finally { a.ws.close(); b.ws.close(); await Promise.all([a.closed(), b.closed()]); }
});


test('SP/обучение/автолут по WS: класс, уровень, двойной клик и перезаход', async () => {
  const a=client(); await a.open();
  try {
    a.send({t:'register',name:'Ученик',pass:'skill-test',cls:'warrior'});
    const auth=await a.wait('authok'); assert.equal(auth.p.skills.power_strike,1);
    a.send({t:'learn',id:'battle_cry',rank:1}); await untilEv(a,/уровень/);
    a.send({t:'dev',lvl:8,sp:5000}); await untilP(a,p=>p.sp===5000&&p.lvl===8);
    a.send({t:'learn',id:'heal',rank:1}); await untilEv(a,/класса/);
    a.send({t:'learn',id:'battle_cry',rank:1}); a.send({t:'learn',id:'battle_cry',rank:1});
    const p=await untilP(a,p=>p.skills.battle_cry===1);
    const {skillRanks}=await import('../src/progression.js');
    assert.equal(p.sp,5000-skillRanks('battle_cry')[0].sp);
    a.send({t:'autoloot',enabled:false}); await untilP(a,p=>p.autoloot===false);
    a.ws.close(); await a.closed(); await pause(150);
    const b=client(); await b.open();
    try { b.send({t:'auth',token:auth.token}); const ok=await b.wait('authok');
      assert.equal(ok.p.sp,p.sp); assert.equal(ok.p.skills.battle_cry,1); assert.equal(ok.p.autoloot,false);
    } finally {b.ws.close();await b.closed();}
  } finally {a.ws.close();await a.closed();}
});

test('профессия по WS: рано, чужой класс, повтор, успешный выбор и сохранение после перезахода', async () => {
  const a = client(); await a.open();
  try {
    a.send({ t: 'register', name: 'Новобранец', pass: 'prof-test', cls: 'warrior' });
    const auth = await a.wait('authok');
    assert.equal(auth.p.prof, null);
    assert.equal((await a.wait('hi')).features.professions, 1);
    // до 20 уровня профессия недоступна
    a.send({ t: 'prof', id: 'knight' }); await untilEv(a, /уровня/);
    a.send({ t: 'dev', lvl: 20, sp: 100000 }); await untilP(a, p => p.lvl === 20 && p.sp === 100000);
    // слишком частые попытки сервер отбивает и объясняет
    a.send({ t: 'prof', id: 'knight' }); await untilEv(a, /Слишком часто/);
    await pause(1100);
    // чужой класс и выдуманный id отклоняются
    a.send({ t: 'prof', id: 'sorcerer' }); await untilEv(a, /недоступна вашему классу/);
    await pause(1100);
    a.send({ t: 'prof', id: 'нет-такой' }); await untilEv(a, /недоступна вашему классу/);
    await pause(1100);
    // умение профессии нельзя выучить до выбора
    a.send({ t: 'learn', id: 'shield_bash', rank: 1 }); await untilEv(a, /профессии/);
    a.send({ t: 'prof', id: 'knight' });
    const chosen = await untilP(a, p => p.prof === 'knight');
    assert.equal(chosen.prof, 'knight');
    // повторный выбор не перезаписывает профессию
    await pause(1100);
    a.send({ t: 'prof', id: 'berserker' }); await untilEv(a, /уже выбрана/);
    // умение профессии учится за SP по общим правилам
    a.send({ t: 'learn', id: 'shield_bash', rank: 1 });
    const learned = await untilP(a, p => p.skills.shield_bash === 1);
    const { skillRanks } = await import('../src/progression.js');
    assert.equal(learned.sp, 100000 - skillRanks('shield_bash')[0].sp);
    assert.equal(learned.prof, 'knight');
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(DB, { readOnly: true });
    const saved = JSON.parse(db.prepare('SELECT save FROM accounts WHERE key = ?').get('новобранец').save); db.close();
    assert.equal(saved.prof, 'knight');
    a.ws.close(); await a.closed(); await pause(150);
    const b = client(); await b.open();
    try {
      b.send({ t: 'auth', token: auth.token });
      const ok = await b.wait('authok');
      assert.equal(ok.p.prof, 'knight');
      assert.equal(ok.p.skills.shield_bash, 1);
      assert.equal(ok.p.sp, learned.sp);
    } finally { b.ws.close(); await b.closed(); }
  } finally { a.ws.close(); await a.closed(); }
});

test('изготовление по WS: списание материалов, повтор заказа и сохранение', async () => {
  const a=client();await a.open();
  try {
    a.send({t:'register',name:'Кузнец',pass:'craft-test',cls:'mage'});await a.wait('authok');
    a.send({t:'dev',lvl:8,coins:1000,item:'pelt',n:40,x:-450.5,z:407});await untilP(a,p=>p.inv.some(e=>e.id==='pelt'));
    a.send({t:'dev',item:'bone',n:40});await untilP(a,p=>p.inv.some(e=>e.id==='bone'));
    const order={t:'craft',id:'staff_oak',request:'native-order-0001'};a.send(order);a.send(order);
    const p=await untilP(a,p=>p.inv.some(e=>e.id==='staff_oak'));
    assert.equal(p.coins,700); assert.equal(p.inv.find(e=>e.id==='pelt').n,20);assert.equal(p.inv.find(e=>e.id==='bone').n,20);
    assert.equal(p.inv.filter(e=>e.id==='staff_oak').length,1);
    const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(DB,{readOnly:true});
    const saved=JSON.parse(db.prepare('SELECT save FROM accounts WHERE key = ?').get('кузнец').save);db.close();
    assert.equal(saved.coins,700);assert.deepEqual(saved.craftReceipts,['native-order-0001']);
  } finally {a.ws.close();await a.closed();}
});

test('отклоненный телепорт и respawn живого не разрешают произвольное перемещение', async () => {
  const a = client(); await a.open();
  try {
    a.send({ t: 'register', name: 'БезРывка', pass: 'secret1', cls: 'warrior' });
    const { p } = await a.wait('authok');
    for (const command of [{ t: 'respawn' }, { t: 'tp', id: 'missing' }]) {
      a.send(command);
      a.send({ t: 'st', x: p.x + 500, z: p.z, y: 0, r: 0, a: 0 });
      const reply = await a.wait('fix', 'snap');
      assert.equal(reply.t === 'fix' ? reply.x : reply.me.x, p.x);
      if (reply.t !== 'fix') assert.equal((await a.wait('fix')).x, p.x);
    }
  } finally { a.ws.close(); await a.closed(); }
});

test('вход вторым устройством получает последнее состояние через пароль и токен', async () => {
  const a = client(), b = client(), c = client(); await Promise.all([a.open(), b.open(), c.open()]);
  try {
    a.send({ t: 'register', name: 'ПереносСессии', pass: 'secret1', cls: 'warrior' });
    const first = await a.wait('authok');
    a.send({ t: 'unequip', slot: 'weapon' });
    const before = await untilP(a, p => !p.equip.weapon);
    b.send({ t: 'auth', token: first.token });
    const second = await b.wait('authok');
    assert.deepEqual(second.p.inv, before.inv); assert.equal(second.p.equip.weapon, null);
    const idx = second.p.inv.findIndex(e => e.id === 'sword_novice');
    b.send({ t: 'equip', idx });
    const equipped = await untilP(b, p => p.equip.weapon === 'sword_novice');
    c.send({ t: 'login', name: 'ПереносСессии', pass: 'secret1' });
    const third = await c.wait('authok');
    assert.equal(third.p.equip.weapon, 'sword_novice'); assert.deepEqual(third.p.inv, equipped.inv);
  } finally { for (const x of [a,b,c]) x.ws.close(); await Promise.all([a.closed(),b.closed(),c.closed()]); }
});

test('законный телепорт принимает новую позицию, отклоняет старую и не отключает проверку скорости', async () => {
  const { buildProps, TELEPORTS } = await import('../src/world-core.js');
  const gate = buildProps().npcs.find(n => n.role === 'gatekeeper');
  const destination = TELEPORTS.find(t => Math.hypot(t.x - gate.x, t.z - gate.z) > 100);
  const a = client(); await a.open();
  try {
    a.send({ t: 'register', name: 'ЗаконныйПеренос', pass: 'secret1', cls: 'warrior' }); await a.wait('authok');
    await at(a, gate.x, gate.z);
    a.send({ t: 'dev', coins: 100000 }); await untilP(a, p => p.coins === 100000);
    a.send({ t: 'tp', id: destination.id });
    const teleported = await untilP(a, p => p.x === destination.x && p.z === destination.z);
    assert.equal(teleported.coins, 100000 - destination.cost);
    a.send({ t: 'st', x: gate.x, z: gate.z, y: 0, r: 0, a: 0 });
    const staleFix = await a.wait('fix');
    assert.equal(staleFix.x, destination.x); assert.equal(staleFix.z, destination.z);
    a.send({ t: 'st', x: destination.x, z: destination.z, y: 0, r: 0, a: 0 });
    // Move one metre from the destination: a normal movement must remain valid.
    a.send({ t: 'st', x: destination.x + 1, z: destination.z, y: 0, r: 0, a: 1 });
    let moved;
    for (let i = 0; i < 30; i++) { const m = await a.wait('snap', 'fix'); assert.notEqual(m.t, 'fix'); if (m.me.x === destination.x + 1) { moved = m; break; } }
    assert.ok(moved, 'нормальное движение после телепорта не принято');
    a.send({ t: 'st', x: destination.x + 500, z: destination.z, y: 0, r: 0, a: 1 });
    assert.equal((await a.wait('fix')).x, destination.x + 1);
  } finally { a.ws.close(); await a.closed(); }
});

test('смерть переживает вход; мертвый не перемещается, после respawn можно двигаться', async () => {
  const { buildProps } = await import('../src/world-core.js');
  const spawns = buildProps().spawns, index = spawns.findIndex(s => s.mob === 'orc'), mob = spawns[index];
  const a = client(), b = client(); await Promise.all([a.open(), b.open()]);
  try {
    a.send({ t: 'register', name: 'СмертьСохранена', pass: 'secret1', cls: 'warrior' });
    const auth = await a.wait('authok');
    await at(a, mob.x, mob.z);
    a.send({ t: 'dev', hp: 1 });
    a.send({ t: 'atk', id: index + 1, kind: 'm' });
    await untilEv(a, /"k":"dead"/);
    b.send({ t: 'auth', token: auth.token });
    const dead = await b.wait('authok'); assert.equal(dead.p.dead, true); assert.equal(dead.p.hp, 0);
    b.send({ t: 'st', x: dead.p.x + 1, z: dead.p.z, y: 0, r: 0, a: 0 });
    const fixed = await b.wait('fix'); assert.equal(fixed.x, dead.p.x); assert.equal(fixed.z, dead.p.z);
    b.send({ t: 'respawn' });
    const alive = await untilP(b, p => !p.dead && p.hp > 0);
    b.send({ t: 'st', x: alive.x + 1, z: alive.z, y: 0, r: 0, a: 1 });
    let moved;
    for (let i = 0; i < 30; i++) { const m = await b.wait('snap', 'fix'); assert.notEqual(m.t, 'fix'); if (m.me.x === alive.x + 1) { moved = m; break; } }
    assert.ok(moved);
  } finally { a.ws.close(); b.ws.close(); await Promise.all([a.closed(), b.closed()]); }
});

test('сервер отвергает срезание фонтана, но принимает путь вокруг края', async () => {
  const c=client(), other=client(); await Promise.all([c.open(),other.open()]);
  try {
    c.send({t:'register',name:'ПутьФонтан',pass:'secret1',cls:'war'}); await c.wait('authok');
    await at(c,-435.1,400);
    c.send({t:'st',x:-430,z:405.1,r:0,a:1});
    const correction=await c.wait('fix'); assert.equal(correction.x,-435.1);
    const path=Array.from({length:32},(_,i)=>{const t=Math.PI-(i+1)*Math.PI/64;return{x:-430+5.1*Math.cos(t),z:400+5.1*Math.sin(t)};});
    // Send the arc at the restored running speed, not as an 8 m burst.
    for(let i=0;i<path.length;i+=8){
      await pause(350);
      const section=path.slice(i,i+8);
      c.send({t:'st',...section.at(-1),path:section,r:0,a:1});
    }
    await pause(150);
    other.send({t:'login',name:'ПутьФонтан',pass:'secret1'});
    const auth=await other.wait('authok');
    assert.ok(Math.abs(auth.p.x+430)<.001); assert.ok(Math.abs(auth.p.z-405.1)<.001);
  } finally { c.ws.close(); other.ws.close(); await Promise.all([c.closed(),other.closed()]); }
});

test('оба клиента видят серверный замах моба; уход из сектора предотвращает урон', async () => {
  const { buildProps } = await import('../src/world-core.js');
  const spawns = buildProps().spawns; const mobId = spawns.findIndex(s => s.mob === 'orc') + 1; const spawn = spawns[mobId - 1];
  const a = client(), b = client(); await Promise.all([a.open(), b.open()]);
  const eventsA = [], eventsB = [];
  for (const [c, log] of [[a, eventsA], [b, eventsB]]) c.ws.on('message', raw => { const m = JSON.parse(raw); if (m.t === 'ev') log.push(...m.e); });
  const waitFor = async predicate => { for (let i = 0; i < 120; i++) { const v = predicate(); if (v) return v; await pause(50); } throw Error('combat event timeout'); };
  try {
    a.send({ t: 'register', name: 'ТелеграфЦель', pass: 'test-secret', cls: 'warrior' });
    b.send({ t: 'register', name: 'ТелеграфЗритель', pass: 'test-secret', cls: 'warrior' });
    const auth = await a.wait('authok'); await b.wait('authok');
    // Observer outside aggro range; both still receive the same nearby combat.
    b.send({ t: 'dev', x: spawn.x + 35, z: spawn.z, hp: 9999 });
    a.send({ t: 'dev', x: spawn.x, z: spawn.z + 4, hp: 9999 });
    let row;
    for (let i=0;i<30&&!row;i++) row=(await a.wait('snap')).m.find(r=>r[0]===mobId && !(r[5]&8));
    assert.ok(row, 'live orc snapshot');
    a.send({t:'dev',x:row[1],z:row[3]+2,hp:9999});
    const warning = await waitFor(() => eventsA.find(e => e.k === 'mob_windup' && e.p === auth.id));
    assert.ok(warning.t >= .5 && warning.arc > 0 && warning.reach > 2);
    assert.ok(!eventsA.some(e => e.k === 'hurt' && e.from === warning.m), 'warning must precede damage');
    a.send({ t: 'dev', x: warning.x + 18, z: warning.z + 18 });
    const strike = await waitFor(() => eventsA.find(e => e.k === 'mob_strike' && e.m === warning.m));
    assert.equal(strike.landed, false);
    assert.ok(!eventsA.some(e => e.k === 'hurt' && e.from === warning.m));
    await waitFor(() => eventsB.some(e => e.k === 'mob_strike' && e.m === warning.m));
    assert.deepEqual(eventsB.find(e => e.k === 'mob_windup' && e.m === warning.m), warning);
    assert.deepEqual(eventsB.find(e => e.k === 'mob_strike' && e.m === warning.m), strike);
  } finally { a.ws.close(); b.ws.close(); await Promise.all([a.closed(), b.closed()]); }
});

test('автоатака сначала объявляет замах; отмена команды и телепорт исключают отложенный урон', async () => {
  const a = client(), b = client(); await Promise.all([a.open(), b.open()]);
  const events = [];
  a.ws.on('message', raw => { const m = JSON.parse(raw); if (m.t === 'ev') events.push(...m.e); });
  const nextAttack = async start => { for (let i = 0; i < 80; i++) { const e = events.slice(start).find(e=>e.k==='attack_start'); if(e)return e; await pause(25); } throw Error('no attack windup'); };
  try {
    a.send({t:'register',name:'ЗамахИгрока',pass:'test-secret',cls:'warrior'}); await a.wait('authok');
    b.send({t:'register',name:'ЦельЗамаха',pass:'test-secret',cls:'warrior'}); const victim=await b.wait('authok');
    await at(a,-700,-500); await at(b,-700,-498);
    let start=events.length;
    a.send({t:'atk',kind:'p',id:victim.id});
    const first=await nextAttack(start); assert.ok(first.t>0);
    assert.ok(!events.slice(start).some(e=>e.k==='hit'), 'damage cannot precede the announced windup');
    a.send({t:'atk',id:null}); await pause(700);
    assert.ok(!events.slice(start).some(e=>e.k==='hit'), 'cancelled swing must not damage the victim');
    await pause(400); start=events.length;
    a.send({t:'atk',kind:'p',id:victim.id}); await nextAttack(start);
    a.send({t:'dev',x:-448,z:418}); await pause(700);
    assert.ok(!events.slice(start).some(e=>e.k==='hit'), 'teleported player cannot finish a stale attack');
    await at(a,-700,-500); start=events.length;
    a.send({t:'atk',kind:'p',id:victim.id}); await nextAttack(start);
    for(let i=0;i<40&&!events.slice(start).some(e=>e.k==='hit');i++)await pause(25);
    assert.ok(events.slice(start).some(e=>e.k==='hit'), 'a completed swing still applies server damage');
  } finally { a.ws.close(); b.ws.close(); await Promise.all([a.closed(),b.closed()]); }
});

test('пати делит реальные XP/SP, защищает групповой дроп, изолирует чат и распускается при выходе', async () => {
  const a=client(), b=client(), outsider=client(); await Promise.all([a.open(),b.open(),outsider.open()]);
  const seen=[]; outsider.ws.on('message', raw=>seen.push(JSON.parse(raw)));
  try {
    a.send({t:'register',name:'ГруппаПервый',pass:'secret1',cls:'warrior'});
    b.send({t:'register',name:'ГруппаВторой',pass:'secret1',cls:'mage'});
    outsider.send({t:'register',name:'ГруппаЧужой',pass:'secret1',cls:'mage'});
    const [aa,bb]=await Promise.all([a.wait('authok'),b.wait('authok'),outsider.wait('authok')]);
    a.send({t:'party',action:'invite',name:'ГруппаВторой'}); const invitation=await b.wait('party_invite');assert.equal(invitation.from,aa.id);
    b.send({t:'party',action:'accept',from:aa.id});
    assert.equal((await a.wait('party')).members.length,2);assert.equal((await b.wait('party')).members.length,2);
    b.send({t:'party',action:'mode',mode:'pickup'});assert.match((await b.wait('party_err')).reason,/лидер/);
    a.send({t:'party',action:'mode',mode:'pickup'});
    let state; do {state=await a.wait('party');} while(state.mode!=='pickup');
    a.send({t:'chat',ch:'party',text:'group-private-marker'});
    assert.equal((await b.wait('chat')).text,'group-private-marker');
    const {HUNTING_CAMPS}=await import('../src/world-core.js');
    const camp=HUNTING_CAMPS.find(c=>c.id==='east_rabbits');
    await at(a,camp.x,camp.z);await at(b,camp.x,camp.z+1);await at(outsider,camp.x,camp.z+2);
    let mob;
    for(let i=0;i<40&&!mob;i++) {const s=await a.wait('snap');mob=s.m.filter(r=>!(r[5]&8)&&Math.hypot(r[1]-camp.x,r[3]-camp.z)<25).sort((x,y)=>Math.hypot(x[1]-camp.x,x[3]-camp.z)-Math.hypot(y[1]-camp.x,y[3]-camp.z))[0];}
    assert.ok(mob);await at(a,mob[1]+1,mob[3]+1);await at(b,mob[1]+2,mob[3]+2);
    a.send({t:'atk',kind:'m',id:mob[0]});
    const killed=(await untilEv(a,/"k":"kill"/)).find(e=>e.k==='kill');
    const shared=(await untilEv(b,/"k":"kill"/)).find(e=>e.k==='kill');
    const {MOBS}=await import('../src/data.js'); const {spForKill}=await import('../src/progression.js');
    assert.equal(killed.xp+shared.xp,MOBS[killed.mob].xp);assert.equal(killed.sp+shared.sp,spForKill(MOBS[killed.mob].xp));
    const pa=await untilP(a,p=>p.kills===1),pb=await untilP(b,p=>p.kills===1);assert.equal(pa.coins,150);assert.equal(pb.coins,150,'pickup policy suppresses autoloot');
    let drops=[];const dropDeadline=Date.now()+5000;
    while(!drops.length && Date.now()<dropDeadline) drops=(await b.wait('snap')).g.filter(d=>d.available&&d.item==='coins');
    const drop=drops[0];assert.ok(drop);await at(outsider,drop.x,drop.z);outsider.send({t:'pickup',id:drop.id});assert.match((await outsider.wait('pickup_err')).reason,/принадлежит/);
    await at(b,drop.x,drop.z);b.send({t:'pickup',id:drop.id});const rewarded=await untilP(b,p=>p.coins>150);assert.equal(rewarded.coins,150+drop.n);
    a.send({t:'pickup',id:drop.id});assert.ok((await a.wait('pickup_err')).reason);
    assert.ok(!seen.some(m=>m.t==='chat'&&m.text==='group-private-marker'));
    b.send({t:'party',action:'leave'});
    do {state=await a.wait('party');} while(state.members.length);assert.equal(state.id,null);
    assert.equal(bb.p.cls,'mage');
  } finally { for(const c of [a,b,outsider])c.ws.close();await Promise.all([a.closed(),b.closed(),outsider.closed()]); }
});

test('эффект во времени тикает без новых команд, ослабляет цель и спадает сам', async () => {
  const { buildProps } = await import('../src/world-core.js');
  const spawns = buildProps().spawns;
  // Голем не агрессивен и достаточно живуч, чтобы пережить всё кровотечение целиком.
  const index = spawns.findIndex((s) => s.mob === 'golem');
  const mobId = index + 1, spawn = spawns[index];
  const a = client(); await a.open();
  const events = [];
  a.ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.t === 'ev') events.push(...m.e); });
  try {
    a.send({ t: 'register', name: 'МагПечати', pass: 'test-secret', cls: 'mage' });
    await a.wait('authok');
    a.send({ t: 'dev', lvl: 30, sp: 100000, hp: 99999, x: spawn.x + 9, z: spawn.z });
    await pause(300);
    a.send({ t: 'learn', id: 'curse', rank: 1 });
    await untilP(a, (p) => p.skills.curse === 1, 'изучена Печать немощи');
    await at(a, spawn.x + 9, spawn.z);
    a.send({ t: 'atk', id: mobId, kind: 'm', hold: true });
    a.send({ t: 'skill', id: 'curse' });
    // наложение: и урон со временем, и ослабление атаки — два отдельных эффекта на одной цели
    const applied = [];
    for (let i = 0; i < 80 && applied.length < 2; i++) {
      await pause(100);
      for (const e of events) if (e.k === 'fx' && e.up && e.m === mobId && !applied.includes(e.kind)) applied.push(e.kind);
    }
    assert.deepEqual(applied.sort(), ['debuff', 'dot'], 'печать наложила урон со временем и ослабление');
    assert.ok(events.filter((e) => e.k === 'fx' && e.up && e.m === mobId && e.kind === 'dot').length === 1, 'эффект не задвоился');
    const applyEvent = events.find((e) => e.k === 'fx' && e.up && e.kind === 'dot');
    assert.ok(applyEvent.dur > 5000, 'клиенту пришёл реальный срок действия');
    // цель видна в снапшоте со своими эффектами
    let row = null;
    for (let i = 0; i < 40 && !row; i++) { const s = await a.wait('snap'); row = (s.m || []).find((r) => r[0] === mobId && r.length > 8); }
    assert.ok(row, 'снапшот моба несёт список эффектов');
    assert.deepEqual(row[8].map((e) => e[1]).sort(), ['debuff', 'dot']);
    assert.ok(row[8].every((e) => e[2] > 0), 'у каждого эффекта есть остаток срока');
    // тики идут сами: новых команд нет, а урон продолжает приходить
    const before = events.filter((e) => e.k === 'hit' && e.m === mobId && e.dot).length;
    await pause(3500);
    const ticks = events.filter((e) => e.k === 'hit' && e.m === mobId && e.dot);
    assert.ok(ticks.length > before, `урон со временем не тикал: ${ticks.length}`);
    assert.ok(ticks.every((e) => e.dmg > 0));
    // спад приходит сам, без единой команды
    for (let i = 0; i < 100 && !events.some((e) => e.k === 'fx' && !e.up && e.m === mobId); i++) await pause(150);
    const ended = events.filter((e) => e.k === 'fx' && !e.up && e.m === mobId);
    assert.equal(ended.length, 2, 'оба эффекта спали сами');
    // в очереди ещё лежат снимки, снятые до спада, — ждём первый снимок уже без эффектов
    let after = null;
    for (let i = 0; i < 120 && after !== 8; i++) { const s = await a.wait('snap'); const r = (s.m || []).find((x) => x[0] === mobId); if (r) after = r.length; }
    assert.equal(after, 8, `снапшот вернулся к прежней длине строки, получено ${after}`);
  } finally { a.ws.close(); await a.closed(); }
});

test('лечение со временем и вампиризм работают на самом игроке', async () => {
  const a = client(); await a.open();
  const events = [];
  a.ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.t === 'ev') events.push(...m.e); });
  try {
    a.send({ t: 'register', name: 'ЖрецГлубин', pass: 'test-secret', cls: 'mage' });
    await a.wait('authok');
    a.send({ t: 'dev', lvl: 20, sp: 100000, hp: 40, x: -430, z: 388 });
    await pause(300);
    a.send({ t: 'learn', id: 'heal', rank: 1 });
    await untilP(a, (p) => p.skills.heal === 1, 'изучено Исцеление');
    a.send({ t: 'dev', hp: 40 });
    await pause(200);
    a.send({ t: 'skill', id: 'heal' });
    for (let i = 0; i < 60 && !events.some((e) => e.k === 'fx' && e.up && e.kind === 'hot'); i++) await pause(100);
    const hot = events.find((e) => e.k === 'fx' && e.up && e.kind === 'hot');
    assert.ok(hot, 'исцеление оставило лечение со временем');
    assert.ok(String(hot.id).startsWith('heal'), hot.id);
    let mine = null;
    for (let i = 0; i < 40 && !mine; i++) { const s = await a.wait('snap'); if (s.me && s.me.fx) mine = s.me.fx; }
    assert.ok(mine.some((e) => e[1] === 'hot' && e[2] > 0), 'снапшот игрока несёт свои эффекты с таймером');
    for (let i = 0; i < 60 && !events.some((e) => e.k === 'heal' && e.hot); i++) await pause(100);
    assert.ok(events.some((e) => e.k === 'heal' && e.hot && e.amount > 0), 'лечение со временем реально вернуло здоровье');
  } finally { a.ws.close(); await a.closed(); }
});

test('элитный моб сильнее и даёт больше награды, чем обычный того же вида', async () => {
  const { buildProps } = await import('../src/world-core.js');
  const { rankedDef, ELITE } = await import('../src/elites.js');
  const { MOBS } = await import('../src/data.js');
  const spawns = buildProps().spawns;
  const defs = spawns.map((sp, i) => rankedDef(MOBS[sp.mob], sp, i + 1));
  const eliteIndex = defs.findIndex((d, i) => d.rank === 'elite' && spawns[i].mob === 'rabbit');
  assert.ok(eliteIndex >= 0, 'в мире нет элитного кролика для сравнения');
  const plainIndex = spawns.findIndex((sp, i) => sp.mob === 'rabbit' && !defs[i].rank && !sp.camp);
  const a = client(); await a.open();
  const seen = new Map();
  a.ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.t === 'mobs') for (const row of m.n) seen.set(row[0], row); });
  const killAt = async (index) => {
    const id = index + 1, spawn = spawns[index];
    await at(a, spawn.x + 1, spawn.z + 1);
    a.send({ t: 'atk', id, kind: 'm' });
    for (let i = 0; i < 200; i++) {
      a.send({ t: 'st', x: spawn.x + 1, y: 0, z: spawn.z + 1, r: 0, a: 0 });
      const m = await a.wait('ev', 'snap');
      if (m.t === 'ev') { const kill = m.e.find((e) => e.k === 'kill'); if (kill) return kill; }
    }
    throw new Error('моб не умер за отведённое время');
  };
  try {
    a.send({ t: 'register', name: 'ОхотникНаЭлиту', pass: 'test-secret', cls: 'warrior' });
    await a.wait('authok');
    a.send({ t: 'dev', hp: 99999 });
    await pause(200);
    const plain = await killAt(plainIndex);
    const elite = await killAt(eliteIndex);
    assert.equal(elite.xp, plain.xp * ELITE.reward, `опыт элиты ${elite.xp} против обычного ${plain.xp}`);
    assert.ok(elite.coins >= MOBS.rabbit.coins[0] * ELITE.reward, `монеты элиты ${elite.coins}`);
    assert.ok(elite.coins <= MOBS.rabbit.coins[1] * ELITE.reward);
    // клиент получает ранг, готовое имя и увеличенный размер, а не вычисляет их сам
    const row = seen.get(eliteIndex + 1);
    assert.ok(row && row.length === 5, 'элита пришла расширенной строкой в mobs');
    assert.equal(row[2], 'elite');
    assert.ok(String(row[3]).includes('элита'), row[3]);
    assert.ok(row[4] > MOBS.rabbit.size, 'размер элиты больше обычного');
    assert.equal(seen.get(plainIndex + 1).length, 2, 'обычный моб прежней строкой');
  } finally { a.ws.close(); await a.closed(); }
});

test('соседи того же семейства вступаются за сородича', async () => {
  const { buildProps } = await import('../src/world-core.js');
  const { SOCIAL_R } = await import('../src/pack.js');
  const { MOBS } = await import('../src/data.js');
  const spawns = buildProps().spawns;
  const kin = (m) => MOBS[m].fam || m;
  // пара сородичей, чьи точки спавна стоят ближе радиуса крика
  let first = -1, second = -1;
  for (let i = 0; i < spawns.length && first < 0; i++) for (let j = i + 1; j < spawns.length; j++) {
    const x = spawns[i], y = spawns[j];
    if (x.camp || y.camp || !MOBS[x.mob].social || !MOBS[y.mob].social) continue;
    if (kin(x.mob) !== kin(y.mob) || Math.hypot(x.x - y.x, x.z - y.z) > SOCIAL_R) continue;
    first = i; second = j; break;
  }
  assert.ok(first >= 0, 'в мире нет пары сородичей в радиусе стаи');
  const victimId = first + 1, allyId = second + 1;
  const a = client(); await a.open();
  const dist = (r, x, z) => Math.hypot(r[1] - x, r[3] - z);
  try {
    a.send({ t: 'register', name: 'ЗовСтаи', pass: 'test-secret', cls: 'mage' });
    await a.wait('authok');
    // Пауки агрессивны сами: встаём вне их радиуса агрессии (14), но в пределах огненной стрелы.
    const AWAY = 24;
    for (let attempt = 0; attempt < 5; attempt++) {
      const ax = spawns[first].x - spawns[second].x, az = spawns[first].z - spawns[second].z;
      const len = Math.hypot(ax, az) || 1;
      a.send({ t: 'dev', hp: 99999, x: spawns[first].x + (ax / len) * AWAY, z: spawns[first].z + (az / len) * AWAY });
      await pause(400);
      let victim = null, ally = null, x = 0, z = 0;
      // мобы бродят вокруг своих точек — ждём мгновения, когда расстановка нужная
      for (let i = 0; i < 50 && !(victim && ally); i++) {
        const s = await a.wait('snap');
        x = s.me.x; z = s.me.z;
        const v = (s.m || []).find((r) => r[0] === victimId && !(r[5] & 8));
        const k = (s.m || []).find((r) => r[0] === allyId && !(r[5] & 8));
        if (!v || !k) continue;
        // жертва в пределах огненной стрелы и вне своей агрессии, сородич — вне своей, но в радиусе крика
        if (dist(v, x, z) > 27 || dist(v, x, z) < 15 || dist(k, x, z) < 16) continue;
        if (Math.hypot(k[1] - v[1], k[3] - v[3]) > SOCIAL_R) continue;
        victim = v; ally = k;
      }
      if (!victim || !ally) continue;
      const startDistance = dist(ally, x, z);
      const hits = [];
      const listener = (raw) => { const m = JSON.parse(raw); if (m.t === 'ev') for (const e of m.e) if (e.k === 'hit' && e.m === victimId) hits.push(e); };
      a.ws.on('message', listener);
      a.send({ t: 'atk', id: victimId, kind: 'm', hold: true });
      a.send({ t: 'skill', id: 'fire_bolt' });
      let closed = false;
      for (let i = 0; i < 70 && !closed; i++) {
        const s = await a.wait('snap');
        a.send({ t: 'st', x, y: 0, z, r: 0, a: 0 });
        const now = (s.m || []).find((r) => r[0] === allyId);
        if (now && startDistance - dist(now, x, z) > 8) closed = true;
      }
      a.ws.off('message', listener);
      if (!hits.length) continue; // выстрел не дошёл — пробуем снова из новой расстановки
      assert.ok(closed, `сородич не пошёл на помощь: было ${startDistance.toFixed(1)}`);
      return;
    }
    throw new Error('не удалось поймать пару сородичей в нужной расстановке');
  } finally { a.ws.close(); await a.closed(); }
});
