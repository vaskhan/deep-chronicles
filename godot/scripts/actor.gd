extends Node3D
## A native scene with imported mesh and AnimationPlayer; no browser runtime.
const Art = preload("res://scripts/art_assets.gd")
var art_model = false
var base_model = ""
var active_art = ""
var entity_id = 0
var kind = "m"
var definition: Dictionary = {}
var model: Node3D
var animator: AnimationPlayer
var label: Label3D
var hp = 100.0
var dead = false
var death_elapsed = 0.0
var corpse_materials: Array = []
var corpse_opacity = 1.0
var model_rest_y = 0.0
var moving = false
var casting = false
var attack_time = 0.0
var radius = 0.6
var seen = 0
var snapshots: Array = []
var selected = false
var status = 0
var look: Dictionary = {}
var display_name = ""
var last_clip = ""
var weapon_node: Node3D
var shield_node: Node3D
var helm_node: Node3D
var bubble: Label3D
var bubble_until = 0
var action_clip = ""
var action_until = 0.0
var action_speed = 1.0
var cast_remaining = 0.0
var cast_skill = ""
var previous_attack_flag = false
var motion_speed = 0.0
var external_motion_sample = false
var travel_speed: float:
	get: return motion_speed
var motion_distance = 0.0
var previous_position = Vector3.ZERO
var have_motion_sample = false
var stride_length = 3.8
## Семейство звука/походки сохраняется при замене геометрии отдельным GLB.
var art_base = ""
var visual_height = 2.5
var attack_sequence = 0
var attack_recovery = .65
var step_length = 1.5
var windup_remaining = 0.0
var winding_up = false
var windup_clip_time = 0.0
var hit_recoil = 0.0
var model_rest_position = Vector3.ZERO
var model_rest_rotation = Vector3.ZERO
var health_bar: MeshInstance3D
var health_fill: MeshInstance3D
## Ранг моба с сервера: "" — обычный, "elite" — элита, "champion" — чемпион.
var rank = ""
var rank_aura: MeshInstance3D
## Активные эффекты цели из снапшота: [[id, вид, осталось мс], …]. Считает их сервер.
var effects: Array = []
var stone_ward: MeshInstance3D

func setup(model_id: String, title: String, def: Dictionary = {}):
	definition = def; display_name = title; base_model = model_id
	radius = float(def.get("size", 1)) * 0.9 if kind == "m" else 0.6
	var art_id = str(def.get("role", model_id)) if kind == "n" else model_id
	if art_id == "guard": art_id = "warrior_chain"
	active_art = art_id
	model = Art.actor(art_id)
	art_model = model != null
	if not model:
		var asset_id = "mage_generated" if model_id == "mage" else model_id
		model = Art.packed("res://generated/actors/%s.glb" % asset_id).instantiate()
	add_child(model)
	model_rest_y = model.position.y
	model_rest_position = model.position; model_rest_rotation = model.rotation
	art_base = str(Art.entry_of(model_id).get("family", Art.base_of(model_id)))
	stride_length = {"rabbit": 1.2, "wolf": 2.8, "boar": 2.6, "spider": 2.8, "scorpion": 2.8, "treant": 5.6, "golem": 5.4}.get(art_base, 3.8)
	animator = model.find_child("AnimationPlayer", true, false)
	if animator:
		for clip in animator.get_animation_list():
			if clip in ["idle", "walk", "cast"]: animator.get_animation(clip).loop_mode = Animation.LOOP_LINEAR
			if clip == "death": animator.get_animation(clip).loop_mode = Animation.LOOP_NONE
	if art_model and art_id in ["warrior", "warrior_chain", "mage"]: _attach_weapon("warrior" if art_id == "warrior_chain" else art_id)
	else:
		weapon_node = model.find_child("weapon", true, false)
		shield_node = model.find_child("shield", true, false)
		helm_node = model.find_child("helmet", true, false)
	if shield_node: shield_node.visible = false
	if helm_node: helm_node.visible = false
	if kind == "n" and weapon_node: weapon_node.visible = false
	if art_id == "stone_guard":
		stone_ward = model.find_child("StoneWard", true, false)
		if stone_ward: stone_ward.visible = false
	label = Label3D.new(); label.text = title
	visual_height = float(Art.manifest().actors.get(art_id, {}).get("height", 2.5))
	label.position.y = visual_height + 0.45
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED; label.font_size = 32; label.pixel_size = 0.009
	label.modulate = Color("e7d8ab") if kind == "n" else Color.WHITE
	label.outline_modulate = Color("18201b"); label.outline_size = 10
	add_child(label)
	if kind == "m":
		health_bar = _health_quad(Vector2(1.45, 0.10), Color("211617")); health_bar.position.y = label.position.y - 0.3
		health_fill = _health_quad(Vector2(1.4, 0.065), Color("bf4338")); health_fill.position.y = health_bar.position.y; health_fill.position.z = 0.012
	_apply_rank()

## Элита и чемпион крупнее обычного моба и светятся аурой. Множители присылает сервер
## в определении (src/elites.js); клиент только показывает их.
func rank_color() -> Color:
	return Color("ff77e0") if rank == "champion" else Color("ffb347")

func _apply_rank():
	if rank.is_empty() or kind != "m": return
	var base_size = float(GameData.catalog.MOBS.get(base_model, {}).get("size", 1.0))
	var factor = float(definition.get("size", base_size)) / maxf(0.01, base_size)
	model.scale *= factor
	radius *= factor
	visual_height *= factor
	label.position.y = visual_height + 0.45
	if health_bar:
		health_bar.position.y = label.position.y - 0.3; health_fill.position.y = health_bar.position.y
	var mesh = TorusMesh.new()
	mesh.inner_radius = radius * Tuning.ELITE_AURA_SCALE; mesh.outer_radius = mesh.inner_radius + 0.09
	mesh.rings = 40; mesh.ring_segments = 6
	rank_aura = MeshInstance3D.new(); rank_aura.mesh = mesh
	var material = StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; material.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	material.cull_mode = BaseMaterial3D.CULL_DISABLED; material.albedo_color = rank_color()
	rank_aura.material_override = material
	rank_aura.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	rank_aura.position.y = 0.1
	add_child(rank_aura)

func _health_quad(size: Vector2, color: Color) -> MeshInstance3D:
	var node = MeshInstance3D.new(); var quad = QuadMesh.new(); quad.size = size; node.mesh = quad
	var mat = StandardMaterial3D.new(); mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED; mat.albedo_color = color
	node.material_override = mat; node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(node); return node

func apply_look(data: Dictionary):
	if data == look: return
	if art_model and base_model == "warrior" and kind != "n":
		var desired = "warrior_chain" if data.get("mat", "cloth") in ["chain", "plate"] else "warrior"
		if desired != active_art:
			var replacement = Art.actor(desired)
			if replacement:
				model.queue_free(); model = replacement; add_child(model); active_art = desired
				model_rest_position = model.position; model_rest_y = model.position.y; model_rest_rotation = model.rotation
				animator = model.find_child("AnimationPlayer", true, false); last_clip = ""
				weapon_node = null; shield_node = null; helm_node = null
				_attach_weapon("warrior")
	if art_model and weapon_node:
		var desired_weapon = "mage" if data.get("staff", base_model == "mage") else "warrior"
		if weapon_node.get_meta("weapon_kind", "") != desired_weapon:
			var skeleton = model.find_child("Skeleton3D", true, false)
			for attachment_name in ["RightHandEquipment", "LeftArmEquipment"]:
				var old = skeleton.get_node_or_null(attachment_name)
				if old: old.free()
			weapon_node = null; shield_node = null; _attach_weapon(desired_weapon)
	look = data.duplicate(true)
	var gear = data.get("gear", {})
	if weapon_node: weapon_node.visible = data.get("w") != null
	if shield_node: shield_node.visible = gear.get("shield") != null
	if helm_node: helm_node.visible = gear.get("head") != null
	if art_model:
		if weapon_node:
			for mesh in weapon_node.find_children("*", "MeshInstance3D", true, false):
				var material = mesh.get_active_material(0)
				if material is StandardMaterial3D and material.metallic > 0.1:
					material = material.duplicate()
					if data.get("w") != null: material.albedo_color = GameData.color(data.w)
					material.emission_enabled = data.get("ench", 0) >= 4; material.emission = Color("77cfff"); material.emission_energy_multiplier = 0.6
					mesh.material_override = material
		if shield_node and gear.get("shield") != null:
			var material = shield_node.get_active_material(0).duplicate(); material.albedo_color = GameData.color(gear.shield); shield_node.material_override = material
		return
	var colors = {"body": data.get("body"), "helmet": gear.get("head"), "legs": gear.get("legs"), "gloves": gear.get("gloves"), "feet": gear.get("feet"), "shield": gear.get("shield")}
	for node in model.find_children("*", "MeshInstance3D", true, false):
		for surface in node.mesh.get_surface_count():
			var mat = node.get_active_material(surface)
			if mat is StandardMaterial3D:
				mat = mat.duplicate()
				var key = mat.resource_name
				if colors.get(key) != null: mat.albedo_color = GameData.color(colors[key])
				if key == "body":
					var tex = "robe" if data.get("robe", false) else {"cloth": "leather", "plate": "plate", "chain": "chain", "leather": "leather"}.get(data.get("mat", "cloth"), "leather")
					mat.albedo_texture = load("res://generated/tex/%s.png" % tex)
				node.set_surface_override_material(surface, mat)
	if weapon_node:
		for node in weapon_node.find_children("*", "MeshInstance3D", true, false):
			var mat = StandardMaterial3D.new(); mat.albedo_color = GameData.color(data.get("w", 0xaaaaaa) if data.get("w") != null else 0xaaaaaa)
			if data.get("ench", 0) >= 4:
				mat.emission_enabled = true; mat.emission = Color("77cfff"); mat.emission_energy_multiplier = 1.2
			node.material_override = mat

func snapshot(row: Array, timestamp: float):
	var pos = Vector3(row[1], row[2], row[3])
	if snapshots.is_empty() or position.distance_to(pos) > 30:
		snapshots.clear(); position = pos; rotation.y = row[4]
	snapshots.append({"t": timestamp, "p": pos, "r": row[4]})
	if snapshots.size() > 30: snapshots.pop_front()
	# Девятый столбец снапшота — активные эффекты; сервер шлёт его только когда они есть.
	effects = row[8] if row.size() > 8 else []
	if is_instance_valid(stone_ward):
		stone_ward.visible = effects.any(func(effect): return effect.size() >= 3 and effect[0] == "stone_guard:guard" and float(effect[2]) > 0)
	var flags = int(row[5]); moving = (flags & 1) != 0; casting = (flags & 4) != 0
	var attack_flag = (flags & 2) != 0
	if attack_flag and not previous_attack_flag and action_until <= 0 and windup_remaining <= 0: play_action("attack")
	previous_attack_flag = attack_flag
	dead = (flags & 8) != 0; hp = row[6]
	if dead and is_instance_valid(stone_ward): stone_ward.visible = false
	# Восьмой столбец у мобов — возраст смерти, у игроков — PvP-статус.
	if kind == "m" and dead and row.size() > 7: death_elapsed = maxf(death_elapsed,float(row[7])/1000.0)
	status = int(row[7]) if kind != "m" and row.size() > 7 else 0
	seen = Time.get_ticks_msec(); visible = true

func measure_motion(before: Vector3, dt: float):
	var displacement = position-before; displacement.y = 0
	var traveled = displacement.length() if displacement.length()<3.0 else 0.0
	motion_speed = traveled/maxf(dt,.001)
	moving = motion_speed > .05 and not dead and not winding_up
	if moving: motion_distance += traveled
	else: motion_speed = 0
	previous_position = position; have_motion_sample = true; external_motion_sample = true

func interpolate(time: float, dt = .016):
	if winding_up:
		measure_motion(position,dt); return
	while snapshots.size() > 2 and snapshots[1].t <= time: snapshots.pop_front()
	if snapshots.size() < 2:
		measure_motion(position,dt); return
	var a = snapshots[0]; var b = snapshots[1]
	var factor = clampf((time - a.t) / maxf(1, b.t - a.t), 0, 1)
	var before = position
	position = a.p.lerp(b.p, factor); rotation.y = lerp_angle(a.r, b.r, factor)
	measure_motion(before,dt)

func _process(dt):
	if not external_motion_sample: measure_motion(previous_position if have_motion_sample else position,dt)
	external_motion_sample = false
	attack_time = maxf(0, attack_time - dt)
	action_until = maxf(0, action_until - dt)
	cast_remaining = maxf(0, cast_remaining - dt)
	if is_instance_valid(bubble): bubble.visible = Time.get_ticks_msec() < bubble_until and not dead
	if not model: return
	hit_recoil = maxf(0, hit_recoil - dt)
	model.position = model_rest_position + Vector3(0, 0, -sin(hit_recoil / 0.22 * PI) * 0.12)
	model.rotation = model_rest_rotation
	if moving and not dead and action_until <= 0:
		model.rotation.x += clampf(motion_speed / 8.0, 0, 1) * 0.065
	death_elapsed = death_elapsed + dt if dead else 0.0
	if kind == "m": _update_corpse()
	if not animator or not animator.has_animation("death"):
		model.rotation.z = lerp_angle(model.rotation.z, PI / 2 if dead else 0, minf(1, dt * 10))
	if moving and not winding_up and not casting and cast_remaining <= 0 and (action_clip.begins_with("attack") or action_clip in ["release","hit"]):
		action_until = 0; attack_time = 0
	var run_threshold = 2.7 if model.has_meta("gait_run_speed") else 5.0
	var locomotion = "run" if motion_speed > run_threshold and animator and animator.has_animation("run") else "walk"
	var clip = "cast" if casting or cast_remaining > 0 else (locomotion if moving and motion_speed > 0.2 else "idle")
	if action_until > 0: clip = action_clip
	elif attack_time > 0 and not casting: clip = "attack"
	if dead: clip = "death" if animator and animator.has_animation("death") else "idle"
	if winding_up and not dead:
		windup_remaining -= dt
		if windup_remaining < -0.5: winding_up = false; action_until = 0
		if animator:
			animator.seek(minf(windup_clip_time, animator.current_animation_position), true)
		if windup_remaining <= 0 and animator: animator.speed_scale = 0.0
		clip = action_clip
	if animator and clip != last_clip and animator.has_animation(clip):
		animator.speed_scale = 1.0
		animator.play(clip, 0.14, action_speed if action_until > 0 and not dead else 1.0); last_clip = clip
	if animator and clip in ["walk", "run"] and not dead:
		var stride = stride_length if clip == "run" else stride_length * 0.48
		var reference = float(model.get_meta("gait_walk_speed" if clip == "walk" else "gait_run_speed",stride/animator.get_animation(clip).length))
		animator.speed_scale = clampf(motion_speed/reference,.05,3.0)
		step_length = reference*animator.get_animation(clip).length*.5
	elif animator and not winding_up: animator.speed_scale = 1.0
	if dead and animator and animator.has_animation("death"):
		animator.seek(minf(death_elapsed,animator.get_animation("death").length),true)
	if health_bar:
		health_bar.visible = label.visible and not dead and (selected or hp < 100 or windup_remaining > 0)
		health_fill.visible = health_bar.visible
		# заполнение прижато к левому краю: убывает справа, как в обычной полосе здоровья
		var fill_w = maxf(0.01, 1.4 * hp / 100.0)
		health_fill.mesh.size.x = fill_w; health_fill.mesh.center_offset.x = (fill_w - 1.4) * 0.5
	if label:
		label.text = display_name + (" · повержен" if dead else "")
		var plain = rank_color() if not rank.is_empty() else (Color("e7d8ab") if kind == "n" else Color.WHITE)
		label.modulate = Color("ffe3a6") if selected else (Color("ff7373") if status == 2 else (Color("d49bff") if status == 1 else plain))
		if kind == "m": label.modulate.a = corpse_opacity
	if is_instance_valid(rank_aura):
		rank_aura.visible = visible and not dead
		rank_aura.rotation.y += dt * 0.9
		rank_aura.material_override.albedo_color = rank_color() * (0.75 + 0.25 * sin(Time.get_ticks_msec() * 0.004))

func _update_corpse():
	# Keep the body on the ground. Duplicate only this corpse's materials:
	# imported meshes/materials are shared with every living instance.
	if not dead:
		for entry in corpse_materials:
			if not is_instance_valid(entry.node): continue
			if entry.surface < 0: entry.node.material_override = entry.original
			else: entry.node.set_surface_override_material(entry.surface,entry.original)
		corpse_materials.clear(); model.visible = true; corpse_opacity = 1.0
		return
	var fall = animator.get_animation("death").length if animator and animator.has_animation("death") else .6
	var rules = GameData.catalog.UI_RULES.corpse
	var fade = clampf((death_elapsed-fall-float(rules.holdSeconds))/float(rules.fadeSeconds),0,1)
	model.visible = fade < 1
	corpse_opacity = 1-fade
	if fade <= 0: return
	if corpse_materials.is_empty():
		for node in model.find_children("*","MeshInstance3D",true,false):
			if not node.mesh: continue
			var surfaces = [-1] if node.material_override else range(node.mesh.get_surface_count())
			for surface in surfaces:
				var original = node.material_override if surface < 0 else node.get_surface_override_material(surface)
				var source = original if original else node.mesh.surface_get_material(surface)
				if not source is BaseMaterial3D: continue
				var mat = source.duplicate(); mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
				corpse_materials.append({"node":node,"surface":surface,"original":original,"material":mat,"alpha":mat.albedo_color.a})
				if surface < 0: node.material_override = mat
				else: node.set_surface_override_material(surface,mat)
	for entry in corpse_materials:
		entry.material.albedo_color.a = entry.alpha*(1-fade)

func play_action(clip: String, duration = 0.0):
	if dead or not animator or not animator.has_animation(clip): return
	var length = animator.get_animation(clip).length
	action_until = duration if duration > 0 else length
	action_speed = length / maxf(0.05, action_until)
	action_clip = clip
	animator.speed_scale = 1.0
	animator.play(clip, 0.08, action_speed); animator.seek(0, true); last_clip = clip
	if clip.begins_with("attack"): attack_time = action_until

func begin_attack(duration: float, windup = -1.0):
	attack_sequence += 1
	var clip = "attack_alt" if attack_sequence % 2 == 0 and animator and animator.has_animation("attack_alt") else "attack"
	if not animator or not animator.has_animation(clip): return
	if windup < 0: windup = duration*.35
	attack_recovery = maxf(.1,duration-windup)
	play_action(clip, duration)
	windup_clip_time = animator.get_animation(clip).length * 0.35
	windup_remaining = windup; winding_up = true

func release_attack():
	windup_remaining = 0; winding_up = false
	if not animator or not action_clip.begins_with("attack"): return
	var clip = action_clip
	# Preserve current clip and hand pose through the impact, then recover.
	var remaining = animator.get_animation(clip).length - windup_clip_time
	action_until = attack_recovery; attack_time = action_until
	action_speed = remaining / action_until
	animator.speed_scale = 1.0; animator.play(clip, 0, action_speed); animator.seek(windup_clip_time, true)

func begin_windup(duration: float, facing: float):
	if dead: return
	rotation.y = facing; moving = false
	var clip = "windup" if animator and animator.has_animation("windup") else "attack"
	if not animator or not animator.has_animation(clip): return
	windup_clip_time = animator.get_animation(clip).length * (0.95 if clip == "windup" else 0.3)
	play_action(clip, duration * animator.get_animation(clip).length / maxf(0.01, windup_clip_time))
	windup_remaining = duration; winding_up = true

func finish_windup():
	windup_remaining = 0; winding_up = false
	play_action("attack", 0.38)
	if animator and action_clip == "attack" and not animator.has_animation("windup"):
		animator.seek(windup_clip_time, true)

func receive_hit():
	if dead: return
	hit_recoil = 0.22
	if action_until <= 0 and not moving and not casting and not winding_up: play_action("hit", 0.22)

func begin_cast(id: String, duration: float):
	cast_skill = id; cast_remaining = duration
	play_action("cast_enter", minf(0.25, duration * 0.4))

func release_cast():
	cast_remaining = 0; casting = false; cast_skill = ""
	play_action("release", 0.42)

func cancel_presentation():
	cast_remaining = 0; cast_skill = ""; casting = false; action_until = 0; attack_time = 0
	windup_remaining = 0; winding_up = false; hit_recoil = 0; motion_speed = 0; have_motion_sample = false; external_motion_sample = false; moving = false
	if animator: animator.speed_scale = 1.0

func cast_origin() -> Vector3:
	if is_instance_valid(weapon_node) and weapon_node.visible:
		return weapon_node.global_position + Vector3.UP * 0.25
	return global_position + Vector3.UP * 1.7

func _attach_weapon(id: String):
	var skeleton = model.find_child("Skeleton3D", true, false)
	if not skeleton: return
	var donor = Art.packed("res://generated/actors/%s.glb" % id).instantiate()
	var weapon = donor.find_child("weapon", true, false)
	if weapon:
		weapon.get_parent().remove_child(weapon)
		weapon.owner = null
		for child in weapon.find_children("*", "", true, false): child.owner = null
		var attachment = BoneAttachment3D.new(); attachment.name = "RightHandEquipment"; attachment.bone_name = "DEF-hand.R"
		skeleton.add_child(attachment)
		var grip = Node3D.new(); grip.name = "WeaponGrip"; attachment.add_child(grip)
		# Bone origin is the wrist; +Y follows the fingers. The canonical rig
		# and equipment use +Z for the forward edge of the palm/blade.
		grip.position = Vector3(0, 0.075, -0.015)
		grip.add_child(weapon)
		weapon.transform = Transform3D.IDENTITY
		weapon.rotation = Vector3.ZERO
		weapon.scale = Vector3.ONE * (0.8 / model.scale.x)
		var handle_center = Vector3(0, 0, 0.14 if id == "warrior" else 0.0)
		weapon.position = -(weapon.basis * handle_center)
		weapon.set_meta("handle_center", handle_center)
		weapon.set_meta("weapon_kind", id)
		weapon_node = weapon
	var shield = donor.find_child("shield", true, false)
	if shield:
		shield.get_parent().remove_child(shield); shield.owner = null
		var attachment = BoneAttachment3D.new(); attachment.name = "LeftArmEquipment"; attachment.bone_name = "DEF-forearm.L"
		skeleton.add_child(attachment); attachment.add_child(shield)
		shield.position = Vector3(0.1, 0.16, 0); shield.rotation = Vector3.ZERO; shield.scale *= 0.9 / model.scale.x
		shield_node = shield; shield.visible = false
	donor.free()

func speak(text: String):
	if not is_instance_valid(bubble):
		bubble = Label3D.new(); bubble.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		bubble.font_size = 30; bubble.pixel_size = 0.012; bubble.outline_size = 8
		bubble.modulate = Color("fff5d8"); bubble.position.y = label.position.y + 0.5; add_child(bubble)
	bubble.text = text.left(60) + ("…" if text.length() > 60 else "")
	bubble_until = Time.get_ticks_msec() + 5000
