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
		if anim_id in ["warrior", "warrior_chain"]: clips.idle = "Idle"; clips.attack_alt = "Sword_Attack"
		if anim_id in ["mage", "gatekeeper", "priest", "wraith", "lich"]: clips.idle = "Spell_Simple_Idle"
		if anim_id == "mage": clips.attack = "Sword_Attack"; clips.attack_alt = "Sword_Attack"
		if anim_id == "merchant": clips.idle = "Idle_Talking"
		if anim_id in ["goblin", "orc", "ghoul", "treant", "golem"]:
			clips.attack = "Punch_Cross"; clips.attack_alt = "Punch_Jab"; clips.idle = "Idle"
		if anim_id in ["wraith", "lich"]: clips.attack = "Spell_Simple_Shoot"; clips.attack_alt = "Spell_Simple_Shoot"
		if anim_id == "fang_shaman":
			clips.idle = "Spell_Simple_Idle"; clips.attack = "Spell_Simple_Shoot"; clips.attack_alt = "Spell_Simple_Shoot"
		if anim_id == "stone_guard":
			clips.attack = "Punch_Cross"; clips.attack_alt = "Punch_Jab"
		for key in clips:
			var clip = canonical_clips[clips[key]].duplicate()
			clip.loop_mode = Animation.LOOP_LINEAR if key in ["idle", "walk", "run", "cast"] else Animation.LOOP_NONE
			if key == "run" and anim_id in ["warrior", "warrior_chain", "mage"]:
				_running_arms(clip, result.find_child("Skeleton3D", true, false))
			if anim_id in ["warrior", "warrior_chain"]:
				_close_weapon_hand(clip, result.find_child("Skeleton3D", true, false))
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

## The no-fingers library leaves an open hand in every sword pose.
## Keep a closed grip in the same animation/blending system as the wrist.
static func _close_weapon_hand(clip: Animation, skeleton: Skeleton3D):
	var path = ""
	for track in clip.get_track_count():
		if str(clip.track_get_path(track)).ends_with(":DEF-hand.R"):
			path = str(clip.track_get_path(track)).get_slice(":", 0)
			break
	if path.is_empty(): return
	for finger in ["index", "middle", "ring", "pinky"]:
		for joint in 3:
			var bone_name = "DEF-f_%s.%02d.R" % [finger, joint + 1]
			var bone = skeleton.find_bone(bone_name)
			if bone < 0: continue
			var track = clip.add_track(Animation.TYPE_ROTATION_3D)
			clip.track_set_path(track, NodePath(path + ":" + bone_name))
			var rest = skeleton.get_bone_rest(bone).basis.get_rotation_quaternion()
			clip.rotation_track_insert_key(track, 0, rest * Quaternion(Vector3(0,0,1), [.12, .30, .20][joint]))

## Bake a quieter upper body into locomotion. Legs, root motion and cadence
## retain their source keys; arm swing is in sagittal planes beside the torso.
static func _running_arms(clip: Animation, skeleton: Skeleton3D):
	var targets = ["DEF-neck", "DEF-head", "DEF-spine.001", "DEF-spine.002", "DEF-spine.003", "DEF-shoulder.L", "DEF-shoulder.R", "DEF-upper_arm.L", "DEF-upper_arm.R", "DEF-forearm.L", "DEF-forearm.R"]
	var rotations = {}; var paths = {}; var source_tracks = []
	for track in clip.get_track_count():
		var bone = skeleton.find_bone(str(clip.track_get_path(track)).get_slice(":", 1))
		if bone >= 0: source_tracks.append([track, bone])
		if bone >= 0 and skeleton.get_bone_name(bone) in targets and clip.track_get_type(track) == Animation.TYPE_ROTATION_3D:
			rotations[bone] = []; paths[bone] = track
	var samples = 60
	for frame in samples + 1:
		var time = clip.length * frame / samples
		var local_poses = []; var global_poses = []
		for bone in skeleton.get_bone_count(): local_poses.append(skeleton.get_bone_rest(bone))
		for pair in source_tracks:
			var track = pair[0]; var bone = pair[1]
			if clip.track_get_type(track) == Animation.TYPE_ROTATION_3D: local_poses[bone].basis = Basis(clip.rotation_track_interpolate(track, time))
			elif clip.track_get_type(track) == Animation.TYPE_POSITION_3D: local_poses[bone].origin = clip.position_track_interpolate(track, time)
		for bone in skeleton.get_bone_count():
			var name = skeleton.get_bone_name(bone); var parent = skeleton.get_bone_parent(bone)
			var parent_pose = global_poses[parent] if parent >= 0 else Transform3D.IDENTITY
			var pose = local_poses[bone]
			if name.begins_with("DEF-spine."):
				var rest = skeleton.get_bone_rest(bone).basis
				var delta = (rest.inverse() * pose.basis).get_euler()
				delta.y *= .2; delta.z *= .2; delta.x *= .75
				pose.basis = rest * Basis.from_euler(delta)
			elif name.begins_with("DEF-shoulder.") or name in ["DEF-neck", "DEF-head"]:
				pose.basis = skeleton.get_bone_rest(bone).basis
			var global_pose = parent_pose * pose
			if name == "DEF-spine.003":
				var euler = global_pose.basis.get_euler()
				euler.y *= .2; euler.z *= .2
				global_pose.basis = Basis.from_euler(euler)
			if name.begins_with("DEF-upper_arm.") or name.begins_with("DEF-forearm."):
				var side = 1.0 if name.ends_with(".L") else -1.0
				var swing = .42 * cos(TAU * frame / samples) * -side
				var angle = swing + (1.35 if name.begins_with("DEF-forearm.") else 0.0)
				var direction = Vector3(side * .08, -cos(angle), sin(angle)).normalized()
				var normal = Vector3(side, 0, 0)
				var z_axis = normal.cross(direction).normalized()
				global_pose.basis = Basis(direction.cross(z_axis).normalized(), direction, z_axis)
			global_poses.append(global_pose)
			if rotations.has(bone): rotations[bone].append((parent_pose.basis.inverse() * global_pose.basis).get_rotation_quaternion())
	for bone in rotations:
		var track = paths[bone]
		while clip.track_get_key_count(track) > 0: clip.track_remove_key(track, clip.track_get_key_count(track)-1)
		for frame in samples + 1: clip.rotation_track_insert_key(track, clip.length * frame / samples, rotations[bone][frame])
