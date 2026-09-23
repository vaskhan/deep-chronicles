extends Node3D
const Art = preload("res://scripts/art_assets.gd")
const Lod = preload("res://scripts/lod.gd")
const Quality = preload("res://scripts/quality.gd")
var materials: Dictionary = {}
var shapes: Dictionary = {}
var environment: WorldEnvironment
var sun: DirectionalLight3D
var sun_start_rotation: Vector3
var portals: Array = []
var underground = false
var atmosphere: Dictionary = {}
var region_id = ""

func build():
	_lighting()
	_terrain()
	_props()
	_models()
	_town_details()
	var dressing = preload("res://scripts/world_dressing.gd").new()
	add_child(dressing)
	var town_decor = preload("res://scripts/town_decor.gd").new()
	add_child(town_decor); town_decor.build()
	_watchfires()
	var gorge = preload("res://scripts/gorge.gd").new()
	add_child(gorge); gorge.build()
	_portal(GameData.position_at(150, 258.5), Color("9c75ff"))
	_portal(Vector3(2205, 0, -195), Color("c6a4ff"))
	for t in GameData.world.towns: _portal(GameData.position_at(t.x + 18*t.scale, t.z + 16*t.scale), Color("70d5f0"))
	for i in 6:
		var light = OmniLight3D.new()
		light.position = Vector3(2200 + (i % 3 + 0.5) * 66, 6, -200 + (int(i / 3.0) + 0.5) * 99)
		light.omni_range = 70; light.light_color = Color("ffb271"); light.light_energy = 2.5
		add_child(light)

func _lighting():
	environment = $WorldEnvironment; sun = $Sun
	sun_start_rotation = sun.rotation
	environment.environment = environment.environment.duplicate(true)
	# Тени по пресету: мобильный — два каскада и короче дальность (каждый каскад заново рисует все тени).
	var pc = Quality.current == Quality.PC
	var splits = Tuning.SHADOW_SPLITS_PC if pc else Tuning.SHADOW_SPLITS_MOBILE
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS if splits >= 4 else DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun.directional_shadow_max_distance = Tuning.SHADOW_DISTANCE_PC if pc else Tuning.SHADOW_DISTANCE_MOBILE
	if splits < 4: sun.directional_shadow_split_1 = Tuning.SHADOW_FIRST_SPLIT

# Переходы света плавные; подземелье сразу получает тёмный фон неба.
func set_region(pos: Vector3):
	var zone = GameData.zone_at(pos)
	var id = "town" if zone.get("town", false) else str(zone.id)
	# В Громовом ущелье свой воздух на каждом ярусе: сырая дымка террас, водяная пыль у водопада, ясный холод вершины.
	if id == "gorge": id = "gorge_" + str(GameData.gorge_tier(pos).get("id", "terraces"))
	if id == region_id: return
	region_id = id; underground = id == "crypt"
	atmosphere = {
		"town": {"fog": Color("acbbc2"), "density": 0.000025, "sun": Color("ffe0b0"), "energy": 1.15, "ambient": 0.28},
		"meadow": {"fog": Color("a8bec5"), "density": 0.000025, "sun": Color("fff0cf"), "energy": 1.1, "ambient": 0.35},
		"forest": {"fog": Color("6f9293"), "density": 0.000025, "sun": Color("e5ecd1"), "energy": 1.05, "ambient": 0.23},
		"waste": {"fog": Color("c4a589"), "density": 0.000025, "sun": Color("ffdbb6"), "energy": 1.15, "ambient": 0.32},
		"gorge_terraces": {"fog": Color("6d8c8b"), "density": 0.000025, "sun": Color("ffe6bf"), "energy": 1.05, "ambient": 0.38},
		"gorge_falls": {"fog": Color("7d9c9b"), "density": 0.000025, "sun": Color("ffe5c4"), "energy": 1.02, "ambient": 0.38},
		"gorge_summit": {"fog": Color("c3d0dc"), "density": 0.000025, "sun": Color("f3f6ff"), "energy": 1.08, "ambient": 0.3},
		"crypt": {"fog": Color("191e30"), "density": 0.008, "sun": Color("9fb1da"), "energy": 0.12, "ambient": 0.23},
	}.get(id, {})
	var e = environment.environment
	e.background_mode = Environment.BG_COLOR if underground else Environment.BG_SKY
	e.background_color = Color("11121b")

func _town_details():
	var cloth = ShaderMaterial.new(); cloth.shader = load("res://shaders/banner.gdshader")
	var iron = StandardMaterial3D.new(); iron.albedo_color = Color("34333b"); iron.metallic = 0.75; iron.roughness = 0.5
	var glow = StandardMaterial3D.new(); glow.albedo_color = Color("ffd398")
	glow.emission_enabled = true; glow.emission = Color("ffb45f"); glow.emission_energy_multiplier = 1.8
	for town in GameData.world.townTemples:
		for side in [-1, 1]:
			var banner = MeshInstance3D.new(); var fabric = QuadMesh.new(); fabric.size = Vector2(2.1, 5.5)
			banner.mesh = fabric; banner.material_override = cloth
			banner.position = GameData.position_at(town.x + side * 5.3 * town.scale, town.z + 7.2 * town.scale) + Vector3.UP * 9
			banner.visibility_range_end = 160; add_child(banner)
			var rail = MeshInstance3D.new(); var bar = BoxMesh.new(); bar.size = Vector3(2.5, 0.12, 0.18)
			rail.mesh = bar; rail.material_override = iron; rail.position = banner.position + Vector3.UP * 2.8; add_child(rail)
			var lamp = MeshInstance3D.new(); var lantern = CylinderMesh.new()
			lantern.top_radius = 0.2; lantern.bottom_radius = 0.3; lantern.height = 0.65; lantern.radial_segments = 6
			lamp.mesh = lantern; lamp.material_override = glow
			lamp.position = GameData.position_at(town.x + side * 7.0*town.scale, town.z + 7.2*town.scale) + Vector3.UP * 5.5; add_child(lamp)
			var light = OmniLight3D.new(); light.position = lamp.position
			light.light_color = Color("ffc07b"); light.light_energy = 1.8; light.omni_range = 9; light.distance_fade_enabled = true
			light.distance_fade_begin = 60; light.distance_fade_length = 20; add_child(light)

func _terrain():
	var material = ShaderMaterial.new()
	material.shader = load("res://shaders/terrain.gdshader")
	for key in ["grass", "forest", "sand", "dirt", "rock", "snow"]:
		var path = "res://assets/terrain/%s.png" % key
		material.set_shader_parameter(key, load(path if ResourceLoader.exists(path) else "res://generated/tex/t_%s.png" % key))
	material.set_shader_parameter("grass", load("res://assets/terrain/pbr/meadow-albedo.png"))
	material.set_shader_parameter("sand", load("res://assets/terrain/pbr/badlands-albedo.png"))
	material.set_shader_parameter("forest", load("res://assets/terrain/pbr/forrest_ground_01_diff_2k.jpg"))
	material.set_shader_parameter("forest_normal", load("res://assets/terrain/pbr/forrest_ground_01_nor_gl_2k.jpg"))
	material.set_shader_parameter("forest_roughness", load("res://assets/terrain/pbr/forrest_ground_01_rough_2k.jpg"))
	material.set_shader_parameter("forest_height", load("res://assets/terrain/pbr/forrest_ground_01_disp_2k.jpg"))
	for layer in ["rock_face", "mossy_rock", "dry_ground_01"]:
		for channel in ["diff", "nor", "arm"]:
			if layer == "dry_ground_01" and channel != "diff": continue
			material.set_shader_parameter(layer + "_" + channel, load("res://assets/gorge/%s_%s.jpg" % [layer, channel]))
	# Chunked meshes let the engine cull terrain behind the camera.
	for cz in range(-1000, 1000, 100):
		for cx in range(-1000, 1000, 100):
			var vertices = PackedVector3Array(); var normals = PackedVector3Array(); var indices = PackedInt32Array()
			for z in 26:
				for x in 26:
					var px = cx + x * 4.0; var pz = cz + z * 4.0
					var ground = GameData.position_at(px, pz)
					# Ходьба по причалам использует отметку настила; дно под ними остаётся под водой.
					if px > -317 and px < -268:
						for pier_z in [425,450,475]:
							if absf(pz-pier_z)<8: ground.y = -13
					vertices.append(ground)
					normals.append(Vector3(GameData.height_at(px - 1, pz) - GameData.height_at(px + 1, pz), 2, GameData.height_at(px, pz - 1) - GameData.height_at(px, pz + 1)).normalized())
					if x < 25 and z < 25:
						var a = z * 26 + x
						indices.append_array(PackedInt32Array([a, a + 1, a + 26, a + 1, a + 27, a + 26]))
			var arrays = []; arrays.resize(Mesh.ARRAY_MAX)
			arrays[Mesh.ARRAY_VERTEX] = vertices; arrays[Mesh.ARRAY_NORMAL] = normals; arrays[Mesh.ARRAY_INDEX] = indices
			var mesh = ArrayMesh.new(); mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
			var node = MeshInstance3D.new(); node.mesh = mesh; node.material_override = material
			node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; add_child(node)
	var water = MeshInstance3D.new(); var plane = PlaneMesh.new(); plane.size = Vector2(8000, 8000)
	water.mesh = plane; water.position.y = -6.5
	var wm = ShaderMaterial.new(); wm.shader = preload("res://shaders/living_water.gdshader")
	water.material_override = wm; water.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; add_child(water)

func _props():
	var box = BoxMesh.new(); box.size = Vector3.ONE; shapes.box = box
	for key in ["cone", "cone4", "cyl"]:
		var mesh = CylinderMesh.new(); mesh.height = 1
		mesh.bottom_radius = 0.75 if key == "cone4" else 0.5
		mesh.top_radius = 0.5 if key == "cyl" else 0.0
		mesh.radial_segments = 4 if key == "cone4" else (32 if key == "cyl" else 7)
		mesh.rings = 0 # промежуточные кольца боковой стенки ничего не добавляют к виду
		shapes[key] = mesh
	var ico = SphereMesh.new(); ico.radius = 1; ico.height = 2; ico.radial_segments = 8; ico.rings = 4; shapes.ico = ico
	var groups: Dictionary = {}
	for row in GameData.world.shapes:
		var in_gorge = GameData.zone_at(Vector3(row[2],row[3],row[4])).id == "gorge"
		var key = "%s_%s_%s_%s_%s_%s" % [row[0], int(row[1]), row[9], floori(row[2] / 200), floori(row[4] / 200), in_gorge]
		if not groups.has(key): groups[key] = []
		groups[key].append(row)
	for rows in groups.values():
		var first = rows[0]
		var mm = MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.mesh = shapes[first[0]]; mm.instance_count = rows.size()
		for i in rows.size():
			var r = rows[i]
			var rotation_y = r[5] + (PI / 4 if r[0] == "cone4" else 0)
			var basis = Basis(Vector3.UP, rotation_y).scaled_local(Vector3(r[6], r[7], r[8]))
			mm.set_instance_transform(i, Transform3D(basis, Vector3(r[2], r[3], r[4])))
		var node = MultiMeshInstance3D.new(); node.multimesh = mm
		node.material_override = _material(int(first[1]), first[9])
		if first[9] in ["brick","plain"] and GameData.zone_at(Vector3(first[2],first[3],first[4])).id == "gorge":
			if not materials.has("gorge_ruin"):
				var ruin = StandardMaterial3D.new(); ruin.albedo_color = Color("68716d")
				ruin.albedo_texture = load("res://assets/gorge/rock_face_diff.jpg")
				ruin.normal_enabled = true; ruin.normal_texture = load("res://assets/gorge/rock_face_nor.jpg"); ruin.normal_scale = .6
				ruin.roughness_texture = load("res://assets/gorge/rock_face_arm.jpg"); ruin.roughness_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_GREEN
				ruin.uv1_triplanar = true; ruin.uv1_world_triplanar = true; ruin.uv1_scale = Vector3.ONE*.2
				materials.gorge_ruin = ruin
			node.material_override = materials.gorge_ruin
		add_child(node)

func _material(value: int, kind: String) -> Material:
	var key = str(value) + kind
	if materials.has(key): return materials[key]
	var m = StandardMaterial3D.new(); m.roughness = 0.9
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	m.albedo_color = GameData.color(value)
	var path = "res://assets/terrain/%s.png" % kind
	if not ResourceLoader.exists(path): path = "res://generated/tex/%s.png" % kind
	if ResourceLoader.exists(path):
		m.albedo_texture = load(path)
		m.uv1_triplanar = true; m.uv1_world_triplanar = true
		m.uv1_scale = Vector3.ONE * 0.25
		if kind in ["cobble", "dbrick", "dfloor", "roof_blue", "roof_red", "sandstone", "water"]: m.albedo_color = Color.WHITE
	var pbr = "paving" if kind in ["cobble", "dfloor", "stone"] else ("masonry" if kind in ["brick", "dbrick"] else "")
	if not pbr.is_empty():
		m.albedo_texture = load("res://assets/materials/%s_albedo.jpg" % pbr)
		m.normal_enabled = true; m.normal_texture = load("res://assets/materials/%s_normal.jpg" % pbr); m.normal_scale = 0.65
		m.roughness_texture = load("res://assets/materials/%s_roughness.jpg" % pbr)
		m.albedo_color = Color("929da7") if pbr == "masonry" else Color("acb0b2")
		m.uv1_triplanar = true; m.uv1_world_triplanar = true; m.uv1_scale = Vector3.ONE * (0.33 if pbr == "masonry" else 0.11)
	materials[key] = m; return m

func _portal(pos: Vector3, col: Color):
	var node = MeshInstance3D.new(); var mesh = TorusMesh.new()
	mesh.inner_radius = 1.9; mesh.outer_radius = 2.2
	node.mesh = mesh; node.position = pos + Vector3.UP * 2.5; node.rotation.x = PI / 2
	var m = StandardMaterial3D.new(); m.albedo_color = col; m.emission_enabled = true; m.emission = col; m.emission_energy_multiplier = 2
	node.material_override = m; add_child(node); portals.append(node)

func _process(dt):
	if not atmosphere.is_empty():
		var blend = 1.0 - exp(-dt * 1.8)
		var e = environment.environment
		e.fog_light_color = e.fog_light_color.lerp(atmosphere.fog, blend)
		e.fog_density = lerpf(e.fog_density, atmosphere.density, blend)
		e.ambient_light_energy = lerpf(e.ambient_light_energy, atmosphere.ambient, blend)
		sun.light_color = sun.light_color.lerp(atmosphere.sun, blend)
		sun.light_energy = lerpf(sun.light_energy, atmosphere.energy, blend)
		var direction = Vector3(Tuning.GORGE_SUN_PITCH, Tuning.GORGE_SUN_YAW, 0) if region_id in ["gorge_terraces", "gorge_falls"] else sun_start_rotation
		sun.rotation.x = lerp_angle(sun.rotation.x, direction.x, blend)
		sun.rotation.y = lerp_angle(sun.rotation.y, direction.y, blend)
	for p in portals: p.rotate_y(dt * 0.35)

func _models():
	var groups: Dictionary = {}
	for original_row in GameData.world.get("modelPlacements", []):
		var row = original_row.duplicate()
		if row[0] == "rock_a":
			var pos = Vector3(row[1], row[2], row[3])
			if GameData.zone_at(pos).id == "gorge": row[0] = "moss_boulder"
		if row[0] in ["oak", "pine"]:
			var zone = GameData.zone_at(Vector3(row[1], row[2], row[3]))
			var choice = posmod(hash("tree:%s:%s" % [row[1],row[3]]), 100)
			if zone.id == "forest": row[0] = "pine_natural" if choice < 50 else ("elm_slender" if choice < 77 else "alder_round")
			else: row[0] = "elm_field" if choice < 48 else ("alder_round" if choice < 78 else ("elm_slender" if choice < 94 else "pine_natural"))
		if row[0] in ["elm_field", "elm_slender", "alder_round", "pine_natural"]:
			row[5] *= 1.2; row[7] *= 1.2
		if not groups.has(row[0]): groups[row[0]] = []
		groups[row[0]].append(row)
	for id in groups:
		var rows: Array = groups[id]
		var source = tree_source(id)
		if source.is_empty(): continue
		var box: AABB = source.box
		var transforms: Array = []
		for r in rows:
			var scale_3d = Vector3(r[5] / maxf(box.size.x, .01), r[6] / maxf(box.size.y, .01), r[7] / maxf(box.size.z, .01))
			var basis = Basis(Vector3.UP, r[4]).scaled_local(scale_3d)
			var offset = Vector3(-box.get_center().x, -box.position.y, -box.get_center().z)
			transforms.append(Transform3D(basis, Vector3(r[1], r[2], r[3]) + basis * offset))
		var tree = id in ["oak", "pine", "elm_field", "elm_slender", "alder_round", "pine_natural"]
		var end = 360.0 if id == "bush" else Tuning.CAMERA_FAR
		Lod.place(self, "Art_" + id, source.parts, transforms, Lod.bands("tree" if tree else "prop", end), {"end_margin": 30.0, "shadow_lod": true})

## Части модели реквизита с материалами мира (листва деревьев, мох камней ущелья); кэш на сборку.
var _sources: Dictionary = {}
func tree_source(id: String) -> Dictionary:
	if _sources.has(id): return _sources[id]
	var path = ("res://assets/gorge/%s.glb" if id == "moss_boulder" else "res://assets/props/%s.glb") % id
	if not ResourceLoader.exists(path): return {}
	var source = Art.packed(path).instantiate()
	var parts: Array = []
	for part in Lod.scene_parts(source):
		var display_mesh: Mesh = part.mesh
		var foliage = false
		if id == "moss_boulder":
			display_mesh = display_mesh.duplicate()
			for surface in display_mesh.get_surface_count():
				display_mesh.surface_set_material(surface,preload("res://scripts/gorge_art.gd").boulder_material(display_mesh.surface_get_material(surface)))
		if id in ["elm_field","elm_slender","alder_round","pine_natural"]:
			display_mesh = display_mesh.duplicate()
			for surface in display_mesh.get_surface_count():
				var original = display_mesh.surface_get_material(surface)
				if original is StandardMaterial3D and "foliage" in original.resource_name:
					var leaf = ShaderMaterial.new(); leaf.shader = preload("res://shaders/tree_leaf.gdshader")
					leaf.set_shader_parameter("leaf_texture", load("res://assets/terrain/pbr/spruce-spray.png" if id == "pine_natural" else "res://assets/terrain/pbr/elm-leaf.png"))
					display_mesh.surface_set_material(surface, leaf); foliage = true
				elif original is StandardMaterial3D and "bark" in original.resource_name.to_lower():
					var bark = original.duplicate(); bark.albedo_color = Color("695444") if id != "elm_slender" else Color("a3977e")
					display_mesh.surface_set_material(surface, bark)
		parts.append({"mesh": display_mesh, "transform": part.transform, "foliage": foliage})
	_sources[id] = {"box": Art.aabb(source), "parts": parts}
	source.free()
	return _sources[id]

func _watchfires():
	# A few warm pools guide the route out of the cold town; range limits mobile cost.
	for town in GameData.world.towns:
		for offset in [Vector2(87, -13), Vector2(87, -3), Vector2(-18, 10), Vector2(18, -16)]:
			var pos = GameData.position_at(town.x + offset.x*town.scale, town.z + offset.y*town.scale)
			var lamp = OmniLight3D.new(); lamp.position = pos + Vector3.UP * 2.0
			lamp.light_color = Color("ffa254"); lamp.light_energy = 2.8; lamp.omni_range = 10; lamp.shadow_enabled = false; add_child(lamp)
			var brazier = MeshInstance3D.new(); var bowl = CylinderMesh.new(); bowl.top_radius = 0.38; bowl.bottom_radius = 0.16; bowl.height = 0.45
			brazier.mesh = bowl; brazier.position = pos + Vector3.UP * 1.55
			var iron = StandardMaterial3D.new(); iron.albedo_color = Color("292e32"); iron.metallic = 0.75; iron.roughness = 0.65; brazier.material_override = iron; add_child(brazier)
			var post = MeshInstance3D.new(); var shaft = CylinderMesh.new(); shaft.top_radius = 0.09; shaft.bottom_radius = 0.2; shaft.height = 1.4
			post.mesh = shaft; post.material_override = iron; post.position = pos + Vector3.UP * 0.7; add_child(post)
			var ember = MeshInstance3D.new(); var flame = SphereMesh.new(); flame.radius = 0.23; flame.height = 0.32
			ember.mesh = flame; ember.position = pos + Vector3.UP * 1.82
			var glow = StandardMaterial3D.new(); glow.albedo_color = Color("ff973d"); glow.emission_enabled = true; glow.emission = Color("ff6c23"); glow.emission_energy_multiplier = 2.5; ember.material_override = glow; add_child(ember)
