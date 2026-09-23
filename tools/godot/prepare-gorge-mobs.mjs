// Local, reproducible CC0 pipeline. GLTF_TRANSFORM_BIN points to gltf-transform 4.5.0.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
const run = (bin, args) => { const r = spawnSync(bin, args, { stdio: 'inherit' }); if (r.error) throw r.error; if (r.status !== 0) throw Error(`${bin}: ${r.status}`); };
const cli = process.env.GLTF_TRANSFORM_BIN || 'gltf-transform';
const v = spawnSync(cli, ['--version'], { encoding: 'utf8' });
if (v.status !== 0 || !v.stdout.includes('4.5.0')) throw Error('Requires gltf-transform 4.5.0 (GLTF_TRANSFORM_BIN)');
run(process.env.BLENDER_BIN || 'blender', ['-b', '--python-exit-code', '1', '-P', 'tools/godot/prepare-gorge-mobs.py']);
const dir = 'godot/assets/gorge-mobs';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gorge-mobs-'));
const report = { sources: 'art/sources/gorge-mobs/sources.json', models: {}, files: {} };
try {
  for (const id of ['fang_warrior', 'fang_shaman', 'stone_guard']) {
    const file = `${dir}/${id}.glb`, out = path.join(temp, `${id}.glb`);
    run(cli, ['optimize', file, out, '--compress', 'false', '--flatten', 'false', '--join', 'false', '--instance', 'false', '--palette', 'false', '--prune', 'false', '--simplify', 'false', '--texture-size', '1024']);
    fs.copyFileSync(out, file);
    const b = fs.readFileSync(file), length = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + length));
    const bin = b.subarray(28 + length);
    // Godot keeps previously extracted embedded images. Replace them explicitly on rebuild.
    for (const image of j.images || []) {
      const view = j.bufferViews[image.bufferView], ext = image.mimeType === 'image/png' ? 'png' : 'jpg';
      fs.writeFileSync(`${dir}/${id}_${image.name}.${ext}`, bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength));
    }
    report.models[id] = { triangles: j.meshes.reduce((sum, m) => sum + m.primitives.reduce((n, p) => n + j.accessors[p.indices].count / 3, 0), 0), bytes: b.length, rig: 'canonical', textureMax: 1024 };
  }
  for (const name of fs.readdirSync(dir).filter(n => /\.(glb|png|jpg)$/.test(n))) report.files[name] = crypto.createHash('sha256').update(fs.readFileSync(`${dir}/${name}`)).digest('hex');
  fs.writeFileSync(`${dir}/manifest.json`, JSON.stringify(report, null, 2) + '\n');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
