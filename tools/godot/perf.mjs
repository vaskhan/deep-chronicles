// Воспроизводимый профиль кадра: игровая камера в городе и в Громовом ущелье, оба пресета качества.
// npm run native:perf [-- --quality=mobile|pc|both] [--seconds=4] [--warmup=2] [--strict]
// Пишет .native-run/perf/profile.json: median/p95/p99 кадра, draw calls, примитивы, память видео.
// Бюджет (docs/NATIVE_PIPELINE.md): ПК-пресет — p95 ≤ 16.7 мс (60 FPS) на выбранном ПК;
// мобильный пресет — p95 ≤ 33.3 мс (30 FPS), но замер на Mac телефон НЕ проверяет: нагрев,
// троттлинг, реальная пропускная способность памяти и прозрачность меряются только на устройстве.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { godotBinary, root, run } from './runtime.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
if (args.includes('--headless')) throw Error('Профиль кадра требует настоящий рендер: --headless не поддерживается');
const which = opt('quality', 'both');
if (!['mobile', 'pc', 'both'].includes(which)) throw Error('--quality: mobile, pc или both');
const presets = which === 'both' ? ['mobile', 'pc'] : [which];
const seconds = Number(opt('seconds', 4)), warmup = Number(opt('warmup', 2));
export const BUDGET = { pc: { ms: 16.7, fps: 60, metric: 'p95_ms' }, mobile: { ms: 33.3, fps: 30, metric: 'p95_ms' } };
const CAVEAT = 'Мобильный бюджет проверен только на этом компьютере с мобильным пресетом. Телефон этим не проверяется: нужен замер на конкретном устройстве (нагрев, троттлинг, память, прозрачность).';

const dir = path.join(root, '.native-run', 'perf');
fs.mkdirSync(dir, { recursive: true });
await run(process.execPath, ['tools/godot/export.mjs']);
await run(godotBinary(), ['--headless', '--path', 'godot', '--editor', '--import', '--quit']);

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const report = { started: new Date().toISOString(), caveat: CAVEAT, budget: BUDGET, presets: {} };
for (const preset of presets) {
  const out = path.join(dir, `raw-${preset}.json`);
  fs.rmSync(out, { force: true });
  // --disable-vsync и --max-fps 0: иначе кадр упирается в частоту экрана (на этом Mac 120 Гц = 8.33 мс)
  const argv = ['--disable-vsync', '--max-fps', '0', '--path', 'godot', '--script', 'res://tests/perf_profile.gd', '--', '--test-mode', `--output=${out}`, `--quality=${preset}`, `--seconds=${seconds}`, `--warmup=${warmup}`];
  let log = '';
  const code = await new Promise((resolve, reject) => {
    const child = spawn(godotBinary(), argv, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const s of [child.stdout, child.stderr]) s.on('data', (c) => { log += c; process.stdout.write(c); });
    child.on('error', reject); child.on('exit', resolve);
  });
  fs.writeFileSync(path.join(dir, `godot-${preset}.log`), log);
  if (code !== 0 || !fs.existsSync(out)) throw Error(`Профиль ${preset} не записан (код ${code}); см. .native-run/perf/godot-${preset}.log`);
  const raw = JSON.parse(fs.readFileSync(out, 'utf8'));
  const spots = {};
  for (const v of raw.views) (spots[v.spot] ||= []).push(v);
  const budget = BUDGET[preset];
  const summary = Object.fromEntries(Object.entries(spots).map(([spot, vs]) => {
    const worst = Math.max(...vs.map((v) => v[budget.metric]));
    return [spot, {
      median_ms: median(vs.map((v) => v.median_ms)), p95_ms_worst: worst, p99_ms_worst: Math.max(...vs.map((v) => v.p99_ms)),
      draw_calls_max: Math.max(...vs.map((v) => v.draw_calls)), primitives_max: Math.max(...vs.map((v) => v.primitives)),
      video_mem_mb: Math.max(...vs.map((v) => v.video_mem_mb)), within_budget: worst <= budget.ms,
    }];
  }));
  const gpuZero = raw.views.every((v) => !v.render_gpu_ms);
  // Кадр, равный периоду экрана, означает упор в синхронизацию драйвера: время ниже этого не измерено.
  const capMs = raw.refresh_hz > 0 ? 1000 / raw.refresh_hz : 0;
  const capped = capMs > 0 && raw.views.filter((v) => Math.abs(v.median_ms - capMs) < capMs * 0.04).length > raw.views.length / 2;
  report.presets[preset] = { ...raw, summary, budget, within_budget: Object.values(summary).every((s) => s.within_budget),
    notes: [...(gpuZero ? ['Время GPU от RenderingServer равно нулю: на этом backend метрика недоступна, это не бесплатный рендер.'] : []),
      ...(capped ? [`Медиана кадра упирается в период экрана ${capMs.toFixed(2)} мс (${raw.refresh_hz} Гц): драйвер держит V-Sync, реальный запас ниже не измерен.`] : [])] };
}
report.finished = new Date().toISOString();
const file = path.join(dir, 'profile.json');
fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
for (const [preset, r] of Object.entries(report.presets)) {
  console.log(`\n[${preset}] ${r.adapter} · ${r.window.join('×')} · бюджет p95 ≤ ${r.budget.ms} мс`);
  for (const note of r.notes) console.log(`  примечание: ${note}`);
  for (const [spot, s] of Object.entries(r.summary)) console.log(`  ${spot.padEnd(15)} median ${s.median_ms} мс · p95 ${s.p95_ms_worst} · p99 ${s.p99_ms_worst} · draw ${s.draw_calls_max} · prims ${s.primitives_max} · vram ${s.video_mem_mb} МБ · ${s.within_budget ? 'в бюджете' : 'ВНЕ БЮДЖЕТА'}`);
}
console.log(`\n${CAVEAT}\nОтчёт: ${path.relative(root, file)}`);
if (args.includes('--strict') && Object.values(report.presets).some((r) => !r.within_budget)) process.exitCode = 1;
