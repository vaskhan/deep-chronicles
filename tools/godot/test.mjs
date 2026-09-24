import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { godotBinary, root, run } from './runtime.mjs';

const built = process.argv.includes('--built');
const binary = built ? path.join(root, process.platform === 'win32' ? 'godot/builds/windows/Хроники Глубин.exe' : 'godot/builds/macos/Хроники Глубин.app/Contents/MacOS/Хроники Глубин') : godotBinary();
if (!built) {
  await run(process.execPath, ['tools/godot/export.mjs']);
  await run(binary, ['--headless', '--path', 'godot', '--editor', '--import', '--quit']);
  // Run geometric regressions before the network smoke test, also in CI.
  for (const name of ['harbor_assets','shop_access','temple_access','temple_stairs','hero_detail','shop_camera','shop_signs','combat_flow']) {
    await geometryTest(name);
  }
}
const probe = net.createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicles-native-'));
const server = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: { ...process.env, PORT: String(port), DB: path.join(dir, 'test.db'), DEV_CMD: '1', AUTH_TRIES: '1000' }, stdio: ['ignore', 'pipe', 'pipe'] });
let godot;
let serverOutput = '';
for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { serverOutput += chunk; });
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Test server startup timeout')), 10000);
    server.once('error', reject); server.once('exit', () => reject(new Error('Test server exited')));
    server.stdout.once('data', () => { clearTimeout(timer); resolve(); });
    server.stderr.on('data', chunk => process.stderr.write(chunk));
  });
  const flags = process.argv.includes('--headless') ? ['--headless'] : [];
  const artifacts = path.join(root, '.native-run', process.argv.includes('--touch') ? 'test-touch-artifacts' : 'test-artifacts');
  fs.mkdirSync(artifacts, { recursive: true });
  godot = spawn(binary, [...flags, ...(!built ? ['--path', 'godot'] : []), '--max-fps', '60', '--', '--test-mode', '--self-test', `--server=ws://127.0.0.1:${port}`, `--artifacts=${artifacts}`, ...(process.argv.includes('--touch') ? ['--touch'] : []), ...(process.argv.includes('--gorge-bench') ? ['--gorge-bench'] : [])], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  for (const stream of [godot.stdout, godot.stderr]) stream.on('data', b => { output += b; process.stdout.write(b); });
  const code = await new Promise((resolve, reject) => {
    // 150 с: шаг Громового ущелья (перенос, элита, стая, водопад) добавил к прогону около 20 с.
    const timer = setTimeout(() => { godot.kill(); reject(new Error('Native smoke test timeout')); }, process.argv.includes('--gorge-bench') ? 270000 : 150000);
    godot.on('error', reject); godot.on('exit', code => { clearTimeout(timer); resolve(code); });
  });
  fs.mkdirSync(path.join(root, '.native-run'), { recursive: true });
  fs.writeFileSync(path.join(root, '.native-run', 'test.log'), output);
  if (code !== 0 || !output.includes('failures=0') || /ERROR:|FAIL:|WARNING:/.test(output) || /(?:^|\n)(?:Error:|TypeError:|ReferenceError:|FATAL)|UnhandledPromiseRejection|SQLITE_[A-Z]+/.test(serverOutput)) throw new Error('Native smoke test failed');
} finally {
  fs.mkdirSync(path.join(root, '.native-run'), { recursive: true });
  fs.writeFileSync(path.join(root, '.native-run', 'test-server.log'), serverOutput);
  godot?.kill(); server.kill();
  await new Promise(resolve => server.exitCode !== null ? resolve() : server.once('exit', resolve));
  fs.rmSync(dir, { recursive: true, force: true });
}

async function geometryTest(name) {
  const child = spawn(binary, ['--headless', '--path', 'godot', '--script', `res://tests/${name}.gd`], {cwd: root, stdio: ['ignore','pipe','pipe']});
  let output = '';
  for (const stream of [child.stdout,child.stderr]) stream.on('data', chunk => {output += chunk; process.stdout.write(chunk);});
  await new Promise((resolve,reject) => {
    const timer = setTimeout(() => {child.kill(); reject(new Error(`Geometry test timed out: ${name}`));},60000);
    child.on('error',error => {clearTimeout(timer);reject(error);});
    child.on('exit',code => {
      clearTimeout(timer);
      if(code!==0 || /SCRIPT ERROR:|ERROR:|WARNING:/.test(output) || !output.includes(`${name.toUpperCase()}_OK`)) reject(new Error(`Geometry test failed: ${name}`));
      else resolve();
    });
  });
}
