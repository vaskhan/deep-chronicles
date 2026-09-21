// Контракт файла настраиваемых чисел: правки редактором и агентом остаются предсказуемыми.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const source = fs.readFileSync(path.join(root, 'godot/scripts/tuning.gd'), 'utf8');
const scripts = fs.readdirSync(path.join(root, 'godot/scripts')).filter(f => f.endsWith('.gd') && f !== 'tuning.gd');
const tests = fs.readdirSync(path.join(root, 'godot/tests')).filter(f => f.endsWith('.gd'));
const code = [...scripts.map(f => `godot/scripts/${f}`), ...tests.map(f => `godot/tests/${f}`)]
  .map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
const constants = new Map();
for (const line of source.split('\n')) {
  const match = /^const ([A-Z][A-Z0-9_]*) = (-?\d+(?:\.\d+)?)$/.exec(line.trim());
  if (line.trim().startsWith('const')) assert.ok(match, `Не литеральное число: ${line.trim()}`);
  if (match) constants.set(match[1], Number(match[2]));
}

test('константы объявлены литералами и каждая используется в коде', () => {
  assert.ok(constants.size >= 20, `Слишком мало констант: ${constants.size}`);
  const unused = [...constants.keys()].filter(name => !code.includes(`Tuning.${name}`));
  assert.deepEqual(unused, [], `Неиспользуемые константы: ${unused.join(', ')}`);
});

test('tuning.gd зарегистрирован автозагрузкой', () => {
  const project = fs.readFileSync(path.join(root, 'godot/project.godot'), 'utf8');
  assert.match(project, /^Tuning="\*res:\/\/scripts\/tuning\.gd"$/m);
});

test('пределы камеры непротиворечивы', () => {
  const value = name => { assert.ok(constants.has(name), `Нет константы ${name}`); return constants.get(name); };
  assert.ok(value('CAMERA_DISTANCE_MIN') < value('CAMERA_DISTANCE_MAX'), 'Пределы дистанции перепутаны');
  assert.ok(value('CAMERA_PITCH_MIN') < value('CAMERA_PITCH_MAX'), 'Пределы наклона перепутаны');
  assert.ok(value('CAMERA_NEAR') > 0 && value('CAMERA_NEAR') < value('CAMERA_FAR'), 'Плоскости отсечения перепутаны');
  assert.ok(value('CAMERA_ZOOM_STEP') > 1, 'Шаг зума должен быть больше единицы');
  for (const name of ['CAMERA_DISTANCE_START', 'CAMERA_DISTANCE_RESET']) {
    const distance = value(name);
    assert.ok(distance >= value('CAMERA_DISTANCE_MIN') && distance <= value('CAMERA_DISTANCE_MAX'), `${name} вне пределов`);
  }
  for (const name of ['CAMERA_PITCH_START', 'CAMERA_PITCH_RESET']) {
    const pitch = value(name);
    assert.ok(pitch >= value('CAMERA_PITCH_MIN') && pitch <= value('CAMERA_PITCH_MAX'), `${name} вне пределов`);
  }
});

test('подписи гаснут не дальше, чем видит клиент', () => {
  // Метка дальше дистанции симуляции рисовала бы устаревшие данные.
  for (const name of ['LABEL_RANGE_ACTOR', 'LABEL_RANGE_LOOT', 'LABEL_RANGE_NPC', 'TARGET_PICK_RANGE']) {
    assert.ok(constants.get(name) <= 160, `${name} выходит за радиус симуляции`);
  }
  assert.ok(constants.get('TALK_OPEN_RANGE') < constants.get('TALK_SEARCH_RANGE'), 'Диалог открывается дальше, чем ищется NPC');
});

test('числа из tuning.gd не продублированы литералами в main.gd', () => {
  const main = fs.readFileSync(path.join(root, 'godot/scripts/main.gd'), 'utf8');
  assert.ok(!/camera\.fov = \d/.test(main), 'FOV камеры задан литералом');
  assert.ok(!/camera_distance = \d/.test(main), 'Дистанция камеры задана литералом');
  assert.ok(!/clampf\(camera_distance[^)]*, \d/.test(main), 'Пределы зума заданы литералами');
});
