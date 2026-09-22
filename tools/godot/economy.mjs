// Deterministic economy audit. No invented playtime or assumed player market prices.
import fs from 'node:fs';
import path from 'node:path';
import { root } from './runtime.mjs';
import { CLASSES, ITEMS, MOBS, SETS, RECIPES, xpToNext } from '../../src/data.js';
import { sellPrice, xpForKill } from '../../src/sim.js';
import { skillRanks, spForKill } from '../../src/progression.js';
import { buildProps } from '../../src/world-core.js';
import { rankedDef, ELITE, CHAMPION } from '../../src/elites.js';
import { DEFAULT_RATES, RATE_NAMES, RATE_KEYS, normalizeRates, isDefaultRates, describeRates, rateXp, rateSp, rateDropChance, rateSellPrice, coinLevelFactor, dropLevelFactor } from '../../src/rates.js';
const money = n => Math.round(n).toLocaleString('ru-RU');
// Рейты для расчёта: --rates=2 сразу поднимает опыт/SP/монеты/шанс дропа, --rate-xp=3 — один коэффициент.
function ratesFromArgv(argv) {
  const raw = {}, uniform = argv.find(a => a.startsWith('--rates='))?.slice(8);
  if (uniform !== undefined) for (const key of ['xp','sp','coins','dropChance']) raw[key] = uniform;
  for (const arg of argv) {
    const match = /^--rate-([a-z-]+)=(.+)$/.exec(arg);
    if (!match) continue;
    const key = RATE_NAMES.find(name => name.toLowerCase() === match[1].replace(/-/g, ''));
    if (!key) throw Error(`Неизвестный коэффициент: ${arg}. Доступны: ${RATE_NAMES.join(', ')}`);
    raw[key] = match[2];
  }
  const { rates, warnings } = normalizeRates(raw);
  for (const warning of warnings) console.warn('Рейты: ' + warning);
  return rates;
}
// Тот же аудит таблиц, но с учётом коэффициентов сервера. При рейтах x1 числа совпадают с прежними.
// Если ближайший обычный моб отстаёт больше чем на девять уровней, он не даёт награды вовсе,
// и уровень становится недостижимым — такие строки помечаются прочерком, а не выдуманным числом.
function simulate(rates=DEFAULT_RATES) {
  let kills=0,coins=150,sales=0,sp=0,blockedAt=0;
  const checkpoints=[];
  for(let lvl=1;lvl<40;lvl++) {
    const mob=Object.values(MOBS).filter(m=>!m.boss&&m.lvl<=lvl).sort((a,b)=>b.lvl-a.lvl)[0];
    const base=xpForKill(mob,lvl,rates),gained=rateXp(base,rates);
    if(!blockedAt&&gained<=0)blockedAt=lvl;
    if(!blockedAt) {
      const count=Math.ceil(xpToNext(lvl)/gained);
      // штраф за разницу уровней одинаково режет опыт, монеты и шанс дропа
      const coinFactor=coinLevelFactor(mob.lvl,lvl,rates),dropFactor=dropLevelFactor(mob.lvl,lvl,rates);
      const expectedSale=Object.entries(mob.drops||{}).reduce((sum,[id,p])=>sum+rateSellPrice(sellPrice(ITEMS[id]),rates)*rateDropChance(p,rates,dropFactor)*rates.dropAmount,0);
      kills+=count; coins+=count*(mob.coins[0]+mob.coins[1])/2*rates.coins*coinFactor; sales+=count*expectedSale;sp+=count*rateSp(spForKill(base),rates);
    }
    if([3,5,8,12,18,25,32,40].includes(lvl+1)) checkpoints.push({level:lvl+1,blocked:Boolean(blockedAt),kills,coins:Math.round(coins),optionalSales:Math.round(sales),sp,learn:Object.fromEntries(Object.entries(CLASSES).map(([id,c])=>[id,c.skills.flatMap(skillRanks).filter(s=>s.lvl<=lvl+1).reduce((n,s)=>n+s.sp,0)]))});
  }
  checkpoints.blockedAt=blockedAt;
  return checkpoints;
}
const rates=ratesFromArgv(process.argv.slice(2));
const checkpoints=simulate(rates);
const gears=[];
for(const grade of ['d','c'])for(const cls of ['warrior','mage']) {
  const set=({d:{warrior:'leather',mage:'apprentice'},c:{warrior:'chain',mage:'mystic'}})[grade][cls];
  const weapon=({d:{warrior:'sword_long',mage:'staff_oak'},c:{warrior:'sword_crystal',mage:'staff_crystal'}})[grade][cls];
  const jewelry=grade==='d'?'bronze':'silver';
  const ids=[weapon,...SETS[set].parts,`ear_${jewelry}`,`ear_${jewelry}`,`neck_${jewelry}`,`ring_${jewelry}`,`ring_${jewelry}`,...(cls==='warrior'?[grade==='d'?'shield_wood':'shield_iron']:[])];
  gears.push({grade,cls,weapon:ITEMS[weapon].price,kit:ids.reduce((n,id)=>n+ITEMS[id].price,0)});
}
// Элиты и чемпионы: доля помеченных точек спавна и средние множители на один обычный спавн.
// Ранг детерминирован, поэтому здесь считается реальный мир, а не предполагаемая вероятность.
const spawns=buildProps().spawns;
const rankedSpawns=spawns.map((sp,i)=>({sp,def:rankedDef(MOBS[sp.mob],sp,i+1)}));
const rankable=rankedSpawns.filter(({sp,def})=>!sp.camp&&!def.boss);
const counts={elite:rankable.filter(r=>r.def.rank==='elite').length,champion:rankable.filter(r=>r.def.rank==='champion').length};
counts.plain=rankable.length-counts.elite-counts.champion;
const share=k=>counts[k]/rankable.length;
const ranks={
  spawns:spawns.length, rankable:rankable.length, ...counts,
  // Средняя награда и средняя живучесть одной случайной цели относительно обычного моба.
  reward:+(share('plain')+share('elite')*ELITE.reward+share('champion')*CHAMPION.reward).toFixed(4),
  toughness:+(share('plain')+share('elite')*ELITE.hp+share('champion')*CHAMPION.hp).toFixed(4),
};
// Награда за единицу нанесённого урона: именно она показывает, сдвинулась ли экономика.
ranks.rewardPerDamage=+(ranks.reward/ranks.toughness).toFixed(4);
const report={rates,ranks,blockedAt:checkpoints.blockedAt,assumptions:'Без смертей; ближайший по уровню обычный моб не выше игрока; округление убийств вверх для каждого уровня; монеты без расходов; продажа ВСЕГО случайного дропа приведена отдельно, вещи для экипировки/крафта в таком сценарии не остаются.',checkpoints,gears,recipes:RECIPES};
const rateNote=isDefaultRates(rates)?[]:[`**Рейты сервера: ${describeRates(rates)}.** Таблица пересчитана под них; канонический файл в репозитории остаётся расчётом ×1.`,''];
const lines=['# Расчёт экономики', '', 'Воспроизведение: `npm run native:economy`; обновить этот файл: `npm run native:economy -- --write`. Коэффициенты сервера: `--rates=2` или `--rate-xp=3` (см. docs/RATES.md).', '', ...rateNote, report.assumptions, '', 'Это аудит таблиц, а не замер реального времени игры. Он не учитывает скорость поиска целей, бой, отдых, группы, PvP, покупки, заточку и телепорты. Баланс требует игровых сессий.', '', '| Уровень | Убийств суммарно | Монеты | Доп. продажа всего дропа | SP | Стоимость всех доступных рангов: воин / маг |','|---|---:|---:|---:|---:|---:|',...checkpoints.map(r=>`| ${r.level} | ${r.blocked?'—':money(r.kills)} | ${r.blocked?'—':money(r.coins)} | ${r.blocked?'—':money(r.optionalSales)} | ${r.blocked?'—':money(r.sp)} | ${money(r.learn.warrior)} / ${money(r.learn.mage)} |`),'','| Грейд / класс | Оружие | Оружие, броня, щит и 5 украшений |','|---|---:|---:|',...gears.map(r=>`| ${r.grade.toUpperCase()} / ${CLASSES[r.cls].name} | ${money(r.weapon)} | ${money(r.kit)} |`),'','## Решения','','- Монеты создаются наградами мобов и продажей предметов NPC. Выводятся покупками, изготовлением, телепортами, очищением кармы и заточкой. SP тратятся отдельно, покупки навыков не конкурируют с оружием за монеты.','- Начальные бесплатные вещи нельзя продавать. Все рецепты проверяются на отсутствие прибыли от цикла «изготовить → продать NPC». Цена ингредиентов здесь — их выкупная стоимость, рынка игроков пока нет.','- D/C-оружие можно купить или изготовить дешевле за добытые материалы. Полный комплект собирается постепенно; новый грейд не означает автоматическую выдачу всего набора.','- B-оружие: 8 печатей, 120 кристаллов, 60 эктоплазмы, 12 000 монет. Оба класса платят одинаково. Печать гарантирована победителю босса; дополнительные вещи выпадают независимо.','- Комплект B воина и мага имеет одинаковую суммарную гарантированную цену (12 печатей, 160 кристаллов, 78 эктоплазмы, 16 000 монет). У мага мантия заменяет и верх, и поножи. Щит и украшения приобретаются отдельно.','- Ресурсы выбирают между продажей сейчас и изготовлением позже; печати нельзя продать. Крафт у торговца, 100% успех, материалы и плата сохраняются одной серверной операцией.','- После +3 заточка может уничтожить предмет. Она остаётся добровольным расходом; ранги навыков и обычные рецепты не имеют случайной неудачи.','- Разница уровней режет опыт, SP, монеты и шанс дропа одинаково и в обе стороны: до трёх уровней награда полная, 4–6 — штраф, 7–9 — крохи, от десяти — ноль. Фарм слабых мобов ради денег и вещей больше не выгоден, как и прокачка на мобах много выше уровня. Ступени настраиваются рейтами, см. docs/RATES.md.','- В группе награда считается один раз по старшему участнику и делится по весам: доля растёт с уровнем (квадрат уровня) и режется отставанием от старшего по той же кривой. Отставший больше чем на девять уровней не получает ничего.','','## Элиты и чемпионы','',
`Ранг точки спавна детерминирован (\`src/elites.js\`). Из ${ranks.spawns} точек мира ранг могут получить ${ranks.rankable} (охотничьи лагеря и босс исключены): ${ranks.elite} элит и ${ranks.champion} чемпионов.`,'',
'| Величина | Значение |','|---|---:|',
`| Доля элит среди обычных спавнов | ${(share('elite')*100).toFixed(1)} % |`,
`| Доля чемпионов | ${(share('champion')*100).toFixed(1)} % |`,
`| Средняя награда случайной цели (обычный = 1) | ×${ranks.reward} |`,
`| Средняя живучесть случайной цели | ×${ranks.toughness} |`,
`| Награда на единицу нанесённого урона | ×${ranks.rewardPerDamage} |`,'',
`Опыт и монеты за одну цель выросли в среднем на ${((ranks.reward-1)*100).toFixed(1)} %, но столько же примерно стоит и убийство: элита живучее в ${ELITE.hp} раза, чемпион — в ${CHAMPION.hp}. На единицу нанесённого урона выдача изменилась всего на ${((ranks.rewardPerDamage-1)*100).toFixed(1)} %. Ранг умножает награду один раз, при спавне, а штраф за разницу уровней применяется отдельно в точке выдачи: с разницы в десять уровней ноль остаётся нулём и для элиты, и для чемпиона.`,'',
'Чемпион отдаёт добычу в ' + CHAMPION.drop + ' раз чаще и возрождается через ' + CHAMPION.respawn + ' с вместо 25 — редкая цель не превращается в ферму. Стартовые охотничьи лагеря рангов не получают, поэтому первые пять уровней проходятся прежним темпом.','',
'## Предел текущего контента','',`Обычные мобы заканчиваются на 24 уровне, босс — на 28. Ступенчатый штраф за разницу уровней делает их бесполезными с разницы в десять уровней, поэтому прокачка обычными мобами упирается в ${checkpoints.blockedAt?checkpoints.blockedAt+1:34} уровень — дальше в таблице прочерк, а не выдуманные числа. Это не «сложный эндгейм», а отсутствие контента: для уровней выше нужны новые зоны и мобы этих уровней. Сейчас основной законченный цикл снаряжения — D → C → B на уровнях 8 / 18 / 25. Массовая торговля, кланы, рынок ресурсов и инфляция между игроками ещё не реализованы. Не обещать им готовый баланс.`,''];
fs.mkdirSync(path.join(root,'.native-run'),{recursive:true});
fs.writeFileSync(path.join(root,'.native-run/economy.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(root,'.native-run/economy.md'),lines.join('\n'));
if(process.argv.includes('--write')) {
  if(!isDefaultRates(rates))throw Error('docs/ECONOMY_BALANCE.md описывает баланс ×1: запись с изменёнными рейтами запрещена');
  fs.writeFileSync(path.join(root,'docs/ECONOMY_BALANCE.md'),lines.join('\n'));
}
console.log([...rateNote,...lines.slice(6+rateNote.length,22+rateNote.length)].join('\n'));
// --compare: во что превращается путь до 25 и 40 уровня на типичных множителях
if(process.argv.includes('--compare')) {
  const columns=[1,2,5,10].map(n=>({n,rows:simulate(normalizeRates(Object.fromEntries(['xp','sp','coins','dropChance'].map(k=>[k,n]))).rates)}));
  const pick=(rows,level)=>rows.find(r=>r.level===level);
  const cell=(row,field)=>row.blocked?'—':money(row[field]);
  const table=['','## Влияние рейтов на путь до 25 и 40 уровня','','Равномерные множители опыта/SP/монет/шанса дропа. Остальные коэффициенты ×1. Прочерк — уровень недостижим: обычные мобы заканчиваются на 24 и с разницы в десять уровней награды не дают.','',
    '| Рейты | Убийств до 25 | Монеты к 25 | SP к 25 | Убийств до 32 | Монеты к 32 | До 40 |','|---|---:|---:|---:|---:|---:|---:|',
    ...columns.map(({n,rows})=>`| ×${n} | ${cell(pick(rows,25),'kills')} | ${cell(pick(rows,25),'coins')} | ${cell(pick(rows,25),'sp')} | ${cell(pick(rows,32),'kills')} | ${cell(pick(rows,32),'coins')} | ${pick(rows,40).blocked?'недостижим':money(pick(rows,40).kills)} |`)];
  fs.writeFileSync(path.join(root,'.native-run/economy-rates.md'),table.join('\n')+'\n');
  console.log(table.join('\n'));
}
