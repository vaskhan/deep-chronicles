extends SceneTree
var Actor
var failures = 0
var output = "user://native-weapons.png"
func _initialize(): _run.call_deferred()
func _run():
	Actor = load("res://scripts/actor.gd")
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--output="): output = arg.trim_prefix("--output=")
	var scene = Node3D.new(); root.add_child(scene)
	var environment = WorldEnvironment.new(); environment.environment = load("res://resources/daylight.tres"); scene.add_child(environment)
	var sun = DirectionalLight3D.new(); sun.rotation_degrees = Vector3(-45, -30, 0); sun.light_energy = 1.1; sun.shadow_enabled = true; scene.add_child(sun)
	var plane = MeshInstance3D.new(); plane.mesh = PlaneMesh.new(); plane.mesh.size = Vector2(50,50)
	var mat = StandardMaterial3D.new(); mat.albedo_color = Color("83907e"); plane.material_override = mat; scene.add_child(plane)
	var actors: Array = []
	for row in 3:
		for col in 6:
			var id = ["warrior", "mage", "warrior_chain"][row]
			var actor = Actor.new(); actor.kind = "self"; scene.add_child(actor); actor.setup(id, id + " · " + ["idle", "walk", "run", "attack", "attack_alt", "cast_enter"][col])
			actor.position = Vector3((col - 2.5) * 3.2, 0, row * 4.0); actor.rotation.y = -0.3
			actor.apply_look({"w": 0xbbccd8, "staff": id == "mage", "gear": {}, "ench": 4})
			actor.set_process(false); actor.animator.play(["idle", "walk", "run", "attack", "attack_alt", "cast_enter"][col], 0); actor.animator.seek([0.4, 0.2, 0.22, 0.6, 0.2, 0.25][col], true); actor.animator.pause()
			actors.append(actor)
	if "--reference" in OS.get_cmdline_user_args():
		for actor in actors: actor.hide()
		var reference = load("res://generated/anims/AnimationLibrary_Godot_Standard.nofingers.gltf").instantiate()
		scene.add_child(reference); reference.scale = Vector3.ONE * 2
		var anim = reference.find_child("AnimationPlayer", true, false); anim.play("Sword_Idle"); anim.seek(0.4, true); anim.pause()
	var camera = Camera3D.new(); scene.add_child(camera); camera.position = Vector3(-1, 7, -24); camera.look_at(Vector3(0, 1, 1.8)); camera.fov = 43; camera.current = true
	await create_timer(0.5).timeout
	for actor in actors:
		var skeleton = actor.model.find_child("Skeleton3D", true, false)
		var hand = skeleton.get_bone_global_pose(skeleton.find_bone("DEF-hand.R"))
		var attachment = actor.weapon_node.get_parent().get_parent()
		var grip = actor.weapon_node.get_parent()
		var wrist_error = (skeleton.global_transform * hand.origin).distance_to(attachment.global_position)
		var handle_error = actor.weapon_node.to_global(actor.weapon_node.get_meta("handle_center")).distance_to(grip.global_position)
		var forward = (skeleton.global_basis * hand.basis.z).normalized()
		var blade = actor.weapon_node.global_basis.z.normalized()
		var surface_distance = _hand_surface_distance(actor)
		if wrist_error > 0.001 or handle_error > 0.001 or forward.dot(blade) < 0.999 or surface_distance > .075:
			failures += 1; push_error("Weapon grip drift: " + actor.display_name + " surface distance=" + str(surface_distance))
		else: print("PASS: palm grip and blade orientation: ", actor.display_name)
	if DisplayServer.get_name() != "headless":
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(output)
		print("WEAPONS ", ProjectSettings.globalize_path(output))
	print("WEAPON_TEST_RESULT checks=18 failures=", failures)
	quit(0 if failures == 0 else 1)

## Check against skinned hand geometry, not just the attachment's own origin.
func _hand_surface_distance(actor) -> float:
	if actor.active_art not in ["warrior", "warrior_chain"]: return 0.0
	var skeleton = actor.model.find_child("Skeleton3D", true, false)
	var center = actor.weapon_node.to_global(actor.weapon_node.get_meta("handle_center"))
	var closest = INF
	for mesh in actor.model.find_children("*", "MeshInstance3D", true, false):
		if not mesh.skin: continue
		var transforms = []; var hand_bind = []
		for bind in mesh.skin.get_bind_count():
			var name = str(mesh.skin.get_bind_name(bind)); var bone = skeleton.find_bone(name)
			transforms.append(skeleton.global_transform * skeleton.get_bone_global_pose(bone) * mesh.skin.get_bind_pose(bind))
			hand_bind.append(name.ends_with(".R") and (name.begins_with("DEF-f_") or name.begins_with("DEF-thumb") or name == "DEF-hand.R"))
		for surface in mesh.mesh.get_surface_count():
			var arrays = mesh.mesh.surface_get_arrays(surface)
			var vertices = arrays[Mesh.ARRAY_VERTEX]; var weights = arrays[Mesh.ARRAY_WEIGHTS]; var bones = arrays[Mesh.ARRAY_BONES]
			for vertex in vertices.size():
				var hand_weight = 0.0; var point = Vector3.ZERO
				for slot in 4:
					var index = vertex*4+slot; var bind = bones[index]; var weight = weights[index]
					if hand_bind[bind]: hand_weight += weight
					point += (transforms[bind] * vertices[vertex]) * weight
				if hand_weight > .5: closest = minf(closest, point.distance_to(center))
	return closest
