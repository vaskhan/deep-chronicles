// Эффекты во времени на цели: урон со временем (dot), лечение со временем (hot),
// ослабление характеристики (debuff), замедление (slow), вампиризм (drain) и обычное усиление (buff).
// Без DOM и three.js — чистые функции, время приходит параметром в миллисекундах.
// Одни и те же правила считает сервер и проверяют юнит-тесты, поэтому здесь нет ни Date.now(), ни случайности.
//
// Эффект: { id, kind, name?, stat?, mul?, perTick?, tick?, next?, until, from? }
// id уникален на цели: одинаковый эффект не складывается, а продлевает длительность.

// Читаемые названия видов — интерфейс собирает подпись значка из них.
export const EFFECT_NAMES = {
  buff: 'Усиление',
  debuff: 'Ослабление',
  slow: 'Замедление',
  dot: 'Урон со временем',
  hot: 'Лечение со временем',
  drain: 'Вампиризм',
};

// ---------- создание ----------

// усиление характеристики цели: { stat, mul, dur }
export function makeBuff(id, { stat, mul, dur, name }, now, from = null) {
  return { id, kind: 'buff', stat, mul, name, until: now + dur * 1000, from };
}
// ослабление характеристики цели: тот же расчёт, другой знак множителя
export function makeDebuff(id, { stat, mul, dur, name }, now, from = null) {
  return { id, kind: 'debuff', stat, mul, name, until: now + dur * 1000, from };
}
// замедление — частный случай ослабления по скорости, но клиент рисует его отдельным значком
export function makeSlow(id, { mul, dur, name }, now, from = null) {
  return { id, kind: 'slow', stat: 'speed', mul, name, until: now + dur * 1000, from };
}
// урон со временем: { mul, dur, tick }; mul — суммарный множитель атаки за всё время действия
export function makeDot(id, { mul, dur, tick }, atk, now, from = null) {
  const step = tick || 1, ticks = Math.max(1, Math.floor(dur / step));
  return {
    id, kind: 'dot', perTick: Math.max(1, Math.round((atk * mul) / ticks)),
    tick: step * 1000, next: now + step * 1000, until: now + dur * 1000, from,
  };
}
// лечение со временем: { amount, dur, tick }; amount — доля максимального здоровья цели за один тик
export function makeHot(id, { amount, dur, tick }, maxHp, now, from = null) {
  const step = tick || 1;
  return {
    id, kind: 'hot', perTick: Math.max(1, Math.round(maxHp * amount)),
    tick: step * 1000, next: now + step * 1000, until: now + dur * 1000, from,
  };
}
// вампиризм: пока эффект жив, нанесённый урон лечит носителя на долю mul
export function makeDrain(id, { mul, dur, name }, now, from = null) {
  return { id, kind: 'drain', mul, name, until: now + dur * 1000, from };
}

// ---------- наложение ----------

// Одинаковый эффект (тот же id) не суммируется: обновляются сила и срок, фаза тиков сохраняется,
// чтобы повторное наложение не выдавало лишний тик сразу же.
export function applyEffect(list, eff) {
  const i = list.findIndex((e) => e.id === eff.id);
  if (i < 0) return [...list, eff];
  const old = list[i];
  // старая фаза годится, только если её следующий тик ещё впереди (eff.next - eff.tick === «сейчас»)
  const keep = eff.tick && old.tick && old.next != null && old.next > eff.next - eff.tick;
  return list.map((e, k) => (k === i ? { ...eff, next: keep ? old.next : eff.next } : e));
}

// ---------- такт ----------

// Считает тики, накопившиеся с прошлого вызова, и убирает истёкшие эффекты.
// hits — сработавшие тики с числом повторов n и источником from (нужен для награды за добивание).
export function tickEffects(list, now) {
  const out = [], hits = [], expired = [];
  let dmg = 0, heal = 0;
  for (const e of list) {
    let kept = e;
    if (e.tick) {
      let next = e.next, n = 0;
      while (next <= now && next <= e.until) { n++; next += e.tick; }
      if (n) {
        if (e.kind === 'dot') dmg += n * e.perTick;
        if (e.kind === 'hot') heal += n * e.perTick;
        hits.push({ ...e, n });
        kept = { ...e, next };
      }
    }
    if (e.until > now) out.push(kept); else expired.push(e);
  }
  return { list: out, hits, expired, dmg, heal };
}

// ---------- чтение ----------

// Итоговый множитель характеристики от всех активных усилений и ослаблений.
export function effectMul(list, stat, now) {
  let m = 1;
  for (const e of list) if (e.stat === stat && e.until > now) m *= e.mul;
  return m;
}
// Суммарная доля вампиризма (несколько источников перемножаются как 1 - (1-a)(1-b)).
export function drainMul(list, now) {
  let rest = 1;
  for (const e of list) if (e.kind === 'drain' && e.until > now) rest *= 1 - e.mul;
  return 1 - rest;
}
// Сколько здоровья вернёт нанесённый урон.
export const drainHeal = (dmg, mul) => (mul > 0 && dmg > 0 ? Math.max(1, Math.round(dmg * mul)) : 0);

// Компактный вид для снапшота: [id, вид, осталось мс]. Клиент рисует значок и таймер.
export const snapshotEffects = (list, now) =>
  list.filter((e) => e.until > now).map((e) => [e.id, e.kind, Math.max(0, Math.round(e.until - now))]);
