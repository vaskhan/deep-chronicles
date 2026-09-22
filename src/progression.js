// Общие правила обучения. Только сервер изменяет SP и изученные ранги.
import { CLASSES, SKILLS, xpToNext } from './data.js';
export const SKILL_LEVELS = {
  power_strike: [1, 8, 18, 25, 32, 40], fire_bolt: [1, 8, 18, 25, 32, 40],
  battle_cry: [5, 12, 20, 28, 36], heal: [3, 10, 18, 25, 32, 40],
  whirlwind: [12, 20, 28, 36], ice_nova: [10, 18, 26, 34],
  blood_rage: [16, 24, 32, 40], curse: [7, 14, 22, 30, 38],
};
export const spForKill = xp => Math.max(1, Math.floor(xp * 0.12));
export const skillRanks = id => (Object.hasOwn(SKILL_LEVELS, id) ? SKILL_LEVELS[id] : []).map((lvl, i) => {
  const base = SKILLS[id], sk = { ...base, lvl, rank: i + 1, sp: lvl === 1 ? 0 : Math.round(xpToNext(lvl) * 0.18), mp: Math.round(base.mp * (1 + i * 0.12)) };
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
  const legacy = !P.skills || typeof P.skills !== 'object' || Array.isArray(P.skills);
  const learned = {};
  for (const id of CLASSES[P.cls].skills) {
    const maximum = SKILL_LEVELS[id].filter(lvl => lvl <= P.lvl).length;
    const rank = legacy ? (P.lvl >= SKILLS[id].lvl ? 1 : 0) : Math.max(0, Math.min(maximum, Number.isInteger(P.skills[id]) ? P.skills[id] : 0));
    if (rank) learned[id] = rank;
  }
  P.skills = learned; return P;
}
export function learnError(P, id, rank) {
  if (!CLASSES[P.cls].skills.includes(id)) return 'Это умение не вашего класса';
  const current = P.skills[id] || 0;
  if (!Number.isInteger(rank) || rank !== current + 1) return 'Ранг уже изучен или устарел. Обновите карточку';
  const next = skillRanks(id)[current];
  if (!next) return 'Умение изучено полностью';
  if (P.lvl < next.lvl) return `Нужен уровень ${next.lvl}`;
  if (P.sp < next.sp) return `Недостаточно SP: нужно ${next.sp}`;
  return null;
}
