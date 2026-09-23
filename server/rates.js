// Источник рейтов на сервере: файл настроек + переменные окружения.
// Читается один раз при старте. Битый или недоступный файл не роняет сервер —
// сервер продолжает на значениях по умолчанию и пишет предупреждение в журнал.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RATE_NAMES, normalizeRates, describeRates, isDefaultRates } from '../src/rates.js';

export const DEFAULT_RATES_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'rates.json');
// RATE_XP=2, RATE_DROP_CHANCE=3, RATE_LEVEL_GAP_5=0.5 — переменная окружения сильнее файла.
export const envName = (key) => 'RATE_' + key.replace(/[A-Z]|\d+/g, (part) => '_' + part).toUpperCase();

function readFileRates(file, warnings) {
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed?.rates && typeof parsed.rates === 'object' ? parsed.rates : parsed;
  } catch (e) {
    warnings.push(`Файл рейтов ${path.basename(file)} не прочитан (${e.message}) — взяты значения по умолчанию`);
    return {};
  }
}

// Возвращает { rates, warnings, file, fromEnv } — ничего не печатает и не бросает.
export function loadRates(env = process.env, file = env.RATES_FILE || DEFAULT_RATES_FILE) {
  const warnings = [];
  const raw = { ...readFileRates(file, warnings) }, fromEnv = [];
  for (const key of RATE_NAMES) {
    const name = envName(key);
    if (env[name] === undefined || env[name] === '') continue;
    raw[key] = env[name]; fromEnv.push(name);
  }
  const { rates, warnings: issues } = normalizeRates(raw);
  return { rates, warnings: [...warnings, ...issues], file, fromEnv };
}

// Один раз при старте: итоговые значения видны в журнале и в отчётах автотестов.
export function logRates(result, log = console.log) {
  for (const warning of result.warnings) log('[rates] ' + warning);
  log(`[rates] Рейты сервера: ${describeRates(result.rates)}${isDefaultRates(result.rates) ? '' : ` · источник: ${path.basename(result.file)}${result.fromEnv.length ? ' + ' + result.fromEnv.join(', ') : ''}`}`);
  return result.rates;
}
