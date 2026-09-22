import { MOVE_SCALE } from '../../src/movement.js';
import { skillRanks, profsFor } from '../../src/progression.js';
import { LOOT } from '../../src/loot.js';
// One source of truth: bake the existing world, catalog and procedural animation
// into engine-neutral files. No server saves or credentials enter this export.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import sharp from 'sharp';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as data from '../../src/data.js';
import { buildProps, obstacles, TOWNS, ZONES, TELEPORTS, CRYPT, DUNGEON, MAP, heightAt } from '../../src/world-core.js';
import { buildHero, buildMob, buildNpc } from '../../src/models.js';
import { MODEL_OF, rigModel } from '../../src/glb.js';
import { calcStats, MAX_ENCH, SAFE_ENCH, ENCH_CHANCE } from '../../src/stats.js';
import { sellPrice, CORPSE } from '../../src/sim.js';
import { newChar } from '../../server/sim/player.js';
import { enhanceHumanoid, enhanceMob } from './art.mjs';
import { artPlacements } from './placements.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'godot/generated');
await fs.mkdir(path.join(out, 'actors'), { recursive: true });
for (const folder of ['icons', 'tex', 'models', 'anims']) {
  await fs.cp(path.join(root, 'public/assets', folder), path.join(out, folder), { recursive: true });
}
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(v => { this.result = v; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(v => { this.result = `data:${blob.type};base64,${Buffer.from(v).toString('base64')}`; this.onloadend?.(); }); }
};
globalThis.ProgressEvent = class extends Event { constructor(type, options) { super(type); Object.assign(this, options); } };
const shapes = [];
let material = 'plain';
const props = buildProps({ use(k) { material = k; }, add(shape, color, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) { shapes.push([shape, color, x, y, z, ry, sx, sy, sz, material]); } });
const presentation = artPlacements(shapes, TOWNS, CRYPT);
const terrain = { start: -1000, step: 4, count: 501 };
const h = Buffer.alloc(terrain.count ** 2 * 4);
for (let z = 0; z < terrain.count; z++) for (let x = 0; x < terrain.count; x++) h.writeFloatLE(heightAt(terrain.start + x * terrain.step, terrain.start + z * terrain.step), (z * terrain.count + x) * 4);
await fs.writeFile(path.join(out, 'heights.bin'), h);
await fs.writeFile(path.join(out, 'world.json'), JSON.stringify({ ...props, ...presentation, obstacles, towns: TOWNS, zones: ZONES, teleports: TELEPORTS, crypt: CRYPT, dungeon: DUNGEON, map: MAP, terrain }));
await fs.writeFile(path.join(out, 'catalog.json'), JSON.stringify({ ...Object.fromEntries(Object.entries(data).filter(([, v]) => typeof v !== 'function')), UI_RULES: { corpse: CORPSE, movementScale: MOVE_SCALE, skillRanks: Object.fromEntries(Object.keys(data.SKILLS).map(id => [id, skillRanks(id)])), loot: LOOT, previewCharacters: Object.fromEntries(Object.keys(data.CLASSES).map(cls => [cls, newChar("Предпросмотр", cls)])), maxEnch: MAX_ENCH, safeEnch: SAFE_ENCH, enchChance: ENCH_CHANCE, sellPrices: Object.fromEntries(Object.entries(data.ITEMS).map(([id, item]) => [id, sellPrice(item)])) } }));

// Bake the exact existing procedural animations into standard glTF clips.
delete MODEL_OF['Маг'];
function nameParts(g) {
  let i = 0; g.traverse(n => { n.name = `part_${i++}`; });
  for (const [role, node] of Object.entries(g.userData.parts || {})) node.name = ({ armL: 'arm_left', armR: 'arm_right', legL: 'leg_left', legR: 'leg_right' })[role] || role;
  if (g.userData.weapon) g.userData.weapon.name = 'weapon';
  if (g.userData.hands) {
    const [upper, left, right] = g.children;
    upper.name = 'upper'; left.name = 'leg_left'; right.name = 'leg_right';
    const [body, trim, head, helm, armL, armR] = upper.children;
    for (const [n, name] of [[body, 'body'], [trim, 'trim'], [head, 'head'], [helm, 'helmet'], [armL, 'arm_left'], [armR, 'arm_right'], [g.userData.hands.weapon, 'weapon'], [g.userData.hands.shield, 'shield']]) n.name = name;
    body.material.name = 'body'; helm.children[0].material.name = 'helmet';
    left.children[0].material.name = 'legs'; left.children[1].material.name = 'feet';
    armL.children[1].material.name = 'gloves';
    g.userData.hands.shield.material.name = 'shield';
  }
}
async function bake(name, g) {
  nameParts(g);
  const nodes = []; g.traverse(n => nodes.push(n));
  const clips = [];
  for (const [kind, duration] of [['idle', 3.49], ['walk', 0.698], ['attack', 0.6], ['cast', 1.05]]) {
    const count = Math.ceil(duration * 24), times = Array.from({ length: count + 1 }, (_, i) => duration * i / count);
    const tracks = nodes.map(n => ({ n, p: [], q: [], s: [] }));
    for (const t of times) {
      g.userData.anim?.(t, { moving: kind === 'walk', attackT: kind === 'attack' ? 1 - t / duration : 0, casting: kind === 'cast' });
      for (const a of tracks) { a.p.push(...a.n.position); a.q.push(...a.n.quaternion); a.s.push(...a.n.scale); }
    }
    const all = tracks.flatMap(a => [new THREE.VectorKeyframeTrack(`${a.n.name}.position`, times, a.p), new THREE.QuaternionKeyframeTrack(`${a.n.name}.quaternion`, times, a.q), new THREE.VectorKeyframeTrack(`${a.n.name}.scale`, times, a.s)]);
    clips.push(new THREE.AnimationClip(kind, duration, all));
  }
  g.userData.anim?.(0, { moving: false, attackT: 0, casting: false });
  // Functions/circular references aren't portable glTF metadata.
  g.traverse(n => { n.userData = {}; if (n.isMesh && !n.material.isMeshStandardMaterial) {
    const old = n.material;
    n.material = new THREE.MeshStandardMaterial({ color: old.color, roughness: 0.85, metalness: 0, transparent: old.transparent, opacity: old.opacity, emissive: old.emissive, emissiveIntensity: old.emissiveIntensity });
    n.material.name = old.name;
  } });
  const result = await new GLTFExporter().parseAsync(g, { binary: true, animations: clips, onlyVisible: false });
  await fs.writeFile(path.join(out, 'actors', `${name}.glb`), Buffer.from(result));
}
for (const [id, cls] of Object.entries(data.CLASSES)) await bake(id, enhanceHumanoid(buildHero(cls), id));
// Preserve the existing generated mage, including its texture and the same
// articulated mesh segmentation used by the browser client. Decode textures in
// Godot, so this offline exporter needs no DOM/canvas shim.
{
  const file = await fs.readFile(path.join(root, 'public/assets/models/mage_mystic_anime.glb'));
  const jsonLength = file.readUInt32LE(12);
  const document = JSON.parse(file.subarray(20, 20 + jsonLength).toString());
  const bin = file.subarray(28 + jsonLength);
  for (const [i, image] of (document.images || []).entries()) {
    const view = document.bufferViews[image.bufferView];
    await sharp(bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength)).png().toFile(path.join(out, 'actors', `mage_texture_${i}.png`));
  }
  for (const mat of document.materials || []) {
    for (const key of ['normalTexture', 'occlusionTexture', 'emissiveTexture']) delete mat[key];
    if (mat.pbrMetallicRoughness) { delete mat.pbrMetallicRoughness.baseColorTexture; delete mat.pbrMetallicRoughness.metallicRoughnessTexture; }
    mat.name = 'mage_art';
  }
  delete document.images; delete document.textures; delete document.samplers;
  document.buffers[0].uri = `data:application/octet-stream;base64,${bin.toString('base64')}`;
  const loaded = await new GLTFLoader().parseAsync(JSON.stringify(document), '');
  loaded.scene.updateMatrixWorld(true);
  const model = rigModel(loaded.scene);
  const staff = buildHero(data.CLASSES.mage).userData.hands.weapon;
  staff.position.set(0.13, -0.54, 0.1); staff.rotation.x = 13 * Math.PI / 180;
  model.userData.parts.armR?.add(staff);
  staff.name = 'weapon';
  model.userData.weapon = staff;
  await bake('mage_generated', model);
}
for (const [id, def] of Object.entries(data.MOBS)) await bake(id, enhanceMob(buildMob(def), id, def));
await bake('npc', enhanceHumanoid(buildNpc(0xd09030), 'npc'));

// Golden profiles exercise the native display calculation against JS rules.
const fixtures = [];
for (const cls of Object.keys(data.CLASSES)) for (const lvl of [1, 8, 18, 40]) for (const set of ['none', ...Object.keys(data.SETS)]) {
  // Профессии входят в набор эталонов: множители характеристик обязан повторять и клиентский предпросмотр.
  for (const prof of [null, ...profsFor(cls).map(x => x.id)]) {
    const p = { cls, lvl, prof, inv: [{ id: 'potion_hp', n: 25 }], equip: Object.fromEntries(data.SLOTS.map(s => [s.id, null])), enc: {} };
    p.equip.weapon = cls === 'mage' ? 'staff_crystal' : 'sword_crystal'; p.enc.weapon = lvl % 7;
    for (const id of data.SETS[set]?.parts || []) { p.equip[data.ITEMS[id].slot] = id; p.enc[data.ITEMS[id].slot] = 4; }
    fixtures.push({ p, stats: calcStats(p) });
  }
}
await fs.writeFile(path.join(out, 'stats-fixtures.json'), JSON.stringify(fixtures));
console.log(`Godot: ${shapes.length} objects, ${props.spawns.length} spawns, ${obstacles.length} obstacles, ${fixtures.length} stat fixtures exported.`);
