// Нагрузочный замер сервера: N клиентов непрерывно получают и подбирают наземную добычу.
// node tools/server/bench-loot.mjs [--clients=20] [--seconds=35] [--out=file.json] [--fullfsync=0]
// По умолчанию на macOS включён F_FULLFSYNC (DB_FULLFSYNC=1): запись стоит столько же, сколько fsync на Linux.
// Сервер запускается с временной SQLite на диске (WAL, как в проде) и DEV_CMD только для неё.
// Отчёт: длительность тика (p50/p95/p99/max), задержка цикла событий, число и время записей в БД.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const CLIENTS = Number(arg('clients', 20)), SECONDS = Number(arg('seconds', 35)), OUT = arg('out', '');
const probe = net.createServer();
await new Promise((r) => probe.listen(0, '127.0.0.1', r));
const port = probe.address().port; await new Promise((r) => probe.close(r));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'realms-bench-'));
const srv = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: { ...process.env, PORT: String(port), DB: path.join(dir, 'bench.db'), DEV_CMD: '1', AUTH_TRIES: '100000', DB_FULLFSYNC: arg('fullfsync', '1') }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; for (const s of [srv.stdout, srv.stderr]) s.on('data', (c) => { log += c; });
await new Promise((r) => srv.stdout.once('data', r));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function bot(i) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const b = { ws, i, name: `Бот${i}`, picked: 0, errors: 0, tried: new Set(), stats: null, x: -448 + (i % 10) * 4, z: 418 + Math.floor(i / 10) * 4 };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'devstats') b.stats = m.perf;
    if (m.t === 'pickup_err') b.errors++;
    if (m.t === 'ev') for (const e of m.e) if (e.k === 'pickup') b.picked++;
    if (m.t === 'snap' && b.running) {
      for (const d of m.g || []) if (d.available && !b.tried.has(d.id) && Math.hypot(d.x - b.x, d.z - b.z) < 2.5) { b.tried.add(d.id); ws.send(JSON.stringify({ t: 'pickup', id: d.id })); }
    }
  });
  b.ready = new Promise((r) => ws.once('open', () => { ws.send(JSON.stringify({ t: 'register', name: b.name, pass: 'bench-secret', cls: i % 2 ? 'mage' : 'warrior' })); ws.on('message', (raw) => { if (JSON.parse(raw).t === 'authok') r(); }); }));
  return b;
}
const bots = Array.from({ length: CLIENTS }, (_, i) => bot(i));
await Promise.all(bots.map((b) => b.ready));
for (const b of bots) b.ws.send(JSON.stringify({ t: 'dev', x: b.x, z: b.z, hp: 99999 }));
await pause(500);
bots[0].ws.send(JSON.stringify({ t: 'dev', stats: 'reset' }));
await pause(200);
const until = Date.now() + SECONDS * 1000;
for (const b of bots) b.running = true;
// каждый бот раз в 400 мс роняет себе добычу (монеты + шкура) и подбирает её по снапшоту
while (Date.now() < until) {
  for (const b of bots) b.ws.send(JSON.stringify({ t: 'dev', x: b.x, z: b.z, drop: 'pelt' }));
  await pause(400);
}
for (const b of bots) b.running = false;
await pause(800);
bots[0].stats = null; bots[0].ws.send(JSON.stringify({ t: 'dev', stats: 1 }));
while (!bots[0].stats) await pause(50);
const result = { node: process.version, clients: CLIENTS, seconds: SECONDS, pickups: bots.reduce((s, b) => s + b.picked, 0), pickupErrors: bots.reduce((s, b) => s + b.errors, 0), server: bots[0].stats };
for (const b of bots) b.ws.close();
await pause(300);
srv.kill('SIGTERM');
await new Promise((r) => (srv.exitCode !== null ? r() : srv.once('exit', r)));
fs.rmSync(dir, { recursive: true, force: true });
if (/SERVER_FAULT|SERVER_UNCAUGHT/.test(log)) result.faults = log.split('\n').filter((l) => /SERVER_FAULT|SERVER_UNCAUGHT/.test(l)).slice(0, 5);
console.log(JSON.stringify(result, null, 2));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
