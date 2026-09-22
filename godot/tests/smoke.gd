extends Node
var root: Window:
	get: return get_tree().root
var process_frame: Signal:
	get: return get_tree().process_frame
var current_scene: Node:
	get: return get_tree().current_scene
	set(value): get_tree().current_scene = value

func create_timer(seconds: float): return get_tree().create_timer(seconds)
func quit(code: int): get_tree().quit(code)
var game
var net
var data
var failures = 0
var checks = 0
var received: Array = []
var peer: WebSocketPeer
var peer_inbox: Array = []
var peer_id = 0
var artifacts = ""

func _ready():
	_run.call_deferred()

func check(condition: bool, description: String):
	checks += 1
	if condition: print("PASS: " + description)
	else: failures += 1; push_error("FAIL: " + description)

func wait_for(condition: Callable, seconds = 8.0) -> bool:
	var deadline = Time.get_ticks_msec() + seconds * 1000
	while Time.get_ticks_msec() < deadline:
		_poll_peer()
		if condition.call(): return true
		await create_timer(0.03).timeout
	return false

func wait_wall(seconds: float):
	var deadline = Time.get_ticks_msec() + int(seconds * 1000)
	await wait_for(func(): return Time.get_ticks_msec() >= deadline, seconds + 2)

func _poll_peer():
	if not peer: return
	peer.poll()
	while peer.get_available_packet_count() > 0:
		var m = JSON.parse_string(peer.get_packet().get_string_from_utf8())
		if m is Dictionary: peer_inbox.append(m)

func _run():
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--artifacts="): artifacts = arg.trim_prefix("--artifacts=")
	data = root.get_node("GameData"); net = root.get_node("Network")
	if not "--test-mode" in OS.get_cmdline_user_args() or not net.endpoint.begins_with("ws://127.0.0.1:"):
		push_error("Tests require an isolated local server and --test-mode"); quit(1); return
	var fixtures = JSON.parse_string(FileAccess.get_file_as_string("res://generated/stats-fixtures.json"))
	var stats_match = true
	for fixture in fixtures:
		var s = data.stats(fixture.p)
		for key in fixture.stats:
			if fixture.stats[key] is float or fixture.stats[key] is int:
				if not is_equal_approx(float(s[key]), float(fixture.stats[key])):
					stats_match = false; print("Mismatch ", key, ": ", s[key], " != ", fixture.stats[key])
	check(stats_match, "%s native stat profiles match the JS game rules" % fixtures.size())
	check(data.world.spawns.size() >= 210 and data.world.obstacles.size() >= 3251 + data.world.townDecor.size() and data.world.modelPlacements.size() >= 1900, "world content exported without missing spawns")
	check(absf(data.height_at(-430, 400) - 4) < 0.001, "town ground matches server")
	var position = data.move(Vector3(-437, 4, 400), Vector3.RIGHT, 5)
	check(position.distance_to(Vector3(-430, 4, 400)) >= 4.5*float(data.world.towns[0].scale)+0.6-0.01, "movement cannot cross the fountain")
	var art = load("res://scripts/art_assets.gd")
	var assets_ok = true
	for id in data.catalog.MOBS.keys() + ["warrior", "mage", "merchant", "gatekeeper", "priest"]:
		var actor = art.actor(id)
		if not actor: assets_ok = false; continue
		var skeleton = actor.find_child("Skeleton3D", true, false)
		var player = actor.find_child("AnimationPlayer", true, false)
		if not skeleton or not player or not player.has_animation("walk") or not player.has_animation("death"):
			assets_ok = false; print("Incomplete rig: ", id)
		actor.free()
	for row in data.world.modelPlacements:
		if not ResourceLoader.exists("res://assets/props/%s.glb" % row[0]): assets_ok = false
	check(assets_ok, "all hero, NPC, mob rigs and placed scenery assets exist")
	var animated_creatures = true
	for id in ["wolf", "boar", "rabbit", "spider", "scorpion"]:
		var creature = art.actor(id); root.add_child(creature)
		var player = creature.find_child("AnimationPlayer", true, false)
		var skeleton = creature.find_child("Skeleton3D", true, false)
		for clip in ["idle", "walk", "run", "windup", "attack", "cast", "hit", "death"]:
			if not player.has_animation(clip): animated_creatures = false
		player.play("run"); player.seek(0.12, true); player.advance(0)
		var poses = []
		for i in skeleton.get_bone_count(): poses.append(skeleton.get_bone_pose_rotation(i))
		player.seek(0.42, true); player.advance(0)
		var changed = 0
		for i in skeleton.get_bone_count():
			if not poses[i].is_equal_approx(skeleton.get_bone_pose_rotation(i)): changed += 1
		if changed < 4: animated_creatures = false; print("Frozen creature rig: ", id, " changed=", changed)
		creature.free()
	check(animated_creatures, "five creature rigs have eight clips and articulated legs actually change pose")

	game = load("res://scenes/main.tscn").instantiate(); root.add_child(game); current_scene = game
	net.message.connect(func(m): received.append(m))
	check(await wait_for(func(): return net.online), "Godot WebSocket connects to Node server")
	check(await wait_for(func(): return game.hud.login_online.text == "Игроков онлайн: 0"), "login displays authenticated players, excluding its own unauthenticated connection")
	await _screenshot("login.png")
	game.hud.login_switch.pressed.emit()
	check(is_instance_valid(game.hud.creation_preview) and game.hud.class_select.visible, "character creation previews the real Godot model")
	await _screenshot("create-character.png")
	game.hud.login_name.text = "NativeTest"; game.hud.login_pass.text = "isolated-test"
	game.hud.login_submit.pressed.emit()
	if not await wait_for(func(): return not game.profile.is_empty()):
		check(false, "registration returned profile"); _finish(); return
	check(game.profile.cls == "warrior" and game.profile.lvl == 1, "server creates the player")
	check(await wait_for(func(): return game.hud.status_label.text.contains("Игроков онлайн: 1")), "HUD shows the live server player count")
	check(game.hero.animator != null and game.hero.animator.has_animation("walk"), "native animated hero imported")
	var saved_position = game.hero.position
	for region in [[Vector3(-430,4,400), "town"], [Vector3(20,0,10), "forest"], [Vector3(360,0,-120), "waste"], [Vector3(2205,0,-195), "crypt"]]:
		game.hero.position = region[0]
		game.world.set_region(region[0]); game.world._process(10)
		game.game_audio.follow(game.hero, game.camera, 2)
		check(game.world.region_id == region[1] and game.game_audio.ambience.playing, "light and ambience match " + region[1])
	game.game_audio.clear()
	check(not game.game_audio.ambience.playing, "ambience stops on clear")
	game.hero.position = saved_position; game.world.set_region(saved_position); game.world._process(10)
	check(await wait_for(func(): return not game.mobs.is_empty()), "nearby mobs arrive as snapshots")
	var tab = InputEventKey.new(); tab.physical_keycode = KEY_TAB; tab.keycode = KEY_TAB; tab.pressed = true
	root.push_input(tab, true); await process_frame
	check(game.hud.window_kind == "inventory", "real Tab opens the bag before GUI focus navigation")
	root.push_input(tab, true); await process_frame
	check(game.hud.window_kind.is_empty(), "Tab closes the bag on the second press")
	game.hud.chat_input.grab_focus(); root.push_input(tab, true); await process_frame
	check(game.hud.window_kind.is_empty(), "Tab while editing chat does not open inventory")
	var focus = root.gui_get_focus_owner()
	if focus: focus.release_focus()
	await _test_audio_bank()
	await _test_locomotion()

	await create_timer(0.2).timeout
	for kind in ["inventory", "character", "map", "shop", "teleport", "priest", "menu", "skills", "profession", "settings", "controls", "actions", "equipment", "craft"]:
		game.hud.show_window(kind)
		await process_frame
		check(is_instance_valid(game.hud.window) and game.get_viewport().get_visible_rect().encloses(game.hud.window.get_global_rect()), kind + " window fits the viewport")
		if DisplayServer.get_name() != "headless": await _screenshot(kind + ".png")
	game.hud.close_window()
	game.hud.show_window("map")
	check(game.hud.map_control.city_focus, "map opens the detailed town plan while in town")
	game.hud.close_window()
	for shop_id in ["weapons", "clothes", "alchemy"]:
		var vendor = game.npcs.filter(func(n): return n.definition.get("shop", "") == shop_id)[0]
		game._open_npc(vendor)
		var products = []
		for button in game.hud.window.find_children("*", "Button", true, false):
			if button.has_meta("buy"): products.append(button.get_meta("buy"))
		check(products == data.catalog.SHOP_STOCK[shop_id], "native shop shows its own inventory: " + shop_id)
	game.hud.shop_id = ""; game.hud.shop_name = "Рыночный торговец"; game.hud.close_window()
	game.hud.show_window("settings")
	for slider in game.hud.window.find_children("*", "HSlider", true, false):
		if slider.get_meta("audio_bus", "") == "Effects":
			slider.value = 0
			check(AudioServer.is_bus_mute(AudioServer.get_bus_index("Effects")) and game.hud.Settings.read_value("audio", "Effects", -1) == 0, "sound slider mutes the real effects bus and persists independently")
			slider.value = 65
	for slider in game.hud.window.find_children("*", "HSlider", true, false):
		if slider.get_meta("audio_bus", "") == "Music":
			slider.value = 0
			check(AudioServer.is_bus_mute(AudioServer.get_bus_index("Music")) and not AudioServer.is_bus_mute(AudioServer.get_bus_index("Effects")), "music slider mutes only music and leaves combat sounds audible")
			slider.value = 45
	game.hud.close_window()
	check(game.hud.skill_buttons[0].get_global_rect().intersects(game.get_viewport().get_visible_rect()), "hotbar is inside viewport")
	game.hud.log_line("system-only-marker", "rewards")
	game.hud.chat.add_message({"ch": "all", "from": "Проверка", "text": "player-only-marker"})
	check(game.hud.chat.system_view.get_parsed_text().contains("system-only-marker") and not game.hud.chat.log_view.get_parsed_text().contains("system-only-marker"), "system log is separate from player chat")
	check(not game.hud.chat.system_view.get_parsed_text().contains("player-only-marker"), "ordinary messages never enter system log")
	check(game.hud.chat.system_view.get_global_rect().end.y < game.hud.chat.log_view.get_global_rect().position.y, "system log is above ordinary chat")
	var distance = game.camera_distance
	_wheel(game.hud.chat.log_view.get_global_rect().get_center(), MOUSE_BUTTON_WHEEL_DOWN)
	await process_frame
	check(is_equal_approx(distance, game.camera_distance), "real wheel input over chat does not move the camera")
	_wheel(game.hud.chat.system_view.get_global_rect().get_center(), MOUSE_BUTTON_WHEEL_UP)
	await process_frame
	check(is_equal_approx(distance, game.camera_distance), "real wheel input over system log does not move the camera")
	var zoom = game.hud.minimap.zoom
	_wheel(game.hud.minimap.get_global_rect().get_center(), MOUSE_BUTTON_WHEEL_UP)
	await process_frame
	check(game.hud.minimap.zoom < zoom and is_equal_approx(distance, game.camera_distance), "minimap wheel changes map scale without moving camera")
	game.hud.minimap.change_zoom(100); check(game.hud.minimap.zoom == 8.0, "minimap zoom-out is bounded")
	game.hud.minimap.change_zoom(0.001); check(game.hud.minimap.zoom == 0.5, "minimap zoom-in is bounded")
	game.hud.minimap.change_zoom(4)
	game.hud.assign_slot(0, "pickup"); game.hud.hotbar_locked = false; game.hud.swap_slots(0, 8)
	game.hud.assign_slot(8, "potion_hp")
	check(game.hud.hotbar_bindings[8] == "potion_hp" and game.hud.Settings.read_value("hotbar", "warrior", [])[8] == "potion_hp", "custom action bindings are saved")
	game.hud.hotbar_bindings = game.hud.default_bindings(); game.hud._save_hotbar(); game.hud.set_hotbar_locked(true)
	await _test_hotbar_drag()
	_test_gait()
	check(game.hud.pickup_button.visible and game.hud.pickup_button.text.contains("Поднять"), "pickup has an explicit permanent action button")
	await _screenshot("chat-actions.png")
	await _town_overview()
	var fixes_before_move = received.filter(func(m): return m.t == "fix").size()
	var start = game.hero.position
	game.joystick = Vector2.RIGHT
	await create_timer(0.35).timeout
	game.joystick = Vector2.ZERO
	check(game.hero.position.distance_to(start) > 1, "native movement updates position")
	check(is_equal_approx(game.stats.speed, 7.15), "native warrior uses the requested ten-percent faster pace")
	var stopped_at = game.hero.position
	await create_timer(.15).timeout
	check(game.hero.position.distance_to(stopped_at)<.01 and not game.hero.moving and game.hero.last_clip == "idle", "releasing movement stops position and gait without drifting")
	var fixes = received.filter(func(m): return m.t == "fix").size()
	check(fixes == fixes_before_move, "server accepts native movement speed")
	await _dev({"x": -435.1, "z": 400})
	var before_slide = game.hero.position
	var fixes_before_slide = received.filter(func(m): return m.t == "fix").size()
	game.destination = data.position_at(-430, 406); game.has_destination = true
	await create_timer(0.8).timeout
	game.has_destination = false
	await create_timer(0.2).timeout
	check(game.hero.position.distance_to(before_slide) > 2, "native player slides around the fountain")
	check(received.filter(func(m): return m.t == "fix").size() == fixes_before_slide, "server accepts curved native movement around obstacles")
	await _dev({"x": -450.5, "z": 407, "coins": 10000, "lvl": 8})
	game.hud.show_window("shop")
	_click("buy", "sword_long")
	check(await wait_for(func(): return _bag("sword_long") >= 0), "shop purchase is server-authoritative")
	game.hud.show_window("inventory")
	await process_frame; await process_frame
	var equipment_slots = game.hud.window.find_children("*", "Button", true, false).filter(func(b): return b.has_meta("equipment_slot"))
	check(equipment_slots.size() == 12 and equipment_slots.all(func(b): return game.hud.window.get_global_rect().encloses(b.get_global_rect())), "all twelve equipment slots fit inside the compact inventory")
	var source_item
	var weapon_slot
	for button in game.hud.window.find_children("*", "Button", true, false):
		if button.get_meta("equipment_slot", "") == "weapon": weapon_slot = button
		if button.get("payload") is Dictionary and button.payload.get("id") == "sword_long" and button.payload.has("idx"): source_item = button
	check(is_instance_valid(source_item) and is_instance_valid(weapon_slot), "bag and equipped weapon expose real drag destinations")
	if is_instance_valid(source_item) and is_instance_valid(weapon_slot): await _drag(source_item, weapon_slot)
	check(await wait_for(func(): return game.profile.equip.weapon == "sword_long"), "inventory equip updates character")
	await _dev({"item": "scroll_ench_w"})
	_select_bag("scroll_ench_w"); _click("item_action", "scroll_ench_w")
	for button in game.hud.window.find_children("*", "Button", true, false):
		if button.get("payload") is Dictionary and button.payload.get("slot") == "weapon": button.pressed.emit(); break
	_click("item_action", "sword_long")
	check(await wait_for(func(): return game.profile.enc.get("weapon", 0) == 1), "enchanting returns server result")
	await _dev({"item": "potion_mp", "n": 3})
	var quantity = int(game.profile.inv[_bag("potion_mp")].n)
	var money_before = game.profile.coins
	game.hud.show_window("shop"); _click("shop_tab", "sell"); _click("sell_stack", "potion_mp")
	check(await wait_for(func(): return _bag("potion_mp") < 0 and game.profile.coins == money_before + quantity * data.sell_price("potion_mp")), "sell tab sells the correct stack at the server price")
	await _dev({"sp": 5000})
	game.hud.show_window("skills"); _click("learn", "battle_cry")
	check(await wait_for(func(): return game.profile.get("skills", {}).get("battle_cry", 0) == 1 and game.profile.sp < 5000), "skills card learns the server rank and spends SP")
	game.hud.close_window()
	game.hud.skill_buttons[1].pressed.emit()
	check(await wait_for(func(): return game.hud.effects_row.get_child_count() > 0 and game.stats.patk > data.stats(game.profile).patk), "buff and effective stats come from the server skill event")
	check(await wait_for(func(): return game.hero.effects.any(func(entry): return str(entry[1]) == "buff" and int(entry[2]) > 0)), "snapshot carries the hero's own timed effects with a remaining time")
	var effect_icon = game.hud.effects_row.get_child(0)
	var effect_timer = effect_icon.find_child("Timer", true, false)
	check(is_instance_valid(effect_timer) and effect_timer.text.ends_with("с") and effect_icon.tooltip_text.contains("Боевой клич"), "effect icon counts the remaining seconds down and names the skill")
	check(game.combat_fx.auras.size() > 0 and int(game.combat_fx.counts.get("aura", 0)) > 0, "timed effect spawns real particles through combat_fx")
	check(game.hud.effects_row.visible and not game.hud.target_effects_row.visible, "target effect row stays hidden while the target carries nothing")
	await _screenshot("effect-icons.png")
	await _test_profession()
	await _dev({"x": -418, "z": 410})
	game.hud.show_window("teleport"); _click("teleport", "meadow")
	check(await wait_for(func(): return absf(game.hero.position.x + 260) < 2), "teleport places the native hero in the correct world coordinates")
	await wait_for(func(): return game.mobs.values().any(func(m): return m.visible and not m.dead))
	check(await wait_for(func(): return not game.hud.minimap.mob_markers.is_empty()), "minimap displays live server mobs")
	await create_timer(0.3).timeout
	await _screenshot("minimap-mobs.png")
	var mob = null
	var combat_position = Vector3.ZERO
	for m in game.mobs.values():
		if not m.visible or m.dead or m.definition.lvl > 3: continue
		if data.world.towns.any(func(t): return Vector2(m.position.x - t.x, m.position.z - t.z).length() < t.r + 30): continue
		for i in 8:
			var angle = TAU * i / 8
			var candidate = data.position_at(m.position.x + cos(angle) * 1.2, m.position.z + sin(angle) * 1.2)
			if data.move(candidate, Vector3.ZERO, 0.01).distance_to(candidate) < 0.1:
				mob = m; combat_position = candidate; break
		if mob: break
	if mob:
		await _dev({"x": combat_position.x, "z": combat_position.z, "hp": 500, "lvl": 18})
		# Use the same screen-space picking as the mouse/touch client.
		await create_timer(0.25).timeout
		game.pick(game.camera.unproject_position(mob.position + Vector3.UP * 1.1))
		check(await wait_for(func(): return game.target == mob and game.target_arrow.visible and game.hud.target_panel.visible and mob.selected), "clicking a mob displays its name, HP, arrow and selection ring")
		await _screenshot("target-selected.png")
		game.hud.autoloot_button.button_pressed = false
		check(await wait_for(func(): return game.profile.get("autoloot") == false), "autoloot toggle persists on the server")
		var sp_before = int(game.profile.get("sp", 0))
		var coins_before = int(game.profile.coins)
		game.attack(); game.use_skill("power_strike")
		var killed = await wait_for(func(): return game.profile.get("kills", 0) > 0, 12)
		if not killed:
			print("Combat diagnostics: player=", game.hero.position, " mob=", mob.position, " hp=", mob.hp, " visible=", mob.visible, " attacking=", game.attacking)
			for message in received:
				if message.t == "ev":
					for event in message.e:
						if event.k == "msg": print("Server: ", event.text)
		check(game.profile.get("sp", 0) > sp_before, "mob kill awards server SP")
		check(killed, "native target + attack + skill kill a server mob and award progress")
		check(int(game.profile.coins) == coins_before, "kill awards XP but coins stay on the ground")
		check(await wait_for(func(): return game.ground_loot.values().any(func(d): return d.data.item == "coins")), "server kill spawns visible ground coins")
		game.camera_distance = 15; game.camera_pitch = 0.85; game.camera_yaw += PI
		await create_timer(0.65).timeout
		check(mob.dead and mob.last_clip == "death" and mob.death_elapsed > 0, "animal plays its death animation and leaves a corpse")
		await _screenshot("death-and-loot.png")
		var coins_drop
		for drop in game.ground_loot.values():
			if drop.data.item == "coins": coins_drop = drop; break
		if coins_drop:
			var reward = int(coins_drop.data.n); var drop_id = str(coins_drop.data.id)
			game.pick(game.camera.unproject_position(coins_drop.position + coins_drop.label.position))
			check(await wait_for(func(): return int(game.profile.coins) == coins_before + reward and not game.ground_loot.has(drop_id)), "screen click picks up actual coins and server credits the wallet once")

	else: check(false, "an unobstructed mob outside peace zones is available for combat test")
	game.camera_distance = 28; game.camera_pitch = 0.56; game.camera_yaw = 0.45
	game._cancel_attack()
	await create_timer(0.25).timeout
	# Сравнение ждёт ближайшего обновления карты: окно «свежести» 1500 мс иначе истекает
	# между перерисовкой и самой проверкой, и живой маркер считается лишним.
	check(await wait_for(func(): return game.hud.minimap.mob_markers.size() == game.mobs.values().filter(func(m): return m.visible and not m.dead and Time.get_ticks_msec() - m.seen < 1500).size()), "minimap removes dead and stale mobs")
	# A second ordinary WS client proves the native client interoperates with the existing protocol.
	peer = WebSocketPeer.new(); peer.connect_to_url(net.endpoint)
	check(await wait_for(func(): return peer.get_ready_state() == WebSocketPeer.STATE_OPEN), "second player connects")
	peer.send_text(JSON.stringify({"t": "register", "name": "NativePeer", "pass": "isolated-test", "cls": "mage"}))
	check(await wait_for(func(): return peer_inbox.any(func(m): return m.t == "authok")), "second player authenticates")
	for m in peer_inbox:
		if m.t == "authok": peer_id = int(m.id)
	await _dev({"x": -448, "z": 418})
	check(await wait_for(func(): return game.players.has(peer_id) and game.players[peer_id].visible), "native multiplayer renders a remote player")
	peer.send_text(JSON.stringify({"t": "dev", "lvl": 10, "sp": 1000, "hp": 30}))
	await create_timer(0.2).timeout
	peer.send_text(JSON.stringify({"t": "learn", "id": "heal", "rank": 1}))
	check(await wait_for(func(): return peer_inbox.any(func(m): return m.t == "you" and m.p.get("skills", {}).get("heal", 0) == 1)), "remote mage learns healing on the same server")
	peer.send_text(JSON.stringify({"t": "skill", "id": "heal"}))
	check(await wait_for(func(): return game.players[peer_id].cast_remaining > 0 and game.combat_fx.casts.has(game.players[peer_id].get_instance_id())), "remote cast shows the correct actor animation and charge effect")
	check(game.cast_time == 0, "another player's spell never starts the local cast bar")
	check(await wait_for(func(): return game.combat_fx.counts.get("heal", 0) > 0), "nearby healing release renders from server events")
	await _dev({"drop": "pelt"})
	check(await wait_for(func(): return game.ground_loot.values().any(func(d): return d.data.item == "pelt")), "server item drop has a native model and name")
	var pelt_drop
	for drop in game.ground_loot.values():
		if drop.data.item == "pelt": pelt_drop = drop; break
	if pelt_drop:
		var drop_id = str(pelt_drop.data.id)
		check(await wait_for(func(): return peer_inbox.any(func(m): return m.t == "snap" and m.get("g", []).any(func(d): return d.id == drop_id))), "second client sees the same ground item ID")
		await _dev({"x": pelt_drop.position.x - 6, "z": pelt_drop.position.z})
		await create_timer(0.2).timeout
		game.pick(game.camera.unproject_position(pelt_drop.position + pelt_drop.label.position))
		check(await wait_for(func(): return _bag("pelt") >= 0 and not game.ground_loot.has(drop_id)), "click approaches a distant ground item and it enters the authoritative inventory")
		peer_inbox.clear()
		check(await wait_for(func(): return peer_inbox.any(func(m): return m.t == "snap" and not m.get("g", []).any(func(d): return d.id == drop_id))), "pickup disappears from both clients")
	game.hud.show_window("inventory")
	check(game.hud.wallet_label.text.contains(game.hud._money(int(game.profile.coins))), "inventory wallet shows the exact server balance")
	_click("bag_filter", 3)
	await process_frame
	check(game.hud.bag_grid.get_children().any(func(b): return b.payload.get("id") == "pelt") and not game.hud.bag_grid.get_children().any(func(b): return b.payload.get("id") == "potion_hp"), "loot filter keeps loot and hides consumables")
	game.hud.bag_filter = 0; game.hud.bag_query = "Шкура"; game.hud._fill_bag()
	check(game.hud.bag_grid.get_children().filter(func(b): return not b.payload.is_empty()).all(func(b): return b.payload.idx == _bag(b.payload.id)), "filtered bag preserves original server indices")
	game.hud.bag_query = ""; game.hud.show_window("inventory", true)
	await _screenshot("inventory-loot.png")
	game.hud.bag_filter = 0; game.hud.close_window()

	game.hud.chat.input.text = "native public chat"; game.hud.chat.submit()
	check(await wait_for(func(): return peer_inbox.any(func(m): return m.t == "chat" and m.text == "native public chat")), "public chat interoperates")
	game.hud.chat.select_channel("pm"); game.hud.chat.recipient.text = "NativePeer"
	game.hud.chat.input.text = "native private chat"; game.hud.chat.submit()
	check(await wait_for(func(): return peer_inbox.any(func(m): return m.t == "pm" and m.text == "native private chat")), "private chat interoperates")
	check(await wait_for(func(): return game.hud.chat.log_view.get_parsed_text().contains("native private chat")), "private chat tab renders the server reply")
	check(not game.hud.chat.log_view.get_parsed_text().contains("native public chat"), "private chat tab filters public messages")
	game.hud.chat.select_channel("all")
	check(game.hud.chat.log_view.get_parsed_text().contains("native public chat"), "public history is retained across tabs")
	await _test_chat_channels()
	game.hud.chat.set_preference("sys", false); game.hud.log_line("hidden system notice")
	check(not game.hud.chat.log_view.get_parsed_text().contains("hidden system notice"), "chat settings filter system messages")
	game.hud.chat.set_preference("sys", true)
	for i in 270: game.hud.log_line("battle message %s" % i, "combat")
	check(game.hud.chat.log_view.get_parsed_text().contains("native public chat"), "combat spam cannot erase ordinary chat history")
	game.hud.chat.set_preference("combat", false)
	check(not game.hud.chat.system_view.get_parsed_text().contains("battle message"), "system log combat filter is independent")
	await _test_chat_scroll()
	await _test_chat_resize()
	await _test_party()
	check(await wait_for(func(): return game.hud.minimap.player_markers.size() > 0 and net.online_count == 2), "server online count and remote players appear in the HUD and minimap")
	var saved_level = game.profile.lvl
	var reconnects = net.reconnect_count
	var original_socket = net.socket
	net.last_packet_at = Time.get_ticks_msec() - 11000
	net._notification(Node.NOTIFICATION_APPLICATION_RESUMED)
	check(net.socket == original_socket, "returning focus does not replace a healthy connection")
	net.socket.close(1001, "test interrupted connection")
	check(await wait_for(func(): return net.reconnect_count > reconnects and net.authed), "transport loss automatically reconnects without a manual start")
	check(game.profile.lvl == saved_level and game.profile.equip.weapon == "sword_long", "token reconnect retains progression and equipment")
	check(game.hud.chat.history.any(func(entry): return entry.text == "native public chat"), "reconnect preserves social chat history")
	# Change class with a separate test account and test imported mage animation and casting.
	game._return_to_login(true)
	await wait_for(func(): return net.online)
	game._login({"t": "register", "name": "NativeMage", "pass": "isolated-test", "cls": "mage"})
	check(await wait_for(func(): return game.profile.get("cls") == "mage"), "mage character starts")
	check(game.hero.animator != null and game.hero.animator.has_animation("cast"), "mage has native cast animation")
	await _dev({"lvl": 10, "hp": 50, "sp": 5000})
	game.hud.show_window("skills"); _click("learn", "heal")
	check(await wait_for(func(): return game.profile.get("skills", {}).get("heal", 0) == 1), "mage learns healing for SP")
	game.hud.close_window()
	game.use_skill("heal")
	check(await wait_for(func(): return game.cast_time > 0), "server-driven casting starts")
	check(game.hero.cast_remaining > 0 and game.combat_fx.casts.has(game.hero.get_instance_id()), "local cast combines wind-up animation with a hand focus and ground sigil")
	check(await wait_for(func(): return game.profile.hp > 60), "healing updates server health")
	check(await wait_for(func(): return game.game_audio.play_counts.get("heal", 0) > 0 and game.hero.action_clip == "release"), "server heal triggers a release clip and spatial audio")
	game.hud.show_window("inventory")
	await process_frame
	check(game.hud.enchant_scroll.is_empty() and game.hud.chat.recipient.text.is_empty(), "changing account clears old inventory and chat selection")
	game.hud.close_window()
	await _dev({"item": "sword_long", "lvl": 10})
	game._action("equip", _bag("sword_long"))
	check(await wait_for(func(): return game.hero.weapon_node.get_meta("weapon_kind") == "warrior"), "mage equipping a sword changes the actual weapon model")
	check(game.hero.weapon_node.to_global(game.hero.weapon_node.get_meta("handle_center")).distance_to(game.hero.weapon_node.get_parent().global_position) < 0.001, "weapon handle stays exactly on the palm grip")
	await _dev({"x": -450.5, "z": 407, "coins": 1000, "item": "pelt", "n": 20})
	await _dev({"item": "bone", "n": 20})
	game.hud.show_window("craft"); _click("craft", "staff_oak")
	check(await wait_for(func(): return _bag("staff_oak") >= 0 and game.profile.coins == 700 and _bag("pelt") < 0 and _bag("bone") < 0), "native crafting spends exact resources on the actual server")
	game.hud.close_window()
	await _dev({"lvl": 25, "item": "staff_abyss"})
	game._action("equip", _bag("staff_abyss"))
	check(await wait_for(func(): return game.profile.equip.weapon == "staff_abyss" and game.hero.weapon_node.get_meta("weapon_kind") == "mage"), "B mage weapon is equipped and uses the staff model")
	for item in ["hat_abyss", "robe_abyss", "gloves_abyss", "boots_abyss"]:
		await _dev({"item": item}); game._action("equip", _bag(item)); await create_timer(0.15).timeout
	check(await wait_for(func(): return game.stats.sets.any(func(entry): return entry.id == "abyss" and entry.have == entry.parts.size())), "complete B mage set activates the shared server-stat bonus")
	game.hud.show_window("character"); await _screenshot("mage-b-gear.png"); game.hud.close_window()
	await _test_combat_presentation()
	await _test_starter_hunt()
	await _test_elite()
	await _test_mob_telegraph()
	await _test_timed_effects()
	await _test_pack()
	# Real screenshot from the rendering backend, when running with a display.
	if DisplayServer.get_name() != "headless":
		await RenderingServer.frame_post_draw
		await _screenshot("game.png")
	# A second login is terminal, not a transient network fault. Otherwise two
	# devices can hide the reason or keep taking the character from each other.
	peer.close(); peer = WebSocketPeer.new(); peer.connect_to_url(net.endpoint)
	await wait_for(func(): return peer.get_ready_state() == WebSocketPeer.STATE_OPEN)
	peer.send_text(JSON.stringify({"t": "login", "name": "NativeMage", "pass": "isolated-test"}))
	check(await wait_for(func(): return game.profile.is_empty() and net.stopped), "login on another device stops automatic reconnect")
	await create_timer(1.2).timeout
	check(game.hud.login_message.text.contains("другого устройства") and not net.authed, "duplicate-login reason remains visible without a reconnect loop")
	check(game.hud.login_online.text.contains("нет связи") and game.combat_fx.active.is_empty() and not game.game_audio.ambience.playing and game.game_audio.music.players.all(func(p): return not p.playing), "logout clears music, effects, ambience and the stale online count")
	_finish()

func _test_combat_presentation():
	game.hud.show_window("skills"); _click("learn", "ice_nova")
	check(await wait_for(func(): return game.profile.skills.get("ice_nova", 0) == 1), "mage learns the frost spell for visual integration test")
	game.hud.close_window()
	await _dev({"x": -260, "z": 220, "hp": 500, "mp": 500})
	game.camera_distance = 12; game.camera_pitch = 0.4
	await create_timer(0.35).timeout
	game.use_skill("ice_nova")
	check(await wait_for(func(): return game.cast_time > 0), "frost wind-up starts from server confirmation")
	await _screenshot("combat-casting.png")
	check(await wait_for(func(): return game.combat_fx.counts.get("frost", 0) > 0), "frost has its own expanding shards and ring")
	await create_timer(0.15).timeout
	await _screenshot("combat-frost.png")
	check(game.game_audio.play_counts.get("frost", 0) > 0, "frost plays a distinct sound")
	var victim
	for mob in game.mobs.values():
		if mob.visible and not mob.dead and not data.world.towns.any(func(t): return Vector2(mob.position.x - t.x, mob.position.z - t.z).length() < t.r + 30): victim = mob; break
	if victim:
		var pos = data.position_at(victim.position.x + 8, victim.position.z + 3)
		await _dev({"x": pos.x, "z": pos.z, "mp": 500})
		game.set_target(victim); game.use_skill("fire_bolt")
		check(await wait_for(func(): return game.combat_fx.counts.get("projectile", 0) > 0), "fire release creates a projectile from the equipped hand toward the server target")
		await _screenshot("combat-fire.png")
		check(game.game_audio.play_counts.get("charge", 0) > 0 and game.game_audio.play_counts.get("fire", 0) > 0, "charge and fire release use separate sounds")
		game._cancel_attack()
	else: check(false, "live mob exists for fire presentation test")
	for i in 48: game.combat_fx.burst(game.hero.position, Color.WHITE)
	check(game.combat_fx.active.size() <= 40 and game.game_audio.voices.size() == 24, "dense combat caps effect instances and audio voices")
	game.combat_fx.clear()
	await create_timer(0.5).timeout

func _test_audio_bank():
	var audio = game.game_audio
	check(audio.music.cue == "music_town" and audio.music.players[audio.music.current_voice].playing, "town has an independently mixed authored music track")
	var loaded = 0
	var valid = true
	for variants in audio.variants.values():
		for stream in variants:
			loaded += 1
			if not stream or stream.get_length() <= 0: valid = false
	check(valid and loaded == 67, "all 67 licensed recordings and music tracks decode as real audio streams")
	var limiter_found = false
	for i in AudioServer.get_bus_effect_count(0):
		var effect = AudioServer.get_bus_effect(0, i)
		if effect is AudioEffectHardLimiter and effect.ceiling_db <= -1: limiter_found = true
	check(limiter_found, "the actual master bus limits overlapping combat peaks to -1 dB")
	audio.play_at("swing", game.hero.position)
	var first = audio.last_variant.get("swing", -1)
	# Cooldowns use monotonic wall time; headless frame timers may run ahead.
	var next_swing_at = Time.get_ticks_msec() + 80
	await wait_for(func(): return Time.get_ticks_msec() >= next_swing_at)
	audio.play_at("swing", game.hero.position)
	check(first >= 0 and audio.last_variant.get("swing", -1) != first, "successive sword swings select different recorded samples")
	var before = audio.play_counts.get("impact", 0)
	audio.play_at("impact", game.hero.position + Vector3.RIGHT * 100)
	check(audio.play_counts.get("impact", 0) == before, "distant combat cannot consume local audio voices")
	if DisplayServer.get_name() != "headless":
		var capture = AudioEffectCapture.new(); capture.buffer_length = 1.0
		var index = AudioServer.get_bus_effect_count(0); AudioServer.add_bus_effect(0, capture)
		for i in 12: audio.play_at("critical", game.hero.position + Vector3(i % 4, 0, floori(i / 4.0)) * 1.2)
		await create_timer(0.25).timeout
		var samples = capture.get_buffer(capture.get_frames_available())
		var peak = 0.0; var finite = true
		for sample in samples:
			finite = finite and is_finite(sample.x) and is_finite(sample.y)
			peak = maxf(peak, maxf(absf(sample.x), absf(sample.y)))
		check(samples.size() > 0 and finite and peak > 0 and peak <= 0.9, "rendered audio reaches the mixer without NaNs, silence or clipping")
		AudioServer.remove_bus_effect(0, index)

func _test_locomotion():
	await _dev({"x": -448, "z": 418})
	var start = game.hero.position
	var direction = Vector3.ZERO
	for i in 16:
		var trial = Vector3(sin(i * TAU / 16), 0, cos(i * TAU / 16))
		var candidate = start + trial * 16
		if data.move(candidate, Vector3.ZERO, 0.01).distance_to(candidate) < 0.1:
			direction = trial; break
	game.destination = start + direction * 16; game.has_destination = true
	check(await wait_for(func(): return game.hero.moving and game.hero.last_clip == "run"), "actual click movement selects the full-body running clip")
	await create_timer(0.2).timeout
	check(game.hero.motion_speed > 5 and game.hero.motion_speed <= float(game.stats.speed) * 1.05 and game.stats.speed <= 8.1, "running speed is reduced and animation follows measured displacement")
	var skeleton = game.hero.model.find_child("Skeleton3D", true, false)
	var bone = skeleton.find_bone("DEF-foot.L")
	var pose = skeleton.get_bone_global_pose(bone)
	await create_timer(0.11).timeout
	check(not pose.is_equal_approx(skeleton.get_bone_global_pose(bone)), "the running skeleton moves its feet between real rendered frames")
	await _screenshot("motion-running.png")
	check(await wait_for(func(): return not game.has_destination), "hero reaches the clicked point with the slower server-compatible speed")
	await create_timer(0.2).timeout
	var steps = game.game_audio.play_counts.get("step_concrete", 0)
	check(steps > 0, "distance-driven recorded stone footsteps accompany the run")
	await create_timer(0.4).timeout
	check(game.game_audio.play_counts.get("step_concrete", 0) == steps and game.hero.last_clip == "idle", "stopping stops both steps and running animation")

func _test_mob_telegraph():
	var spawn
	for entry in data.world.spawns:
		if entry.mob == "orc": spawn = entry; break
	if not spawn: check(false, "orc spawn exists"); return
	await _dev({"x": spawn.x, "z": spawn.z + 5, "hp": 500})
	game.camera_distance = 13; game.camera_pitch = 0.48
	var orc_id = data.world.spawns.find(spawn) + 1
	check(await wait_for(func(): return game.mobs.has(orc_id) and game.mobs[orc_id].visible), "the live orc position arrives after entering its zone")
	if not game.mobs.has(orc_id): return
	var live_orc = game.mobs[orc_id]
	var warning = {}
	var from_message = received.size()
	# Mobs wander: use their live position, never assume they stayed at a spawn.
	# Choose a clear exit corridor, otherwise a tree can block a legitimate dodge.
	var escape = Vector3.ZERO
	for i in 32:
		var direction = Vector3(sin(i * TAU / 32), 0, cos(i * TAU / 32))
		var clear_path = true
		for step in range(4, 25):
			var point = data.position_at(live_orc.position.x + direction.x * step * 0.5, live_orc.position.z + direction.z * step * 0.5)
			if data.move(point, Vector3.ZERO, 0.01).distance_to(point) > 0.05: clear_path = false; break
		if clear_path: escape = direction; break
	check(escape != Vector3.ZERO, "telegraph fixture has a collision-free escape corridor")
	if escape == Vector3.ZERO: return
	# No fixed delay here: react to the event without consuming half its wind-up.
	net.send({"t": "dev", "x": live_orc.position.x + escape.x * 2, "z": live_orc.position.z + escape.z * 2, "hp": 500})
	# Под нагрузкой клиент может проснуться к концу чужого замаха: такое событие
	# описывает удар, который игрок физически не успел увидеть. Берём следующий,
	# у которого на экране ещё остаётся время на реакцию.
	var announced = false
	var mob = null
	var windup_at = 0
	for attempt in 3:
		warning.clear()
		from_message = received.size()
		announced = await wait_for(func():
			for packet in received.slice(from_message):
				if packet.t == "ev":
					for event in packet.e:
						if event.k == "mob_windup" and int(event.p) == game.own_id: warning.merge(event, true); return true
			return false, 10)
		if not announced: break
		windup_at = Time.get_ticks_msec()
		mob = game.mobs.get(int(warning.m))
		var telegraph = game.combat_fx.telegraphs.get(mob.get_instance_id()) if is_instance_valid(mob) else null
		# Остаток сектора на экране: жизнь эффекта равна замаху плюс 0.25 с послесвечения.
		# Пропавший сектор — тот же случай: под нагрузкой тест проснулся уже после
		# удара, замах закончился и `mob_strike` снял телеграф. Берём следующий.
		if telegraph != null and float(telegraph.life) - float(telegraph.age) >= float(warning.get("t", 0.0)) * 0.6: break
		print("TELEGRAPH_SKIP stale=", snappedf(float(telegraph.age), 0.01) if telegraph else "consumed")
	check(announced, "an aggressive server mob announces its wind-up before damage")
	if warning.is_empty(): return
	game.set_target(mob)
	check(is_instance_valid(mob) and mob.winding_up and game.combat_fx.telegraphs.has(mob.get_instance_id()), "server wind-up drives the monster pose and the matching ground sector")
	check(game.game_audio.music.combat_remaining > 0, "a real mob threat switches the local music into combat")
	# Бежать начинаем сразу: замах длится не больше 0.32 с, а пауза звука и сохранение
	# PNG в оконном режиме съедают почти всё окно реакции (в headless они бесплатны).
	# Real client movement, not a developer warp: leave the fixed sector.
	game.destination = game.hero.position + escape * 14
	game.has_destination = true
	await create_timer(0.05).timeout
	check(game.game_audio.music.duck_db < 0 and game.game_audio.music.cue == "music_battle", "battle theme crossfades and ducks below attack sounds")
	await _screenshot("mob-windup.png")
	var strike = {}
	check(await wait_for(func():
		for packet in received.slice(from_message):
			if packet.t == "ev":
				for event in packet.e:
					if event.k == "mob_strike" and int(event.m) == int(warning.m): strike.merge(event, true); return true
		return false, 3), "server resolves the telegraphed attack")
	# Диагностика отказа: сервер считает попадание по своей копии позиции игрока.
	var hit_x = float(strike.get("x", 0.0)); var hit_z = float(strike.get("z", 0.0))
	var away = Vector2(game.hero.position.x - hit_x, game.hero.position.z - hit_z)
	var angle = absf(wrapf(atan2(away.x, away.y) - float(strike.get("r", 0.0)), -PI, PI))
	print("TELEGRAPH_DIAG ", JSON.stringify({
		"landed": strike.get("landed", true), "reach": strike.get("reach", 0.0), "arc": strike.get("arc", 0.0),
		"client_distance": snappedf(away.length(), 0.01), "client_angle": snappedf(angle, 0.01),
		"windup": strike.get("t", 0.0), "attacking": game.attacking, "has_destination": game.has_destination,
		"speed": game.stats.get("speed", 0), "elapsed_ms": Time.get_ticks_msec() - windup_at,
	}))
	check(not strike.get("landed", true), "running out of the telegraph avoids the actual server hit")
	await _screenshot("mob-dodge.png")
	await _dev({"x": -448, "z": 418, "hp": 500})
	check(game.combat_fx.telegraphs.is_empty(), "teleport clears all monster warning geometry")

func _bag(id: String) -> int:
	for i in game.profile.inv.size():
		if game.profile.inv[i].id == id: return i
	return -1

## Общий план города: окна закрыты, камера отодвинута и поднята. Кадр показывает, что после
## слияния застройка, растительность и HUD остаются на местах; камера возвращается назад.
func _town_overview():
	game.hud.close_window()
	await _dev({"x": -430, "z": 436})
	var yaw = game.camera_yaw
	var pitch = game.camera_pitch
	var distance = game.camera_distance
	game.camera_yaw = 0.9
	game.camera_pitch = Tuning.CAMERA_PITCH_MAX * 0.62
	game.camera_distance = Tuning.CAMERA_DISTANCE_MAX * 0.72
	await create_timer(0.6).timeout
	check(Vector2(game.hero.position.x + 430, game.hero.position.z - 436).length() < 6, "hero stands on the town square for the overview frame")
	await _screenshot("town-overview.png")
	game.camera_yaw = yaw
	game.camera_pitch = pitch
	game.camera_distance = distance
	await create_timer(0.3).timeout

func _dev(fields: Dictionary):
	var command = fields.duplicate(); command.t = "dev"; net.send(command)
	await create_timer(0.3).timeout

func _finish():
	if peer: peer.close()
	if net.socket: net.socket.close()
	print("NATIVE_TEST_RESULT checks=%s failures=%s" % [checks, failures])
	quit(0 if failures == 0 else 1)

## Профессия: блокировка до 20 уровня, выбор решает сервер, результат виден в интерфейсе.
func _test_profession():
	check(game.profile.get("prof", null) == null, "new character starts without a profession")
	game.hud.show_window("profession"); await process_frame; await process_frame
	var cards = game.hud.window.find_children("*", "PanelContainer", true, false).filter(func(n): return n.has_meta("profession_card"))
	check(cards.size() == 2, "profession window offers exactly two cards for the class")
	var locked = _find_button("prof", "knight")
	check(is_instance_valid(locked) and locked.disabled and locked.tooltip_text.contains("20"), "profession is locked before level 20 with a readable reason")
	await _screenshot("profession-locked.png")
	await _dev({"lvl": 20, "sp": 100000})
	check(await wait_for(func(): return int(game.profile.lvl) == 20), "server raises the character to the profession level")
	game.hud.show_window("profession"); await process_frame; await process_frame
	await _screenshot("profession.png")
	var health_before = data.stats(game.profile).maxHp
	_click("prof", "knight")
	check(await wait_for(func(): return str(game.profile.get("prof", "")) == "knight"), "profession choice is decided and returned by the server")
	check(game.hud.chat.system_view.get_parsed_text().contains("Страж"), "system log reports the chosen profession")
	check(data.stats(game.profile).maxHp > health_before, "profession bonus reaches the character stats")
	# HUD пересчитывает полосы раз в 0.2 с: ждём настоящего обновления, а не доверяем кадру.
	check(await wait_for(func(): return game.hud.hp_bar.max_value > health_before), "profession bonus reaches the health bar")
	game.hud.show_window("profession"); await process_frame; await process_frame
	var rejected = _find_button("prof", "berserker")
	check(is_instance_valid(rejected) and rejected.disabled, "the second profession is closed after the choice")
	game.hud.show_window("character"); await process_frame; await process_frame
	var hero_lines = game.hud.window.find_children("*", "Label", true, false).filter(func(n): return n.has_meta("hero_profession"))
	check(hero_lines.size() == 1 and hero_lines[0].text.contains("Страж"), "hero window shows the chosen profession")
	await _screenshot("profession-hero.png")
	game.hud.show_window("skills"); await process_frame; await process_frame
	check(is_instance_valid(_find_button("learn", "shield_bash")), "skills card lists the profession skill after the choice")
	await _screenshot("profession-skills.png")
	_click("learn", "shield_bash")
	check(await wait_for(func(): return int(game.profile.get("skills", {}).get("shield_bash", 0)) == 1), "profession skill is learned for SP under the usual rules")
	check("shield_bash" in game.hud.binding_choices(), "profession skill becomes assignable to the action bar")
	game.hud.close_window()

func _find_button(key: String, value):
	for button in game.hud.window.find_children("*", "Button", true, false):
		if button.has_meta(key) and button.get_meta(key) == value: return button
	return null

func _click(key: String, value):
	for button in game.hud.window.find_children("*", "Button", true, false):
		if button.has_meta(key) and button.get_meta(key) == value:
			check(not button.disabled, "UI action is enabled: " + key)
			if not button.disabled: button.pressed.emit()
			return
	check(false, "UI action exists: " + key)

func _select_bag(id: String):
	for button in game.hud.window.find_children("*", "Button", true, false):
		if button.get("payload") is Dictionary and button.payload.get("id") == id and button.payload.has("idx"):
			button.pressed.emit(); return
	check(false, "inventory item exists: " + id)

func _screenshot(name: String):
	if DisplayServer.get_name() == "headless": return
	await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(artifacts.path_join(name) if not artifacts.is_empty() else "user://native-" + name)

func _wheel(pos: Vector2, direction: int):
	var motion = InputEventMouseMotion.new(); motion.position = pos; motion.global_position = pos
	root.push_input(motion, true)
	var event = InputEventMouseButton.new(); event.position = pos; event.global_position = pos; event.button_index = direction; event.pressed = true
	root.push_input(event, true)
	event = event.duplicate(); event.pressed = false; root.push_input(event, true)

func _drag(source: Control, destination: Control):
	var start = source.get_global_rect().get_center()
	var finish = destination.get_global_rect().get_center()
	var motion = InputEventMouseMotion.new(); motion.position = start; motion.global_position = start; root.push_input(motion, true)
	var press = InputEventMouseButton.new(); press.position = start; press.global_position = start; press.button_index = MOUSE_BUTTON_LEFT; press.pressed = true
	root.push_input(press, true); await process_frame
	for point in [start + Vector2(16, 0), finish]:
		motion = InputEventMouseMotion.new(); motion.position = point; motion.global_position = point; motion.relative = point - start; motion.button_mask = MOUSE_BUTTON_MASK_LEFT
		root.push_input(motion, true); await process_frame
	press = press.duplicate(); press.position = finish; press.global_position = finish; press.pressed = false; root.push_input(press, true)
	await process_frame

func _test_hotbar_drag():
	game.hud.set_hotbar_locked(false); game.hud.assign_slot(8, "empty")
	game.hud.show_window("skills"); await process_frame; await process_frame
	var icons = game.hud.window.find_children("*", "TextureRect", true, false)
	var icon
	for candidate in icons:
		if candidate.get_meta("skill_icon", "") == "power_strike": icon = candidate
	check(is_instance_valid(icon), "skills card exposes a draggable icon")
	if is_instance_valid(icon):
		await _drag(icon, game.hud.skill_buttons[8])
		check(game.hud.hotbar_bindings[8] == "power_strike", "real mouse drag assigns a learned skill from K to an empty hotbar cell")
	game.hud.close_window(); await process_frame
	var swapped_out = str(game.hud.hotbar_bindings[7])
	await _drag(game.hud.skill_buttons[8], game.hud.skill_buttons[7])
	check(game.hud.hotbar_bindings[7] == "power_strike" and game.hud.hotbar_bindings[8] == swapped_out, "real mouse drag swaps action cells")
	game.hud.set_hotbar_locked(true); await process_frame
	var locked_cell = str(game.hud.hotbar_bindings[6])
	await _drag(game.hud.skill_buttons[7], game.hud.skill_buttons[6])
	check(game.hud.hotbar_bindings[7] == "power_strike" and game.hud.hotbar_bindings[6] == locked_cell, "locked hotbar rejects mouse drag")
	game.hud.hotbar_bindings = game.hud.default_bindings(); game.hud._save_hotbar()

func _test_chat_channels():
	var chat = game.hud.chat
	chat.select_channel("trade"); chat.input.text = "native trade channel"; chat.submit()
	check(await wait_for(func(): return peer_inbox.any(func(m): return m.t == "chat" and m.get("ch") == "trade" and m.text == "native trade channel")), "trade channel reaches the real second client")
	check(await wait_for(func(): return chat.log_view.get_parsed_text().contains("native trade channel")), "trade tab renders its server echo")
	chat.input.text = "trade cooldown attempt"; chat.submit()
	check(await wait_for(func(): return received.any(func(m): return m.t == "chatwait" and m.ch == "trade")), "trade cooldown is shown from the server")
	chat.select_channel("all"); chat.set_preference("trade", false)
	check(not chat.log_view.get_parsed_text().contains("native trade channel"), "All tab honors trade filter")
	chat.set_preference("trade", true)
	check(chat.log_view.get_parsed_text().contains("native trade channel"), "enabling trade restores retained messages")
	peer.send_text(JSON.stringify({"t": "dev", "x": game.hero.position.x, "z": game.hero.position.z})); await create_timer(0.25).timeout
	chat.select_channel("near"); chat.input.text = "native nearby channel"; chat.submit()
	check(await wait_for(func(): return peer_inbox.any(func(m): return m.t == "chat" and m.get("ch") == "near" and m.text == "native nearby channel")), "near channel reaches a nearby player")
	peer.send_text(JSON.stringify({"t": "chat", "ch": "all", "text": "peer incoming public"}))
	check(await wait_for(func(): return chat.history.any(func(m): return m.text == "peer incoming public")), "incoming public chat is retained while another tab is active")
	check(not chat.log_view.get_parsed_text().contains("peer incoming public") and chat.unread.all > 0, "inactive tab filters messages and shows unread count")
	chat.select_channel("all"); check(chat.unread.all == 0, "reading a tab clears its unread count")
	# The server's PM rate limit uses real time, independent of headless frame dt.
	await wait_wall(0.45)
	chat.select_channel("pm"); chat.recipient.text = ""; chat.input.text = '"NativePeer quoted whisper'; chat.submit()
	check(await wait_for(func(): return peer_inbox.any(func(m): return m.t == "pm" and m.text == "quoted whisper")), "quoted recipient command works from an empty PM tab")
	await wait_wall(0.45)
	peer.send_text(JSON.stringify({"t": "pm", "to": "NativeTest", "text": "peer reply"}))
	check(await wait_for(func(): return chat.log_view.get_parsed_text().contains("peer reply")), "incoming whisper is shown in the PM tab")
	chat.input.text = "/r native answer"; chat.submit()
	check(await wait_for(func(): return peer_inbox.any(func(m): return m.t == "pm" and m.text == "native answer")), "reply command selects the last correspondent")
	await wait_wall(0.45)
	chat.input.text = "/w Nobody no recipient online"; chat.submit()
	check(await wait_for(func(): return chat.system_view.get_parsed_text().contains("Nobody: не в сети")), "offline recipient error appears in the system pane")
	chat.select_channel("all")
	await _screenshot("chat-channels.png")

func _test_chat_scroll():
	var chat = game.hud.chat
	for i in 80: chat.add_message({"ch": "all", "from": "Проверка", "text": "scroll history %s" % i})
	await process_frame; await process_frame
	var scroll = chat.log_view.get_v_scroll_bar()
	scroll.value = scroll.max_value * 0.3
	await process_frame
	var before = scroll.value
	chat.add_message({"ch": "all", "from": "Проверка", "text": "new while reading"})
	await process_frame; await process_frame
	check(absf(scroll.value - before) < 2, "incoming chat does not jump while reading old messages")
	var cam = game.camera_distance
	_wheel(chat.log_view.get_global_rect().get_center(), MOUSE_BUTTON_WHEEL_UP)
	await process_frame
	check(scroll.value < before and is_equal_approx(cam, game.camera_distance), "wheel scrolls actual chat history without zooming camera")
	chat.set_preference("rewards", false); game.hud.log_line("hidden reward marker", "rewards")
	check(not chat.system_view.get_parsed_text().contains("hidden reward marker"), "reward filter does not alter social history")
	chat.set_preference("rewards", true); chat.set_preference("combat", true)
	var was_authed = net.authed; net.authed = false
	chat.input.text = "draft during disconnect"; chat.submit()
	check(chat.input.text == "draft during disconnect", "disconnected chat preserves unsent draft")
	net.authed = was_authed; chat.input.clear()

func _test_gait():
	var actor = load("res://scripts/actor.gd").new(); actor.kind = "p"; add_child(actor); actor.setup("warrior","Проверка движения"); actor.set_process(false)
	actor.position = Vector3(.1,0,0); actor.measure_motion(Vector3.ZERO,.1); actor._process(.01)
	check(actor.last_clip == "walk" and actor.animator.speed_scale < 1, "slow actual travel selects a calibrated walking clip")
	actor.position = Vector3(.6,0,0); actor.measure_motion(Vector3.ZERO,.1); actor._process(.01)
	check(actor.last_clip == "run" and absf(actor.animator.speed_scale - 6.0/float(actor.model.get_meta("gait_run_speed")))<.01, "jog playback follows measured displacement")
	actor.position = Vector3(1.2,0,0); actor.measure_motion(Vector3(.6,0,0),.1)
	actor.play_action("attack",.6); actor._process(.01)
	check(actor.last_clip == "run" and actor.action_until == 0, "moving cancels full-body attack presentation without skating")
	actor.measure_motion(actor.position,.1); actor._process(.01)
	check(actor.last_clip == "idle" and actor.travel_speed == 0, "blocked travel does not animate running in place")
	actor.position = Vector3(100,0,0); actor.measure_motion(Vector3.ZERO,.016); actor._process(.01)
	check(actor.last_clip == "idle", "teleports do not accelerate the gait")
	actor.position = Vector3.ZERO
	actor.snapshots = [{"t":1000.0,"p":Vector3.ZERO,"r":0.0},{"t":1100.0,"p":Vector3(.6,0,0),"r":0.0}]
	actor.interpolate(1050,.05); actor._process(.01)
	check(actor.moving and absf(actor.travel_speed-6)<.01, "remote gait follows rendered travel rather than the newest packet flag")
	actor.interpolate(1250,.05); actor.interpolate(1300,.05); actor._process(.01)
	check(actor.position.is_equal_approx(Vector3(.6,0,0)) and actor.last_clip == "idle", "remote movement neither overshoots its final snapshot nor runs after stopping")
	actor.free()

func _grip_drag(grip: Control, delta: Vector2):
	var start = grip.get_global_rect().get_center()
	var motion = InputEventMouseMotion.new(); motion.position = start; motion.global_position = start; root.push_input(motion, true)
	var button = InputEventMouseButton.new(); button.position = start; button.global_position = start; button.button_index = MOUSE_BUTTON_LEFT; button.pressed = true; root.push_input(button, true)
	await process_frame
	motion = InputEventMouseMotion.new(); motion.position = start + delta; motion.global_position = motion.position; motion.relative = delta; motion.button_mask = MOUSE_BUTTON_MASK_LEFT; root.push_input(motion, true)
	await process_frame; await process_frame
	button = button.duplicate(); button.position = start + delta; button.global_position = button.position; button.pressed = false; root.push_input(button, true)
	await create_timer(0.3).timeout

func _test_chat_resize():
	game.hud.close_window()
	var chat = game.hud.chat
	chat.set_preference("system_height", 80); chat.set_preference("player_height", 140)
	await create_timer(0.3).timeout
	var social_height = chat.player_frame.size.y; var sys_height = chat.system_frame.size.y
	var camera_yaw = game.camera_yaw; var camera_distance = game.camera_distance
	await _grip_drag(chat.system_grip, Vector2(0, -44))
	check(chat.system_frame.size.y >= sys_height + 40 and absf(chat.player_frame.size.y - social_height) < 2, "dragging system grip expands only the system pane")
	sys_height = chat.system_frame.size.y
	await _grip_drag(chat.player_grip, Vector2(0, 38))
	check(chat.player_frame.size.y <= social_height - 34 and absf(chat.system_frame.size.y - sys_height) < 2, "dragging social grip shrinks only the ordinary chat (%s -> %s; sys %s -> %s)" % [social_height, chat.player_frame.size.y, sys_height, chat.system_frame.size.y])
	check(is_equal_approx(camera_yaw, game.camera_yaw) and is_equal_approx(camera_distance, game.camera_distance) and not game.has_destination, "chat resize drag cannot rotate, zoom or move the hero")
	var restored = load("res://scripts/chat_panel.gd").new(); root.add_child(restored); restored.hide()
	check(restored.preferences.system_height == chat.preferences.system_height and restored.preferences.player_height == chat.preferences.player_height, "both independent chat dimensions survive panel recreation")
	restored.queue_free()
	chat.set_preference("system_height", 420); chat.set_preference("player_height", 420); chat.select_channel("pm")
	await create_timer(0.3).timeout
	check(game.hud.chat_frame.get_global_rect().position.y >= 140, "large chat sizes and private-recipient field fit below the status HUD")
	chat.set_preference("sys", false); await process_frame
	check(not chat.system_frame.visible and chat.preferences.system_height == 420, "hiding system pane preserves its chosen height")
	chat.set_preference("sys", true); chat.set_preference("system_height", 120); chat.set_preference("player_height", 140); chat.select_channel("all")
	await create_timer(0.3).timeout; await _screenshot("chat-resized.png")

func _test_party():
	peer.send_text(JSON.stringify({"t": "party", "action": "invite", "name": game.profile.name}))
	check(await wait_for(func(): return game.hud.window_kind == "party" and not game.hud.party_invite.is_empty()), "real second client opens a party invitation in the native UI")
	var buttons = game.hud.window.find_children("*", "Button", true, false)
	for button in buttons:
		if button.text == "Принять": button.pressed.emit(); break
	check(await wait_for(func(): return game.hud.party_state.get("members", []).size() == 2), "accepting invitation creates the server party and shows both members")
	peer.send_text(JSON.stringify({"t": "party", "action": "mode", "mode": "pickup"}))
	check(await wait_for(func(): return game.hud.party_state.get("mode") == "pickup"), "leader loot policy reaches the live client")
	game.hud.close_window(); game.hud.chat.select_channel("party"); game.hud.chat.input.text = "native party channel"; game.hud.chat.submit()
	check(await wait_for(func(): return peer_inbox.any(func(m): return m.t == "chat" and m.get("ch") == "party" and m.text == "native party channel")), "party tab sends a private group message to the real member")
	await _screenshot("party-chat.png")
	net.send({"t": "party", "action": "leave"})
	check(await wait_for(func(): return game.hud.party_state.get("members", []).is_empty()), "leaving the party clears the authoritative membership")
	game.hud.chat.select_channel("all")

func _test_starter_hunt():
	await _dev({"x": -620, "z": 400})
	game.camera_distance = 16; game.camera_pitch = 0.62
	check(await wait_for(func():
		var near = 0
		for mob in game.mobs.values():
			if mob.visible and not mob.dead and mob.position.distance_to(game.hero.position) < 30: near += 1
		return near >= 8), "starter hunting clearing has at least eight live server mobs within thirty units")
	await create_timer(0.3).timeout; await _screenshot("starter-hunt.png")

func _ranked_mob():
	for mob in game.mobs.values():
		if mob.visible and not mob.rank.is_empty(): return mob
	return null

## Значки эффектов у цели: сервер накладывает урон со временем и ослабление, клиент их рисует.
func _test_timed_effects():
	# Цель должна пережить прямой удар, иначе проверять будет нечего: берём орка, а не кролика.
	var spawn
	var orc_id = 0
	for i in data.world.spawns.size():
		if data.world.spawns[i].mob == "orc": spawn = data.world.spawns[i]; orc_id = i + 1
	if not spawn: check(false, "orc spawn exists for the timed effect test"); return
	await _dev({"lvl": 25, "sp": 200000, "hp": 9000, "x": spawn.x, "z": spawn.z + 5})
	net.send({"t": "learn", "id": "curse", "rank": 1})
	check(await wait_for(func(): return int(game.profile.get("skills", {}).get("curse", 0)) == 1), "mage learns the timed-effect skill on the server")
	check(await wait_for(func(): return game.mobs.has(orc_id) and game.mobs[orc_id].visible and not game.mobs[orc_id].dead), "a live server mob is within casting range")
	if not game.mobs.has(orc_id): return
	var mob = game.mobs[orc_id]
	game.set_target(mob)
	game.use_skill("curse")
	check(await wait_for(func(): return mob.effects.size() >= 2, 12), "server puts both the damage over time and the weakening on the target")
	var kinds = []
	for entry in mob.effects: kinds.append(str(entry[1]))
	kinds.sort()
	check(kinds == ["debuff", "dot"], "target carries exactly the damage over time and the stat weakening")
	check(mob.effects.all(func(entry): return int(entry[2]) > 0), "every target effect reports its remaining time")
	check(await wait_for(func(): return game.hud.target_effects_row.visible and game.hud.target_effects_row.get_child_count() == mob.effects.size()), "target panel shows one icon per server effect")
	var target_timer = game.hud.target_effects_row.get_child(0).find_child("Timer", true, false)
	check(is_instance_valid(target_timer) and target_timer.text.ends_with("с"), "target effect icon counts down")
	check(game.combat_fx.auras.size() >= 2, "each target effect keeps its own live aura")
	game.camera_distance = 15; game.camera_pitch = 0.62
	await create_timer(0.4).timeout
	await _screenshot("target-effects.png")
	# Спад приходит с сервера: значки гаснут сами, без единой команды клиента.
	check(await wait_for(func(): return mob.dead or (mob.effects.is_empty() and not game.hud.target_effects_row.visible), 16), "effects expire on their own and the icons disappear")
	game.camera_distance = 28; game.camera_pitch = 0.56

## Элиты и чемпионы: ранг, размер, подпись и аура приходят с сервера.
func _test_elite():
	check(await wait_for(func(): return _ranked_mob() != null, 12), "server marks ranked mobs in the starter zone")
	var elite = _ranked_mob()
	if not elite: return
	check(is_instance_valid(elite.rank_aura), "ranked mob wears its own aura ring")
	check(float(elite.definition.size) > float(data.catalog.MOBS[elite.base_model].size), "ranked mob is bigger than the ordinary mob of its kind")
	check(elite.display_name != str(data.catalog.MOBS[elite.base_model].name), "ranked mob carries the server name, not the plain one")
	check(elite.label.modulate.is_equal_approx(elite.rank_color()), "rank colours the name plate")
	await _dev({"x": elite.position.x + 7, "z": elite.position.z + 7, "hp": 9000})
	game.set_target(elite)
	game.camera_distance = 14; game.camera_pitch = 0.6
	await create_timer(0.6).timeout
	check(elite.rank_aura.visible, "aura is drawn while the elite is alive")
	await _screenshot("elite-mob.png")
	game.set_target(null)
	game.camera_distance = 28; game.camera_pitch = 0.56

## Стая: удар по одному мобу поднимает сородича того же семейства рядом.
## Радиус крика — 12 единиц (src/pack.js); стоим дальше радиуса агрессии сородича,
## чтобы он мог прийти только на зов, а не заметить героя сам.
func _test_pack():
	var spawns = data.world.spawns
	var first = -1
	var second = -1
	for i in spawns.size():
		if first >= 0: break
		var a = spawns[i]
		var da = data.catalog.MOBS[a.mob]
		if a.has("camp") or not da.get("social", false): continue
		for j in range(i + 1, spawns.size()):
			var b = spawns[j]
			var db = data.catalog.MOBS[b.mob]
			if b.has("camp") or not db.get("social", false): continue
			if str(da.get("fam", a.mob)) != str(db.get("fam", b.mob)): continue
			if Vector2(a.x - b.x, a.z - b.z).length() > 12.0: continue
			first = i; second = j; break
	if first < 0: check(false, "world has a pair of kin inside the social radius"); return
	var victim_id = first + 1
	var ally_id = second + 1
	var away = Vector2(spawns[first].x - spawns[second].x, spawns[first].z - spawns[second].z).normalized()
	# Попытки растянуты: убитая в прошлой попытке жертва возрождается около 25 секунд,
	# а сородич успевает отойти на прогулке. Короткий цикл сгорал вхолостую.
	for attempt in 8:
		await _dev({"hp": 9000, "x": spawns[first].x + away.x * 16, "z": spawns[first].z + away.y * 16})
		if not await wait_for(func(): return game.mobs.has(victim_id) and game.mobs.has(ally_id) and game.mobs[victim_id].visible and game.mobs[ally_id].visible and not game.mobs[victim_id].dead and not game.mobs[ally_id].dead, 14): continue
		var victim = game.mobs[victim_id]
		var ally = game.mobs[ally_id]
		# Сородич гуляет вокруг точки спавна: ждём, пока он окажется вне своего радиуса
		# агрессии и внутри радиуса крика, а не отбрасываем попытку по первому же кадру.
		if not await wait_for(func(): return ally.position.distance_to(game.hero.position) >= 16.0 and ally.position.distance_to(victim.position) <= 12.0, 8): continue
		if victim.dead or ally.dead: continue
		var started = ally.position.distance_to(game.hero.position)
		# Сверху: в лесу низкая камера упирается в крону ближайшего дерева.
		game.camera_distance = 17; game.camera_pitch = 1.05
		game.set_target(victim); game.attack()
		var answered = await wait_for(func(): return started - game.mobs[ally_id].position.distance_to(game.hero.position) > 8.0, 14)
		if not answered: continue
		check(true, "attacking one mob brings its kin from outside its own aggression range")
		# Ждём, пока подкрепление дойдёт до героя: кадр должен показать стаю в бою, а не бег вдалеке.
		await wait_for(func(): return game.mobs[ally_id].position.distance_to(game.hero.position) < 9.0, 10)
		await create_timer(0.3).timeout
		await _screenshot("mob-pack.png")
		game._cancel_attack(); game.set_target(null)
		game.camera_distance = 28; game.camera_pitch = 0.56
		return
	check(false, "kin answered the call for help")
