// Общие правила обучения. Только сервер изменяет SP и изученные ранги.
import { CLASSES, SKILLS, PROFESSIONS, PROF_LVL, xpToNext } from './data.js';
export const SKILL_LEVELS = {
  power_strike: [1, 8, 18, 25, 32, 40], fire_bolt: [1, 8, 18, 25, 32, 40],
  battle_cry: [5, 12, 20, 28, 36], heal: [3, 10, 18, 25, 32, 40],
  whirlwind: [12, 20, 28, 36], ice_nova: [10, 18, 26, 34],
  blood_rage: [16, 24, 32, 40], curse: [7, 14, 22, 30, 38],
  // умения профессий: первый ранг на уровне умения, дальше шаг в 4 уровня
  shield_bash: [20, 24, 28, 32, 36], iron_will: [22, 26, 30, 34, 38],
  frenzy: [20, 24, 28, 32, 36], cleave: [24, 28, 32, 36, 40],
  lightning: [20, 24, 28, 32, 36], meteor: [26, 30, 34, 38],
  heal_major: [20, 24, 28, 32, 36], blessing: [22, 26, 30, 34, 38],
};
// ===== профессии =====
// Профессия хранится в профиле полем `prof` (null — не выбрана). Решение принимает только сервер.
const profOf = id => (typeof id === 'string' && Object.hasOwn(PROFESSIONS, id) ? PROFESSIONS[id] : null);
// какие профессии предлагать классу
export const profsFor = cls => Object.entries(PROFESSIONS).filter(([, prof]) => prof.base === cls).map(([id, prof]) => ({ id, ...prof }));
// владелец умения профессии: нужен для понятных отказов в learn
export const profOfSkill = id => Object.values(PROFESSIONS).find(prof => prof.skills.includes(id)) || null;
// все умения персонажа: базовые класса плюс умения выбранной профессии
export const skillsOf = P => [...CLASSES[P.cls].skills, ...(profOf(P.prof)?.skills || [])];
export function profError(P, id) {
  const prof = profOf(id);
  if (!prof || prof.base !== P.cls) return 'Эта профессия недоступна вашему классу';
  if (P.prof) return `Профессия уже выбрана: ${PROFESSIONS[P.prof].name}`;
  if (P.lvl < PROF_LVL) return `Профессию выбирают с ${PROF_LVL} уровня`;
  return null;
}
// выбор профессии: текст ошибки или null. Профиль меняется только при успехе.
export function applyProf(P, id) {
  const error = profError(P, id); if (error) return error;
  P.prof = id;
  return null;
}
export const spForKill = xp => Math.max(1, Math.floor(xp * 0.12));
// Умения профессий живут по отдельной, более дешёвой шкале. Базовая формула привязана к опыту
// уровня и к 20+ уровню требует десятки тысяч SP — за профессию это слишком дорого: её умения
// начинают качаться с нуля уже после 20 уровня. Первый ранг — примерно 25–30 убийств моба
// своего уровня по текущей выдаче SP, дальше цена растёт в PROF_SP_STEP раз за ранг.
export const PROF_SP_FIRST = 2400;
export const PROF_SP_STEP = 1.6;
export const profSkillCost = rank => Math.round(PROF_SP_FIRST * Math.pow(PROF_SP_STEP, rank - 1) / 10) * 10;
export const skillRanks = id => (Object.hasOwn(SKILL_LEVELS, id) ? SKILL_LEVELS[id] : []).map((lvl, i) => {
  const base = SKILLS[id];
  const cost = profOfSkill(id) ? profSkillCost(i + 1) : (lvl === 1 ? 0 : Math.round(xpToNext(lvl) * 0.18));
  const sk = { ...base, lvl, rank: i + 1, sp: cost, mp: Math.round(base.mp * (1 + i * 0.12)) };
  if (base.mul) sk.mul = +(base.kind === 'buff' ? base.mul + i * 0.05 : base.mul * (1 + i * 0.18)).toFixed(3);
  if (base.amount) sk.amount = +(base.amount + i * 0.05).toFixed(3);
  // Эффекты во времени тоже растут с рангом: сильнее урон/лечение и глубже ослабление.
  if (base.dot) sk.dot = { ...base.dot, mul: +(base.dot.mul * (1 + i * 0.18)).toFixed(3) };
  if (base.hot) sk.hot = { ...base.hot, amount: +(base.hot.amount + i * 0.005).toFixed(4) };
  if (base.drain) sk.drain = { ...base.drain, mul: +Math.min(0.6, base.drain.mul + i * 0.05).toFixed(3) };
  if (base.debuff) sk.debuff = { ...base.debuff, mul: +Math.max(0.4, base.debuff.mul - i * 0.04).toFixed(3) };
  if (base.slow) sk.slow = { ...base.slow, mul: +Math.max(0.3, base.slow.mul - i * 0.05).toFixed(3) };
  return sk;
});
export const effectiveSkill = (P, id) => skillRanks(id)[(P.skills?.[id] || 1) - 1];
export function migrateProgression(P) {
  P.sp = Number.isSafeInteger(P.sp) && P.sp >= 0 ? P.sp : 0;
  P.autoloot = typeof P.autoloot === 'boolean' ? P.autoloot : true;
  // Профессия чужого класса или неизвестный id — то же самое, что «не выбрана»: сброса прочего прогресса нет.
  P.prof = profOf(P.prof)?.base === P.cls ? P.prof : null;
  const legacy = !P.skills || typeof P.skills !== 'object' || Array.isArray(P.skills);
  const learned = {};
  for (const id of skillsOf(P)) {
    const maximum = SKILL_LEVELS[id].filter(lvl => lvl <= P.lvl).length;
    // Старые профили знали только базовые умения класса: умения профессии за них не выдаются.
    const rank = legacy ? (CLASSES[P.cls].skills.includes(id) && P.lvl >= SKILLS[id].lvl ? 1 : 0)
      : Math.max(0, Math.min(maximum, Number.isInteger(P.skills[id]) ? P.skills[id] : 0));
    if (rank) learned[id] = rank;
  }
  P.skills = learned; return P;
}
export function learnError(P, id, rank) {
  if (!skillsOf(P).includes(id)) {
    const owner = profOfSkill(id);
    if (owner) return owner.base === P.cls ? `Это умение профессии «${owner.name}»` : 'Это умение не вашего класса';
    return 'Это умение не вашего класса';
  }
  const current = P.skills[id] || 0;
  if (!Number.isInteger(rank) || rank !== current + 1) return 'Ранг уже изучен или устарел. Обновите карточку';
  const next = skillRanks(id)[current];
  if (!next) return 'Умение изучено полностью';
  if (P.lvl < next.lvl) return `Нужен уровень ${next.lvl}`;
  if (P.sp < next.sp) return `Недостаточно SP: нужно ${next.sp}`;
  return null;
}
