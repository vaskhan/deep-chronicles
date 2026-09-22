// Умения мобов: эффект на героя при попадании (onHit) и щит на себя при потере здоровья (guard).
// Чистые функции поверх src/effects.js; случайность приходит аргументом, время — в миллисекундах.
// Считает только сервер (server/server.js), клиент получает готовые события fx.
import { makeDot, makeDebuff } from './effects.js';

// Эффекты удара моба по герою. id начинается с вида моба: клиент берёт из него подпись умения.
// Замедление героя бьёт по скорости атаки (aspd), а не по бегу: бег ведёт клиент,
// и урезанная скорость бега на сервере дала бы честному игроку ложный откат `fix`.
export function mobHitEffects(kind, def, atk, now, rng = Math.random) {
  const hit = def?.onHit;
  if (!hit || rng() >= hit.chance) return [];
  const out = [], name = hit.name, src = def.baseName || def.name;
  if (hit.dot) out.push({ ...makeDot(`${kind}:dot`, hit.dot, atk, now, null), name, src });
  if (hit.slow) out.push({ id: `${kind}:slow`, kind: 'slow', stat: 'aspd', mul: hit.slow.mul, name, until: now + hit.slow.dur * 1000, from: null, src });
  if (hit.debuff) out.push({ ...makeDebuff(`${kind}:weak`, { ...hit.debuff, name }, now, null), src });
  return out;
}

// Щит стража: раз в cd секунд, когда здоровье падает ниже доли below, моб усиливает свою характеристику.
// Возвращает эффект для наложения или null. m.guardReady — время, когда щит снова доступен.
export function guardTrigger(m, now) {
  const g = m.def?.guard;
  if (!g || m.dead || m.hp <= 0 || m.hp > m.def.hp * g.below) return null;
  if ((m.guardReady || 0) > now) return null;
  m.guardReady = now + g.cd * 1000;
  return { id: `${m.kind}:guard`, kind: 'buff', stat: g.stat, mul: g.mul, name: g.name, until: now + g.dur * 1000, from: null };
}
