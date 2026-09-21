// Линтер сцены: молчаливые ошибки графики (нормали, свет, материалы) без сервера.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { godotBinary, root, run } from './runtime.mjs';

const strict = process.argv.includes('--strict');
if (!process.argv.includes('--skip-assets')) {
  await run(process.execPath, ['tools/godot/export.mjs']);
  await run(godotBinary(), ['--headless', '--path', 'godot', '--editor', '--import', '--quit']);
}
let output = '';
const code = await new Promise((resolve, reject) => {
  const child = spawnLint();
  const timer = setTimeout(() => { child.kill(); reject(new Error('Scene lint timeout')); }, 120000);
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output += chunk; process.stdout.write(chunk); });
  child.on('error', reject);
  child.on('exit', value => { clearTimeout(timer); resolve(value); });
});
fs.mkdirSync(path.join(root, '.native-run'), { recursive: true });
fs.writeFileSync(path.join(root, '.native-run', 'scene-lint.log'), output);
if (code !== 0 || !output.includes('SCENE_LINT_OK failures=0')) throw new Error('Scene lint failed');
console.log('SCENE_LINT_PASSED');

function spawnLint() {
  return spawn(godotBinary(), ['--headless', '--path', 'godot', '--max-fps', '60', '--',
    '--test-mode', '--scene-lint', ...(strict ? ['--strict'] : [])], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
}
