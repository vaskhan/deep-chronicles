import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { godotBinary, root, run } from './runtime.mjs';

const args = process.argv.slice(2);
const useBuilt = args.includes('--built');
const built = path.join(root, process.platform === 'win32' ? 'godot/builds/windows/Хроники Глубин.exe' : 'godot/builds/macos/Хроники Глубин.app/Contents/MacOS/Хроники Глубин');
if (useBuilt && args.includes('--editor')) throw Error('--built and --editor are mutually exclusive');
if (useBuilt && !fs.existsSync(built)) throw Error('Built application missing; run native:build for this platform first');
const binary = useBuilt ? built : godotBinary();
const runtime = path.join(root, '.native-run');
fs.mkdirSync(runtime, { recursive: true });
const url = args.find(a => a.startsWith('--server='))?.slice(9) || (args.includes('--local') ? 'ws://127.0.0.1:8790' : 'wss://realms.neuraldeep.ru/ws');
const ready = () => new Promise(resolve => {
  const socket = new WebSocket(url);
  const timer = setTimeout(() => { socket.terminate(); resolve(false); }, 1500);
  socket.on('error', () => { clearTimeout(timer); resolve(false); });
  socket.on('message', raw => {
    let message; try { message = JSON.parse(raw); } catch { return; }
    if (message.t !== 'hi') return;
    clearTimeout(timer); socket.close(); resolve(true);
  });
});
if (!useBuilt && !args.includes('--skip-assets')) {
  await run(process.execPath, ['tools/godot/export.mjs']);
  await run(binary, ['--headless', '--path', 'godot', '--editor', '--import', '--quit']);
}
const parsed = new URL(url);
if (!['ws:', 'wss:'].includes(parsed.protocol)) throw new Error('Адрес сервера должен начинаться с ws:// или wss://');
const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
if (local && !(await ready())) {
  const log = fs.openSync(path.join(runtime, 'server.log'), 'a');
  const env = { ...process.env, PORT: parsed.port || '8790', DB: path.join(runtime, 'world.db'), HOST: parsed.hostname === '[::1]' ? '::1' : '127.0.0.1' };
  delete env.DEV_CMD;
  const server = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, detached: true, stdio: ['ignore', log, log], env });
  server.unref(); fs.closeSync(log);
  fs.writeFileSync(path.join(runtime, 'server.pid'), String(server.pid));
  let connected = false;
  for (let i = 0; i < 30; i++) { if (await ready()) { connected = true; break; } await new Promise(r => setTimeout(r, 200)); }
  if (!connected) throw new Error('Сервер не запустился: .native-run/server.log');
}
const extra = args.filter(a => !['--skip-assets', '--editor', '--built', '--foreground', '--local'].includes(a) && !a.startsWith('--server='));
const options = useBuilt ? [] : ['--path', path.join(root, 'godot')];
if (args.includes('--editor')) options.push('--editor');
options.push('--', `--server=${url}`);
if (!args.includes('--editor')) options.push(local ? '--quick-start' : '--resume');
options.push(...extra);
if (args.includes('--foreground')) await run(useBuilt ? built : binary, options);
else {
  const log = fs.openSync(path.join(runtime, 'client.log'), 'w');
  const game = spawn(useBuilt ? built : binary, options, { cwd: root, detached: true, stdio: ['ignore', log, log] });
  game.unref(); fs.closeSync(log); fs.writeFileSync(path.join(runtime, 'client.pid'), String(game.pid));
  console.log(`Игра запущена (PID ${game.pid}). Сервер: ${url}\n${local ? 'Локальные сохранения: .native-run/world.db\n' : 'Персонажи и прогресс загружаются с основного сервера.\n'}Логи: .native-run/client.log`);
}
