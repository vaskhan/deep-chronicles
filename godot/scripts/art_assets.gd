extends RefCounted
## Persistent source art lives in assets/. generated/ is always disposable.
static var scenes: Dictionary = {}
static var bounds: Dictionary = {}
static var canonical_clips: Dictionary = {}
static var registry: Dictionary = {}

static func manifest() -> Dictionary:
	if registry.is_empty(): registry = JSON.parse_string(FileAccess.get_file_as_string("res://assets/manifest.json"))
	return registry

static func packed(path: String) -> PackedScene:
	if not scenes.has(path): scenes[path] = load(path)
	return scenes[path]

## Запись манифеста с учётом псевдонима: {"base": "spider", "tint": "...", "height": ...}
## берёт модель, риг и клипы основы, а рост и окраску — свои. Так новые мобы переиспользуют
## готовые GLB без копий файлов (первый проход Громового ущелья).
static func entry_of(id: String) -> Dictionary:
	var entry: Dictionary = manifest().actors.get(id, {})
	if entry.has("base"):
		var merged: Dictionary = manifest().actors.get(str(entry.base), {}).duplicate()
		merged.merge(entry, true)
		return merged
	return entry

## Вид-основа модели: для псевдонима — исходная модель, иначе сам id.
static func base_of(id: String) -> String:
	return str(manifest().actors.get(id, {}).get("base", id))

static var tinted: Dictionary = {}
## Окраска умножением на цвет. Материалы кэшируются по (материал, цвет): сотня мобов
## одного вида делит один набор материалов, а исходные материалы основы не меняются.
static func _tint(root: Node3D, color: Color):
	for mesh in root.find_children("*", "MeshInstance3D", true, false):
		for i in mesh.get_surface_override_material_count():
			var original = mesh.get_active_material(i)
			if not original is BaseMaterial3D: continue
			var key = "%s:%s" % [original.get_instance_id(), color.to_html()]
			if not tinted.has(key):
				var copy: BaseMaterial3D = original.duplicate()
				copy.albedo_color = original.albedo_color * color
				tinted[key] = copy
			mesh.set_surface_override_material(i, tinted[key])

static func actor(id: String) -> Node3D:
	var entry = entry_of(id)
	if entry.is_empty() or not ResourceLoader.exists(entry.path): return null
	var result = packed(entry.path).instantiate()
	if entry.has("tint"): _tint(result, Color(str(entry.tint)))
	var anim_id = base_of(id)
	if entry.get("rig", "") == "canonical":
		if canonical_clips.is_empty():
			var source_scene = packed("res://generated/anims/AnimationLibrary_Godot_Standard.nofingers.gltf").instantiate()
			var source: AnimationPlayer = source_scene.find_child("AnimationPlayer", true, false)
			for key in source.get_animation_list(): canonical_clips[key] = source.get_animation(key)
			source_scene.free()
		var player = AnimationPlayer.new(); player.name = "AnimationPlayer"; result.add_child(player)
		var library = AnimationLibrary.new()
		var clips = {"idle": "Idle", "walk": "Walk", "run": "Jog_Fwd", "attack": "Sword_Attack", "attack_alt": "Sword_Attack", "cast": "Spell_Simple_Idle", "cast_enter": "Spell_Simple_Enter", "release": "Spell_Simple_Shoot", "hit": "Hit_Chest", "death": "Death01"}
		if anim_id in ["warrior", "warrior_chain"]: clips.idle = "Sword_Idle"; clips.attack_alt = "Punch_Cross"
		if anim_id in ["mage", "gatekeeper", "priest", "wraith", "lich"]: clips.idle = "Spell_Simple_Idle"
		if anim_id == "mage": clips.attack = "Spell_Simple_Shoot"; clips.attack_alt = "Spell_Simple_Shoot"
		if anim_id == "merchant": clips.idle = "Idle_Talking"
		if anim_id in ["goblin", "orc", "ghoul", "treant", "golem"]:
			clips.attack = "Punch_Cross"; clips.attack_alt = "Punch_Jab"; clips.idle = "Idle"
		if anim_id in ["wraith", "lich"]: clips.attack = "Spell_Simple_Shoot"; clips.attack_alt = "Spell_Simple_Shoot"
		for key in clips:
			var clip = canonical_clips[clips[key]].duplicate()
			clip.loop_mode = Animation.LOOP_LINEAR if key in ["idle", "walk", "run", "cast"] else Animation.LOOP_NONE
			library.add_animation(key, clip)
		player.add_animation_library("", library)
	else:
		var player = result.find_child("AnimationPlayer", true, false)
		if player:
			var library = AnimationLibrary.new()
			for key in entry.get("clips", {}):
				var source_name = entry.clips[key]
				if not player.has_animation(source_name): continue
				var clip = player.get_animation(source_name).duplicate()
				clip.loop_mode = Animation.LOOP_LINEAR if key in ["idle", "walk", "run", "cast"] else Animation.LOOP_NONE
				library.add_animation(key, clip)
			for key in player.get_animation_library_list(): player.remove_animation_library(key)
			player.add_animation_library("", library)
	var box = aabb(result)
	var factor = float(entry.get("height", 2.4)) / maxf(box.size.y, 0.01)
	if entry.get("rig", "") == "canonical":
		result.set_meta("gait_walk_speed",1.04985*factor)
		result.set_meta("gait_run_speed",5.27730*factor)
	result.scale = Vector3.ONE * factor
	result.position = Vector3(-box.get_center().x, -box.position.y, -box.get_center().z) * factor
	result.rotation.y = float(entry.get("yaw", 0))
	return result

static func aabb(root: Node3D) -> AABB:
	var box = AABB(); var first = true
	for mesh in root.find_children("*", "MeshInstance3D", true, false):
		var transform = mesh.transform
		var parent = mesh.get_parent()
		while parent != root and parent is Node3D:
			transform = parent.transform * transform; parent = parent.get_parent()
		var part = transform * mesh.get_aabb()
		box = part if first else box.merge(part); first = false
	return box
