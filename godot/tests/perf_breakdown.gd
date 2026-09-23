extends SceneTree
## Разбор кадра по источникам: с тех же игровых камер, что perf_profile.gd, по очереди скрывает
## каждую группу геометрии мира и записывает, сколько примитивов и draw calls она давала.
## Отдельно меряет вклад теней солнца. Кадры каждого ракурса — в --shots=<папка>.
## Godot --path godot --script res://tests/perf_breakdown.gd -- --test-mode --output=/tmp/breakdown.json [--quality=pc] [--shots=/tmp/shots]
const Quality = preload("res://scripts/quality.gd")
var output = "/tmp/breakdown.json"
var shots = ""

func _initialize(): _run.call_deferred()

func _gorge_at(u: float, s: float) -> Vector2:
	var g = root.get_node("GameData").world.gorge
	var v = s + 24.0 * sin(u / 440.0 * PI * 1.6)
	return Vector2(g.origin.x + u * g.axis.x + v * g.axis.z, g.origin.z + u * g.axis.z - v * g.axis.x)

## Группа узла для отчёта: по имени и родителю, без знания внутренностей построителей.
func _category(node: Node, world: Node) -> String:
	var parent = node.get_parent()
	var owner_name = ""
	var n = node
	while n and n.get_parent() != world: n = n.get_parent()
	if n: owner_name = str(n.name)
	var bare = str(node.name).trim_prefix("@").get_slice("@", 0)
	if bare.begins_with("Art_") or bare.begins_with("TownTree"): return bare.get_slice("_", 0) + ("_" + bare.get_slice("_", 1) if bare.begins_with("Art_") else "")
	if str(node.name).begins_with("Terrain") or (parent == world and node is MeshInstance3D and node.material_override is ShaderMaterial and str(node.material_override.shader.resource_path).ends_with("terrain.gdshader")): return "terrain"
	if parent == world and node is MultiMeshInstance3D: return "shapes"
	if owner_name.begins_with("ThunderGorge"):
		if bare.begins_with("Cliff"): return "gorge_cliffs"
		if bare.begins_with("Fern"): return "gorge_ferns"
		if bare.begins_with("BankStone"): return "gorge_stones"
		return "gorge_water"
	var script = n.get_script() if n else null
	if script:
		var path = str(script.resource_path)
		if path.ends_with("world_dressing.gd"): return "understory"
		if path.ends_with("town_decor.gd"):
			if parent != n: return "town_models"
			if bare.begins_with("TownStatic"): return "town_static"
			return "town_decor" if node is MultiMeshInstance3D else "town_ground"
	return "other:" + owner_name

func _measure(frames: int) -> Vector2:
	var draws = 0.0; var prims = 0.0
	# счётчики RenderingServer отстают на несколько кадров конвейера
	for i in 8: await process_frame
	for i in frames:
		await process_frame
		draws += Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)
		prims += Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME)
	return Vector2(draws / frames, prims / frames)

func _run():
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--output="): output = arg.trim_prefix("--output=")
		if arg.begins_with("--shots="): shots = arg.trim_prefix("--shots=")
	if not shots.is_empty(): DirAccess.make_dir_recursive_absolute(shots)
	var data = root.get_node("GameData")
	var tuning = root.get_node("Tuning")
	var preset = Quality.preset_from_args(OS.get_cmdline_user_args(), tuning.QUALITY_PRESET)
	var quality = Quality.apply(root, preset)
	var world = load("res://scenes/world.tscn").instantiate(); root.add_child(world); world.build()
	var camera = Camera3D.new(); root.add_child(camera); camera.current = true
	camera.fov = tuning.CAMERA_FOV; camera.near = tuning.CAMERA_NEAR; camera.far = tuning.CAMERA_FAR
	var town = data.world.towns[0]
	var spots = [["town", Vector2(town.x, town.z - 12)], ["gorge_terraces", _gorge_at(90, 4)], ["gorge_falls", _gorge_at(175, -6)]]
	var views = []
	for spot in spots:
		for k in 4:
			var yaw = tuning.CAMERA_YAW_START + k * PI / 2.0
			var hero = data.position_at(spot[1].x, spot[1].y)
			var aim = hero + Vector3.UP * 1.4
			var pitch = tuning.CAMERA_PITCH_START
			var eye = aim + Vector3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch)) * tuning.CAMERA_DISTANCE_START
			eye.y = maxf(eye.y, data.height_at(eye.x, eye.z) + 1.0)
			camera.position = eye; camera.look_at(aim)
			world.set_region(hero)
			# прогрев: подлесок достраивается по одному участку за кадр
			for i in 90: await process_frame
			var total = await _measure(10)
			if not shots.is_empty():
				root.get_texture().get_image().save_png("%s/%s-%d.png" % [shots, spot[0], k])
			var groups: Dictionary = {}
			for node in world.find_children("*", "GeometryInstance3D", true, false):
				if not node.visible: continue
				var c = _category(node, world)
				if not groups.has(c): groups[c] = []
				groups[c].append(node)
			var parts = {}
			for c in groups:
				for node in groups[c]: node.visible = false
				var without = await _measure(4)
				for node in groups[c]: node.visible = true
				parts[c] = {"draw": roundi(total.x - without.x), "prims": roundi(total.y - without.y), "nodes": groups[c].size()}
			world.sun.shadow_enabled = false
			var no_shadow = await _measure(4)
			world.sun.shadow_enabled = true
			var row = {"spot": spot[0], "view": k, "draw": roundi(total.x), "prims": roundi(total.y),
				"shadow": {"draw": roundi(total.x - no_shadow.x), "prims": roundi(total.y - no_shadow.y)}, "parts": parts}
			views.append(row)
			print("BREAKDOWN ", JSON.stringify(row))
	var file = FileAccess.open(output, FileAccess.WRITE)
	file.store_string(JSON.stringify({"quality": quality, "views": views}, "  ") + "\n"); file.close()
	quit()
