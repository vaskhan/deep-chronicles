// Серверные коэффициенты (рейты): одна таблица множителей наград и расходов.
// Модуль чистый — без DOM, three.js и файловой системы; его одинаково читают сервер,
// экономический расчёт и юнит-тесты. Все значения по умолчанию равны 1: настройки
// «из коробки» обязаны повторять текущий баланс один в один (проверяется тестом).
// Источник значений на сервере — server/rates.js (файл + переменные окружения).
import { SAFE_ENCH, ENCH_CHANCE } from './stats.js';

export const formatRate = (value) => `×${(+value.toFixed(4)).toLocaleString('ru-RU')}`;

// Описание каждого коэффициента: значение по умолчанию, предел, тип, куда применяется
// и как он выглядит в журнале сервера.
export const RATE_KEYS = Object.freeze({
  xp: { def: 1, min: 0.1, max: 100, label: 'опыт', where: 'опыт за убийство моба (до дележа в группе)' },
  sp: { def: 1, min: 0.1, max: 100, label: 'SP', where: 'SP за убийство моба (до дележа в группе)' },
  coins: { def: 1, min: 0.1, max: 100, label: 'монеты', where: 'монеты, выпадающие с моба' },
  dropChance: { def: 1, min: 0.1, max: 100, label: 'шанс дропа', where: 'шанс выпадения вещей; гарантированный дроп остаётся гарантированным при полном множителе уровня' },
  dropAmount: { def: 1, min: 1, max: 100, integer: true, label: 'количество дропа', where: 'сколько штук каждой выпавшей вещи' },
  craftCost: { def: 1, min: 0.1, max: 100, label: 'цена крафта', where: 'монеты и материалы в рецептах изготовления' },
  enchantChance: { def: 1, min: 0.1, max: 10, label: 'шанс заточки', where: 'шанс успеха заточки выше безопасной ступени' },
  sellPrice: { def: 1, min: 0.1, max: 100, label: 'цена продажи', where: 'сколько платит NPC за вещь' },
  buyPrice: { def: 1, min: 0.1, max: 100, label: 'цена покупки', where: 'сколько NPC просит за товар' },
  respawn: { def: 1, min: 0.1, max: 100, label: 'респавн', where: 'скорость возрождения мобов: время делится на этот множитель' },
  partyBonus: { def: 1, min: 1, max: 2, label: 'бонус группы', where: 'надбавка к XP/SP за каждого дополнительного участника группы' },
  levelGap4: { def: 0.9, min: 0, max: 1, label: 'разница 4', where: 'множитель награды при разнице уровней 4', text: (v) => `разница 4 ${formatRate(v)}` },
  levelGap5: { def: 0.75, min: 0, max: 1, label: 'разница 5', where: 'множитель награды при разнице уровней 5', text: (v) => `разница 5 ${formatRate(v)}` },
  levelGap6: { def: 0.55, min: 0, max: 1, label: 'разница 6', where: 'множитель награды при разнице уровней 6', text: (v) => `разница 6 ${formatRate(v)}` },
  levelGap7: { def: 0.35, min: 0, max: 1, label: 'разница 7', where: 'множитель награды при разнице уровней 7', text: (v) => `разница 7 ${formatRate(v)}` },
  levelGap8: { def: 0.2, min: 0, max: 1, label: 'разница 8', where: 'множитель награды при разнице уровней 8', text: (v) => `разница 8 ${formatRate(v)}` },
  levelGap9: { def: 0.08, min: 0, max: 1, label: 'разница 9', where: 'множитель награды при разнице уровней 9', text: (v) => `разница 9 ${formatRate(v)}` },
  levelGapAffectsCoins: { def: 1, bool: true, label: 'штраф уровня на монеты',
    where: 'распространять ли штраф за разницу уровней на монеты', text: (v) => `штраф уровня на монеты: ${v ? 'да' : 'нет'}` },
  levelGapAffectsDrop: { def: 1, bool: true, label: 'штраф уровня на дроп',
    where: 'распространять ли штраф за разницу уровней на шанс дропа', text: (v) => `штраф уровня на дроп: ${v ? 'да' : 'нет'}` },
});

export const RATE_NAMES = Object.freeze(Object.keys(RATE_KEYS));
export const DEFAULT_RATES = Object.freeze(Object.fromEntries(RATE_NAMES.map((k) => [k, RATE_KEYS[k].def])));

// Переключатели хранятся числами 0/1: настройки остаются однородным JSON и уезжают клиенту как есть.
const TRUE_WORDS = ['1', 'true', 'yes', 'on', 'да'], FALSE_WORDS = ['0', 'false', 'no', 'off', 'нет'];
function parseSwitch(value) {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value === 1 ? 1 : value === 0 ? 0 : null;
  if (typeof value !== 'string') return null;
  const word = value.trim().toLowerCase();
  return TRUE_WORDS.includes(word) ? 1 : FALSE_WORDS.includes(word) ? 0 : null;
}
const clampRate = (value, spec) => {
  const limited = Math.min(spec.max, Math.max(spec.min, value));
  return spec.integer ? Math.round(limited) : +limited.toFixed(4);
};

// Разбор «сырых» настроек: строки из окружения, числа из JSON, мусор.
// Никогда не бросает исключение — непонятное значение заменяется единицей с предупреждением.
export function normalizeRates(raw = {}) {
  const rates = { ...DEFAULT_RATES }, warnings = [];
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  if (raw && source !== raw) warnings.push('Настройки рейтов должны быть объектом — взяты значения по умолчанию');
  for (const [key, value] of Object.entries(source)) {
    if (!Object.hasOwn(RATE_KEYS, key)) { warnings.push(`Неизвестный коэффициент «${key}» — пропущен`); continue; }
    const spec = RATE_KEYS[key];
    if (spec.bool) {
      const flag = parseSwitch(value);
      if (flag === null) warnings.push(`${key}: «${value}» не «да» и не «нет» — оставлено ${spec.def ? 'включённым' : 'выключенным'}`);
      else rates[key] = flag;
      continue;
    }
    // null, true, [] и прочее к числу не приводим: молчаливый 0 сломал бы баланс.
    const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(',', '.').trim()) : NaN;
    if (!Number.isFinite(parsed)) { warnings.push(`${key}: «${value}» не число — оставлено ${formatRate(spec.def)}`); continue; }
    const limited = clampRate(parsed, spec);
    if (parsed < spec.min || parsed > spec.max) warnings.push(`${key}: ${parsed} вне пределов ${spec.min}…${spec.max} — зажато до ${limited}`);
    else if (Math.abs(limited - parsed) > 1e-9) warnings.push(`${key}: ${parsed} округлено до ${limited}${spec.integer ? ' (нужно целое)' : ''}`);
    rates[key] = limited;
  }
  return { rates: Object.freeze(rates), warnings };
}

// Удобное сокращение там, где предупреждения не нужны (тесты, расчёт экономики).
export const ratesOf = (raw) => normalizeRates(raw).rates;
export const isDefaultRates = (rates) => RATE_NAMES.every((k) => rates[k] === DEFAULT_RATES[k]);

// ---------- разница уровней ----------
// Ступени как в классических MMO, одинаково в обе стороны (по модулю разницы):
// до 3 включительно — полная награда, 4–6 — штраф, 7–9 — почти ничего, от 10 — ноль.
// Границы ступеней и ноль с десятого уровня жёсткие; значения внутри задаются рейтами.
export const LEVEL_GAP_FULL = 3;   // до этой разницы награда полная
export const LEVEL_GAP_NONE = 10;  // с этой разницы награды нет вовсе
export function levelFactor(mobLvl, heroLvl, rates = DEFAULT_RATES) {
  const gap = Math.abs(Math.round(mobLvl - heroLvl));
  if (gap <= LEVEL_GAP_FULL) return 1;
  if (gap >= LEVEL_GAP_NONE) return 0;
  return rates[`levelGap${gap}`];
}
export const coinLevelFactor = (mobLvl, heroLvl, rates = DEFAULT_RATES) => (rates.levelGapAffectsCoins ? levelFactor(mobLvl, heroLvl, rates) : 1);
export const dropLevelFactor = (mobLvl, heroLvl, rates = DEFAULT_RATES) => (rates.levelGapAffectsDrop ? levelFactor(mobLvl, heroLvl, rates) : 1);
// Ступени кривой одной строкой — для журнала, документации и отчётов.
export const levelCurve = (rates = DEFAULT_RATES) => Array.from({ length: LEVEL_GAP_NONE + 1 }, (_, gap) => ({ gap, factor: levelFactor(0, gap, rates) }));

// Дележ целого числа по весам без потери единиц: сумма долей точно равна total.
// Остаток раздаётся по одной единице, начиная с самой большой дробной части.
export function splitByWeights(total, weights) {
  const sum = weights.reduce((n, w) => n + w, 0);
  if (!(total > 0) || !(sum > 0)) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const out = exact.map((v) => Math.floor(v));
  let rest = total - out.reduce((n, v) => n + v, 0);
  const order = exact.map((v, i) => [v - Math.floor(v), weights[i], i])
    .sort((a, b) => b[0] - a[0] || b[1] - a[1] || a[2] - b[2]);
  for (let i = 0; rest > 0 && i < order.length; i++, rest--) out[order[i][2]]++;
  return out;
}
// Вес участника группы: доля растёт с уровнем (квадрат уровня, как в классике),
// а отставание от старшего режет её по той же ступенчатой кривой.
export const partyWeight = (lvl, topLvl, rates = DEFAULT_RATES) => lvl * lvl * levelFactor(lvl, topLvl, rates);

// ---------- применение: строго в точках выдачи ----------
// Опыт и SP умножаются ДО дележа в группе — так суммы остаются целыми и сходятся.
export const rateXp = (xp, rates = DEFAULT_RATES) => (xp > 0 ? Math.max(1, Math.round(xp * rates.xp)) : 0);
export const rateSp = (sp, rates = DEFAULT_RATES) => (sp > 0 ? Math.max(1, Math.round(sp * rates.sp)) : 0);
export const rateCoins = (coins, rates = DEFAULT_RATES) => Math.max(0, Math.round(coins * rates.coins));
// Гарантированный дроп (шанс 1) остаётся гарантированным при полном множителе уровня,
// но штраф за разницу уровней режет и его: иначе фарм босса низким уровнем давал бы полный лут.
export const rateDropChance = (chance, rates = DEFAULT_RATES, factor = 1) =>
  (chance >= 1 ? 1 : Math.min(1, Math.max(0, chance * rates.dropChance))) * Math.min(1, Math.max(0, factor));
// Бросок дропа с учётом рейтов: возвращает список id, повторённых dropAmount раз.
export function rollDropsRated(mobDef, rates = DEFAULT_RATES, rng = Math.random, factor = 1) {
  const out = [];
  for (const [id, chance] of Object.entries(mobDef.drops || {})) {
    if (rng() >= rateDropChance(chance, rates, factor)) continue;
    for (let i = 0; i < rates.dropAmount; i++) out.push(id);
  }
  return out;
}
// Список id → список стопок: при dropAmount > 1 одинаковые вещи не разводятся по кучкам.
export const countDrops = (drops = []) => {
  const counts = new Map();
  for (const id of drops) counts.set(id, (counts.get(id) || 0) + 1);
  return [...counts].map(([item, n]) => ({ item, n }));
};
// Надбавка за размер группы: ×1 в одиночку и при partyBonus = 1.
export const partyMultiplier = (size, rates = DEFAULT_RATES) => 1 + (rates.partyBonus - 1) * Math.max(0, size - 1);
// Обратный множитель: respawn ×2 означает вдвое более быстрое возрождение.
export const rateRespawnMs = (ms, rates = DEFAULT_RATES) => Math.max(1000, Math.round(ms / rates.respawn));
export const rateSellPrice = (price, rates = DEFAULT_RATES) => (price > 0 ? Math.max(1, Math.round(price * rates.sellPrice)) : 0);
export const rateBuyPrice = (price, rates = DEFAULT_RATES) => Math.max(1, Math.round(price * rates.buyPrice));
// Материалы никогда не обнуляются: рецепт без затрат перестал бы быть рецептом.
export const rateRecipe = (recipe, rates = DEFAULT_RATES) => ({
  ...recipe,
  coins: Math.max(0, Math.round(recipe.coins * rates.craftCost)),
  materials: Object.fromEntries(Object.entries(recipe.materials).map(([id, n]) => [id, Math.max(1, Math.round(n * rates.craftCost))])),
});
export const enchantChanceOf = (rates = DEFAULT_RATES) => Math.min(1, Math.max(0.01, ENCH_CHANCE * rates.enchantChance));
export const enchSucceedsRated = (cur, rates = DEFAULT_RATES, rng = Math.random) => cur < SAFE_ENCH || rng() < enchantChanceOf(rates);

// ---------- показ ----------
// Короткая строка для журнала сервера и отчётов: перечисляет всё, что отличается от умолчания.
export const rateText = (key, value) => (RATE_KEYS[key].text ? RATE_KEYS[key].text(value) : `${RATE_KEYS[key].label} ${formatRate(value)}`);
export function describeRates(rates) {
  const changed = RATE_NAMES.filter((k) => rates[k] !== DEFAULT_RATES[k]);
  if (!changed.length) return 'обычные (все ×1)';
  return changed.map((k) => rateText(k, rates[k])).join(', ');
}
