extends Node
## Only display and movement prediction are calculated here; progression stays on the server.
var catalog: Dictionary
var world: Dictionary
var heights: PackedFloat32Array
var grid: Dictionary = {}
var icons: Dictionary = {}

func _ready():
	catalog = JSON.parse_string(FileAccess.get_file_as_string("res://generated/catalog.json"))
	world = JSON.parse_string(FileAccess.get_file_as_string("res://generated/world.json"))
	heights = FileAccess.get_file_as_bytes("res://generated/heights.bin").to_float32_array()
	var obs = world.obstacles.duplicate()
	for n in world.npcs:
		if n.role != "guard": obs.append({"x": n.x, "z": n.z, "r": 0.9})
	for o in obs:
		for x in range(floori((o.x - o.r - 1) / 24), floori((o.x + o.r + 1) / 24) + 1):
			for z in range(floori((o.z - o.r - 1) / 24), floori((o.z + o.r + 1) / 24) + 1):
				var k = Vector2i(x, z)
				if not grid.has(k): grid[k] = []
				grid[k].append(o)

func color(value) -> Color:
	return Color.hex((int(value) << 8) | 255)

func height_at(x: float, z: float) -> float:
	if x > 2100: return 0.0
	var t = world.terrain
	var fx = clampf((x - t.start) / t.step, 0, t.count - 1.001)
	var fz = clampf((z - t.start) / t.step, 0, t.count - 1.001)
	var ix = int(fx)
	var iz = int(fz)
	var a = iz * int(t.count) + ix
	var u = fx - ix; var v = fz - iz; var stride = int(t.count)
	return heights[a] * (1-u-v) + heights[a+1]*u + heights[a+stride]*v if u+v <= 1 else heights[a+1]*(1-v) + heights[a+stride]*(1-u) + heights[a+stride+1]*(u+v-1)

func position_at(x: float, z: float) -> Vector3:
	return Vector3(x, height_at(x, z), z)

var gorge_polygon := PackedVector2Array()
var gorge_box := Rect2()
func in_gorge(x: float, z: float) -> bool:
	if gorge_polygon.is_empty():
		if not world.has("gorge"): return false
		for v in world.gorge.polygon: gorge_polygon.append(Vector2(v[0], v[1]))
		gorge_box = Rect2(gorge_polygon[0], Vector2.ZERO)
		for v in gorge_polygon: gorge_box = gorge_box.expand(v)
	var p = Vector2(x, z)
	return gorge_box.has_point(p) and Geometry2D.is_point_in_polygon(p, gorge_polygon)

## Ярус ущелья по положению: та же ось u, что в src/gorge.js (изгиб на u не влияет).
func gorge_tier(pos: Vector3) -> Dictionary:
	if not in_gorge(pos.x, pos.z): return {}
	var u = Vector2(pos.x - world.gorge.origin.x, pos.z - world.gorge.origin.z).dot(Vector2(world.gorge.axis.x, world.gorge.axis.z))
	for t in world.gorge.tiers:
		if u < float(t.u1): return t
	return world.gorge.tiers[-1]

func zone_at(pos: Vector3) -> Dictionary:
	if pos.x > 2100: return {"id": "crypt", "name": "Катакомбы", "lv": "18–28"}
	for t in world.towns:
		if Vector2(pos.x - t.x, pos.z - t.z).length() < t.r + 20:
			return {"id": t.id, "name": t.name, "lv": "мирная зона", "town": true}
	# Громовое ущелье очерчено контуром стен (src/gorge.js), а не кругом.
	if in_gorge(pos.x, pos.z):
		for z in world.zones:
			if z.id == "gorge": return z
	var best = world.zones[0]
	var distance = INF
	for z in world.zones:
		if z.get("shaped", false): continue
		var d = Vector2(pos.x - z.x, pos.z - z.z).length() / z.r
		if d < distance: best = z; distance = d
	return best

func move(pos: Vector3, direction: Vector3, distance: float, trace: Array = []) -> Vector3:
	# Substeps prevent tunnelling when a rendered frame takes longer than usual.
	var steps = maxi(1, ceili(distance / 0.25))
	for i in steps:
		pos += direction * distance / steps
		for o in grid.get(Vector2i(floori(pos.x / 24), floori(pos.z / 24)), []):
			var d = Vector2(pos.x - o.x, pos.z - o.z)
			var length = d.length()
			if length < o.r + 0.6 and length > 0.0001:
				d *= (o.r + 0.6) / length
				pos.x = o.x + d.x; pos.z = o.z + d.y
		if pos.x < 2100:
			pos.x = clampf(pos.x, -780, 780); pos.z = clampf(pos.z, -780, 780)
		trace.append({"x": pos.x, "z": pos.z})
	pos.y = height_at(pos.x, pos.z)
	return pos

func icon(id: String) -> Texture2D:
	if not icons.has(id):
		# Умения и предметы могут ссылаться на семейство уже нарисованной иконки полем `icon`.
		var art_id = catalog.ITEMS.get(id, {}).get("icon", catalog.SKILLS.get(id, {}).get("icon", id))
		var p = "res://generated/icons/%s.png" % art_id
		icons[id] = load(p) if ResourceLoader.exists(p) else null
	return icons[id]

func xp_next(level: int) -> int:
	return roundi(60 * pow(level, 2.25))

func ench_value(it: Dictionary, key: String, e: int) -> float:
	var v = float(it.get(key, 0))
	if v == 0 or e == 0: return v
	var step = maxf(1, floor(v * (0.06 if it.get("slot") == "weapon" else 0.05) + 0.5))
	return v + step * (mini(e, 3) + 2 * maxi(0, e - 3))

func stats(p: Dictionary, buffs: Array = []) -> Dictionary:
	var c = catalog.CLASSES[p.cls]
	var a = c.attr; var b = c.base; var g = c.grow; var l = p.lvl - 1
	var s = {"attr": a, "maxHp": (b.hp + g.hp * l) * (1 + (a.con - 30) * 0.01), "maxMp": (b.mp + g.mp * l) * (1 + (a.men - 30) * 0.01), "patk": (b.patk + g.patk * l) * (1 + (a.str - 30) * 0.01), "matk": (b.matk + g.matk * l) * (1 + (a.int - 30) * 0.01), "pdef": b.pdef + g.pdef * l, "mdef": (b.mdef + g.mdef * l) * (1 + (a.men - 30) * 0.01), "aspd": (b.aspd + g.get("aspd", 0.0) * l) * (1 + (a.dex - 30) * 0.01), "speed": b.speed * (1 + (a.dex - 30) * 0.004), "crit": b.crit + (a.dex - 30) * 0.002, "cast": (1 + g.get("cast", 0.0) * l) * (1 + (a.wit - 20) * 0.01), "acc": sqrt(a.dex) * 6 + p.lvl, "eva": sqrt(a.dex) * 6 + p.lvl, "range": c.range, "critPower": b.get("critPower", 1.75), "load": 0.0, "cap": round(40 + a.con * 1.2), "regen": 1.0, "sets": []}
	for slot in p.equip:
		var it = catalog.ITEMS.get(p.equip[slot], {})
		for k in ["patk", "matk", "pdef", "mdef"]: s[k] += ench_value(it, k, int(p.get("enc", {}).get(slot, 0)))
		s.maxHp += it.get("hp", 0); s.maxMp += it.get("mp", 0); s.crit += it.get("crit", 0); s.load += it.get("w", 0)
	# Keep JS summation order (bag then equipment), including half-rounding edges.
	s.load = 0.0
	for e in p.inv: s.load += catalog.ITEMS.get(e.id, {}).get("w", 0) * e.n
	for id in p.equip.values(): s.load += catalog.ITEMS.get(id, {}).get("w", 0)
	for id in catalog.SETS:
		var st = catalog.SETS[id].duplicate(true)
		st["have"] = 0; st["id"] = id
		for part in st.parts:
			if part in p.equip.values(): st.have += 1
		if st.have > 0: s.sets.append(st)
		if st.have == st.parts.size():
			for key in st.bonus:
				var target = "maxHp" if key == "hp" else ("maxMp" if key == "mp" else key)
				s[target] += st.bonus[key]
	# Профессия: те же множители, что и в src/stats.js::calcStats. Считает всё равно сервер.
	var prof = profession(p)
	if not prof.is_empty():
		for key in prof.bonus: s[key] *= prof.bonus[key]
	var second = profession(p, true)
	if not second.is_empty() and second.get("parent", "") == p.get("prof", ""):
		for key in second.bonus: s[key] *= second.bonus[key]
	for id in skills_of(p):
		if int(p.get("skills", {}).get(id, 0)) <= 0: continue
		var passive = skill(p, id)
		if passive.kind != "passive" or p.lvl < passive.lvl: continue
		if promotion_required(p,int(passive.lvl)) != "": continue
		if passive.get("needShield", false) and str(p.equip.get("shield", "")).is_empty(): continue
		if s.has(passive.stat): s[passive.stat] *= passive.mul
	s.load = floor(s.load * 10 + 0.5) / 10
	if s.load > s.cap * 0.7: s.speed *= 0.6; s.regen = 0.5
	# Зеркало src/stats.js: множитель применяют только эффекты с характеристикой.
	# Урон и лечение со временем, вампиризм характеристик не меняют.
	for buff in buffs:
		if buff.has("stat") and buff.until > Time.get_ticks_msec(): s[buff.stat] *= buff.mul
	s.maxHp = floor(s.maxHp + 0.5); s.maxMp = floor(s.maxMp + 0.5)
	s.speed *= float(catalog.UI_RULES.movementScale)
	return s

func sell_price(id: String) -> int:
	return int(catalog.UI_RULES.sellPrices.get(id, 0))

func wear_error(p: Dictionary, it: Dictionary) -> String:
	if not it.has("slot"): return "Это нельзя надеть"
	if p.lvl < it.get("lvl", 1): return "Нужен уровень %s" % int(it.lvl)
	if p.cls == "warrior" and it.get("twoHand", false): return "Воин не владеет посохом"
	if p.cls == "warrior" and it.get("robe", false): return "Воин не носит мантии"
	return ""

func enchant_error(id: String, e: int, scroll: String) -> String:
	var it = catalog.ITEMS[id]; var sc = catalog.ITEMS.get(scroll, {})
	if not it.has("slot"): return "Выберите снаряжение"
	if it.get("grade", "none") == "none": return "Этот предмет нельзя усилить"
	if e >= catalog.UI_RULES.maxEnch: return "Достигнуто максимальное усиление"
	if (it.slot == "weapon") != (sc.get("ench") == "w"): return "Нужен другой тип свитка"
	return ""

func appearance(p: Dictionary) -> Dictionary:
	var items = catalog.ITEMS
	var weapon = items.get(p.equip.get("weapon"), {})
	var armor = items.get(p.equip.get("armor"), {})
	var gear = {}
	for slot in ["head", "legs", "gloves", "feet", "shield"]: gear[slot] = items.get(p.equip.get(slot), {}).get("color")
	gear.helmKind = items.get(p.equip.get("head"), {}).get("set")
	var mat = {"chain": "chain", "bone": "plate", "leather": "leather"}.get(armor.get("set", ""), "cloth")
	return {"cls": p.cls, "body": armor.get("color", catalog.CLASSES[p.cls].color), "w": weapon.get("color"), "staff": weapon.get("twoHand", false), "ench": p.get("enc", {}).get("weapon", 0), "robe": armor.get("robe", false) or p.cls == "mage", "mat": mat, "gear": gear}

## Выбранная профессия профиля или пустой словарь.
func profession(p: Dictionary, second = false) -> Dictionary:
	var id = p.get("prof2" if second else "prof")
	if id is String and catalog.PROFESSIONS.has(id): return catalog.PROFESSIONS[id]
	return {}

## Профессии, доступные классу: id + описание. Порядок — как в общих данных.
func professions_for(cls: String, parent = "") -> Array:
	var list = []
	for id in catalog.PROFESSIONS:
		if catalog.PROFESSIONS[id].base == cls and str(catalog.PROFESSIONS[id].get("parent", "")) == parent: list.append({"id": id}.merged(catalog.PROFESSIONS[id]))
	return list

## Умения персонажа: базовые класса плюс умения выбранной профессии.
func skills_of(p: Dictionary) -> Array:
	var list: Array = catalog.CLASSES[p.cls].skills.duplicate()
	var prof = profession(p)
	if not prof.is_empty(): list.append_array(prof.skills)
	var second = profession(p, true)
	if not second.is_empty() and second.get("parent", "") == p.get("prof", ""): list.append_array(second.skills)
	return list

func promotion_required(p: Dictionary, level: int) -> String:
	if level >= int(catalog.SECOND_PROF_LVL) and profession(p, true).is_empty(): return "Требуется вторая профессия (40 уровень)"
	if level >= int(catalog.PROF_LVL) and profession(p).is_empty(): return "Требуется первая профессия (20 уровень)"
	return ""

func skill(p: Dictionary, id: String) -> Dictionary:
	var ranks = catalog.UI_RULES.skillRanks[id]
	return ranks[clampi(int(p.get("skills", {}).get(id, 1)) - 1, 0, ranks.size() - 1)]

# --- Эффекты во времени: подписи, цвета и названия умений. Правила — src/effects.js ---
const EFFECT_LABELS = {"buff": "Усиление", "debuff": "Ослабление", "slow": "Замедление", "dot": "Урон", "hot": "Лечение", "drain": "Вампиризм"}
const EFFECT_COLORS = {"buff": "ffcf7a", "debuff": "c58cff", "slow": "8fd6ff", "dot": "ff8a6a", "hot": "86f0b4", "drain": "ff6f8a"}

func effect_label(kind: String) -> String:
	return str(EFFECT_LABELS.get(kind, "Эффект"))

func effect_color(kind: String) -> Color:
	return Color(str(EFFECT_COLORS.get(kind, "ffffff")))

## Полное имя эффекта: «Ледяная волна · Замедление». id эффекта — «умение» или «умение:вид».
func effect_title(id: String, kind: String) -> String:
	var skill = catalog.SKILLS.get(id.split(":")[0], {})
	# Умения мобов: id начинается с вида моба (src/mob-skills.js), имя — из его onHit/guard.
	var mob = catalog.MOBS.get(id.split(":")[0], {})
	if skill.is_empty() and not mob.is_empty():
		var ability = mob.get("guard", {}) if id.ends_with(":guard") else mob.get("onHit", {})
		if ability.has("name"): return "%s · %s" % [str(ability.name), effect_label(kind)]
	if skill.is_empty(): return effect_label(kind)
	return "%s · %s" % [str(skill.get("name", id)), effect_label(kind)]
