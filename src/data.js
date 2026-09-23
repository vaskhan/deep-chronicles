// Данные мира: классы, предметы, мобы, умения, зоны. Всё своё — механика в духе старых MMORPG.

export const MAX_LEVEL = 60;
// опыт до следующего уровня
export const xpToNext = (lv) => Math.round(60 * Math.pow(lv, 2.25));

export const CLASSES = {
  warrior: {
    name: 'Воин', color: 0xb04030,
    attr: { str: 40, dex: 30, con: 43, int: 21, wit: 11, men: 25 },
    base: { hp: 120, mp: 30, patk: 9, matk: 3, pdef: 40, mdef: 30, aspd: 0.60, speed: 26, crit: 0.08, critPower: 1.75 },
    grow: { aspd: 0.004, hp: 22, mp: 4, patk: 2.2, matk: 0.4, pdef: 2.0, mdef: 1.2 },
    skills: ['power_strike', 'battle_cry', 'whirlwind', 'blood_rage', 'defensive_stance', 'bleeding_strike', 'armor_crush', 'weapon_mastery', 'armor_mastery', 'vitality'],
    range: 3.2,
  },
  mage: {
    name: 'Маг', color: 0x3050c0,
    attr: { str: 22, dex: 21, con: 27, int: 41, wit: 20, men: 39 },
    base: { hp: 100, mp: 90, patk: 4, matk: 12, pdef: 30, mdef: 45, aspd: 0.50, speed: 24, crit: 0.05, critPower: 1.6 },
    grow: { cast: 0.006, aspd: 0.003, hp: 21, mp: 14, patk: 0.6, matk: 2.6, pdef: 1.2, mdef: 2.0 },
    skills: ['fire_bolt', 'heal', 'ice_nova', 'curse', 'wind_strike', 'magic_shield', 'empower', 'magic_mastery', 'robe_mastery', 'mana_mastery'],
    range: 3.2,
  },
};

// умения: kind — dmg (физ/маг), heal, buff, aoe.
// Поля эффектов во времени (правила — src/effects.js): dot — урон со временем,
// hot — лечение со временем, debuff — ослабление характеристики, slow — замедление,
// drain — вампиризм. Сила эффектов растёт по рангам в src/progression.js.
export const SKILLS = {
  power_strike: { name: 'Мощный удар', key: '1', mp: 8, cd: 5, kind: 'dmg', school: 'p', mul: 1.6, range: 3.5, color: 0xffa040, lvl: 1 },
  battle_cry: { name: 'Боевой клич', key: '2', mp: 15, cd: 40, kind: 'buff', stat: 'patk', mul: 1.3, dur: 20, color: 0xff4040, lvl: 5 },
  whirlwind: { name: 'Вихрь', key: '3', mp: 22, cd: 10, kind: 'aoe', school: 'p', mul: 1.6, radius: 7, color: 0xffd060, lvl: 10 },
  blood_rage: { name: 'Кровавая ярость', key: '4', mp: 20, cd: 45, kind: 'buff', drain: { mul: 0.3, dur: 12 }, color: 0xc0303a, lvl: 15 },
  fire_bolt: { name: 'Огненная стрела', key: '1', mp: 10, cd: 2.2, kind: 'dmg', school: 'm', mul: 2.2, range: 24, color: 0xff5010, cast: 1.5, lvl: 1 },
  heal: { name: 'Исцеление', key: '2', mp: 18, cd: 6, kind: 'heal', amount: 0.24, hot: { amount: 0.03, dur: 6, tick: 1.5 }, color: 0x60ff90, cast: 1.4, lvl: 7 },
  ice_nova: { name: 'Ледяная волна', key: '3', mp: 30, cd: 12, kind: 'aoe', school: 'm', mul: 1.8, radius: 9, slow: { mul: 0.55, dur: 6 }, color: 0x80d0ff, cast: 0.9, lvl: 14 },
  curse: { name: 'Печать немощи', key: '4', mp: 22, cd: 14, kind: 'dmg', school: 'm', mul: 0.8, range: 20, dot: { mul: 2.4, dur: 9, tick: 1.5 }, debuff: { stat: 'patk', mul: 0.72, dur: 9 }, color: 0x9a4bd8, cast: 1.3, lvl: 14 },
  defensive_stance: { name: 'Защитная стойка', mp: 10, cd: 35, kind: 'buff', stat: 'pdef', mul: 1.25, dur: 15, school: 'p', color: 0xbad1e8, lvl: 5, icon: 'battle_cry' },
  bleeding_strike: { name: 'Кровоточащий удар', mp: 12, cd: 10, kind: 'dmg', school: 'p', mul: 1.0, range: 3.5, dot: { mul: 1.5, dur: 9, tick: 1.5 }, color: 0xc94949, lvl: 10, icon: 'power_strike' },
  armor_crush: { name: 'Разрушение брони', mp: 14, cd: 12, kind: 'dmg', school: 'p', mul: 1.15, range: 3.5, debuff: { stat: 'pdef', mul: 0.8, dur: 8 }, color: 0xe3ae72, lvl: 15, icon: 'power_strike' },
  wind_strike: { name: 'Удар ветра', mp: 9, cd: 3.5, kind: 'dmg', school: 'm', mul: 1.8, range: 22, cast: 1.1, color: 0x9ce7ce, lvl: 7, icon: 'fire_bolt' },
  magic_shield: { name: 'Магический щит', mp: 16, cd: 35, kind: 'buff', stat: 'pdef', mul: 1.3, dur: 18, cast: 1.0, color: 0x91c9ff, lvl: 7, icon: 'battle_cry' },
  empower: { name: 'Усиление магии', mp: 20, cd: 45, kind: 'buff', stat: 'matk', mul: 1.15, dur: 20, cast: 1.4, color: 0xc08bff, lvl: 14, icon: 'battle_cry' },
  // умения профессий: открываются только после выбора профессии и учатся за SP на общих правилах.
  // needShield — требование к экипировке, проверяет сервер. icon — семейство существующей иконки.
  shield_bash: { name: 'Удар щитом', mp: 20, cd: 9, kind: 'dmg', school: 'p', mul: 1.8, range: 3.5, needShield: true, color: 0xc0d0e0, lvl: 20, icon: 'shield_iron' },
  iron_will: { name: 'Железная воля', mp: 30, cd: 60, kind: 'buff', stat: 'pdef', mul: 1.4, dur: 30, color: 0x90a0c0, lvl: 24, icon: 'battle_cry' },
  frenzy: { name: 'Неистовство', mp: 25, cd: 60, kind: 'buff', stat: 'patk', mul: 1.5, dur: 15, color: 0xff3020, lvl: 20, icon: 'battle_cry' },
  cleave: { name: 'Рассекающий удар', mp: 28, cd: 7, kind: 'dmg', school: 'p', mul: 2.2, range: 3.5, color: 0xff7040, lvl: 24, icon: 'power_strike' },
  lightning: { name: 'Цепная молния', mp: 34, cd: 5, kind: 'dmg', school: 'm', mul: 3.0, range: 26, color: 0xa0c0ff, cast: 2.0, lvl: 20, icon: 'fire_bolt' },
  meteor: { name: 'Метеор', mp: 60, cd: 18, kind: 'aoe', school: 'm', mul: 2.6, radius: 8, color: 0xff6020, cast: 2.8, lvl: 25, icon: 'ice_nova' },
  heal_major: { name: 'Великое исцеление', mp: 40, cd: 10, kind: 'heal', amount: 0.7, color: 0x90ffb0, cast: 2.2, lvl: 20, icon: 'heal' },
  blessing: { name: 'Благословение', mp: 35, cd: 90, kind: 'buff', stat: 'mdef', mul: 1.35, dur: 60, color: 0xfff0a0, cast: 1.0, lvl: 25, icon: 'heal' },
  weapon_mastery: { name: 'Владение оружием', kind: 'passive', stat: 'patk', mul: 1.04, mp: 0, cd: 0, lvl: 5, icon: 'power_strike', color: 0xc3b789 },
  armor_mastery: { name: 'Владение бронёй', kind: 'passive', stat: 'pdef', mul: 1.06, mp: 0, cd: 0, lvl: 5, icon: 'battle_cry', color: 0xc3b789 },
  vitality: { name: 'Жизненная сила', kind: 'passive', stat: 'maxHp', mul: 1.04, mp: 0, cd: 0, lvl: 10, icon: 'heal', color: 0xc3b789 },
  magic_mastery: { name: 'Владение магией', kind: 'passive', stat: 'matk', mul: 1.04, mp: 0, cd: 0, lvl: 7, icon: 'fire_bolt', color: 0xc3b789 },
  robe_mastery: { name: 'Владение мантией', kind: 'passive', stat: 'pdef', mul: 1.06, mp: 0, cd: 0, lvl: 7, icon: 'battle_cry', color: 0xc3b789 },
  mana_mastery: { name: 'Запас маны', kind: 'passive', stat: 'maxMp', mul: 1.08, mp: 0, cd: 0, lvl: 14, icon: 'heal', color: 0xc3b789 },
  shield_mastery: { name: 'Мастерство щита', kind: 'passive', stat: 'pdef', mul: 1.06, mp: 0, cd: 0, lvl: 20, icon: 'battle_cry', color: 0xc3b789, needShield: true },
  iron_body: { name: 'Железное тело', kind: 'passive', stat: 'maxHp', mul: 1.06, mp: 0, cd: 0, lvl: 32, icon: 'heal', color: 0xc3b789 },
  knight_will: { name: 'Воля стража', kind: 'passive', stat: 'mdef', mul: 1.08, mp: 0, cd: 0, lvl: 43, icon: 'battle_cry', color: 0xc3b789 },
  berserk_mastery: { name: 'Мастерство берсерка', kind: 'passive', stat: 'patk', mul: 1.05, mp: 0, cd: 0, lvl: 20, icon: 'power_strike', color: 0xc3b789 },
  keen_edge: { name: 'Точность клинка', kind: 'passive', stat: 'crit', mul: 1.1, mp: 0, cd: 0, lvl: 32, icon: 'power_strike', color: 0xc3b789 },
  battle_endurance: { name: 'Боевая выносливость', kind: 'passive', stat: 'maxHp', mul: 1.05, mp: 0, cd: 0, lvl: 43, icon: 'heal', color: 0xc3b789 },
  spell_mastery: { name: 'Мастерство заклинаний', kind: 'passive', stat: 'matk', mul: 1.05, mp: 0, cd: 0, lvl: 20, icon: 'fire_bolt', color: 0xc3b789 },
  quick_chant: { name: 'Быстрое чтение', kind: 'passive', stat: 'cast', mul: 1.04, mp: 0, cd: 0, lvl: 35, icon: 'fire_bolt', color: 0xc3b789 },
  deep_reserve: { name: 'Глубокий резерв', kind: 'passive', stat: 'maxMp', mul: 1.1, mp: 0, cd: 0, lvl: 44, icon: 'heal', color: 0xc3b789 },
  healer_wisdom: { name: 'Мудрость целителя', kind: 'passive', stat: 'mdef', mul: 1.08, mp: 0, cd: 0, lvl: 20, icon: 'heal', color: 0xc3b789 },
  healer_devotion: { name: 'Сосредоточенность', kind: 'passive', stat: 'cast', mul: 1.04, mp: 0, cd: 0, lvl: 35, icon: 'heal', color: 0xc3b789 },
  healer_reserve: { name: 'Резерв целителя', kind: 'passive', stat: 'maxMp', mul: 1.1, mp: 0, cd: 0, lvl: 44, icon: 'heal', color: 0xc3b789 },
  second_wind: { name: 'Второе дыхание', kind: 'heal', amount: 0.22, mp: 18, cd: 25, cast: 1.4, lvl: 28, color: 0x8fddaf, icon: 'heal' },
  shield_wall: { name: 'Стена щитов', kind: 'buff', stat: 'pdef', mul: 1.5, needShield: true, mp: 24, cd: 45, dur: 10, lvl: 40, color: 0xaabfee, icon: 'battle_cry' },
  judgement: { name: 'Приговор', kind: 'dmg', school: 'p', mul: 1.8, range: 3.5, debuff: { stat: 'patk', mul: 0.8, dur: 7 }, mp: 22, cd: 10, lvl: 46, color: 0xf2d493, icon: 'power_strike' },
  battle_focus: { name: 'Боевой фокус', kind: 'buff', stat: 'aspd', mul: 1.12, mp: 20, cd: 40, dur: 15, lvl: 28, color: 0xf5c371, icon: 'battle_cry' },
  savage_strike: { name: 'Яростный удар', kind: 'dmg', school: 'p', mul: 2.4, range: 3.5, mp: 26, cd: 9, lvl: 40, color: 0xff784a, icon: 'power_strike' },
  blood_storm: { name: 'Кровавая буря', kind: 'aoe', school: 'p', mul: 1.2, radius: 5, dot: { mul: 1.6, dur: 8, tick: 2 }, mp: 34, cd: 18, lvl: 46, color: 0xba324c, icon: 'whirlwind' },
  flame_wave: { name: 'Огненное кольцо', kind: 'aoe', school: 'm', mul: 2.0, radius: 7, mp: 35, cd: 12, cast: 1.8, lvl: 30, color: 0xff743c, icon: 'ice_nova' },
  arcane_surge: { name: 'Магический порыв', kind: 'buff', stat: 'cast', mul: 1.1, mp: 28, cd: 45, dur: 15, cast: 1.2, lvl: 40, color: 0xbda1ff, icon: 'battle_cry' },
  frost_lance: { name: 'Ледяное копьё', kind: 'dmg', school: 'm', mul: 2.5, range: 25, debuff: { stat: 'patk', mul: 0.8, dur: 6 }, mp: 32, cd: 7, cast: 1.9, lvl: 48, color: 0x9fe9ff, icon: 'fire_bolt' },
  renewal: { name: 'Обновление', kind: 'heal', amount: 0.1, hot: { amount: 0.04, dur: 10, tick: 2 }, mp: 26, cd: 15, cast: 1.0, lvl: 30, color: 0x78efbd, icon: 'heal' },
  holy_bolt: { name: 'Священная стрела', kind: 'dmg', school: 'm', mul: 2.1, range: 24, mp: 22, cd: 4, cast: 1.5, lvl: 40, color: 0xffe7ac, icon: 'fire_bolt' },
  protective_ward: { name: 'Защитный покров', kind: 'buff', stat: 'pdef', mul: 1.4, mp: 30, cd: 45, dur: 15, cast: 1.4, lvl: 48, color: 0xb7efd8, icon: 'battle_cry' },

  sacred_guard: { name: 'Священный заслон', kind: 'buff', mp: 30, cd: 12, lvl: 40, icon: 'power_strike', color: 0xd8bded, stat: 'mdef', mul: 1.35, dur: 15, cast: 1.2 },
  paladin_resolve: { name: 'Стойкость паладина', kind: 'passive', stat: 'pdef', mul: 1.04, mp: 0, cd: 0, lvl: 49, icon: 'battle_cry', color: 0xc3b789 },
  dark_verdict: { name: 'Тёмный приговор', kind: 'dmg', mp: 30, cd: 12, lvl: 40, icon: 'power_strike', color: 0xd8bded, school: 'p', mul: 2.0, range: 3.5 },
  dark_resolve: { name: 'Воля тёмного стража', kind: 'passive', stat: 'maxHp', mul: 1.04, mp: 0, cd: 0, lvl: 49, icon: 'battle_cry', color: 0xc3b789 },
  sonic_strike: { name: 'Звуковой удар', kind: 'dmg', mp: 30, cd: 12, lvl: 40, icon: 'power_strike', color: 0xd8bded, school: 'p', mul: 2.2, range: 3.5 },
  gladiator_mastery: { name: 'Мастерство гладиатора', kind: 'passive', stat: 'patk', mul: 1.04, mp: 0, cd: 0, lvl: 49, icon: 'battle_cry', color: 0xc3b789 },
  war_sweep: { name: 'Великий вихрь', kind: 'aoe', mp: 30, cd: 12, lvl: 40, icon: 'power_strike', color: 0xd8bded, school: 'p', mul: 1.9, radius: 7 },
  warlord_endurance: { name: 'Выносливость воеводы', kind: 'passive', stat: 'maxHp', mul: 1.04, mp: 0, cd: 0, lvl: 49, icon: 'battle_cry', color: 0xc3b789 },
  arcane_bolt: { name: 'Чародейская стрела', kind: 'dmg', mp: 30, cd: 12, lvl: 40, icon: 'fire_bolt', color: 0xd8bded, school: 'm', mul: 2.5, range: 25, cast: 2.0 },
  arcane_mastery: { name: 'Высшая магия', kind: 'passive', stat: 'matk', mul: 1.04, mp: 0, cd: 0, lvl: 48, icon: 'battle_cry', color: 0xc3b789 },
  storm_ring: { name: 'Кольцо бури', kind: 'aoe', mp: 30, cd: 12, lvl: 40, icon: 'fire_bolt', color: 0xd8bded, school: 'm', mul: 2.2, radius: 7, cast: 2.0 },
  storm_mastery: { name: 'Мастерство бури', kind: 'passive', stat: 'cast', mul: 1.04, mp: 0, cd: 0, lvl: 48, icon: 'battle_cry', color: 0xc3b789 },
  divine_recovery: { name: 'Божественное восстановление', kind: 'heal', mp: 30, cd: 12, lvl: 40, icon: 'fire_bolt', color: 0xd8bded, amount: 0.38, cast: 1.8 },
  bishop_wisdom: { name: 'Мудрость епископа', kind: 'passive', stat: 'mdef', mul: 1.04, mp: 0, cd: 0, lvl: 48, icon: 'battle_cry', color: 0xc3b789 },
  prophecy: { name: 'Пророчество защиты', kind: 'buff', mp: 30, cd: 12, lvl: 40, icon: 'fire_bolt', color: 0xd8bded, stat: 'pdef', mul: 1.3, dur: 15, cast: 1.2 },
  prophet_reserve: { name: 'Резерв пророка', kind: 'passive', stat: 'maxMp', mul: 1.04, mp: 0, cd: 0, lvl: 48, icon: 'battle_cry', color: 0xc3b789 },

};

// Профессия выбирается один раз с PROF_LVL уровня и уже не меняется.
// bonus — множители к готовым характеристикам (см. src/stats.js::calcStats), skills — активные и пассивные умения профессии.
export const PROF_LVL = 20;
export const SECOND_PROF_LVL = 40;
export const PROFESSIONS = {
  knight: { name: 'Страж', base: 'warrior', desc: 'Щит и тяжёлая броня: держит удар и прикрывает группу.', bonus: { maxHp: 1.15, pdef: 1.15, aspd: 1.04 }, skills: ['second_wind', 'shield_wall', 'judgement', 'shield_mastery', 'iron_body', 'knight_will', 'shield_bash', 'iron_will'] },
  berserker: { name: 'Берсерк', base: 'warrior', desc: 'Максимум урона ценой собственной защиты.', bonus: { patk: 1.12, crit: 1.25, pdef: 0.95, aspd: 1.12, critPower: 1.08 }, skills: ['battle_focus', 'savage_strike', 'blood_storm', 'berserk_mastery', 'keen_edge', 'battle_endurance', 'frenzy', 'cleave'] },
  sorcerer: { name: 'Чародей', base: 'mage', desc: 'Разрушительная магия и быстрые заклинания.', bonus: { matk: 1.15, cast: 1.1 }, skills: ['flame_wave', 'arcane_surge', 'frost_lance', 'spell_mastery', 'quick_chant', 'deep_reserve', 'lightning', 'meteor'] },
  healer: { name: 'Целитель', base: 'mage', desc: 'Сильное лечение и благословения на защиту.', bonus: { maxMp: 1.2, mdef: 1.1 }, skills: ['renewal', 'holy_bolt', 'protective_ward', 'healer_wisdom', 'healer_devotion', 'healer_reserve', 'heal_major', 'blessing'] },
  paladin: { name: 'Паладин', base: 'warrior', parent: 'knight', tier: 2, desc: 'Вторая профессия: паладин.', bonus: { maxHp: 1.06 }, skills: ['sacred_guard', 'paladin_resolve'] },
  dark_guard: { name: 'Тёмный страж', base: 'warrior', parent: 'knight', tier: 2, desc: 'Вторая профессия: тёмный страж.', bonus: { pdef: 1.06 }, skills: ['dark_verdict', 'dark_resolve'] },
  gladiator: { name: 'Гладиатор', base: 'warrior', parent: 'berserker', tier: 2, desc: 'Вторая профессия: гладиатор.', bonus: { patk: 1.05 }, skills: ['sonic_strike', 'gladiator_mastery'] },
  warlord: { name: 'Воевода', base: 'warrior', parent: 'berserker', tier: 2, desc: 'Вторая профессия: воевода.', bonus: { maxHp: 1.06 }, skills: ['war_sweep', 'warlord_endurance'] },
  archmage: { name: 'Архимаг', base: 'mage', parent: 'sorcerer', tier: 2, desc: 'Вторая профессия: архимаг.', bonus: { matk: 1.05 }, skills: ['arcane_bolt', 'arcane_mastery'] },
  stormcaller: { name: 'Повелитель бурь', base: 'mage', parent: 'sorcerer', tier: 2, desc: 'Вторая профессия: повелитель бурь.', bonus: { cast: 1.04 }, skills: ['storm_ring', 'storm_mastery'] },
  bishop: { name: 'Епископ', base: 'mage', parent: 'healer', tier: 2, desc: 'Вторая профессия: епископ.', bonus: { maxMp: 1.08 }, skills: ['divine_recovery', 'bishop_wisdom'] },
  prophet: { name: 'Пророк', base: 'mage', parent: 'healer', tier: 2, desc: 'Вторая профессия: пророк.', bonus: { mdef: 1.06 }, skills: ['prophecy', 'prophet_reserve'] },

};

// грейды снаряжения
export const GRADES = { none: 'без грейда', d: 'D', c: 'C', b: 'B' };

// слоты куклы персонажа
export const SLOTS = [
  { id: 'ear1', name: 'Серьга', type: 'ear' }, { id: 'neck', name: 'Ожерелье', type: 'neck' }, { id: 'ear2', name: 'Серьга', type: 'ear' },
  { id: 'ring1', name: 'Кольцо', type: 'ring' }, { id: 'head', name: 'Шлем', type: 'head' }, { id: 'ring2', name: 'Кольцо', type: 'ring' },
  { id: 'weapon', name: 'Оружие', type: 'weapon' }, { id: 'armor', name: 'Доспех', type: 'armor' }, { id: 'shield', name: 'Щит', type: 'shield' },
  { id: 'gloves', name: 'Перчатки', type: 'gloves' }, { id: 'legs', name: 'Поножи', type: 'legs' }, { id: 'feet', name: 'Сапоги', type: 'feet' },
];

// w — вес, twoHand — занимает и щит, robe — мантия (не для воина), full — закрывает поножи, set — комплект
// Предел ячеек сумки. Стопка занимает одну ячейку. Держит сохранение профиля намного ниже
// предела записи (server/accounts.js, 64 000 байт): 200 ячеек — около 10 КБ.
export const BAG_SLOTS = 200;

export const ITEMS = {
  // оружие
  sword_novice: { name: 'Меч новичка', slot: 'weapon', grade: 'none', patk: 6, price: 0, w: 3, color: 0xa0a0a0 },
  staff_novice: { name: 'Посох новичка', slot: 'weapon', grade: 'none', patk: 3, matk: 6, price: 0, w: 2, twoHand: true, color: 0x8a6030 },
  sword_long: { name: 'Длинный меч', slot: 'weapon', grade: 'd', patk: 18, price: 900, lvl: 8, w: 3.5, color: 0xc0c8d0 },
  staff_oak: { name: 'Дубовый жезл', slot: 'weapon', grade: 'd', patk: 7, matk: 17, price: 900, lvl: 8, w: 2, twoHand: true, color: 0x6a4020 },
  sword_crystal: { name: 'Кристальный клинок', slot: 'weapon', grade: 'c', patk: 38, price: 6500, lvl: 18, w: 3.5, color: 0x80e0ff },
  staff_crystal: { name: 'Кристальный посох', slot: 'weapon', grade: 'c', patk: 14, matk: 36, price: 6500, lvl: 18, w: 2.2, twoHand: true, color: 0x90a0ff },
  sword_dragon: { name: 'Клинок дракона', slot: 'weapon', grade: 'b', patk: 70, price: 0, lvl: 25, w: 4, color: 0xff6030, rare: true },
  staff_abyss: { name: 'Посох глубин', slot: 'weapon', grade: 'b', patk: 24, matk: 68, price: 0, lvl: 25, w: 2.5, twoHand: true, color: 0x68dfd8, rare: true, icon: 'staff_crystal' },
  // щиты
  shield_wood: { name: 'Дощатый щит', slot: 'shield', grade: 'd', pdef: 12, price: 400, lvl: 8, w: 4, color: 0x8a6030 },
  shield_iron: { name: 'Железный щит', slot: 'shield', grade: 'c', pdef: 26, price: 2600, lvl: 18, w: 6, color: 0x9098a8 },
  // без грейда
  armor_cloth: { name: 'Холщовая рубаха', slot: 'armor', grade: 'none', pdef: 6, mdef: 4, price: 0, w: 2, color: 0x9a8a6a },
  legs_cloth: { name: 'Холщовые штаны', slot: 'legs', grade: 'none', pdef: 3, price: 0, w: 1.5, color: 0x6a5a40 },
  // D: кожаный (тяжёлый)
  helm_leather: { name: 'Кожаный шлем', slot: 'head', grade: 'd', pdef: 7, price: 350, lvl: 8, w: 1.5, set: 'leather', color: 0x7a4a2a },
  armor_leather: { name: 'Кожаный доспех', slot: 'armor', grade: 'd', pdef: 20, mdef: 4, price: 800, lvl: 8, w: 6, set: 'leather', color: 0x7a4a2a },
  legs_leather: { name: 'Кожаные поножи', slot: 'legs', grade: 'd', pdef: 11, price: 500, lvl: 8, w: 3, set: 'leather', color: 0x6a3e22 },
  gloves_leather: { name: 'Кожаные перчатки', slot: 'gloves', grade: 'd', pdef: 4, price: 250, lvl: 8, w: 0.8, set: 'leather', color: 0x7a4a2a },
  boots_leather: { name: 'Кожаные сапоги', slot: 'feet', grade: 'd', pdef: 4, price: 250, lvl: 8, w: 1, set: 'leather', color: 0x5a3a20 },
  // D: ученическая мантия (лёгкая)
  hat_apprentice: { name: 'Ученический капюшон', slot: 'head', grade: 'd', pdef: 4, mdef: 5, price: 350, lvl: 8, w: 0.5, set: 'apprentice', color: 0x3a6a8a },
  robe_apprentice: { name: 'Ученическая мантия', slot: 'armor', grade: 'd', pdef: 18, mdef: 12, mp: 30, price: 1100, lvl: 8, w: 3, robe: true, full: true, set: 'apprentice', color: 0x3a6a8a },
  gloves_apprentice: { name: 'Ученические перчатки', slot: 'gloves', grade: 'd', pdef: 3, mdef: 2, price: 250, lvl: 8, w: 0.4, set: 'apprentice', color: 0x2a4a6a },
  boots_apprentice: { name: 'Ученические туфли', slot: 'feet', grade: 'd', pdef: 3, mdef: 2, price: 250, lvl: 8, w: 0.6, set: 'apprentice', color: 0x2a4a6a },
  // C: кольчужный (тяжёлый)
  helm_chain: { name: 'Кольчужный шлем', slot: 'head', grade: 'c', pdef: 15, price: 2200, lvl: 18, w: 2.5, set: 'chain', color: 0x8090a0 },
  armor_chain: { name: 'Кольчуга', slot: 'armor', grade: 'c', pdef: 42, mdef: 8, price: 5500, lvl: 18, w: 9, set: 'chain', color: 0x8090a0 },
  legs_chain: { name: 'Кольчужные поножи', slot: 'legs', grade: 'c', pdef: 24, price: 3300, lvl: 18, w: 5, set: 'chain', color: 0x707e8e },
  gloves_chain: { name: 'Латные перчатки', slot: 'gloves', grade: 'c', pdef: 9, price: 1600, lvl: 18, w: 1.4, set: 'chain', color: 0x8090a0 },
  boots_chain: { name: 'Латные сапоги', slot: 'feet', grade: 'c', pdef: 9, price: 1600, lvl: 18, w: 2, set: 'chain', color: 0x606c7a },
  // C: мистическая мантия
  hat_mystic: { name: 'Мистическая шляпа', slot: 'head', grade: 'c', pdef: 9, mdef: 10, price: 2200, lvl: 18, w: 0.8, set: 'mystic', color: 0x5040a0 },
  robe_mystic: { name: 'Мистическая мантия', slot: 'armor', grade: 'c', pdef: 38, mdef: 30, mp: 70, price: 7500, lvl: 18, w: 4, robe: true, full: true, set: 'mystic', color: 0x5040a0 },
  gloves_mystic: { name: 'Мистические перчатки', slot: 'gloves', grade: 'c', pdef: 6, mdef: 5, price: 1600, lvl: 18, w: 0.5, set: 'mystic', color: 0x40308a },
  boots_mystic: { name: 'Мистические туфли', slot: 'feet', grade: 'c', pdef: 6, mdef: 5, price: 1600, lvl: 18, w: 0.8, set: 'mystic', color: 0x40308a },
  // B: костяной (добыча с босса)
  helm_bone: { name: 'Костяной шлем', slot: 'head', grade: 'b', pdef: 26, price: 0, lvl: 25, w: 3, set: 'bone', color: 0xe0dcc0, rare: true },
  armor_bone: { name: 'Костяной доспех', slot: 'armor', grade: 'b', pdef: 70, mdef: 20, price: 0, lvl: 25, w: 10, set: 'bone', color: 0xe0dcc0, rare: true },
  legs_bone: { name: 'Костяные поножи', slot: 'legs', grade: 'b', pdef: 40, price: 0, lvl: 25, w: 6, set: 'bone', color: 0xd0cab0, rare: true },
  gloves_bone: { name: 'Костяные перчатки', slot: 'gloves', grade: 'b', pdef: 15, price: 0, lvl: 25, w: 1.6, set: 'bone', color: 0xe0dcc0, rare: true },
  boots_bone: { name: 'Костяные сапоги', slot: 'feet', grade: 'b', pdef: 15, price: 0, lvl: 25, w: 2.2, set: 'bone', color: 0xc8c2a8, rare: true },
  // B: комплект мага — та же ступень, что костяной комплект воина.
  hat_abyss: { name: 'Капюшон глубин', slot: 'head', grade: 'b', pdef: 16, mdef: 20, price: 0, lvl: 25, w: 1, set: 'abyss', color: 0x286e75, rare: true, icon: 'hat_mystic' },
  robe_abyss: { name: 'Мантия глубин', slot: 'armor', grade: 'b', pdef: 60, mdef: 50, mp: 120, price: 0, lvl: 25, w: 4.5, robe: true, full: true, set: 'abyss', color: 0x286e75, rare: true, icon: 'robe_mystic' },
  gloves_abyss: { name: 'Перчатки глубин', slot: 'gloves', grade: 'b', pdef: 10, mdef: 9, price: 0, lvl: 25, w: 0.6, set: 'abyss', color: 0x205c63, rare: true, icon: 'gloves_mystic' },
  boots_abyss: { name: 'Сапоги глубин', slot: 'feet', grade: 'b', pdef: 10, mdef: 9, price: 0, lvl: 25, w: 0.9, set: 'abyss', color: 0x205c63, rare: true, icon: 'boots_mystic' },
  shield_bone: { name: 'Щит глубин', slot: 'shield', grade: 'b', pdef: 44, price: 0, lvl: 25, w: 7, color: 0xe0dcc0, rare: true, icon: 'shield_iron' },
  neck_lich: { name: 'Ожерелье глубин', slot: 'neck', grade: 'b', mdef: 40, price: 0, lvl: 25, w: 0.1, color: 0x68dfd8, rare: true, icon: 'neck_silver' },
  ring_lich: { name: 'Кольцо глубин', slot: 'ring', grade: 'b', mdef: 22, crit: 0.015, price: 0, lvl: 25, w: 0.1, color: 0x68dfd8, rare: true, icon: 'ring_silver' },
  lich_seal: { name: 'Печать Короля-лича', price: 0, sell: 0, stack: true, loot: true, w: 0.05, color: 0xb070ff, icon: 'ear_lich' },
  // украшения
  ear_bronze: { name: 'Бронзовая серьга', slot: 'ear', grade: 'd', mdef: 7, mp: 10, price: 300, lvl: 8, w: 0.1, color: 0xc08040 },
  neck_bronze: { name: 'Бронзовое ожерелье', slot: 'neck', grade: 'd', mdef: 10, price: 400, lvl: 8, w: 0.1, color: 0xc08040 },
  ring_bronze: { name: 'Бронзовое кольцо', slot: 'ring', grade: 'd', mdef: 5, price: 250, lvl: 8, w: 0.1, color: 0xc08040 },
  ear_silver: { name: 'Серебряная серьга', slot: 'ear', grade: 'c', mdef: 16, mp: 25, price: 2200, lvl: 18, w: 0.1, color: 0xd0d8e0 },
  neck_silver: { name: 'Серебряное ожерелье', slot: 'neck', grade: 'c', mdef: 22, price: 3000, lvl: 18, w: 0.1, color: 0xd0d8e0 },
  ring_silver: { name: 'Серебряное кольцо', slot: 'ring', grade: 'c', mdef: 12, crit: 0.01, price: 1800, lvl: 18, w: 0.1, color: 0xd0d8e0 },
  ear_lich: { name: 'Серьга Короля-лича', slot: 'ear', grade: 'b', mdef: 32, mp: 80, price: 0, lvl: 25, w: 0.1, color: 0xb070ff, rare: true },
  // расходники
  potion_hp: { name: 'Зелье здоровья', use: 'hp', amount: 120, price: 30, stack: true, w: 0.05, color: 0xff3040 },
  potion_mp: { name: 'Зелье маны', use: 'mp', amount: 80, price: 45, stack: true, w: 0.05, color: 0x3060ff },
  scroll_escape: { name: 'Свиток возврата', use: 'escape', price: 120, stack: true, w: 0.05, color: 0xe0d080 },
  scroll_ench_w: { name: 'Свиток усиления оружия', use: 'ench', ench: 'w', price: 1500, stack: true, w: 0.05, color: 0xff9040 },
  scroll_ench_a: { name: 'Свиток усиления брони', use: 'ench', ench: 'a', price: 400, stack: true, w: 0.05, color: 0x60c0ff },
  // трофеи на продажу
  bone: { name: 'Кость', price: 8, stack: true, loot: true, w: 0.2, color: 0xeeeedd },
  pelt: { name: 'Шкура', price: 14, stack: true, loot: true, w: 0.3, color: 0x8a6a4a },
  crystal: { name: 'Кристалл', price: 60, stack: true, loot: true, w: 0.1, color: 0x90e0ff },
  ectoplasm: { name: 'Эктоплазма', price: 90, stack: true, loot: true, w: 0.1, color: 0x90ffb0 },
};

// комплекты: бонус, когда надеты все части
export const SETS = {
  abyss: { name: 'Комплект глубин', parts: ['hat_abyss', 'robe_abyss', 'gloves_abyss', 'boots_abyss'], bonus: { mp: 280, matk: 26, cast: 0.15 } },
  leather: { name: 'Кожаный комплект', parts: ['helm_leather', 'armor_leather', 'legs_leather', 'gloves_leather', 'boots_leather'], bonus: { hp: 80, pdef: 10 } },
  apprentice: { name: 'Ученический комплект', parts: ['hat_apprentice', 'robe_apprentice', 'gloves_apprentice', 'boots_apprentice'], bonus: { mp: 60, matk: 5 } },
  chain: { name: 'Кольчужный комплект', parts: ['helm_chain', 'armor_chain', 'legs_chain', 'gloves_chain', 'boots_chain'], bonus: { hp: 220, pdef: 25, speed: -1 } },
  mystic: { name: 'Мистический комплект', parts: ['hat_mystic', 'robe_mystic', 'gloves_mystic', 'boots_mystic'], bonus: { mp: 150, matk: 14, cast: 0.1 } },
  bone: { name: 'Костяной комплект', parts: ['helm_bone', 'armor_bone', 'legs_bone', 'gloves_bone', 'boots_bone'], bonus: { hp: 400, pdef: 40, crit: 0.03 } },
};

// мобы: shape — вид (для процедурной модели); fam/social — стаи (src/pack.js):
// атака одного поднимает сородичей того же семейства рядом. Одиночки (кролик, древень, голем, босс) поля не имеют.
export const MOBS = {
  rabbit: { name: 'Полевой кролик', lvl: 1, hp: 120, patk: 5, pdef: 20, xp: 18, coins: [2, 6], shape: 'critter', color: 0xd0c0a0, size: 0.5, speed: 3.2, drops: { pelt: 0.3 } },
  wolf: { name: 'Серый волк', lvl: 3, hp: 200, patk: 10, pdef: 28, xp: 45, coins: [5, 12], shape: 'beast', color: 0x707070, size: 0.9, fam: 'wolf', social: true, drops: { pelt: 0.5 } },
  goblin: { name: 'Гоблин-разведчик', lvl: 5, hp: 300, patk: 15, pdef: 34, xp: 80, coins: [10, 22], shape: 'humanoid', color: 0x4a8a3a, size: 0.9, fam: 'goblin', social: true, drops: { potion_hp: 0.15, bone: 0.3, ring_bronze: 0.02 } },
  boar: { name: 'Дикий кабан', lvl: 8, hp: 450, patk: 22, pdef: 45, xp: 140, coins: [15, 30], shape: 'beast', color: 0x6a4a30, size: 1.15, fam: 'boar', social: true, drops: { pelt: 0.6, boots_leather: 0.03, gloves_apprentice: 0.03 } },
  treant: { name: 'Древень', lvl: 11, hp: 650, patk: 30, pdef: 70, xp: 240, coins: [25, 50], shape: 'tree', color: 0x3a5a2a, size: 1.8, drops: { crystal: 0.1, hat_apprentice: 0.04, ear_bronze: 0.03 } },
  orc: { name: 'Орк-воитель', lvl: 14, hp: 900, patk: 42, pdef: 80, xp: 360, coins: [40, 80], shape: 'humanoid', color: 0x3a6a4a, size: 1.4, aggro: true, fam: 'orc', social: true, drops: { potion_hp: 0.2, bone: 0.4, helm_leather: 0.04, scroll_ench_a: 0.03 } },
  spider: { name: 'Пещерный паук', lvl: 16, hp: 1000, patk: 50, pdef: 85, xp: 430, coins: [45, 90], shape: 'spider', color: 0x3a2a3a, size: 1.3, aggro: true, fam: 'arachnid', social: true, drops: { crystal: 0.15, neck_bronze: 0.03 } },
  scorpion: { name: 'Песчаный скорпион', lvl: 19, hp: 1200, patk: 60, pdef: 110, xp: 600, coins: [60, 120], shape: 'spider', color: 0xb08040, size: 1.5, fam: 'arachnid', social: true, drops: { crystal: 0.2, gloves_chain: 0.02 } },
  golem: { name: 'Каменный голем', lvl: 23, hp: 1400, patk: 78, pdef: 160, xp: 950, coins: [90, 170], shape: 'golem', color: 0x8a7a6a, size: 2.2, drops: { crystal: 0.35, scroll_ench_w: 0.03, boots_chain: 0.03 } },
  skeleton: { name: 'Скелет-страж', lvl: 18, hp: 700, patk: 56, pdef: 95, xp: 520, coins: [55, 100], shape: 'humanoid', color: 0xe0dcc8, size: 1.1, aggro: true, fam: 'undead', social: true, drops: { bone: 0.8, potion_mp: 0.1, scroll_ench_a: 0.04 } },
  ghoul: { name: 'Упырь', lvl: 21, hp: 950, patk: 68, pdef: 120, xp: 720, coins: [70, 140], shape: 'humanoid', color: 0x6a8a6a, size: 1.2, aggro: true, fam: 'undead', social: true, drops: { ectoplasm: 0.25, ring_silver: 0.02 } },
  wraith: { name: 'Призрак', lvl: 24, hp: 1100, patk: 80, pdef: 130, xp: 900, coins: [90, 160], shape: 'ghost', color: 0x90ffd0, size: 1.3, aggro: true, fam: 'undead', social: true, drops: { ectoplasm: 0.5, scroll_ench_w: 0.04, hat_mystic: 0.02 } },
  // Громовое ущелье (src/gorge.js): 25–40 уровни, продолжение кривой обычных мобов
  // (опыт ≈ 2.95·L^1.8, жизнь ≈ 1.25·опыт, атака ≈ 3.3·L, защита ≈ 5.4·L, монеты ≈ 0.14·опыт).
  // model — готовая модель-основа из godot/assets/manifest.json, окраску и рост задаёт запись вида там же.
  // onHit — эффект на героя при попадании (src/mob-skills.js), guard — щит на себя при потере здоровья.
  cliff_spider: { name: 'Скальный паук', lvl: 25, hp: 1210, patk: 83, pdef: 135, xp: 970, coins: [98, 174], shape: 'spider', model: 'spider', color: 0x5d6a70, size: 1.35, aggro: true, fam: 'cliffspider', social: true,
    onHit: { chance: 0.3, name: 'Яд скального паука', dot: { mul: 1.2, dur: 6, tick: 1.5 } }, drops: { crystal: 0.3, pelt: 0.4, gloves_chain: 0.02 } },
  fang_warrior: { name: 'Воин племени Клыка', lvl: 27, hp: 1390, patk: 89, pdef: 146, xp: 1110, coins: [112, 199], shape: 'humanoid', model: 'orc', color: 0x7a5a3a, size: 1.45, aggro: true, crit: 0.12, fam: 'fang', social: true,
    drops: { bone: 0.6, potion_hp: 0.25, helm_chain: 0.02, scroll_ench_a: 0.04 } },
  river_drowned: { name: 'Речной утопленник', lvl: 28, hp: 1490, patk: 92, pdef: 151, xp: 1190, coins: [120, 213], shape: 'humanoid', model: 'ghoul', color: 0x5c8a86, size: 1.25, aggro: true, fam: 'drowned', social: true,
    onHit: { chance: 0.35, name: 'Хватка утопленника', slow: { mul: 0.7, dur: 5 } }, drops: { ectoplasm: 0.3, potion_mp: 0.15, ring_silver: 0.02 } },
  fang_shaman: { name: 'Шаман племени Клыка', lvl: 29, hp: 1265, patk: 105, pdef: 157, xp: 1265, coins: [127, 227], shape: 'humanoid', model: 'orc', color: 0x8a4a6a, size: 1.3, aggro: true, fam: 'fang', social: true,
    onHit: { chance: 0.3, name: 'Проклятие Клыка', debuff: { stat: 'pdef', mul: 0.8, dur: 8 } }, drops: { crystal: 0.3, ectoplasm: 0.15, scroll_ench_w: 0.03, ear_silver: 0.02 } },
  pool_drowned: { name: 'Утопленник омута', lvl: 31, hp: 1780, patk: 102, pdef: 167, xp: 1425, coins: [144, 256], shape: 'humanoid', model: 'ghoul', color: 0x3f6f7a, size: 1.35, aggro: true, fam: 'drowned', social: true,
    onHit: { chance: 0.4, name: 'Холод омута', slow: { mul: 0.6, dur: 6 } }, drops: { ectoplasm: 0.4, legs_chain: 0.02, gloves_mystic: 0.02 } },
  grotto_weaver: { name: 'Грот-ткач', lvl: 32, hp: 1890, patk: 106, pdef: 173, xp: 1510, coins: [152, 270], shape: 'spider', model: 'spider', color: 0x3c3448, size: 1.55, aggro: true, fam: 'cliffspider', social: true,
    onHit: { chance: 0.35, name: 'Паутинный яд', dot: { mul: 1.6, dur: 8, tick: 2 } }, drops: { crystal: 0.45, pelt: 0.4, boots_mystic: 0.02, neck_silver: 0.015 } },
  // танк: толще и крепче обычного, прячется за каменной кожей; награда выше за долгий бой
  stone_guard: { name: 'Каменный страж', lvl: 34, hp: 3160, patk: 95, pdef: 248, xp: 2020, coins: [204, 362], shape: 'golem', model: 'golem', color: 0x6f7f86, size: 2.1, aggro: true, fam: 'stone', social: true,
    guard: { below: 0.5, name: 'Каменная кожа', stat: 'pdef', mul: 1.6, dur: 8, cd: 20 }, drops: { crystal: 0.6, scroll_ench_w: 0.04, armor_chain: 0.015, robe_mystic: 0.015, shield_iron: 0.02 } },
  outpost_guard: { name: 'Страж заставы', lvl: 36, hp: 2680, patk: 119, pdef: 194, xp: 1865, coins: [189, 335], shape: 'humanoid', model: 'skeleton', color: 0xb8c4cc, size: 1.2, aggro: true, fam: 'outpost', social: true,
    guard: { below: 0.6, name: 'Щит заставы', stat: 'pdef', mul: 1.4, dur: 6, cd: 18 }, drops: { bone: 0.9, crystal: 0.3, scroll_ench_a: 0.05, helm_bone: 0.005, gloves_bone: 0.005 } },
  summit_wraith: { name: 'Дух перевала', lvl: 38, hp: 2575, patk: 125, pdef: 205, xp: 2060, coins: [207, 369], shape: 'ghost', model: 'wraith', color: 0xbfe6ff, size: 1.35, aggro: true, fam: 'frost', social: true,
    onHit: { chance: 0.3, name: 'Могильный холод', slow: { mul: 0.75, dur: 4 }, dot: { mul: 0.8, dur: 4, tick: 1 } }, drops: { ectoplasm: 0.6, scroll_ench_w: 0.05, hat_abyss: 0.005, gloves_abyss: 0.005, ring_lich: 0.004 } },
  outpost_warlock: { name: 'Колдун заставы', lvl: 39, hp: 2155, patk: 142, pdef: 211, xp: 2155, coins: [217, 387], shape: 'humanoid', model: 'lich', color: 0x5a7ab0, size: 1.4, aggro: true, fam: 'outpost', social: true,
    onHit: { chance: 0.3, name: 'Печать распада', debuff: { stat: 'pdef', mul: 0.75, dur: 8 }, dot: { mul: 1.0, dur: 6, tick: 1.5 } }, drops: { ectoplasm: 0.5, crystal: 0.4, scroll_ench_w: 0.06, boots_bone: 0.005, boots_abyss: 0.005, neck_lich: 0.004 } },
  lich: { name: 'Король-лич', lvl: 28, hp: 9000, patk: 120, pdef: 200, xp: 9000, coins: [1500, 2500], shape: 'humanoid', color: 0x8040c0, size: 2.6, aggro: true, boss: true, respawn: 300, drops: { lich_seal: 1, staff_abyss: 0.3, hat_abyss: 0.3, robe_abyss: 0.3, gloves_abyss: 0.3, boots_abyss: 0.3, shield_bone: 0.2, neck_lich: 0.2, ring_lich: 0.25, sword_dragon: 0.3, armor_bone: 0.3, helm_bone: 0.3, legs_bone: 0.3, gloves_bone: 0.3, boots_bone: 0.3, ear_lich: 0.25, scroll_ench_w: 0.5, ectoplasm: 1 } },
};

// торговцы
export const SHOP = [
  'potion_hp', 'potion_mp', 'scroll_escape', 'scroll_ench_a', 'scroll_ench_w',
  'sword_long', 'staff_oak', 'shield_wood', 'helm_leather', 'armor_leather', 'legs_leather', 'gloves_leather', 'boots_leather',
  'hat_apprentice', 'robe_apprentice', 'gloves_apprentice', 'boots_apprentice', 'ear_bronze', 'neck_bronze', 'ring_bronze',
  'sword_crystal', 'staff_crystal', 'shield_iron', 'helm_chain', 'armor_chain', 'legs_chain', 'gloves_chain', 'boots_chain',
  'hat_mystic', 'robe_mystic', 'gloves_mystic', 'boots_mystic', 'ear_silver', 'neck_silver', 'ring_silver',
];

// Явная цена выкупа: стартовые бесплатные вещи больше не превращаются в 1600 монет.
for (const item of Object.values(ITEMS)) if (item.rare) item.sell = 1600;

// Гарантированная альтернатива случайному дропу. Изготовление у торговца.
export const RECIPES = {
  sword_long: { coins: 300, materials: { pelt: 20, bone: 20 } },
  staff_oak: { coins: 300, materials: { pelt: 20, bone: 20 } },
  sword_crystal: { coins: 900, materials: { crystal: 40, bone: 40 } },
  staff_crystal: { coins: 900, materials: { crystal: 40, bone: 40 } },
  sword_dragon: { coins: 12000, materials: { lich_seal: 8, crystal: 120, ectoplasm: 60 } },
  staff_abyss: { coins: 12000, materials: { lich_seal: 8, crystal: 120, ectoplasm: 60 } },
};
for (const id of [...SETS.bone.parts, ...SETS.abyss.parts, 'shield_bone', 'ear_lich', 'neck_lich', 'ring_lich']) {
  const main = ITEMS[id].slot === 'armor';
  RECIPES[id] = { coins: main ? 6000 : 2500, materials: { lich_seal: main ? 4 : 2, crystal: main ? 60 : 25, ectoplasm: main ? 30 : 12 } };
}
RECIPES.robe_abyss = { coins: 8500, materials: { lich_seal: 6, crystal: 85, ectoplasm: 42 } };

// Ассортимент стационарных городских лавок. Рыночный торговец сохраняет общий каталог.
export const SHOP_STOCK = {
  weapons: SHOP.filter(id => ['weapon','shield'].includes(ITEMS[id].slot)),
  clothes: SHOP.filter(id => ['head','armor','legs','gloves','feet'].includes(ITEMS[id].slot)),
  alchemy: SHOP.filter(id => !ITEMS[id].slot || ['ear','neck','ring'].includes(ITEMS[id].slot)),
};
