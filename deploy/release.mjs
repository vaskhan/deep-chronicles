// Validate the exact tested input/output hashes, then stage and promote atomically per component.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { root } from '../tools/godot/runtime.mjs';
import { validateRelease } from '../tools/godot/release-contract.mjs';
for (const arg of process.argv.slice(2)) if (arg !== '--verified') throw Error(`Unknown deploy option: ${arg}`);
const host = process.env.DEPLOY_HOST;
if (!host || host.startsWith('-') || /[\s\x00-\x1f]/.test(host)) throw Error('Set DEPLOY_HOST in .env or the environment');
const safe = value => String(value).replaceAll(host, '[deployment host]').replaceAll(host.split('@').at(-1), '[deployment host]');
async function run(command, args) {
  const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => process.stdout.write(safe(data)));
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
  if (code !== 0) throw Error(`Release step failed: ${command} (${code})`);
}
if (!process.argv.includes('--verified')) await run(process.execPath, ['tools/godot/verify.mjs', '--headless', '--offline', '--release']);
const report = JSON.parse(fs.readFileSync(path.join(root, '.native-run/verification/report.json'), 'utf8'));
validateRelease(root, report);
const id = `${report.commit.slice(0, 12)}-${new Date().toISOString().replace(/[-:.]/g, '')}`;
const remote = `/opt/realms/releases/${id}`;
await run('ssh', ['-o', 'BatchMode=yes', host, `mkdir -p '${remote}'`]);
for (const dir of ['server', 'src', 'dist']) await run('rsync', ['-az', '--exclude', 'data', `${dir}/`, `${host}:${remote}/${dir}/`]);
// Образ собирается на сервере из этих же файлов: архитектура рабочей станции не навязывается прод-хосту.
await run('rsync', ['-az', 'package.json', 'package-lock.json', 'Dockerfile', 'docker-compose.yml', '.dockerignore', 'deploy/promote.sh', `${host}:${remote}/`]);
await run('ssh', ['-o', 'BatchMode=yes', host, `bash '${remote}/promote.sh' '${remote}'`]);
await run(process.execPath, ['tools/godot/probe.mjs', '--require-native', '--require-party']);
fs.writeFileSync(path.join(root, '.native-run/deployment.json'), JSON.stringify({ id, commit: report.commit, verified: report.finished, promoted: new Date().toISOString(), groundLoot: 1, progression: 1, nativeOnly: 1 }, null, 2) + '\n');
console.log(`Deployment verified: ${id}`);
