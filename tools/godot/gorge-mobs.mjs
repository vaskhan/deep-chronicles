import fs from 'node:fs';
import crypto from 'node:crypto';
import { godotBinary, run } from './runtime.mjs';
const dir = 'godot/assets/gorge-mobs';
const manifest = JSON.parse(fs.readFileSync(`${dir}/manifest.json`));
for (const [name, sha] of Object.entries(manifest.files)) {
  if (crypto.createHash('sha256').update(fs.readFileSync(`${dir}/${name}`)).digest('hex') !== sha) throw Error(`Asset hash mismatch: ${name}`);
}
for (const [id, model] of Object.entries(manifest.models)) if (model.triangles > 15000) throw Error(`Triangle budget: ${id}`);
await run(godotBinary(), ['--headless', '--path', 'godot', '--editor', '--import', '--quit']);
await run(godotBinary(), [...(process.argv.includes('--headless') ? ['--headless'] : []), '--path', 'godot', '--script', 'res://tests/gorge_models.gd', '--', '--test-mode', ...process.argv.slice(2)]);
