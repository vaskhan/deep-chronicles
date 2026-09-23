// Надёжность сервера без сети: лимиты команд, очередь сохранений, предел сумки, откат при сбое записи.
// npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLimiter, bucket, take, COMMAND_LIMITS, TOTAL_LIMIT, FLOOD_DROPS } from '../server/guard.js';

test('лимит команд: всплеск в пределах запаса проходит, дальше — по темпу пополнения', () => {
  const t0 = 1_000_000, l = createLimiter({}, t0);
  const [cap, rate] = COMMAND_LIMITS.buy;
  let ok = 0;
  for (let i = 0; i < 100; i++) if (l.allow('buy', t0)) ok++;
  assert.equal(ok, cap, 'в один момент проходит ровно запас');
  // через секунду добавляется rate единиц
  ok = 0;
  for (let i = 0; i < 100; i++) if (l.allow('buy', t0 + 1000)) ok++;
  assert.equal(ok, rate);
  // виды независимы: исчерпанная покупка не мешает атаке
  assert.ok(l.allow('atk', t0 + 1000));
});

test('лимит команд: общий бюджет ограничивает смесь разных видов', () => {
  const t0 = 5_000, l = createLimiter({}, t0);
  let ok = 0;
  for (let i = 0; i < 20; i++) for (const k of Object.keys(COMMAND_LIMITS)) if (l.allow(k, t0)) ok++;
  assert.equal(ok, TOTAL_LIMIT[0], 'смесь видов упирается в общий запас');
  // честный темп: 20 перемещений и 5 атак в секунду в течение минуты — ни одного отказа
  const h = createLimiter({}, 0);
  let refused = 0;
  for (let ms = 0; ms < 60_000; ms += 50) { if (!h.allow('st', ms)) refused++; if (ms % 200 === 0 && !h.allow('atk', ms)) refused++; }
  assert.equal(refused, 0);
});

test('лимит команд: поток сброшенных пакетов распознаётся, неизвестные виды ограничены', () => {
  const l = createLimiter({}, 0);
  for (let i = 0; i < FLOOD_DROPS + 200; i++) l.allow('__proto__', 10);
  assert.ok(l.flooding(), 'поток должен быть распознан');
  assert.ok(l.dropped > FLOOD_DROPS);
  const quiet = createLimiter({}, 0);
  for (let i = 0; i < 50; i++) quiet.allow('chat', i * 600);
  assert.equal(quiet.flooding(), false, 'редкие отказы — не поток');
});

test('ответы-отказы ограничены отдельно от команд', () => {
  const l = createLimiter({}, 0);
  let n = 0;
  for (let i = 0; i < 1000; i++) if (l.refusal(0)) n++;
  assert.equal(n, 10);
  const b = bucket([2, 1], 0);
  assert.equal(take(b, 0) && take(b, 0), true);
  assert.equal(take(b, 0), false);
  assert.equal(take(b, 1000), true);
});
