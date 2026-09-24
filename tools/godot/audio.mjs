// Audio recordings with explicit provenance. Normal verification is offline; --fetch restores pinned sources.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { root } from './runtime.mjs';
const bank = path.join(root, 'godot/assets/audio');
const manifest = JSON.parse(fs.readFileSync(path.join(bank, 'manifest.json')));
if (process.argv.includes('--fetch')) {
  const result = spawnSync(process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3'), ['tools/godot/import-audio.py'], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw Error('Audio restore failed');
}
for (const [name, entry] of Object.entries(manifest.files)) {
  if (path.isAbsolute(name) || name.split(/[\\/]/).includes('..')) throw Error('Invalid audio path');
  const data = fs.readFileSync(path.join(bank, name));
  if (crypto.createHash('sha256').update(data).digest('hex') !== entry.sha256) throw Error(`Audio changed: ${name}`);
  if (!manifest.sources[entry.source]?.license || !manifest.sources[entry.source]?.sha256) throw Error(`Missing provenance: ${name}`);
  if (data.length < 100) throw Error(`Empty audio: ${name}`);
}
for (const [name, cue] of Object.entries(manifest.cues)) {
  if (!cue.variants.length || !Number.isFinite(cue.gain_db)) throw Error(`Invalid cue: ${name}`);
  for (const file of cue.variants) if (!manifest.files[file.replace('res://assets/audio/', '')]) throw Error(`Untracked cue: ${file}`);
}
console.log(`AUDIO_OK ${Object.keys(manifest.files).length} pinned samples, ${Object.keys(manifest.cues).length} cues, offline hashes verified`);

if (process.argv.includes('--analyze')) {
  const measured = {};
  for (const name of Object.keys(manifest.files)) {
    const result = spawnSync(process.env.FFMPEG_BIN || 'ffmpeg', ['-hide_banner', '-nostats', '-i', path.join(bank, name), '-af', 'loudnorm=I=-20:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    if (result.error || result.status !== 0) throw Error(`Audio analysis needs ffmpeg: ${name}`);
    const matches = result.stderr.match(/\{\s*"input_i"[\s\S]*?\}/g);
    if (!matches) throw Error(`Missing audio measurements: ${name}`);
    measured[name] = JSON.parse(matches.at(-1));
  }
  fs.mkdirSync(path.join(root, '.native-run'), { recursive: true });
  fs.writeFileSync(path.join(root, '.native-run/audio-audit.json'), JSON.stringify({ files: measured, cues: manifest.cues }, null, 2) + '\n');
  console.log('AUDIO_ANALYZED: .native-run/audio-audit.json (LUFS, true peak, loudness range)');
}
