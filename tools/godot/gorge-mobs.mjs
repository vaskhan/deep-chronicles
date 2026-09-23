import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { godotBinary, run } from './runtime.mjs';
const dir = 'godot/assets/gorge-mobs';
const manifest = JSON.parse(fs.readFileSync(`${dir}/manifest.json`));
const sources = JSON.parse(fs.readFileSync(manifest.sources));
for (const pack of ['quaternius', 'kaykit']) {
  if (sources[pack].license !== 'CC0-1.0' || !fs.existsSync(sources[pack].license_file)) throw Error(`Missing CC0 license: ${pack}`);
  for (const [name, info] of Object.entries(sources[pack].files)) {
    const file = `art/sources/gorge-mobs/${name}`;
    if (crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== info.sha256) throw Error(`Source hash mismatch: ${name}`);
  }
}
for (const [name, sha] of Object.entries(manifest.files)) {
  if (crypto.createHash('sha256').update(fs.readFileSync(`${dir}/${name}`)).digest('hex') !== sha) throw Error(`Asset hash mismatch: ${name}`);
}
for (const [id, model] of Object.entries(manifest.models)) {
  const b = fs.readFileSync(`${dir}/${id}.glb`), j = JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));
  const triangles = j.meshes.reduce((sum,m) => sum+m.primitives.reduce((n,p) => n+j.accessors[p.indices].count/3,0),0);
  if (triangles !== model.triangles || triangles > 15000) throw Error(`Triangle budget/report: ${id}`);
}
for (const name of Object.keys(manifest.files).filter(n => /\.(png|jpg)$/.test(n))) {
  const info = await sharp(`${dir}/${name}`).metadata();
  if (Math.max(info.width,info.height) > 1024) throw Error(`Texture budget: ${name}`);
  if (!fs.readFileSync(`${dir}/${name}.import`,'utf8').includes('mipmaps/generate=true')) throw Error(`Missing mipmaps: ${name}`);
}
await run(godotBinary(), ['--headless', '--path', 'godot', '--editor', '--import', '--quit']);
await run(godotBinary(), [...(process.argv.includes('--headless') ? ['--headless'] : []), '--path', 'godot', '--script', 'res://tests/gorge_models.gd', '--', '--test-mode', ...process.argv.slice(2)]);
