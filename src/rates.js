// Серверные коэффициенты (рейты): одна таблица множителей наград и расходов.
// Модуль чистый — без DOM, three.js и файловой системы; его одинаково читают сервер,
// экономический расчёт и юнит-тесты. Все значения по умолчанию равны 1: настройки
// «из коробки» обязаны повторять текущий баланс один в один (проверяется тестом).
// Источник значений на сервере — server/rates.js (файл + переменные окружения).
import { SAFE_ENCH, ENCH_CHANCE } from './stats.js';

// Описание каждого коэффициента: предел, тип и куда он применяется.
export const RATE_KEYS = Object.freeze({
  xp: { min: 0.1, max: 100, label: 'опыт', where: 'опыт за убийство моба (до дележа в группе)' },
  sp: { min: 0.1, max: 100, label: 'SP', where: 'SP за убийство моба (до дележа в группе)' },
  coins: { min: 0.1, max: 100, label: 'монеты', where: 'монеты, выпадающие с моба' },
  dropChance: { min: 0.1, max: 100, label: 'шанс дропа', where: 'шанс выпадения вещей; гарантированный дроп остаётся гарантированным' },
  dropAmount: { min: 1, max: 100, integer: true, label: 'количество дропа', where: 'сколько штук каждой выпавшей вещи' },
  craftCost: { min: 0.1, max: 100, label: 'цена крафта', where: 'монеты и материалы в рецептах изготовления' },
  enchantChance: { min: 0.1, max: 10, label: 'шанс заточки', where: 'шанс успеха заточки выше безопасной ступени' },
  sellPrice: { min: 0.1, max: 100, label: 'цена продажи', where: 'сколько платит NPC за вещь' },
  buyPrice: { min: 0.1, max: 100, label: 'цена покупки', where: 'сколько NPC просит за товар' },
  respawn: { min: 0.1, max: 100, label: 'респавн', where: 'скорость возрождения мобов: время делится на этот множитель' },
  partyBonus: { min: 1, max: 2, label: 'бонус группы', where: 'надбавка к XP/SP за каждого дополнительного участника группы' },
});

export const RATE_NAMES = Object.freeze(Object.keys(RATE_KEYS));
export const DEFAULT_RATES = Object.freeze(Object.fromEntries(RATE_NAMES.map((k) => [k, 1])));

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
    // null, true, [] и прочее к числу не приводим: молчаливый 0 сломал бы баланс.
    const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(',', '.').trim()) : NaN;
    if (!Number.isFinite(parsed)) { warnings.push(`${key}: «${value}» не число — оставлено ×1`); continue; }
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

// ---------- применение: строго в точках выдачи ----------
// Опыт и SP умножаются ДО дележа в группе — так суммы остаются целыми и сходятся.
export const rateXp = (xp, rates = DEFAULT_RATES) => Math.max(1, Math.round(xp * rates.xp));
export const rateSp = (sp, rates = DEFAULT_RATES) => Math.max(1, Math.round(sp * rates.sp));
export const rateCoins = (coins, rates = DEFAULT_RATES) => Math.max(0, Math.round(coins * rates.coins));
// Гарантированный дроп (шанс 1) остаётся гарантированным при любом рейте.
export const rateDropChance = (chance, rates = DEFAULT_RATES) =>
  chance >= 1 ? 1 : Math.min(1, Math.max(0, chance * rates.dropChance));
// Бросок дропа с учётом рейтов: возвращает список id, повторённых dropAmount раз.
export function rollDropsRated(mobDef, rates = DEFAULT_RATES, rng = Math.random) {
  const out = [];
  for (const [id, chance] of Object.entries(mobDef.drops || {})) {
    if (rng() >= rateDropChance(chance, rates)) continue;
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
export const formatRate = (value) => `×${(+value.toFixed(4)).toLocaleString('ru-RU')}`;
// Короткая строка для журнала сервера и отчётов: перечисляет всё, что отличается от ×1.
export function describeRates(rates) {
  const changed = RATE_NAMES.filter((k) => rates[k] !== DEFAULT_RATES[k]);
  if (!changed.length) return 'обычные (все ×1)';
  return changed.map((k) => `${RATE_KEYS[k].label} ${formatRate(rates[k])}`).join(', ');
}
