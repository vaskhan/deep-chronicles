// Лимиты одного соединения: входящие команды и ответы-отказы.
// Корзина с пополнением (token bucket): «запас» — допустимый всплеск кликов, «в секунду» —
// устойчивый темп. Честный клиент в эти пределы не упирается; лишние пакеты сбрасываются
// без обработки, а долгий поток сброшенных пакетов закрывает соединение.

// вид команды → [запас, пополнение в секунду]
export const COMMAND_LIMITS = {
  st: [30, 25], atk: [20, 10], skill: [12, 6], use: [12, 6], pickup: [20, 10],
  equip: [12, 6], unequip: [12, 6], buy: [12, 6], sell: [20, 10], ench: [8, 4], craft: [6, 3],
  learn: [6, 3], prof: [3, 1], autoloot: [4, 1], tp: [4, 1], respawn: [4, 1], wash: [4, 1],
  party: [10, 4], chat: [6, 2], pm: [8, 3], logout: [3, 1], ping: [4, 1],
  auth: [6, 1], login: [6, 1], register: [6, 1],
  // неизвестные виды и нечитаемые пакеты
  other: [10, 5], invalid: [10, 5],
};
// общий бюджет соединения поверх видов
export const TOTAL_LIMIT = [120, 60];
// ответы-отказы (pickup_err, chatwait, pmerr, washerr, autherr): не больше этого, даже при потоке
export const REFUSAL_LIMIT = [10, 4];
// сколько сброшенных пакетов за окно считается потоком — соединение закрывается
export const FLOOD_DROPS = 300, FLOOD_WINDOW = 10_000;

export function bucket([cap, rate], now = Date.now()) { return { cap, rate, level: cap, at: now }; }
function refill(b, now) {
  b.level = Math.min(b.cap, b.level + (Math.max(0, now - b.at) / 1000) * b.rate);
  b.at = now;
}
// Взять одну единицу; false — лимит исчерпан.
export function take(b, now = Date.now()) {
  refill(b, now);
  if (b.level < 1) return false;
  b.level -= 1;
  return true;
}

export function createLimiter({ limits = COMMAND_LIMITS, total = TOTAL_LIMIT, refusals = REFUSAL_LIMIT, flood = FLOOD_DROPS, window = FLOOD_WINDOW } = {}, now = Date.now()) {
  const kinds = new Map(), all = bucket(total, now), refuse = bucket(refusals, now);
  let drops = 0, windowAt = now, dropped = 0;
  const kindOf = (kind) => (Object.hasOwn(limits, kind) ? kind : 'other');
  return {
    // Можно ли обработать команду этого вида сейчас. Сброшенные пакеты считаются для потока.
    allow(kind, t = Date.now()) {
      const k = kindOf(kind);
      if (!kinds.has(k)) kinds.set(k, bucket(limits[k], t));
      const b = kinds.get(k);
      refill(b, t); refill(all, t);
      if (b.level >= 1 && all.level >= 1) { b.level -= 1; all.level -= 1; return true; }
      if (t - windowAt > window) { windowAt = t; drops = 0; }
      drops++; dropped++;
      return false;
    },
    // Поток: за окно сброшено больше порога — соединение пора закрыть.
    flooding: () => drops > flood,
    // Разрешён ли ещё один ответ-отказ.
    refusal: (t = Date.now()) => take(refuse, t),
    get dropped() { return dropped; },
  };
}
