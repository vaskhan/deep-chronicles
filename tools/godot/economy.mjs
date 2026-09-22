// Deterministic economy audit. No invented playtime or assumed player market prices.
import fs from 'node:fs';
import path from 'node:path';
import { root } from './runtime.mjs';
import { CLASSES, ITEMS, MOBS, SETS, RECIPES, xpToNext } from '../../src/data.js';
import { sellPrice, xpForKill } from '../../src/sim.js';
import { skillRanks, spForKill } from '../../src/progression.js';
import { buildProps } from '../../src/world-core.js';
import { rankedDef, ELITE, CHAMPION } from '../../src/elites.js';
const money = n => Math.round(n).toLocaleString('ru-RU');
let kills=0,coins=150,sales=0,sp=0;
const checkpoints=[];
for(let lvl=1;lvl<40;lvl++) {
  const mob=Object.values(MOBS).filter(m=>!m.boss&&m.lvl<=lvl).sort((a,b)=>b.lvl-a.lvl)[0];
  const count=Math.ceil(xpToNext(lvl)/xpForKill(mob,lvl));
  const expectedSale=Object.entries(mob.drops||{}).reduce((sum,[id,p])=>sum+sellPrice(ITEMS[id])*p,0);
  kills+=count; coins+=count*(mob.coins[0]+mob.coins[1])/2; sales+=count*expectedSale;sp+=count*spForKill(xpForKill(mob,lvl));
  if([3,5,8,12,18,25,32,40].includes(lvl+1)) checkpoints.push({level:lvl+1,kills,coins:Math.round(coins),optionalSales:Math.round(sales),sp,learn:Object.fromEntries(Object.entries(CLASSES).map(([id,c])=>[id,c.skills.flatMap(skillRanks).filter(s=>s.lvl<=lvl+1).reduce((n,s)=>n+s.sp,0)]))});
}
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
const report={ranks,assumptions:'Без смертей; ближайший по уровню обычный моб не выше игрока; округление убийств вверх для каждого уровня; монеты без расходов; продажа ВСЕГО случайного дропа приведена отдельно, вещи для экипировки/крафта в таком сценарии не остаются.',checkpoints,gears,recipes:RECIPES};
const lines=['# Расчёт экономики', '', 'Воспроизведение: `npm run native:economy`; обновить этот файл: `npm run native:economy -- --write`.', '', report.assumptions, '', 'Это аудит таблиц, а не замер реального времени игры. Он не учитывает скорость поиска целей, бой, отдых, группы, PvP, покупки, заточку и телепорты. Баланс требует игровых сессий.', '', '| Уровень | Убийств суммарно | Монеты | Доп. продажа всего дропа | SP | Стоимость всех доступных рангов: воин / маг |','|---|---:|---:|---:|---:|---:|',...checkpoints.map(r=>`| ${r.level} | ${money(r.kills)} | ${money(r.coins)} | ${money(r.optionalSales)} | ${money(r.sp)} | ${money(r.learn.warrior)} / ${money(r.learn.mage)} |`),'','| Грейд / класс | Оружие | Оружие, броня, щит и 5 украшений |','|---|---:|---:|',...gears.map(r=>`| ${r.grade.toUpperCase()} / ${CLASSES[r.cls].name} | ${money(r.weapon)} | ${money(r.kit)} |`),'','## Решения','','- Монеты создаются наградами мобов и продажей предметов NPC. Выводятся покупками, изготовлением, телепортами, очищением кармы и заточкой. SP тратятся отдельно, покупки навыков не конкурируют с оружием за монеты.','- Начальные бесплатные вещи нельзя продавать. Все рецепты проверяются на отсутствие прибыли от цикла «изготовить → продать NPC». Цена ингредиентов здесь — их выкупная стоимость, рынка игроков пока нет.','- D/C-оружие можно купить или изготовить дешевле за добытые материалы. Полный комплект собирается постепенно; новый грейд не означает автоматическую выдачу всего набора.','- B-оружие: 8 печатей, 120 кристаллов, 60 эктоплазмы, 12 000 монет. Оба класса платят одинаково. Печать гарантирована победителю босса; дополнительные вещи выпадают независимо.','- Комплект B воина и мага имеет одинаковую суммарную гарантированную цену (12 печатей, 160 кристаллов, 78 эктоплазмы, 16 000 монет). У мага мантия заменяет и верх, и поножи. Щит и украшения приобретаются отдельно.','- Ресурсы выбирают между продажей сейчас и изготовлением позже; печати нельзя продать. Крафт у торговца, 100% успех, материалы и плата сохраняются одной серверной операцией.','- После +3 заточка может уничтожить предмет. Она остаётся добровольным расходом; ранги навыков и обычные рецепты не имеют случайной неудачи.','','## Элиты и чемпионы','',
`Ранг точки спавна детерминирован (\`src/elites.js\`). Из ${ranks.spawns} точек мира ранг могут получить ${ranks.rankable} (охотничьи лагеря и босс исключены): ${ranks.elite} элит и ${ranks.champion} чемпионов.`,'',
'| Величина | Значение |','|---|---:|',
`| Доля элит среди обычных спавнов | ${(share('elite')*100).toFixed(1)} % |`,
`| Доля чемпионов | ${(share('champion')*100).toFixed(1)} % |`,
`| Средняя награда случайной цели (обычный = 1) | ×${ranks.reward} |`,
`| Средняя живучесть случайной цели | ×${ranks.toughness} |`,
`| Награда на единицу нанесённого урона | ×${ranks.rewardPerDamage} |`,'',
`Опыт и монеты за одну цель выросли в среднем на ${((ranks.reward-1)*100).toFixed(1)} %, но столько же примерно стоит и убийство: элита живучее в ${ELITE.hp} раза, чемпион — в ${CHAMPION.hp}. На единицу нанесённого урона выдача изменилась всего на ${((ranks.rewardPerDamage-1)*100).toFixed(1)} %. Таблица уровней выше считает обычных мобов и остаётся верхней границей числа убийств: встреча с элитой сокращает его, а не удлиняет.`,'',
'Чемпион отдаёт добычу в ' + CHAMPION.drop + ' раз чаще и возрождается через ' + CHAMPION.respawn + ' с вместо 25 — редкая цель не превращается в ферму. Стартовые охотничьи лагеря рангов не получают, поэтому первые пять уровней проходятся прежним темпом.','',
'## Предел текущего контента','','Обычные мобы заканчиваются на 24 уровне, босс — на 28. Таблица честно показывает резкий рост числа убийств после 30 из-за штрафа опыта. Нельзя считать уровни 32–40 сбалансированным эндгеймом: для следующего расширения нужны новые зоны и обычные мобы этих уровней. Сейчас основной законченный цикл снаряжения — D → C → B на уровнях 8 / 18 / 25. Массовая торговля, кланы, рынок ресурсов и инфляция между игроками ещё не реализованы. Не обещать им готовый баланс.',''];
fs.mkdirSync(path.join(root,'.native-run'),{recursive:true});
fs.writeFileSync(path.join(root,'.native-run/economy.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(root,'.native-run/economy.md'),lines.join('\n'));
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,'docs/ECONOMY_BALANCE.md'),lines.join('\n'));
console.log(lines.slice(6,22).join('\n'));
