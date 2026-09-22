extends Node3D
const WorldScene = preload("res://scenes/world.tscn")
const Actor = preload("res://scripts/actor.gd")
const Hud = preload("res://scripts/hud.gd")
var world: Node3D
var camera: Camera3D
var hud: CanvasLayer
var hero: Node3D
var profile: Dictionary = {}
var stats: Dictionary = {}
var buffs: Array = []
var ground_loot: Dictionary = {}
var pending_pickup = ""
var pickup_sent_at = 0
var mobs: Dictionary = {}
var players: Dictionary = {}
var npcs: Array = []
var target: Node3D
var destination = Vector3.ZERO
var has_destination = false
var attacking = false
var pending_skill = ""
var talking_to: Node3D
var joystick = Vector2.ZERO
var camera_yaw = Tuning.CAMERA_YAW_START
var camera_pitch = Tuning.CAMERA_PITCH_START
var camera_distance = Tuning.CAMERA_DISTANCE_START
var state_timer = 0.0
var ui_timer = 0.0
var cast_time = 0.0
var cooldowns: Dictionary = {}
var last_pm = ""
var own_id = 0
var clock_offset = 0.0
var have_clock = false
var flag_until = 0
var target_arrow: Label3D
var selection: MeshInstance3D
var marker: MeshInstance3D
var touch_start: Dictionary = {}
var touch_positions: Dictionary = {}
var touch_dragged = false
var pending_login: Dictionary = {}
var resume_on_start = false
var quick_start = false
var quick_tried = false
var capture_path = ""
var startup_panel = ""
var screenshot_done = false
var auth_ready_at = 0
var pvp_enabled = false
var initial_camera = true
var combat_fx: Node3D
var game_audio: Node3D
var run_speed = 0.0

func _ready():
	var args = OS.get_cmdline_user_args()
	# Export templates cannot run arbitrary --script/--path overrides. Exercise
	# the packaged application through an explicit, isolated acceptance mode.
	if "--test-mode" in args and not get_tree().root.has_meta("acceptance_running"):
		var runner = ""
		if "--self-test" in args and Network.endpoint.begins_with("ws://127.0.0.1:"): runner = "res://tests/smoke.gd"
		elif "--network-probe" in args: runner = "res://tests/server_probe.gd"
		elif "--scene-lint" in args: runner = "res://tests/scene_lint.gd"
		if not runner.is_empty():
			Engine.print_to_stdout = true; Engine.print_error_messages = true
			get_tree().root.set_meta("acceptance_running", true)
			process_mode = Node.PROCESS_MODE_DISABLED
			var test = load(runner).new(); test.process_mode = Node.PROCESS_MODE_ALWAYS; add_child(test)
			return
	for a in OS.get_cmdline_user_args():
		if a == "--quick-start": quick_start = true
		if a == "--resume": resume_on_start = true
		if a.begins_with("--capture="): capture_path = a.trim_prefix("--capture=")
		if a.trim_prefix("--panel=") in ["inventory", "character", "settings"] and a.begins_with("--panel="): startup_panel = a.trim_prefix("--panel=")
	world = WorldScene.instantiate(); add_child(world); world.build()
	camera = Camera3D.new(); camera.name = "Camera"; camera.fov = Tuning.CAMERA_FOV; camera.far = Tuning.CAMERA_FAR; camera.near = Tuning.CAMERA_NEAR; add_child(camera); camera.current = true
	camera.position = Vector3(-410, 30, 425); camera.look_at(Vector3(-430, 7, 390))
	combat_fx = load("res://scripts/combat_fx.gd").new(); add_child(combat_fx)
	game_audio = load("res://scripts/game_audio.gd").new(); add_child(game_audio)
	for n in GameData.world.npcs:
		var actor = Actor.new(); actor.kind = "n"; actor.definition = n
		add_child(actor); actor.setup("warrior" if n.role == "guard" else "npc", n.name, n)
		actor.position = GameData.position_at(n.x, n.z)
		actor.apply_look({"body": n.color, "w": 0xb6c5d1 if n.role == "guard" else null, "mat": "chain" if n.role == "guard" else "cloth", "robe": n.role != "guard", "gear": {}})
		npcs.append(actor)
	selection = _ring(Color("ff684a"), 1.2); marker = _ring(Color("c9d5ed"), 0.7)
	selection.mesh.outer_radius = 1.4
	selection.material_override.emission_enabled = true; selection.material_override.emission = Color("ff4830"); selection.material_override.emission_energy_multiplier = 1.1
	target_arrow = Label3D.new(); target_arrow.text = "▼"; target_arrow.font_size = 58; target_arrow.pixel_size = 0.015
	target_arrow.billboard = BaseMaterial3D.BILLBOARD_ENABLED; target_arrow.modulate = Color("ffcd74"); target_arrow.outline_modulate = Color("261208"); target_arrow.outline_size = 14
	add_child(target_arrow); target_arrow.hide()
	selection.hide(); marker.hide()
	hud = Hud.new(); add_child(hud)
	hud.action.connect(_action); hud.login_requested.connect(_login)
	Network.message.connect(_message); Network.connected.connect(_connected)
	Network.status_changed.connect(func(text): hud.login_message.text = text; if not profile.is_empty(): hud.log_line(text))
	Network.start()
	print("NATIVE_READY")

func _connected():
	if not pending_login.is_empty(): Network.send(pending_login); pending_login = {}; return
	if not profile.is_empty(): Network.resume_session(); return
	if resume_on_start and not quick_tried:
		quick_tried = true; Network.resume_session(); return
	if quick_start and not quick_tried:
		quick_tried = true
		if not Network.resume_session():
			var rng = Crypto.new()
			Network.send({"t": "register", "name": "Странник" + str(Time.get_ticks_msec() % 100000), "pass": rng.generate_random_bytes(16).hex_encode(), "cls": "warrior"})

func _login(data: Dictionary):
	var url = hud.server_field.text.strip_edges()
	if not url.begins_with("ws://") and not url.begins_with("wss://"):
		hud.login_message.text = "Адрес сервера должен начинаться с ws:// или wss://"; return
	if url != Network.endpoint or not Network.online or Network.stopped:
		pending_login = data; Network.start(url)
	else: Network.send(data)

func _message(m: Dictionary):
	match m.get("t", ""):
		"authok":
			var same_character = profile.get("name", "") == m.name
			auth_ready_at = Time.get_ticks_msec()
			own_id = int(m.id)
			_clear_entities()
			profile = m.p; stats = GameData.stats(profile)
			if is_instance_valid(hero): hero.queue_free()
			hero = Actor.new(); hero.kind = "self"; hero.name = "Hero"; add_child(hero)
			hero.setup(profile.cls, profile.name); hero.position = GameData.position_at(profile.x, profile.z)
			hero.apply_look(_look_of(profile)); hero.dead = profile.get("dead", false)
			buffs.clear(); cooldowns.clear(); cast_time = 0; has_destination = false; attacking = false
			hud.active_effects = []; hud.target_effects = []
			initial_camera = true
			hud.login_pass.clear()
			if not same_character: hud.chat.clear_history()
			hud.update_party({}); hud.party_invite = {}
			hud.enter(profile)
			if not startup_panel.is_empty(): hud.show_window(startup_panel); startup_panel = ""
			hud.log_line("Добро пожаловать, %s! Хранитель врат перенесёт вас в зону охоты." % profile.name)
			print("NATIVE_AUTH_OK")
		"autherr":
			hud.continue_button.visible = not Network.session.is_empty()
			if not profile.is_empty(): _return_to_login(false, false)
			hud.login_message.text = str(m.reason)
		"kicked":
			hud.log_line("Этот персонаж вошёл с другого устройства.")
			_return_to_login(false, false); hud.login_message.text = "Вход с другого устройства. Войдите снова."
		"you":
			if profile.is_empty(): return
			profile = m.p; stats = GameData.stats(profile, buffs)
			hero.dead = profile.get("dead", false); hero.apply_look(_look_of(profile)); hud.update_profile(profile)
		"mobs":
			for row in m.n:
				var id = int(row[0]); var mob_kind = row[1]
				if mobs.has(id): continue
				var actor = Actor.new(); actor.entity_id = id; actor.kind = "m"; add_child(actor)
				var def = GameData.catalog.MOBS[mob_kind]
				# Элита и чемпион: ранг, готовое имя и увеличенный размер считает сервер (src/elites.js)
				if row.size() > 4:
					actor.rank = str(row[2])
					def = def.duplicate(true); def.name = str(row[3]); def.size = float(row[4])
				actor.setup(mob_kind, "%s · %s" % [def.name, int(def.lvl)], def); actor.hide(); mobs[id] = actor
		"look":
			var id = int(m.id)
			if id == own_id: return
			if not players.has(id):
				var actor = Actor.new(); actor.entity_id = id; actor.kind = "p"; add_child(actor)
				actor.setup(m.look.get("cls", "warrior"), m.name); actor.hide(); players[id] = actor
			players[id].apply_look(m.look)
		"snap":
			if profile.is_empty(): return
			var now = Time.get_unix_time_from_system() * 1000
			var offset = now - m.get("ts", now)
			clock_offset = offset if not have_clock or offset < clock_offset else lerpf(clock_offset, offset, 0.02); have_clock = true
			for row in m.get("o", []):
				if players.has(int(row[0])): players[int(row[0])].snapshot(row, m.get("ts", now))
			for row in m.get("m", []):
				if mobs.has(int(row[0])): mobs[int(row[0])].snapshot(row, m.get("ts", now))
			_sync_ground(m.get("g", []))
			if m.has("me"):
				profile.hp = m.me.hp; profile.mp = m.me.mp; profile.dead = m.me.dead; hero.dead = m.me.dead
				hero.effects = m.me.get("fx", [])
		"pickup_err":
			pending_pickup = ""; pickup_sent_at = 0; hud.log_line(m.reason)
		"ev":
			for e in m.e: _event(e)
		"fix": _place(float(m.x), float(m.z))
		"leave":
			var id = int(m.id)
			if players.has(id):
				if target == players[id]: set_target(null)
				players[id].queue_free(); players.erase(id)
		"me":
			if profile.is_empty(): return
			profile.karma = m.karma; profile.pk = m.pk; profile.pvp = m.pvp
			flag_until = Time.get_ticks_msec() + int(m.get("flag", 0))
		"chat":
			hud.chat.add_message(m)
			if hud.chat.preferences.bubbles:
				if m.from == profile.get("name", "") and is_instance_valid(hero): hero.speak(m.text)
				else:
					for actor in players.values():
						if actor.display_name == m.from and actor.visible: actor.speak(m.text)
		"pm":
			last_pm = m.from if m.from != profile.get("name") else m.to
			var entry = m.duplicate(); entry.ch = "pm"; entry.peer = last_pm; hud.chat.add_message(entry)
		"party": hud.update_party(m)
		"party_invite": hud.party_invite = m; hud.show_window("party")
		"party_err": hud.log_line(m.reason)
		"party_notice": hud.log_line(m.text)
		"pmerr": hud.log_line("%s: %s" % [m.to, m.reason])
		"chatwait": hud.log_line("Подождите %.1f с перед следующим сообщением." % (m.wait / 1000.0))
		"announce": hud.log_line(m.text)
		"pvperr": hud.log_line(m.reason); attacking = false
		"washok": hud.log_line("Карма очищена за %s монет." % int(m.cost)); hud.close_window()
		"washerr": hud.log_line("Для очищения нужно %s монет." % int(m.cost))

func _look_of(p: Dictionary) -> Dictionary:
	return GameData.appearance(p)

func _event(e: Dictionary):
	if profile.is_empty(): return
	var source = hero if not e.has("by") or int(e.by) == own_id else players.get(int(e.by))
	var victim = mobs.get(int(e.get("m", -1))) if e.has("m") else (hero if int(e.get("p", -1)) == own_id else players.get(int(e.get("p", -1))))
	if e.k in ["attack_start", "hit", "miss", "cast_fx"] and source == hero and e.get("id", "") not in ["heal", "battle_cry"]: game_audio.music.combat()
	if e.k == "hurt" or (e.k == "mob_windup" and int(e.get("p", -1)) == own_id): game_audio.music.combat()
	match e.k:
		"msg": hud.log_line(e.text)
		"cd": cooldowns[e.id] = Time.get_ticks_msec() + float(e.cd) * 1000
		"attack_start":
			if is_instance_valid(source):
				source.begin_attack(float(e.t))
				if source.base_model != "mage": combat_fx.swing(source); game_audio.play_at("swing", source.position)
		"attack_release":
			if is_instance_valid(source): source.release_attack()
			if is_instance_valid(source) and source.base_model == "mage":
				var spell_target = mobs.get(int(e.to.get("m", -1))) if e.to.has("m") else (hero if int(e.to.get("p", -1)) == own_id else players.get(int(e.to.get("p", -1))))
				if is_instance_valid(spell_target): combat_fx.projectile(source, spell_target, Color("9fbdff")); game_audio.play_at("fire", source.position, -5)
		"hit", "miss":
			if is_instance_valid(source) and source.cast_remaining <= 0 and source.action_until <= 0 and not e.has("dot"):
				source.play_action("attack", 0.65)
				if source.base_model == "mage" and is_instance_valid(victim):
					combat_fx.projectile(source, victim, Color("9fbdff")); game_audio.play_at("fire", source.position, -5)
				else:
					combat_fx.swing(source); game_audio.play_at("swing", source.position)
			if source == hero and is_instance_valid(victim): hud.log_line("%s: %s" % [victim.display_name, "Промах" if e.k == "miss" else "Урон %s" % int(e.dmg)], "combat")
			if is_instance_valid(victim) and victim != hero:
				_float(victim.position, "Промах" if e.k == "miss" else (("КРИТ " if e.get("crit", false) else "") + str(int(e.dmg))), Color("ffdd79") if e.get("crit", false) else Color.WHITE)
				if e.k == "hit":
					var critical = bool(e.get("crit", false))
					combat_fx.burst(victim.position, Color("ffd284"), "critical" if critical else "impact", 1.3 if critical else 0.65)
					game_audio.play_at("critical" if critical else "impact", victim.position)
					victim.receive_hit()
					if victim.kind == "m": game_audio.creature(victim, "hurt")
		"mob_windup":
			var mob = mobs.get(int(e.m))
			if is_instance_valid(mob) and not mob.dead:
				mob.position = GameData.position_at(float(e.x), float(e.z))
				mob.begin_windup(float(e.t), float(e.r))
				combat_fx.telegraph(mob, e, int(e.p) == own_id)
				game_audio.creature(mob, "attack")
		"mob_strike", "mob_cancel":
			var mob = mobs.get(int(e.m))
			if is_instance_valid(mob):
				combat_fx.stop_telegraph(mob)
				if e.k == "mob_strike":
					mob.finish_windup()
					if not e.get("landed", false) and int(e.p) == own_id:
						_float(hero.position, "Уход от удара", Color("a8dbda"))
				else: mob.cancel_presentation()
		"hurt":
			hud.log_line("Уклонение" if e.get("dodge", false) else "Получен урон: %s" % int(e.get("dmg", 0)), "combat")
			_float(hero.position, "Уклонение" if e.get("dodge", false) else "−%s" % int(e.get("dmg", 0)), Color("ff7777"))
			if not e.get("dodge", false) and not e.has("dot"):
				combat_fx.burst(hero.position, Color("d59072"), "impact", 0.6); game_audio.play_at("impact", hero.position, -3)
				hero.receive_hit()
			if not is_instance_valid(target): set_target(mobs.get(int(e.get("from", -1)), players.get(int(e.get("fromP", -1)))))
		"mdie":
			if is_instance_valid(victim):
				game_audio.creature(victim, "death"); victim.cancel_presentation(); victim.dead = true; victim.hp = 0; combat_fx.stop_telegraph(victim)
			if target == victim: attacking = false; pending_skill = ""
		"kill": hud.log_line("%s: +%s EXP, +%s SP. %s" % [e.name, int(e.xp), int(e.get("sp", 0)), "Добыча на земле · Z — подобрать." if e.get("ground", false) else "Автолут."], "rewards")
		"pickup":
			game_audio.play_at("loot", hero.position)
			hud.log_line("Подобрано: %s ×%s" % ["Монеты" if e.item == "coins" else GameData.catalog.ITEMS[e.item].name, int(e.n)], "rewards")
			_float(hero.position, "+%s монет" % int(e.n) if e.item == "coins" else GameData.catalog.ITEMS[e.item].name, Color("f5d885"))
		"loot": hud.log_line("Получено: " + GameData.catalog.ITEMS.get(e.id, {}).get("name", e.id))
		"lvl":
			game_audio.play_at("level", hero.position)
			hud.log_line("Новый уровень: %s!" % int(e.lvl)); _float(hero.position, "Уровень %s!" % int(e.lvl), Color("ffe090")); _effect(hero.position, Color("ffe090"), 4)
		"heal":
			_float(hero.position, "+%s" % int(e.amount), Color("83ffb0"))
			if not e.has("skill"): combat_fx.burst(hero.position, Color("70e7bb"), "heal", 2); game_audio.play_at("heal", hero.position)
		"cast", "cast_start":
			if is_instance_valid(source):
				var sk = GameData.catalog.SKILLS.get(e.get("id", ""), {})
				source.begin_cast(str(e.get("id", "")), float(e.t))
				combat_fx.begin_cast(source, GameData.color(sk.get("color", 0xa4c6ff)), float(e.t)); game_audio.play_at("charge", source.position)
				if source == hero:
					cast_time = float(e.t); has_destination = false
					hud.cast_duration = cast_time; hud.cast_name = sk.get("name", "Возвращение")
		"buff":
			var sk = GameData.catalog.SKILLS[e.id]
			buffs = buffs.filter(func(b): return b.get("id") != e.id)
			buffs.append({"id": e.id, "stat": e.get("stat", sk.stat), "mul": e.get("mul", sk.mul), "until": Time.get_ticks_msec() + e.dur * 1000})
			hud.log_line(sk.name)
		"cast_fx":
			var sk = GameData.catalog.SKILLS[e.id]
			if is_instance_valid(source):
				combat_fx.stop_cast(source)
				if sk.has("cast"): source.release_cast()
				else: source.play_action("attack", 0.65)
				if source == hero: cast_time = 0
				var hit_target = null
				if e.has("to"):
					hit_target = mobs.get(int(e.to.get("m", -1))) if e.to.has("m") else (hero if int(e.to.get("p", -1)) == own_id else players.get(int(e.to.get("p", -1))))
				var color = GameData.color(sk.color)
				if sk.get("school") == "m" and is_instance_valid(hit_target): combat_fx.projectile(source, hit_target, color)
				elif e.id == "heal": combat_fx.burst(source.position, color, "heal", 2)
				elif e.id == "ice_nova": combat_fx.burst(source.position, color, "frost", float(sk.radius))
				else:
					combat_fx.swing(source, color); combat_fx.burst(source.position, color, "buff" if e.id == "battle_cry" else "impact", float(sk.get("radius", 2)))
				game_audio.play_at({"fire_bolt": "fire", "heal": "heal", "ice_nova": "frost", "battle_cry": "buff"}.get(e.id, "swing"), source.position)
		"fx":
			# Наложение и спад эффекта во времени. Сила, урон и срок — серверные, клиент рисует ауру.
			var bearer = mobs.get(int(e.get("m", -1))) if e.has("m") else (hero if int(e.get("p", -1)) == own_id else players.get(int(e.get("p", -1))))
			if not is_instance_valid(bearer): return
			var key = "%s:%s" % [bearer.get_instance_id(), str(e.id)]
			var kind = str(e.get("kind", ""))
			if bool(e.get("up", false)):
				combat_fx.aura(bearer, key, GameData.effect_color(kind), float(e.get("dur", 1000)) / 1000.0)
				game_audio.play_at("buff" if kind in ["buff", "hot", "drain"] else "frost", bearer.position, -6)
				if bearer == hero: hud.log_line("%s · %s с" % [GameData.effect_title(str(e.id), kind), maxi(1, ceili(float(e.get("dur", 1000)) / 1000.0))], "combat")
			else:
				combat_fx.stop_aura(key)
				if bearer == hero: hud.log_line("%s: действие закончилось" % GameData.effect_title(str(e.id), kind), "combat")
		"ench": _effect(hero.position, Color("ffc96d") if e.ok else Color("787c89"), 2)
		"dead":
			combat_fx.stop_cast(hero); hero.cancel_presentation(); game_audio.play_at("death", hero.position)
			hud.close_window()
			pending_pickup = ""; pickup_sent_at = 0
			profile.dead = true; hero.dead = true; attacking = false; cast_time = 0; has_destination = false
			hud.log_line("Вы погибли: %s. Потеря опыта: %s." % [e.by, int(e.loss)])
		"move": _place(float(e.x), float(e.z)); hud.close_window()

func _place(x: float, z: float):
	if not is_instance_valid(hero): return
	combat_fx.clear(); hero.cancel_presentation(); cast_time = 0; run_speed = 0
	hero.position = GameData.position_at(x, z); has_destination = false; attacking = false; pending_skill = ""; talking_to = null; pending_pickup = ""
	set_target(null); marker.hide(); initial_camera = true

func _process(dt):
	if profile.is_empty() or not is_instance_valid(hero):
		if is_instance_valid(game_audio) and is_instance_valid(game_audio.ambience): game_audio.ambience.stop()
		if not capture_path.is_empty() and not screenshot_done and Network.online and Time.get_ticks_msec() > 8000:
			screenshot_done = true; _capture()
		return
	dt = minf(dt, 0.1)
	cast_time = maxf(0, cast_time - dt); hero.casting = cast_time > 0; hero.moving = false
	if Network.authed and not hero.dead and cast_time <= 0: _move_hero(dt)
	var time = Time.get_unix_time_from_system() * 1000 - clock_offset - 150
	for actor in mobs.values() + players.values():
		if Time.get_ticks_msec() - actor.seen > 1500: actor.hide()
		elif actor.visible: actor.interpolate(time)
		actor.label.visible = actor.visible and hero.position.distance_to(actor.position) < Tuning.LABEL_RANGE_ACTOR
	for drop in ground_loot.values(): drop.label.visible = hero.position.distance_to(drop.position) < Tuning.LABEL_RANGE_LOOT
	for npc in npcs: npc.label.visible = hero.position.distance_to(npc.position) < Tuning.LABEL_RANGE_NPC
	if is_instance_valid(target) and target.visible:
		selection.visible = not target.dead
		selection.position = target.position + Vector3.UP * 0.17
		target_arrow.visible = not target.dead
		target_arrow.position = target.position + Vector3.UP * (target.label.position.y + 0.7 + sin(Time.get_ticks_msec() * 0.004) * 0.08)
		selection.material_override.albedo_color = Color("e7c67e") if target.kind == "n" else Color("ff684a")
		selection.scale = Vector3.ONE * maxf(0.75, target.radius)
	else: selection.hide(); target_arrow.hide()
	hero.status = 2 if profile.get("karma", 0) > 0 else (1 if flag_until > Time.get_ticks_msec() else 0)
	_update_camera(dt); world.set_region(hero.position)
	game_audio.follow(hero, camera, dt)
	state_timer += dt; ui_timer += dt
	if state_timer >= 0.1:
		state_timer = 0
		if Network.authed:
			Network.send({"t": "st", "x": hero.position.x, "y": hero.position.y, "z": hero.position.z, "r": hero.rotation.y, "a": (1 if hero.moving else 0) | (2 if hero.attack_time > 0 else 0) | (4 if hero.casting else 0) | (8 if hero.dead else 0)})
	if ui_timer >= 0.2:
		ui_timer = 0; stats = GameData.stats(profile, buffs)
		hud.active_buffs = buffs
		hud.active_effects = hero.effects
		hud.target_effects = target.effects if is_instance_valid(target) and not target.dead else []
		hud.update_values(profile, stats, hero.position, target, cooldowns, cast_time)
		hud.minimap.update_entities(mobs, players, target)
		if is_instance_valid(hud.map_control): hud.map_control.update_entities(mobs, players, target)
	if not capture_path.is_empty() and not screenshot_done and Time.get_ticks_msec() > maxi(8000, auth_ready_at + 2500):
		screenshot_done = true; _capture()

func _move_hero(dt):
	var input = joystick
	var focus = get_viewport().gui_get_focus_owner()
	if not focus is LineEdit:
		input += Vector2(float(Input.is_physical_key_pressed(KEY_D)) - float(Input.is_physical_key_pressed(KEY_A)), float(Input.is_physical_key_pressed(KEY_S)) - float(Input.is_physical_key_pressed(KEY_W)))
	var direction = Vector3.ZERO
	var distance = stats.speed * dt
	if input.length() > 0.15:
		if hero.action_until > 0 and hero.action_clip.begins_with("attack"): hero.cancel_presentation()
		_cancel_attack(); has_destination = false; talking_to = null; pending_pickup = ""; marker.hide()
		direction = Vector3(input.x, 0, input.y).rotated(Vector3.UP, camera_yaw).normalized()
		distance *= minf(1, input.length())
	elif not pending_pickup.is_empty():
		if not ground_loot.has(pending_pickup): pending_pickup = ""; pickup_sent_at = 0; return
		var offset = ground_loot[pending_pickup].position - hero.position; offset.y = 0
		if offset.length() > float(GameData.catalog.UI_RULES.loot.pickupRange) - 0.65:
			direction = offset.normalized(); distance = minf(distance, offset.length())
		elif pickup_sent_at == 0:
			Network.send({"t": "st", "x": hero.position.x, "y": hero.position.y, "z": hero.position.z, "r": hero.rotation.y, "a": 0})
			Network.send({"t": "pickup", "id": pending_pickup}); pickup_sent_at = Time.get_ticks_msec()
		elif Time.get_ticks_msec() - pickup_sent_at > 2500:
			pending_pickup = ""; pickup_sent_at = 0; hud.log_line("Сервер не подтвердил подбор. Попробуйте ещё раз.")
	elif attacking and is_instance_valid(target) and not target.dead:
		var reach = float(stats.range) + target.radius
		if pending_skill != "": reach = float(GameData.catalog.SKILLS[pending_skill].get("range", stats.range)) + target.radius
		var offset = target.position - hero.position; offset.y = 0
		if offset.length() > reach * 0.94: direction = offset.normalized(); distance = minf(distance, offset.length() - reach * 0.9)
		else:
			hero.rotation.y = atan2(offset.x, offset.z)
			if pending_skill != "":
				Network.send({"t": "skill", "id": pending_skill}); pending_skill = ""
	elif has_destination:
		var offset = destination - hero.position; offset.y = 0
		if offset.length() < (3.5 if is_instance_valid(talking_to) else 0.5):
			has_destination = false; marker.hide()
			if is_instance_valid(talking_to): _open_npc(talking_to); talking_to = null
		else: direction = offset.normalized(); distance = minf(distance, offset.length())
	if direction.length_squared() > 0.1:
		if not attacking and hero.action_until > 0 and hero.action_clip.begins_with("attack"): hero.cancel_presentation()
		run_speed = move_toward(run_speed, float(stats.speed), float(stats.speed) * 6.0 * dt)
		distance = minf(distance, run_speed * dt)
		var before = hero.position
		hero.position = GameData.move(hero.position, direction, distance)
		hero.rotation.y = lerp_angle(hero.rotation.y, atan2(direction.x, direction.z), minf(1, dt * 15))
		hero.moving = before.distance_squared_to(hero.position) > 0.00001
	else: run_speed = 0

func _update_camera(dt):
	var aim = hero.position + Vector3.UP * 1.4
	var offset = Vector3(sin(camera_yaw) * cos(camera_pitch), sin(camera_pitch), cos(camera_yaw) * cos(camera_pitch)) * camera_distance
	var desired = aim + offset
	desired.y = maxf(desired.y, GameData.height_at(desired.x, desired.z) + 1.0)
	if hero.position.x > 2100: desired.y = minf(desired.y, 6.7)
	camera.position = desired if initial_camera else camera.position.lerp(desired, 1 - exp(-dt * 12))
	initial_camera = false; camera.look_at(aim)

func set_target(actor):
	pending_pickup = ""
	if is_instance_valid(target): target.selected = false
	# Выбор другой цели прекращает бой даже если прежняя цель уже исчезла:
	# иначе оставшийся флаг атаки молча уводит героя в новый бой.
	if target != actor: _cancel_attack()
	target = actor
	if is_instance_valid(actor): actor.selected = true
	if is_instance_valid(actor) and actor.kind in ["m", "p"]: Network.send({"t": "atk", "id": actor.entity_id, "kind": actor.kind, "hold": true})

func _cancel_attack():
	pending_pickup = ""; pickup_sent_at = 0
	if attacking: Network.send({"t": "atk", "id": null})
	attacking = false; pending_skill = ""

func attack():
	if not is_instance_valid(target) or target.dead or target.kind == "n": return
	if target.kind == "p" and not pvp_enabled and not Input.is_key_pressed(KEY_CTRL):
		hud.log_line("Для PvP удерживайте Ctrl при атаке или включите PvP в окне персонажа."); return
	attacking = true; has_destination = false; talking_to = null; pending_pickup = ""
	Network.send({"t": "atk", "id": target.entity_id, "kind": target.kind})

func use_skill(id: String):
	var sk = GameData.skill(profile, id)
	if sk.kind == "dmg" and is_instance_valid(target):
		if target.kind == "p" and not pvp_enabled and not Input.is_key_pressed(KEY_CTRL): hud.log_line("Включите PvP в окне персонажа."); return
		Network.send({"t": "atk", "id": target.entity_id, "kind": target.kind, "hold": true})
		var distance = Vector2(target.position.x - hero.position.x, target.position.z - hero.position.z).length()
		if distance > sk.get("range", stats.range) + target.radius:
			pending_skill = id; attacking = true; has_destination = false; return
		hero.rotation.y = atan2(target.position.x - hero.position.x, target.position.z - hero.position.z)
	Network.send({"t": "skill", "id": id})

func next_target():
	if not is_instance_valid(hero): return
	var list = mobs.values().filter(func(m): return m.visible and not m.dead and hero.position.distance_to(m.position) < Tuning.TARGET_PICK_RANGE)
	list.sort_custom(func(a, b): return hero.position.distance_squared_to(a.position) < hero.position.distance_squared_to(b.position))
	if list.is_empty(): return
	set_target(list[(list.find(target) + 1) % list.size()])

func talk_nearest():
	var nearest; var distance = Tuning.TALK_SEARCH_RANGE
	for npc in npcs:
		var d = hero.position.distance_to(npc.position)
		if d < distance and npc.definition.role != "guard": nearest = npc; distance = d
	if nearest: _talk(nearest)
	else: hud.log_line("Подойдите к торговцу, жрецу или хранителю врат.")

func _talk(npc):
	_cancel_attack(); set_target(npc)
	if hero.position.distance_to(npc.position) < Tuning.TALK_OPEN_RANGE: _open_npc(npc)
	else: destination = npc.position; has_destination = true; talking_to = npc

func _open_npc(npc):
	var kind = {"merchant": "shop", "gatekeeper": "teleport", "priest": "priest"}.get(npc.definition.role, "")
	if kind != "": hud.show_window(kind)
	else: hud.log_line("Страж охраняет город от убийц.")

func _action(kind: String, value):
	if profile.is_empty(): return
	match kind:
		"inventory", "character", "map", "menu", "skills", "settings", "controls", "actions", "equipment", "party": hud.toggle(kind)
		"camera": camera_yaw = hero.rotation.y + PI; camera_pitch = Tuning.CAMERA_PITCH_RESET; camera_distance = Tuning.CAMERA_DISTANCE_RESET
		"fullscreen": DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED if DisplayServer.window_get_mode() == DisplayServer.WINDOW_MODE_FULLSCREEN else DisplayServer.WINDOW_MODE_FULLSCREEN)
		"attack": attack()
		"target": next_target()
		"talk": talk_nearest()
		"pickup": pickup_nearest()
		"joystick": joystick = value
		"respawn": Network.send({"t": "respawn"})
		"logout": _return_to_login(true)
		"pvp":
			pvp_enabled = not pvp_enabled; hud.pvp_enabled = pvp_enabled
			hud.log_line("PvP включён" if pvp_enabled else "PvP выключен"); hud.show_window("character", true)
		"hotbar": hud.activate_slot(int(value))
		"skill": use_skill(str(value))
		"learn": Network.send({"t": "learn", "id": value.id, "rank": value.rank})
		"autoloot": Network.send({"t": "autoloot", "enabled": value})
		"use", "buy": Network.send({"t": kind, "id": value, "n": 1})
		"equip", "sell": Network.send({"t": kind, "idx": value, "n": 1})
		"craft": Network.send({"t": "craft", "id": value, "request": "%s-%s" % [Time.get_ticks_usec(), randi()]})
		"buy_stack": Network.send({"t": "buy", "id": value.id, "n": value.n})
		"sell_stack": Network.send({"t": "sell", "idx": value.idx, "n": value.n})
		"equip_slot": Network.send({"t": "equip", "idx": value.idx, "slot": value.slot})
		"unequip": Network.send({"t": "unequip", "slot": value})
		"enchant": Network.send({"t": "ench", "scroll": value.scroll, "ref": value.ref})
		"teleport": Network.send({"t": "tp", "id": value})
		"wash": Network.send({"t": "wash"})
		"party_command": Network.send(value)
		"chat": _chat(str(value))

func _chat(text: String):
	text = text.strip_edges()
	if text.is_empty(): return
	if text.begins_with('/ш ') or text.begins_with('/л '): text = '/w ' + text.substr(3)
	if text.begins_with('/о '): text = '/r ' + text.substr(3)
	if text.begins_with('"'): text = '/w ' + text.substr(1)
	if text.begins_with("/w "):
		var parts = text.split(" ", false, 2)
		if parts.size() >= 3: Network.send({"t": "pm", "to": parts[1], "text": parts[2]})
		else: hud.log_line("Личное сообщение: /w Имя текст")
	elif text.begins_with("/r "):
		if not last_pm.is_empty(): Network.send({"t": "pm", "to": last_pm, "text": text.substr(3)})
		else: hud.log_line("Пока некому ответить. Укажите /w Имя текст")
	elif hud.chat_channel.selected == 3:
		var to = hud.chat.recipient.text.strip_edges()
		if not to.is_empty(): Network.send({"t": "pm", "to": to, "text": text})
	else:
		var channel = ["all", "near", "trade", "pm", "party"][hud.chat_channel.selected]
		if text.begins_with("+"): channel = "trade"; text = text.substr(1)
		Network.send({"t": "chat", "ch": channel, "text": text})

func _return_to_login(forget: bool, reconnect = true):
	if forget: Network.logout()
	last_pm = ""; buffs.clear(); hud.active_buffs = []; hud.active_effects = []; hud.target_effects = []; hud.enchant_scroll = ""; hud.selected_item = {}; hud.chat.clear_history()
	pvp_enabled = false; hud.pvp_enabled = false; joystick = Vector2.ZERO
	hud.login_pass.clear()
	_clear_entities(); profile = {}; hud.close_window(); hud.game_ui.hide(); hud.login_panel.show()
	if is_instance_valid(hero): hero.queue_free()
	hero = null; hud.continue_button.visible = not forget and not Network.session.is_empty()
	if reconnect: Network.start()
	else:
		Network.stopped = true; Network.online = false; Network.authed = false
		if Network.socket: Network.socket.close()

func _clear_entities():
	if is_instance_valid(combat_fx): combat_fx.clear()
	if is_instance_valid(game_audio): game_audio.clear()
	target = null; attacking = false; talking_to = null; pending_pickup = ""; pickup_sent_at = 0
	for drop in ground_loot.values(): drop.queue_free()
	ground_loot.clear()
	for actor in mobs.values() + players.values(): actor.queue_free()
	mobs.clear(); players.clear()

func _input(event):
	# Control забирает Tab для смены фокуса до unhandled_input.
	# Оставляем ввод текста и меню входа, в игре открываем сумку.
	if profile.is_empty() or not event is InputEventKey: return
	if event.physical_keycode != KEY_TAB or not event.pressed or event.echo: return
	if get_viewport().gui_get_focus_owner() is LineEdit or get_viewport().gui_get_focus_owner() is TextEdit: return
	hud.toggle("inventory"); get_viewport().set_input_as_handled()

func _unhandled_input(event):
	if profile.is_empty(): return
	if event is InputEventMouse or event is InputEventGesture or event is InputEventScreenTouch or event is InputEventScreenDrag:
		if hud.pointer_over_ui(event.position): return
	if event is InputEventKey and event.pressed and not event.echo:
		match event.physical_keycode:
			KEY_I: hud.toggle("inventory")
			KEY_C: hud.toggle("character")
			KEY_M: hud.toggle("map")
			KEY_K: hud.toggle("skills")
			KEY_F: attack()
			KEY_E: talk_nearest()
			KEY_Z: pickup_nearest()
			KEY_Q: next_target()
			KEY_ESCAPE:
				if hud.window_kind != "": hud.close_window()
				else: set_target(null); _cancel_attack(); has_destination = false; hud.show_window("menu")
			KEY_ENTER: hud.chat_input.grab_focus()
			KEY_V: camera_yaw = hero.rotation.y + PI; camera_pitch = Tuning.CAMERA_PITCH_RESET; camera_distance = Tuning.CAMERA_DISTANCE_RESET
			KEY_1, KEY_2, KEY_3, KEY_4, KEY_5, KEY_6, KEY_7, KEY_8, KEY_9: hud.activate_slot(int(event.physical_keycode) - KEY_1)
			KEY_0: hud.activate_slot(9)
			KEY_F11: DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED if DisplayServer.window_get_mode() == DisplayServer.WINDOW_MODE_FULLSCREEN else DisplayServer.WINDOW_MODE_FULLSCREEN)
	elif event is InputEventMouseButton:
		if event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_UP: camera_distance = clampf(camera_distance / Tuning.CAMERA_ZOOM_STEP, Tuning.CAMERA_DISTANCE_MIN, Tuning.CAMERA_DISTANCE_MAX)
		if event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_DOWN: camera_distance = clampf(camera_distance * Tuning.CAMERA_ZOOM_STEP, Tuning.CAMERA_DISTANCE_MIN, Tuning.CAMERA_DISTANCE_MAX)
		if event.button_index == MOUSE_BUTTON_LEFT and event.pressed: pick(event.position)
	elif event is InputEventMouseMotion and Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT):
		camera_yaw -= event.relative.x * Tuning.CAMERA_MOUSE_YAW; camera_pitch = clampf(camera_pitch + event.relative.y * Tuning.CAMERA_MOUSE_PITCH, Tuning.CAMERA_PITCH_MIN, Tuning.CAMERA_PITCH_MAX)
	elif event is InputEventPanGesture:
		camera_yaw -= event.delta.x * Tuning.CAMERA_TRACKPAD_YAW; camera_pitch = clampf(camera_pitch + event.delta.y * Tuning.CAMERA_TRACKPAD_PITCH, Tuning.CAMERA_PITCH_MIN, Tuning.CAMERA_PITCH_MAX)
	elif event is InputEventMagnifyGesture: camera_distance = clampf(camera_distance / event.factor, Tuning.CAMERA_DISTANCE_MIN, Tuning.CAMERA_DISTANCE_MAX)
	elif event is InputEventScreenTouch:
		if event.pressed:
			touch_start[event.index] = event.position; touch_positions[event.index] = event.position
			if touch_positions.size() == 1: touch_dragged = false
			else: touch_dragged = true
		else:
			if not touch_dragged and touch_positions.size() == 1: pick(event.position)
			touch_start.erase(event.index); touch_positions.erase(event.index)
	elif event is InputEventScreenDrag:
		if not touch_positions.has(event.index): return
		if event.position.distance_to(touch_start.get(event.index, event.position)) > 10: touch_dragged = true
		if touch_positions.size() == 2:
			var other = touch_positions.keys()[0] if touch_positions.keys()[1] == event.index else touch_positions.keys()[1]
			var before = touch_positions[event.index].distance_to(touch_positions[other])
			var after = event.position.distance_to(touch_positions[other])
			if after > 1: camera_distance = clampf(camera_distance * before / after, Tuning.CAMERA_DISTANCE_MIN, Tuning.CAMERA_DISTANCE_MAX)
		elif touch_dragged:
			camera_yaw -= event.relative.x * Tuning.CAMERA_TOUCH_YAW; camera_pitch = clampf(camera_pitch + event.relative.y * Tuning.CAMERA_MOUSE_PITCH, Tuning.CAMERA_PITCH_MIN, Tuning.CAMERA_PITCH_MAX)
		touch_positions[event.index] = event.position

func pick(screen: Vector2):
	if not is_instance_valid(hero) or hero.dead: return
	var nearest_drop; var drop_distance = 35.0
	for drop in ground_loot.values():
		if camera.is_position_behind(drop.position): continue
		for point in [drop.position + Vector3.UP * 0.2, drop.position + drop.label.position]:
			var d = camera.unproject_position(point).distance_to(screen)
			if d < drop_distance: nearest_drop = drop; drop_distance = d
	if nearest_drop:
		pickup_drop(nearest_drop.data.id); return
	var closest; var distance = 40.0
	for actor in mobs.values() + players.values() + npcs:
		if not actor.visible or actor.dead or camera.is_position_behind(actor.position): continue
		var projected = camera.unproject_position(actor.position + Vector3.UP * 1.1)
		var d = projected.distance_to(screen)
		if d < distance: closest = actor; distance = d
	if closest:
		if closest.kind == "n": _talk(closest)
		elif target == closest: attack()
		else: set_target(closest)
		return
	var origin = camera.project_ray_origin(screen); var direction = camera.project_ray_normal(screen)
	var previous = origin
	for i in range(1, 401):
		var pos = origin + direction * i * 2.5
		if pos.y <= GameData.height_at(pos.x, pos.z):
			for j in 8:
				var middle = (pos + previous) * 0.5
				if middle.y <= GameData.height_at(middle.x, middle.z): pos = middle
				else: previous = middle
			destination = GameData.position_at(pos.x, pos.z); has_destination = true; talking_to = null; pending_pickup = ""; _cancel_attack()
			marker.position = destination + Vector3.UP * 0.1; marker.show(); return
		previous = pos

func _ring(col: Color, radius: float) -> MeshInstance3D:
	var mesh = TorusMesh.new(); mesh.inner_radius = radius; mesh.outer_radius = radius + 0.08; mesh.rings = 24; mesh.ring_segments = 6
	var node = MeshInstance3D.new(); node.mesh = mesh
	var mat = StandardMaterial3D.new(); mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; mat.albedo_color = col
	node.material_override = mat; node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; add_child(node); return node

func _effect(pos: Vector3, col: Color, radius: float):
	var node = _ring(col, 0.5); node.position = pos + Vector3.UP * 0.35
	node.material_override.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	var tween = create_tween(); tween.tween_property(node, "scale", Vector3.ONE * radius * 2, 0.5)
	tween.parallel().tween_property(node.material_override, "albedo_color:a", 0, 0.5)
	tween.tween_callback(node.queue_free)
	var sparks = CPUParticles3D.new(); sparks.position = pos + Vector3.UP
	sparks.amount = 22; sparks.lifetime = 0.65; sparks.one_shot = true; sparks.explosiveness = 1
	sparks.direction = Vector3.UP; sparks.spread = 100; sparks.gravity = Vector3(0, -5, 0)
	sparks.initial_velocity_min = 2; sparks.initial_velocity_max = 5; sparks.scale_amount_min = 0.06; sparks.scale_amount_max = 0.16
	var mesh = SphereMesh.new(); mesh.radius = 0.5; mesh.height = 1; mesh.radial_segments = 6; mesh.rings = 3
	var mat = StandardMaterial3D.new(); mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; mat.albedo_color = col
	mat.emission_enabled = true; mat.emission = col; mat.emission_energy_multiplier = 2.5; mesh.material = mat
	sparks.mesh = mesh; add_child(sparks); sparks.emitting = true
	get_tree().create_timer(1.2).timeout.connect(sparks.queue_free)

func _projectile(from: Vector3, to: Vector3, col: Color):
	var node = MeshInstance3D.new(); var mesh = SphereMesh.new(); mesh.radius = 0.25; mesh.height = 0.5
	node.mesh = mesh; node.position = from + Vector3.UP * 1.4
	var mat = StandardMaterial3D.new(); mat.albedo_color = col; mat.emission_enabled = true; mat.emission = col; mat.emission_energy_multiplier = 5
	node.material_override = mat; add_child(node)
	var light = OmniLight3D.new(); light.light_color = col; light.light_energy = 2; light.omni_range = 4; node.add_child(light)
	var tween = create_tween(); tween.tween_property(node, "position", to + Vector3.UP, clampf(from.distance_to(to) / 50, 0.15, 0.6))
	tween.tween_callback(func(): _effect(to, col, 1.8); node.queue_free())

func _float(pos: Vector3, text: String, col: Color):
	var label = Label3D.new(); label.text = text; label.modulate = col; label.font_size = 52; label.pixel_size = 0.012
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED; label.outline_size = 10; label.no_depth_test = true
	label.position = pos + Vector3.UP * 2.5; add_child(label)
	var tween = create_tween(); tween.tween_property(label, "position:y", label.position.y + 2, 0.9)
	tween.parallel().tween_property(label, "modulate:a", 0, 0.9); tween.tween_callback(label.queue_free)

func _capture():
	await RenderingServer.frame_post_draw
	var image = get_viewport().get_texture().get_image()
	image.save_png(capture_path)
	var report = FileAccess.open(capture_path + ".json", FileAccess.WRITE)
	if report:
		var state = {"endpoint": Network.endpoint, "connected": Network.online, "authenticated": Network.authed, "online": Network.online_count, "fps": Engine.get_frames_per_second(), "window": hud.window_kind, "music": game_audio.music.cue, "music_playing": game_audio.music.players.any(func(player): return player.playing)}
		if is_instance_valid(hero): state.merge({"health": hud.hp_text.text, "animation": hero.last_clip, "model": hero.active_art, "mobs": mobs.size(), "ready": not hud.hp_text.text.is_empty() and not hero.last_clip.is_empty()})
		else: state["ready"] = hud.login_panel.visible and Network.online
		report.store_string(JSON.stringify(state))
	print("NATIVE_SCREENSHOT_SAVED")

func _sync_ground(entries: Array):
	var seen: Dictionary = {}
	for entry in entries:
		seen[entry.id] = true
		if not ground_loot.has(entry.id):
			var drop = load("res://scripts/ground_loot.gd").new(); add_child(drop); drop.setup(entry); ground_loot[entry.id] = drop
		else: ground_loot[entry.id].refresh(entry)
	for id in ground_loot.keys():
		if not seen.has(id):
			ground_loot[id].queue_free(); ground_loot.erase(id)
			if pending_pickup == id: pending_pickup = ""; pickup_sent_at = 0

func pickup_drop(id: String):
	if not ground_loot.has(id) or hero.dead: return
	if not ground_loot[id].data.available:
		hud.log_line("Добыча пока принадлежит " + ground_loot[id].data.ownerName); return
	_cancel_attack(); has_destination = false; talking_to = null; marker.hide()
	pending_pickup = id; pickup_sent_at = 0

func pickup_nearest():
	if not is_instance_valid(hero): return
	var nearest = ""; var distance = 25.0
	for drop in ground_loot.values():
		var d = hero.position.distance_to(drop.position)
		if drop.data.available and d < distance: nearest = drop.data.id; distance = d
	if not nearest.is_empty(): pickup_drop(nearest)
	else: hud.log_line("Рядом нет доступной добычи. Подойдите к месту гибели моба.")
