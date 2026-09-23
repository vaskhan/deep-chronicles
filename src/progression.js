// Общие правила обучения. Только сервер изменяет SP и изученные ранги.
import { CLASSES, SKILLS, PROFESSIONS, PROF_LVL, SECOND_PROF_LVL, MAX_LEVEL, xpToNext } from './data.js';
const LEGACY_SKILL_LEVELS = {
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
export const trainingLevels = (cls, limit = MAX_LEVEL) => {
  const levels = [1];
  for (let level = cls === 'warrior' ? 5 : 7; level < 20 && level <= limit; level += cls === 'warrior' ? 5 : 7) levels.push(level);
  if (limit >= 20) levels.push(20);
  for (let level = 20 + (cls === 'warrior' ? 4 : 5); level <= Math.min(40, limit); level += cls === 'warrior' ? 4 : 5) levels.push(level);
  for (let level = 40 + (cls === 'warrior' ? 3 : 4); level <= limit; level += cls === 'warrior' ? 3 : 4) levels.push(level);
  return levels;
};
const classOfSkill = id => Object.entries(CLASSES).find(([,c]) => c.skills.includes(id))?.[0]
  || Object.values(PROFESSIONS).find(p => p.skills.includes(id))?.base;
export const SKILL_LEVELS = Object.fromEntries(Object.keys(SKILLS).map(id => [id, trainingLevels(classOfSkill(id)).filter(lvl => lvl >= SKILLS[id].lvl)]));
export const trainingCost = level => level === 1 ? 0 : Math.max(5, Math.round(xpToNext(level) * 0.006));
// ===== профессии =====
// Профессия хранится в профиле полем `prof` (null — не выбрана). Решение принимает только сервер.
const profOf = id => (typeof id === 'string' && Object.hasOwn(PROFESSIONS, id) ? PROFESSIONS[id] : null);
// какие профессии предлагать классу
export const profsFor = (cls, parent = null) => Object.entries(PROFESSIONS).filter(([, prof]) => prof.base === cls && (parent ? prof.parent === parent : !prof.parent)).map(([id, prof]) => ({ id, ...prof }));
// владелец умения профессии: нужен для понятных отказов в learn
export const profOfSkill = id => Object.values(PROFESSIONS).find(prof => prof.skills.includes(id)) || null;
// все умения персонажа: базовые класса плюс умения выбранной профессии
export const skillsOf = P => [...CLASSES[P.cls].skills, ...(profOf(P.prof)?.skills || []), ...(P.prof2 && profOf(P.prof2)?.parent === P.prof ? profOf(P.prof2).skills : [])];
export const promotionError = (P, level) => level >= SECOND_PROF_LVL && profOf(P.prof2)?.parent !== P.prof
  ? 'Сначала выберите вторую профессию' : level >= PROF_LVL && (!profOf(P.prof) || profOf(P.prof).parent)
  ? 'Сначала выберите профессию' : null;
export function profError(P, id) {
  const prof = profOf(id);
  if (!prof || prof.base !== P.cls) return 'Эта профессия недоступна вашему классу';
  if (prof.parent) {
    if (P.prof !== prof.parent) return 'Сначала выберите соответствующую первую профессию';
    if (P.prof2) return `Вторая профессия уже выбрана: ${PROFESSIONS[P.prof2].name}`;
    if (P.lvl < SECOND_PROF_LVL) return `Вторую профессию выбирают с ${SECOND_PROF_LVL} уровня`;
  } else {
    if (P.prof) return `Профессия уже выбрана: ${PROFESSIONS[P.prof].name}`;
    if (P.lvl < PROF_LVL) return `Профессию выбирают с ${PROF_LVL} уровня`;
  }
  return null;
}
export function applyProf(P, id) {
  const error = profError(P,id); if (error) return error;
  if (profOf(id).parent) P.prof2=id; else P.prof=id;
  return null;
}
export const spForKill = xp => Math.max(1, Math.floor(xp * 0.12));
export const skillRanks = id => (Object.hasOwn(SKILL_LEVELS, id) ? SKILL_LEVELS[id] : []).map((lvl, i) => {
  const base = SKILLS[id];
  const cost = trainingCost(lvl);
  const growth = (lvl - base.lvl) * 0.002;
  const sk = { ...base, lvl, rank: i + 1, sp: cost, mp: Math.round(base.mp * (1 + i * 0.12)) };
  // Attack stats and gear already grow with level; ranks add a modest bonus.
  if (base.mul) sk.mul = +(['buff','passive'].includes(base.kind) ? base.mul + Math.min(0.20, (lvl - base.lvl) * 0.004) : base.mul * (1 + growth)).toFixed(3);
  if (base.amount) sk.amount = +(Math.min(0.8, base.amount + (lvl - base.lvl) * 0.002)).toFixed(3);
  // Эффекты во времени тоже растут с рангом: сильнее урон/лечение и глубже ослабление.
  if (base.dot) sk.dot = { ...base.dot, mul: +(base.dot.mul * (1 + growth)).toFixed(3) };
  if (base.hot) sk.hot = { ...base.hot, amount: +(Math.min(0.08, base.hot.amount + (lvl - base.lvl) * 0.0004)).toFixed(4) };
  if (base.drain) sk.drain = { ...base.drain, mul: +Math.min(0.6, base.drain.mul + (lvl - base.lvl) * 0.003).toFixed(3) };
  if (base.debuff) sk.debuff = { ...base.debuff, mul: +Math.max(0.4, base.debuff.mul - (lvl - base.lvl) * 0.002).toFixed(3) };
  if (base.slow) sk.slow = { ...base.slow, mul: +Math.max(0.3, base.slow.mul - (lvl - base.lvl) * 0.002).toFixed(3) };
  return sk;
});
export const effectiveSkill = (P, id) => skillRanks(id)[(P.skills?.[id] || 1) - 1];
export function migrateProgression(P) {
  P.sp = Number.isSafeInteger(P.sp) && P.sp >= 0 ? P.sp : 0;
  P.autoloot = typeof P.autoloot === 'boolean' ? P.autoloot : true;
  // Профессия чужого класса или неизвестный id — то же самое, что «не выбрана»: сброса прочего прогресса нет.
  P.prof = profOf(P.prof)?.base === P.cls && !profOf(P.prof).parent ? P.prof : null;
  P.prof2 = profOf(P.prof2)?.parent === P.prof && P.prof ? P.prof2 : null;
  const legacy = !P.skills || typeof P.skills !== 'object' || Array.isArray(P.skills);
  if (!legacy && P.trainingVersion !== 2) {
    let refund = 0;
    for (const [id, count] of Object.entries(P.skills)) {
      const old = LEGACY_SKILL_LEVELS[id]; if (!old || !skillsOf(P).includes(id)) continue;
      const owned = Math.max(0, Math.min(old.length, Number.isInteger(count) ? count : 0));
      const lastLevel = old[owned - 1] || 0;
      const ranks = skillRanks(id).filter(r => r.lvl <= Math.min(lastLevel, P.lvl, P.prof2 ? MAX_LEVEL : P.prof ? SECOND_PROF_LVL - 1 : PROF_LVL - 1));
      const spent = old.slice(0, owned).reduce((sum,lvl,i) => sum + (profOfSkill(id) ? Math.round(2400 * Math.pow(1.6,i) / 10) * 10 : lvl === 1 ? 0 : Math.round(xpToNext(lvl)*0.18)),0);
      refund += Math.max(0, spent - ranks.reduce((sum,r) => sum+r.sp,0));
      P.skills[id] = ranks.length;
    }
    P.sp += refund;
  }
  P.trainingVersion = 2;
  const learned = {};
  for (const id of skillsOf(P)) {
    const maximum = SKILL_LEVELS[id].filter(lvl => lvl <= P.lvl && !promotionError(P,lvl)).length;
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
  if (promotionError(P,next.lvl)) return promotionError(P,next.lvl);
  if (P.lvl < next.lvl) return `Нужен уровень ${next.lvl}`;
  if (P.sp < next.sp) return `Недостаточно SP: нужно ${next.sp}`;
  return null;
}
