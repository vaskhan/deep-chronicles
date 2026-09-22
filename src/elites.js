// Элиты и чемпионы: множители к определению моба и детерминированный выбор точек спавна.
// Без DOM и three.js. Расстановка мира детерминирована, поэтому ранг берётся из той же
// хеш-функции, что и сами спавны (src/world-core.js) — один и тот же мир у сервера и тестов.
import { hash } from './world-core.js';

// Множители к определению моба. reward умножает и опыт, и монеты; drop — шанс каждой вещи.
export const ELITE = { hp: 2.5, atk: 1.4, size: 1.3, reward: 3, drop: 1 };
export const CHAMPION = { hp: 3, atk: 1.6, size: 1.25, reward: 4, drop: 5, respawn: 300 };

// Доля помеченных обычных спавнов. Несколько элит на зону, чемпион — редкость.
export const ELITE_RATE = 0.1;
export const CHAMPION_RATE = 0.015;

// Приставки именных мобов зоны. Выбор детерминирован, список свой.
export const CHAMPION_TITLES = ['Свирепый', 'Древний', 'Меченый', 'Проклятый', 'Вожак', 'Матёрый', 'Изувеченный', 'Багровый'];

export function eliteDef(def) {
  return {
    ...def, rank: 'elite', name: `${def.name} (элита)`, baseName: def.name,
    hp: Math.round(def.hp * ELITE.hp), patk: Math.round(def.patk * ELITE.atk),
    xp: Math.round(def.xp * ELITE.reward), coins: def.coins.map((c) => Math.round(c * ELITE.reward)),
    size: +((def.size || 1) * ELITE.size).toFixed(3), dropMul: ELITE.drop,
  };
}

export function championDef(def, title) {
  const name = `${title} ${def.name.toLowerCase()}`;
  return {
    ...def, rank: 'champion', name, baseName: def.name,
    hp: Math.round(def.hp * CHAMPION.hp), patk: Math.round(def.patk * CHAMPION.atk),
    xp: Math.round(def.xp * CHAMPION.reward), coins: def.coins.map((c) => Math.round(c * CHAMPION.reward)),
    size: +((def.size || 1) * CHAMPION.size).toFixed(3), dropMul: CHAMPION.drop,
    respawn: CHAMPION.respawn, aggro: true,
  };
}

// Ранг точки спавна. Боссы и охотничьи лагеря остаются обычными: первые группы за воротами
// намеренно щадящие, элита среди них сорвала бы стартовую охоту.
export function rankOf(spawn, index, def) {
  if (!def || def.boss || spawn.camp) return null;
  const r = hash(spawn.x * 0.37 + index * 1.7, spawn.z * 0.41 - index * 2.3);
  if (r > 1 - CHAMPION_RATE) return 'champion';
  if (r > 1 - CHAMPION_RATE - ELITE_RATE) return 'elite';
  return null;
}

// Приставка чемпиона — тоже от координат: у одной точки мира всегда одно имя.
export const championTitle = (spawn, index) =>
  CHAMPION_TITLES[Math.floor(hash(spawn.z * 0.19 - index, spawn.x * 0.23 + index) * CHAMPION_TITLES.length) % CHAMPION_TITLES.length];

// Определение моба с учётом ранга точки. Обычные спавны возвращают исходное определение без копии.
export function rankedDef(def, spawn, index) {
  const rank = rankOf(spawn, index, def);
  if (rank === 'champion') return championDef(def, championTitle(spawn, index));
  if (rank === 'elite') return eliteDef(def);
  return def;
}
