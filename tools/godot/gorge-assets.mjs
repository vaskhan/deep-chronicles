// Закреплённые CC0-сканы и PBR-карты ущелья: хеши, mipmaps и импорт LOD.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { root } from './runtime.mjs';
const folder = path.join(root, 'godot/assets/gorge');
const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'));
for (const [name, file] of Object.entries(manifest.files)) {
  if (path.basename(name) !== name) throw Error(`Invalid path: ${name}`);
  const source = manifest.sources[file.source];
  if (!source?.page || source.license !== 'CC0-1.0') throw Error(`Missing provenance: ${name}`);
  const bytes = fs.readFileSync(path.join(folder, name));
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw Error(`Changed asset: ${name}`);
  const settings = fs.readFileSync(path.join(folder, name + '.import'), 'utf8');
  if (/\.(jpg|png)$/.test(name) && !settings.includes('mipmaps/generate=true')) throw Error(`Missing mipmaps: ${name}`);
  if (name.endsWith('.glb') && !settings.includes('meshes/generate_lods=true')) throw Error(`Missing LOD: ${name}`);
}
console.log(`GORGE_ASSETS_OK ${Object.keys(manifest.files).length} files, CC0 provenance, SHA-256, mipmaps and LOD`);
