// Иконки интерфейса: умения, предметы, зелья → public/assets/icons/<id>.png (256², прозрачный фон).
// node tools/gen-icons.mjs                 — всё, чего ещё нет
// node tools/gen-icons.mjs fire_bolt heal  — только эти
// node tools/gen-icons.mjs --skills        — группа: --skills | --items | --potions
// node tools/gen-icons.mjs --force ...     — перерисовать поверх существующих
// Нужен OPENROUTER_API_KEY в .env. Модель: IMG_MODEL (по умолчанию google/gemini-3.1-flash-image).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { drawImage, KEY } from './ai.mjs';
import { SKILLS, ITEMS, SHOP } from '../src/data.js';

const OUT = 'public/assets/icons';
const SIZE = 256;

// единый стиль: то же аниме, что у моделей, но плоско и по центру — иконка читается в 32 px
const BASE = 'Single game UI icon, anime style (cel-shaded, bold clean lineart, vivid saturated colors, soft inner glow), '
  + 'centered single object filling the frame with small margin, flat front view, no perspective, no background scene, '
  + 'plain flat pure white background, no text, no letters, no frame, no border, no shadow on the ground, crisp readable silhouette. ';

// описания по видам умений: цвет стихии задаёт настроение иконки
const SKILL_ART = {
  power_strike: 'A heavy steel sword slamming down with an orange impact shockwave.',
  battle_cry: 'A roaring warrior helmet with red battle aura waves radiating outward.',
  whirlwind: 'A golden spinning tornado of swirling blades.',
  fire_bolt: 'A blazing orange-red fireball with a comet trail of flames.',
  heal: 'A glowing green cross of light with soft sparkles and a leaf motif.',
  ice_nova: 'A burst of pale blue ice crystals radiating from a frozen center.',
  // Умения профессий. Пока в игре показываются иконки-семейства из поля SKILLS[id].icon;
  // эти описания нужны, чтобы отрисовать собственные иконки отдельным запуском.
  shield_bash: 'A round steel shield slamming forward with a pale blue impact ring.',
  iron_will: 'A steel-grey tower shield crossed by glowing runes of endurance.',
  frenzy: 'A snarling red battle aura around two crossed axes, wild sparks.',
  cleave: 'A wide curved orange slash arc cutting across the frame.',
  lightning: 'A branching pale blue lightning bolt with crackling arcs.',
  meteor: 'A burning orange meteor falling with a fiery tail and ember trail.',
  heal_major: 'A large radiant green cross of light inside a soft halo of petals.',
  blessing: 'A golden shield-shaped sigil of light with warm rising sparks.',
};

const grade = (it) => (it.grade && it.grade !== 'none' ? `, ${{ d: 'uncommon green', c: 'rare blue', b: 'epic purple' }[it.grade]} magic glow` : '');

// предмет → короткое описание: берём русское имя и слот, цвет из данных
function itemArt(id, it) {
  const kind = {
    weapon: id.startsWith('staff') ? 'a magic wooden staff with a glowing gem on top, vertical' : 'a sword, blade pointing up',
    shield: 'a shield, front view',
    head: /apprentice|mystic/.test(id) ? 'a pointed wizard hat' : 'a metal helmet, front view',
    armor: /robe/.test(id) ? 'a long mage robe on invisible body, front view' : 'a chest armor piece, front view',
    legs: 'armored leg greaves, front view',
    gloves: 'a pair of gloves, front view',
    feet: 'a pair of boots, front view',
    ear: 'a single ornate earring',
    neck: 'an ornate necklace with a gem',
    ring: 'a single ornate ring with a gem',
  }[it.slot] || 'a fantasy item';
  const color = it.color !== undefined ? `, main color #${it.color.toString(16).padStart(6, '0')}` : '';
  return `Fantasy RPG inventory icon: ${kind}${color}${grade(it)}. Item name for reference: ${it.name}.`;
}

const POTION_ART = {
  potion_hp: 'A round glass flask with glowing red healing liquid and a cork.',
  potion_mp: 'A round glass flask with glowing blue mana liquid and a cork.',
  scroll_return: 'A rolled parchment scroll with a violet glowing rune seal.',
};

// что рисуем: id → промпт
export function allIcons() {
  const out = {};
  for (const [id, s] of Object.entries(SKILLS)) out[id] = { group: 'skills', art: SKILL_ART[id] || `A fantasy spell icon: ${s.name}.` };
  for (const [id, it] of Object.entries(ITEMS)) out[id] = { group: 'items', art: itemArt(id, it) };
  for (const id of Object.keys(SHOP || {})) if (POTION_ART[id]) out[id] = { group: 'potions', art: POTION_ART[id] };
  for (const [id, art] of Object.entries(POTION_ART)) out[id] ||= { group: 'potions', art };
  return out;
}

// белый фон → прозрачность: иконка ложится на любую панель
async function cutWhite(buf) {
  const img = sharp(buf).resize(SIZE, SIZE, { fit: 'contain', background: '#fff' }).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const m = Math.min(r, g, b);
    if (m > 244) data[i + 3] = 0; // почти белый — прочь
    else if (m > 226) data[i + 3] = Math.round((244 - m) / 18 * 255); // край — мягкая граница
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

async function generate(id, art) {
  const { png, cost } = await drawImage(BASE + art);
  fs.writeFileSync(path.join(OUT, id + '.png'), await cutWhite(png));
  return cost;
}

const list = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)).sort();

// контактный лист: смотрим глазами до того, как иконки уедут в игру
function preview(icons) {
  const cards = Object.entries(icons).map(([id, { group }]) =>
    `<figure class="${group}"><img src="${id}.png" alt=""><figcaption>${id}<small>${group}</small></figcaption></figure>`).join('');
  fs.writeFileSync(path.join(OUT, '_preview.html'),
    `<!doctype html><meta charset="utf-8"><title>Иконки</title>
<style>body{margin:0;padding:24px;background:#14161c;color:#dfe3ee;font:13px ui-sans-serif,system-ui}
h1{font-size:14px;text-transform:uppercase;letter-spacing:.04em;color:#8992a8}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:14px}
figure{margin:0;padding:10px;background:#1c1f28;border:1px solid #2c3040;border-radius:10px;text-align:center}
img{width:96px;height:96px;image-rendering:auto;background:repeating-conic-gradient(#23262f 0 25%,#1a1d25 0 50%) 0/16px 16px}
figcaption{margin-top:8px;font-size:11px;word-break:break-all}small{display:block;color:#8992a8}</style>
<h1>Иконки · ${Object.keys(icons).length}</h1><div class="grid">${cards}</div>`);
}

if (process.argv[1].endsWith('gen-icons.mjs')) {
  if (!KEY) throw new Error('нет OPENROUTER_API_KEY в .env');
  fs.mkdirSync(OUT, { recursive: true });
  const icons = allIcons();
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const groups = args.filter((a) => a.startsWith('--') && a !== '--force').map((a) => a.slice(2));
  const ids = args.filter((a) => !a.startsWith('--'));
  let todo = Object.keys(icons);
  if (ids.length) todo = ids;
  else if (groups.length) todo = todo.filter((id) => groups.includes(icons[id].group));
  if (!force && !ids.length) todo = todo.filter((id) => !fs.existsSync(path.join(OUT, id + '.png')));

  let total = 0, done = 0;
  for (let i = 0; i < todo.length; i += 5) { // по пять за раз: быстрее и не ловим лимиты
    await Promise.all(todo.slice(i, i + 5).map(async (id) => {
      for (let k = 0; k < 2; k++) {
        try { total += await generate(id, icons[id].art); console.log(`✓ ${id}`); done++; return; }
        catch (e) { if (k) console.log(`✗ ${id}: ${e.message}`); }
      }
    }));
  }
  preview(icons);
  const have = list(OUT);
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(have));
  console.log(`готово: ${done} из ${todo.length}, $${total.toFixed(2)}\nпосмотреть: open ${OUT}/_preview.html`);
}
