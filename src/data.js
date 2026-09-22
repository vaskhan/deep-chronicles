// Данные мира: классы, предметы, мобы, умения, зоны. Всё своё — механика в духе старых MMORPG.

export const MAX_LEVEL = 40;
// опыт до следующего уровня
export const xpToNext = (lv) => Math.round(60 * Math.pow(lv, 2.25));

export const CLASSES = {
  warrior: {
    name: 'Воин', color: 0xb04030,
    attr: { str: 40, dex: 30, con: 43, int: 21, wit: 11, men: 25 },
    base: { hp: 120, mp: 30, patk: 9, matk: 3, pdef: 40, mdef: 30, aspd: 1.0, speed: 8, crit: 0.08 },
    grow: { hp: 22, mp: 4, patk: 2.2, matk: 0.4, pdef: 2.0, mdef: 1.2 },
    skills: ['power_strike', 'battle_cry', 'whirlwind'],
    range: 3.2,
  },
  mage: {
    name: 'Маг', color: 0x3050c0,
    attr: { str: 22, dex: 21, con: 27, int: 41, wit: 20, men: 39 },
    base: { hp: 80, mp: 90, patk: 4, matk: 12, pdef: 30, mdef: 45, aspd: 0.8, speed: 7.4, crit: 0.05 },
    grow: { hp: 13, mp: 14, patk: 0.6, matk: 2.6, pdef: 1.2, mdef: 2.0 },
    skills: ['fire_bolt', 'heal', 'ice_nova'],
    range: 22,
  },
};

// умения: kind — dmg (физ/маг), heal, buff, aoe
export const SKILLS = {
  power_strike: { name: 'Мощный удар', key: '1', mp: 8, cd: 5, kind: 'dmg', school: 'p', mul: 2.4, range: 3.5, color: 0xffa040, lvl: 1 },
  battle_cry: { name: 'Боевой клич', key: '2', mp: 15, cd: 40, kind: 'buff', stat: 'patk', mul: 1.3, dur: 20, color: 0xff4040, lvl: 5 },
  whirlwind: { name: 'Вихрь', key: '3', mp: 22, cd: 10, kind: 'aoe', school: 'p', mul: 1.6, radius: 7, color: 0xffd060, lvl: 12 },
  fire_bolt: { name: 'Огненная стрела', key: '1', mp: 10, cd: 2.2, kind: 'dmg', school: 'm', mul: 2.2, range: 24, color: 0xff5010, cast: 0.8, lvl: 1 },
  heal: { name: 'Исцеление', key: '2', mp: 18, cd: 6, kind: 'heal', amount: 0.35, color: 0x60ff90, cast: 1.0, lvl: 3 },
  ice_nova: { name: 'Ледяная волна', key: '3', mp: 30, cd: 12, kind: 'aoe', school: 'm', mul: 1.8, radius: 9, color: 0x80d0ff, cast: 0.6, lvl: 10 },
  // умения профессий: открываются только после выбора профессии и учатся за SP на общих правилах.
  // needShield — требование к экипировке, проверяет сервер. icon — семейство существующей иконки.
  shield_bash: { name: 'Удар щитом', mp: 20, cd: 9, kind: 'dmg', school: 'p', mul: 1.8, range: 3.5, needShield: true, color: 0xc0d0e0, lvl: 20, icon: 'shield_iron' },
  iron_will: { name: 'Железная воля', mp: 30, cd: 60, kind: 'buff', stat: 'pdef', mul: 1.4, dur: 30, color: 0x90a0c0, lvl: 22, icon: 'battle_cry' },
  frenzy: { name: 'Неистовство', mp: 25, cd: 60, kind: 'buff', stat: 'patk', mul: 1.5, dur: 15, color: 0xff3020, lvl: 20, icon: 'battle_cry' },
  cleave: { name: 'Рассекающий удар', mp: 28, cd: 7, kind: 'dmg', school: 'p', mul: 3.2, range: 3.5, color: 0xff7040, lvl: 24, icon: 'power_strike' },
  lightning: { name: 'Цепная молния', mp: 34, cd: 5, kind: 'dmg', school: 'm', mul: 3.0, range: 26, color: 0xa0c0ff, cast: 1.2, lvl: 20, icon: 'fire_bolt' },
  meteor: { name: 'Метеор', mp: 60, cd: 18, kind: 'aoe', school: 'm', mul: 2.6, radius: 8, color: 0xff6020, cast: 1.8, lvl: 26, icon: 'ice_nova' },
  heal_major: { name: 'Великое исцеление', mp: 40, cd: 10, kind: 'heal', amount: 0.7, color: 0x90ffb0, cast: 1.4, lvl: 20, icon: 'heal' },
  blessing: { name: 'Благословение', mp: 35, cd: 90, kind: 'buff', stat: 'mdef', mul: 1.35, dur: 60, color: 0xfff0a0, cast: 1.0, lvl: 22, icon: 'heal' },
};

// Профессия выбирается один раз с PROF_LVL уровня и уже не меняется.
// bonus — множители к готовым характеристикам (см. src/stats.js::calcStats), skills — два умения профессии.
export const PROF_LVL = 20;
export const PROFESSIONS = {
  knight: { name: 'Страж', base: 'warrior', desc: 'Щит и тяжёлая броня: держит удар и прикрывает группу.', bonus: { maxHp: 1.15, pdef: 1.15 }, skills: ['shield_bash', 'iron_will'] },
  berserker: { name: 'Берсерк', base: 'warrior', desc: 'Максимум урона ценой собственной защиты.', bonus: { patk: 1.12, crit: 1.25, pdef: 0.95 }, skills: ['frenzy', 'cleave'] },
  sorcerer: { name: 'Чародей', base: 'mage', desc: 'Разрушительная магия и быстрые заклинания.', bonus: { matk: 1.15, cast: 1.1 }, skills: ['lightning', 'meteor'] },
  healer: { name: 'Целитель', base: 'mage', desc: 'Сильное лечение и благословения на защиту.', bonus: { maxMp: 1.2, mdef: 1.1 }, skills: ['heal_major', 'blessing'] },
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

// мобы: shape — вид (для процедурной модели)
export const MOBS = {
  rabbit: { name: 'Полевой кролик', lvl: 1, hp: 40, patk: 5, pdef: 20, xp: 18, coins: [2, 6], shape: 'critter', color: 0xd0c0a0, size: 0.5, speed: 3.2, drops: { pelt: 0.3 } },
  wolf: { name: 'Серый волк', lvl: 3, hp: 85, patk: 10, pdef: 28, xp: 45, coins: [5, 12], shape: 'beast', color: 0x707070, size: 0.9, drops: { pelt: 0.5 } },
  goblin: { name: 'Гоблин-разведчик', lvl: 5, hp: 130, patk: 15, pdef: 34, xp: 80, coins: [10, 22], shape: 'humanoid', color: 0x4a8a3a, size: 0.9, drops: { potion_hp: 0.15, bone: 0.3, ring_bronze: 0.02 } },
  boar: { name: 'Дикий кабан', lvl: 8, hp: 210, patk: 22, pdef: 45, xp: 140, coins: [15, 30], shape: 'beast', color: 0x6a4a30, size: 1.15, drops: { pelt: 0.6, boots_leather: 0.03, gloves_apprentice: 0.03 } },
  treant: { name: 'Древень', lvl: 11, hp: 380, patk: 30, pdef: 70, xp: 240, coins: [25, 50], shape: 'tree', color: 0x3a5a2a, size: 1.8, drops: { crystal: 0.1, hat_apprentice: 0.04, ear_bronze: 0.03 } },
  orc: { name: 'Орк-воитель', lvl: 14, hp: 520, patk: 42, pdef: 80, xp: 360, coins: [40, 80], shape: 'humanoid', color: 0x3a6a4a, size: 1.4, aggro: true, drops: { potion_hp: 0.2, bone: 0.4, helm_leather: 0.04, scroll_ench_a: 0.03 } },
  spider: { name: 'Пещерный паук', lvl: 16, hp: 600, patk: 50, pdef: 85, xp: 430, coins: [45, 90], shape: 'spider', color: 0x3a2a3a, size: 1.3, aggro: true, drops: { crystal: 0.15, neck_bronze: 0.03 } },
  scorpion: { name: 'Песчаный скорпион', lvl: 19, hp: 820, patk: 60, pdef: 110, xp: 600, coins: [60, 120], shape: 'spider', color: 0xb08040, size: 1.5, drops: { crystal: 0.2, gloves_chain: 0.02 } },
  golem: { name: 'Каменный голем', lvl: 23, hp: 1400, patk: 78, pdef: 160, xp: 950, coins: [90, 170], shape: 'golem', color: 0x8a7a6a, size: 2.2, drops: { crystal: 0.35, scroll_ench_w: 0.03, boots_chain: 0.03 } },
  skeleton: { name: 'Скелет-страж', lvl: 18, hp: 700, patk: 56, pdef: 95, xp: 520, coins: [55, 100], shape: 'humanoid', color: 0xe0dcc8, size: 1.1, aggro: true, drops: { bone: 0.8, potion_mp: 0.1, scroll_ench_a: 0.04 } },
  ghoul: { name: 'Упырь', lvl: 21, hp: 950, patk: 68, pdef: 120, xp: 720, coins: [70, 140], shape: 'humanoid', color: 0x6a8a6a, size: 1.2, aggro: true, drops: { ectoplasm: 0.25, ring_silver: 0.02 } },
  wraith: { name: 'Призрак', lvl: 24, hp: 1100, patk: 80, pdef: 130, xp: 900, coins: [90, 160], shape: 'ghost', color: 0x90ffd0, size: 1.3, aggro: true, drops: { ectoplasm: 0.5, scroll_ench_w: 0.04, hat_mystic: 0.02 } },
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
