extends Node3D
## Рынок и сквер: расстановка и препятствия приходят из общего каталога мира.
const Art = preload("res://scripts/art_assets.gd")
const Lod = preload("res://scripts/lod.gd")
var materials: Dictionary = {}
var groups: Dictionary = {}
var origin = Vector3.ZERO
var orientation = Basis.IDENTITY
var architecture: RefCounted
var tree_transforms: Array = []

func build():
	_material("wood", Color("76523b"))
	_material("stone", Color.WHITE, "res://assets/materials/paving_albedo.jpg")
	_material("iron", Color("383a40"))
	_material("soil", Color("39372a"))
	_material("cream", Color("d7c8a0"))
	_material("burgundy", Color("743740")); _material("ochre", Color("b78b42")); _material("green", Color("4e7264"))
	_material("leaf", Color("52613c")); _material("flower", Color("bd7ca0")); _material("fruit", Color("bd5636"))
	var glow = _material("glow", Color("ffcc80")); glow.emission_enabled = true; glow.emission = Color("ffb365"); glow.emission_energy_multiplier = 1.2
	var fabric = ShaderMaterial.new(); fabric.shader = load("res://shaders/banner.gdshader"); materials["pennant"] = fabric
	_material("water",Color("528e9c"))
	_material("paving",Color("b3ad9f"),"res://assets/materials/paving_albedo.jpg")
	_material("trim",Color("645e50"),"res://assets/materials/paving_albedo.jpg")
	_material("lawn",Color("78805b"),"res://assets/terrain/grass.png")
	var dirt = ShaderMaterial.new(); dirt.shader = load("res://shaders/town_dirt.gdshader")
	dirt.set_shader_parameter("ground_texture",load("res://assets/terrain/dirt.png")); materials["dirt_road"] = dirt
	architecture = preload("res://scripts/town_architecture.gd").new(self)
	for town in GameData.world.towns:
		origin = GameData.position_at(town.x,town.z); orientation = _plan_basis(town)
		if town.id == "harbor":
			_district_ground(town)
			origin = Vector3(town.x,0,town.z); _harbor(); _temple_terrace()
			origin = GameData.position_at(town.x,town.z)
		else: _cylinder(Vector3(0,.01,0),87,.06,"paving")
		if town.id == "harbor": continue
		for x in [-18,18]: _box(Vector3(x,.075,34),Vector3(16,.05,7),"lawn")
		_garland(Vector3(-32,7,-8),Vector3(-18,6.3,-8))
		_garland(Vector3(-32,7,22),Vector3(-18,6.3,22))
		_garland(Vector3(30,7.5,-22),Vector3(48,7.5,-22))
		_ring(6.4,6.65,.27,"trim"); _ring(17.8,18.15,.27,"trim"); _ring(19.3,19.65,.27,"trim")
		for i in 16:
			var angle = i*TAU/16
			var mesh = BoxMesh.new(); mesh.size = Vector3(.13,.025,10)
			_part(mesh,Vector3(sin(angle)*12,.28,cos(angle)*12),"trim","inlay",Basis(Vector3.UP,angle))
	for gate in GameData.world.get("townGates", []):
		origin = GameData.position_at(gate.x,gate.z); orientation = _plan_basis(gate,gate.rotation)
		_gate()
	for hall in GameData.world.get("townCivic", []):
		origin = GameData.position_at(hall.x,hall.z); orientation = _plan_basis(hall)
		_hall(hall)
	for house in GameData.world.get("townHouses", []):
		origin = GameData.position_at(house.x,house.z); orientation = _plan_basis(house,house.rotation)
		architecture.house(house)
	for road in GameData.world.get("townRoads", []):
		if road.has("points"): _road(road); continue
		origin = GameData.position_at(road.x, road.z); orientation = Basis.IDENTITY
		_box(Vector3(0,.05,0),Vector3(road.w,.08,road.d),"stone")
	for shop in GameData.world.get("townShops", []):
		origin = GameData.position_at(shop.x, shop.z); orientation = _plan_basis(shop)
		_shop(shop)
	for item in GameData.world.get("townDecor", []):
		origin = GameData.position_at(item.x, item.z)
		orientation = _plan_basis(item,float(item.rotation))
		match item.kind:
			"stall": _stall(item.color)
			"bench": _bench()
			"planter": _planter()
			"tree": _tree()
			"barrels":
				_barrel(Vector3(-0.6,0,0)); _barrel(Vector3(0.6,0,0.3))
			"lamp": _lamp()
			"hedge":
				_box(Vector3(0,.22,0),Vector3(2.7,.44,1.65),"stone")
				_model("bush",Vector3(0,.4,0),Vector3(2.5,1,1.5))
			"cart": _cart()
			"well": _well()
	# Статика города сливается в один меш на материал и ячейку 100 м: сотни мелких MultiMesh
	# (по одному на размер бруска) давали ~900 draw calls. Вымпелы и паруса качает шейдер
	# по локальной вершине и позиции экземпляра — они остаются MultiMesh.
	var merged: Dictionary = {}
	for group in groups.values():
		if group.material == materials.pennant:
			var mm = MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D
			mm.mesh = group.mesh; mm.instance_count = group.transforms.size()
			for i in mm.instance_count: mm.set_instance_transform(i, group.transforms[i])
			var instance = MultiMeshInstance3D.new(); instance.multimesh = mm; instance.material_override = group.material; instance.position = group.anchor
			instance.visibility_range_end = Tuning.CAMERA_FAR; instance.visibility_range_end_margin = 20; add_child(instance)
			continue
		# Плоское у земли (мостовая, газоны, инкрустации) и мелочь (фрукты, цветы) тени не дают
		# заметной — их каскады теней не перерисовывают.
		var casters = []; var quiet = []
		var bounds: AABB = group.mesh.get_aabb()
		for t in group.transforms:
			var box: AABB = t * bounds
			var flat = box.size.y < .3 and _low(box, group.anchor)
			var tiny = maxf(box.size.x, maxf(box.size.y, box.size.z)) < .35
			(quiet if flat or tiny else casters).append(t)
		for pack in [[casters, true], [quiet, false]]:
			if pack[0].is_empty(): continue
			var key = "%d%s%s" % [group.material.get_instance_id(), group.anchor, pack[1]]
			if not merged.has(key): merged[key] = {"material": group.material, "anchor": group.anchor, "shadow": pack[1], "parts": []}
			merged[key].parts.append({"mesh": group.mesh, "transforms": pack[0]})
	for batch in merged.values():
		var node = MeshInstance3D.new(); node.name = "TownStatic_%d" % get_child_count(); node.mesh = _merge(batch.parts)
		node.material_override = batch.material; node.position = batch.anchor
		if not batch.shadow: node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		node.visibility_range_end = Tuning.CAMERA_FAR; node.visibility_range_end_margin = 20; add_child(node)
	if not tree_transforms.is_empty():
		var source = get_parent().tree_source("elm_field")
		Lod.place(self, "TownTree", source.parts, tree_transforms, Lod.bands("tree", Tuning.CAMERA_FAR), {"end_margin": 20.0, "shadow_lod": true})

## Лежит ли плоская деталь у земли: верх не выше полуметра над рельефом под её центром.
func _low(box: AABB, anchor: Vector3) -> bool:
	var centre = box.get_center() + anchor
	return box.end.y + anchor.y - GameData.height_at(centre.x, centre.z) < .5

## Один статический меш из групп {mesh, transforms}. Нормали — обратной транспонированной
## матрицей (бруски масштабируются неравномерно); у мешей без нормалей — нормаль грани.
func _merge(parts: Array) -> ArrayMesh:
	var vertices = PackedVector3Array(); var normals = PackedVector3Array(); var uvs = PackedVector2Array()
	var indices = PackedInt32Array()
	for group in parts:
		for surface in group.mesh.get_surface_count():
			var arrays = group.mesh.surface_get_arrays(surface)
			var source: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
			var source_normals = arrays[Mesh.ARRAY_NORMAL]
			var source_uvs = arrays[Mesh.ARRAY_TEX_UV]
			var source_index = arrays[Mesh.ARRAY_INDEX]
			if source_index == null or source_index.is_empty():
				source_index = PackedInt32Array(range(source.size()))
			var has_normals = source_normals != null and source_normals.size() == source.size()
			for t in group.transforms:
				var transform: Transform3D = t
				var base = vertices.size()
				var placed: PackedVector3Array = transform * source
				vertices.append_array(placed)
				if source_uvs != null and source_uvs.size() == source.size(): uvs.append_array(source_uvs)
				else:
					var blank = PackedVector2Array(); blank.resize(source.size()); uvs.append_array(blank)
				var flip = transform.basis.determinant() < 0.0
				if has_normals:
					var turned: PackedVector3Array = Transform3D(transform.basis.inverse().transposed(), Vector3.ZERO) * source_normals
					for i in turned.size():
						var n = turned[i]
						turned[i] = n.normalized() if n.length_squared() > 1e-12 else Vector3.UP
					normals.append_array(turned)
				else:
					var flat = PackedVector3Array(); flat.resize(source.size()); flat.fill(Vector3.UP)
					for i in range(0, source_index.size() - 2, 3):
						var a = placed[source_index[i]]; var b = placed[source_index[i + 1]]; var c = placed[source_index[i + 2]]
						var face = (c - a).cross(b - a)
						if face.length_squared() > 1e-12:
							for k in 3: flat[source_index[i + k]] = face.normalized()
					normals.append_array(flat)
				for i in range(0, source_index.size() - 2, 3):
					if flip: indices.append_array([base + source_index[i], base + source_index[i + 2], base + source_index[i + 1]])
					else: indices.append_array([base + source_index[i], base + source_index[i + 1], base + source_index[i + 2]])
	var arrays = []; arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices; arrays[Mesh.ARRAY_NORMAL] = normals; arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_INDEX] = indices
	# Сжатые атрибуты (16-битные позиции в пределах ячейки, октаэдрические нормали): слитые
	# бруски иначе заметно прибавляют к видеопамяти по сравнению с инстансингом.
	var mesh = ArrayMesh.new(); mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays, [], {}, Mesh.ARRAY_FLAG_COMPRESS_ATTRIBUTES)
	return mesh

func _plan_basis(data: Dictionary, angle = 0.0) -> Basis:
	var s = float(data.get("scale",1.0))
	return Basis(Vector3.UP,angle).scaled(Vector3(s,1,s))

func _material(id: String, color: Color, texture_path = "") -> StandardMaterial3D:
	var m = StandardMaterial3D.new(); m.albedo_color = color; m.roughness = 0.88
	if not texture_path.is_empty() and ResourceLoader.exists(texture_path):
		m.albedo_texture = load(texture_path); m.uv1_triplanar = true; m.uv1_world_triplanar = true; m.uv1_scale = Vector3.ONE * 0.25
	if id == "iron": m.metallic = 0.65; m.roughness = 0.48
	materials[id] = m; return m

func _part(mesh: Mesh, pos: Vector3, id: String, key: String, rotation = Basis.IDENTITY):
	var anchor = Vector3(floorf(origin.x / 100) * 100, 0, floorf(origin.z / 100) * 100)
	key += id + str(anchor)
	if not groups.has(key): groups[key] = {"mesh": mesh, "material": materials[id], "anchor": anchor, "transforms": []}
	groups[key].transforms.append(Transform3D(orientation * rotation, origin + orientation * pos - anchor))

func _box(pos: Vector3, size: Vector3, id: String, angle = 0.0):
	var mesh = BoxMesh.new(); mesh.size = size
	_part(mesh, pos, id, "box" + str(size), Basis(Vector3.RIGHT, angle))

func _cylinder(pos: Vector3, radius: float, height: float, id: String):
	var mesh = CylinderMesh.new(); mesh.top_radius = radius; mesh.bottom_radius = radius; mesh.height = height; mesh.radial_segments = 12; mesh.rings = 0
	_part(mesh, pos, id, "cylinder%s,%s" % [radius,height])

func _stall(color: String):
	for x in [-2.1, 2.1]:
		for z in [-1.1, 1.1]: _box(Vector3(x,1.65,z), Vector3(.14,3.3,.14), "wood")
	_box(Vector3(0,1.05,.65), Vector3(4.4,.17,1.15), "wood")
	for x in [-1.9,-.95,0,.95,1.9]: _box(Vector3(x,.58,1.15), Vector3(.86,.9,.1), "wood")
	for i in 8:
		var color_id = color if i % 2 == 0 else "cream"
		for side in [-1,1]:
			_box(Vector3(-2.1+i*.6,3.35,side*.7), Vector3(.6,.045,1.55), color_id, side*.3)
		_box(Vector3(-2.1+i*.6,3.0,1.43), Vector3(.6,.32,.05), color_id)
	for x in [-1.3,0,1.3]:
		_box(Vector3(x,1.2,.65), Vector3(1,.2,.75), "wood")
		for i in 5: _cylinder(Vector3(x-.3+(i%3)*.27,1.4,.45+int(i/3.0)*.25),.13,.19,"fruit" if color == "burgundy" else "ochre")
	_box(Vector3(-1.3,.4,-.5),Vector3(.8,.8,.8),"wood")
	_barrel(Vector3(1.35,0,-.5))

func _barrel(pos: Vector3):
	_cylinder(pos+Vector3.UP*.55,.48,1.1,"wood")
	for y in [.14,.92]: _cylinder(pos+Vector3.UP*y,.495,.085,"iron")
	_cylinder(pos+Vector3.UP*1.11,.44,.04,"wood")

func _bench():
	for x in [-1.3,1.3]: _box(Vector3(x,.37,0),Vector3(.2,.75,.85),"iron")
	for z in [-.3,0,.3]: _box(Vector3(0,.8,z),Vector3(3.5,.14,.24),"wood")
	for x in [-1.5,1.5]: _box(Vector3(x,1.1,-.38),Vector3(.13,1.1,.13),"iron")
	for y in [1.12,1.45]: _box(Vector3(0,y,-.4),Vector3(3.5,.26,.12),"wood")

func _planter():
	_cylinder(Vector3(0,.2,0),1.8,.4,"stone")
	_cylinder(Vector3(0,.42,0),1.6,.05,"soil")
	for i in 18:
		var angle = i*2.4; var radius = .3+float(i%4)*.33
		var pos = Vector3(cos(angle)*radius,.6,sin(angle)*radius)
		_box(pos,Vector3(.14,.35,.14),"leaf")
		_cylinder(pos+Vector3.UP*.2,.17,.12,"flower" if i%3 else "cream")

func _tree():
	_cylinder(Vector3(0,.18,0),2,.36,"stone"); _cylinder(Vector3(0,.37,0),1.8,.04,"soil")
	# Сама крона — общий с лесом вяз с уровнями детализации (lod.gd), без отдельной копии сцены.
	var source = get_parent().tree_source("elm_field")
	var bounds: AABB = source.box; var factor = 10.0 / maxf(.1,bounds.size.y)
	tree_transforms.append(Transform3D(Basis.IDENTITY.scaled(Vector3.ONE * factor), origin + Vector3(-bounds.get_center().x*factor, .4-bounds.position.y*factor, -bounds.get_center().z*factor)))

func _lamp():
	_cylinder(Vector3(0,1.9,0),.095,3.8,"iron")
	_cylinder(Vector3(0,.15,0),.28,.3,"stone")
	_box(Vector3(0,4,0),Vector3(.45,.65,.45),"glow")
	for y in [3.65,4.36]: _box(Vector3(0,y,0),Vector3(.62,.12,.62),"iron")
	var light = OmniLight3D.new(); light.position = origin + Vector3.UP*4
	light.light_color = Color("ffcd91"); light.light_energy = 1.1; light.omni_range = 7
	light.distance_fade_enabled = true; light.distance_fade_begin = 35; light.distance_fade_length = 15; add_child(light)

func _shop(shop: Dictionary):
	if shop.get("frontage", false):
		_shop_frontage(shop)
		return
	var saved_origin = origin
	origin += orientation*Vector3(0,0,-7)
	architecture.house({"town":shop.get("town", ""),"x":shop.x,"z":shop.z,"w":10,"d":7,"h":7.8,"roof":"blue" if shop.id == "clothes" else "red"})
	origin = saved_origin
	# Открытый дворик перед прилавком позволяет войти и видеть продавца с игровой камеры.
	_box(Vector3(0,.06,0),Vector3(10,.12,8),"stone")
	_box(Vector3(0,2.4,-4),Vector3(10,4.8,.35),"cream")
	for x in [-5,5]:
		_box(Vector3(x,2.4,0),Vector3(.35,4.8,8),"cream")
		_box(Vector3(x,.5,0),Vector3(.48,1,8),"masonry")
		for z in [-2,2]:
			_box(Vector3(x*1.045,2.45,z),Vector3(.12,2,1.55),"timber")
			_box(Vector3(x*1.06,2.45,z),Vector3(.06,1.7,1.3),"glass")
			_box(Vector3(x*1.07,2.45,z),Vector3(.06,1.7,.1),"cream")
		for z in [-4,0,4]: _box(Vector3(x,2.5,z),Vector3(.3,5,.3),"wood")
		_box(Vector3(x,3.2,0),Vector3(.42,.22,8.3),"wood")
	_box(Vector3(0,1,-1.5),Vector3(8.8,1.8,.9),"wood")
	for x in [-3,-1,1,3]:
		_box(Vector3(x,2.1,-3.4),Vector3(1.8,.15,.6),"wood")
		if shop.id == "weapons":
			_box(Vector3(x,3,-3.2),Vector3(.16,1.7,.1),"iron",-.2)
			_box(Vector3(x,2.45,-3.1),Vector3(.7,.12,.14),"ochre")
		elif shop.id == "clothes":
			_box(Vector3(x,2.8,-3.2),Vector3(.9,1.2,.15),shop.color)
			_box(Vector3(x,3.2,-3.2),Vector3(1.5,.3,.16),shop.color)
		else:
			for dx in [-.5,0,.5]: _cylinder(Vector3(x+dx,2.45,-3.3),.14,.6,"green")
	# Крыша над складской частью; передняя половина — открытая галерея.
	for side in [-1,1]: _box(Vector3(side*2.55,5.5,-2),Vector3(5.4,.2,4.8),shop.color)
	_box(Vector3(0,4.9,4),Vector3(10.4,.35,.4),"wood")
	_box(Vector3(0,4.85,4.3),Vector3(5,.9,.14),shop.color)
	var sign = Label3D.new(); sign.text = shop.name; sign.font_size = 48; sign.pixel_size = .012
	sign.modulate = Color("fff0cc"); sign.outline_size = 6; sign.position = origin + orientation*Vector3(0,4.85,4.4)
	sign.visibility_range_end = 100; add_child(sign)
	_barrel(Vector3(3.5,0,-.3))

func _shop_frontage(shop: Dictionary):
	var path="res://assets/town/houses/merchant_complete.glb"
	if not ResourceLoader.exists(path):
		# Defensive fallback for a damaged installation; the full kit ships in assets/town/houses.
		var fallback=shop.duplicate();fallback.frontage=false;_shop(fallback);return
	var shell=Art.packed(path).instantiate()
	var factor=float(shop.modelScale)
	shell.scale=Vector3.ONE*factor
	shell.position=origin+orientation*Vector3(0,0,-7)+Vector3.UP*(.08-.11175*factor)
	add_child(shell)
	for part in shell.find_children("*","MeshInstance3D",true,false):
		for surface in part.mesh.get_surface_count():
			var source=part.get_active_material(surface)
			if source is BaseMaterial3D:
				var material=source.duplicate();material.cull_mode=BaseMaterial3D.CULL_DISABLED
				material.texture_filter=BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
				part.set_surface_override_material(surface,material)
	var light=OmniLight3D.new();light.position=shell.position+Vector3(0,3.0,0)
	light.light_color=Color("ffdcad");light.light_energy=1.3;light.omni_range=13;add_child(light)
	var sign=Label3D.new();sign.text=shop.name;sign.font_size=44;sign.pixel_size=.011
	sign.modulate=Color("fff0cc");sign.outline_size=6
	sign.position=shell.position+Vector3(.65,3.25,4.5);sign.visibility_range_end=70;add_child(sign)

func _ring(inner: float, outer: float, y: float, material: String):
	var ring = TorusMesh.new(); ring.inner_radius = inner; ring.outer_radius = outer; ring.rings = 64; ring.ring_segments = 6
	_part(ring,Vector3(0,y,0),material,"ring"+str(inner),Basis.IDENTITY.scaled(Vector3(1,.08,1)))

func _model(id: String, pos: Vector3, dimensions: Vector3):
	var model = Art.packed("res://assets/props/%s.glb" % id).instantiate()
	var bounds = Art.aabb(model); var factor = dimensions / bounds.size
	model.transform = Transform3D(orientation.scaled_local(factor),origin+orientation*(pos+Vector3(-bounds.get_center().x,-bounds.position.y,-bounds.get_center().z)*factor))
	add_child(model)

func _gate():
	_box(Vector3(0,.03,0),Vector3(13,.08,30),"stone")
	for x in [-12,12]:
		_model("tower",Vector3(x,0,0),Vector3(8,26,8))
		_box(Vector3(x,1.0,0),Vector3(9,2,9),"stone")
		_box(Vector3(x,9,4.2),Vector3(2.5,7,.12),"burgundy")
		_box(Vector3(x,9,4.3),Vector3(.15,6,.06),"ochre")
	# Арка: отдельные клиновидно расположенные камни над свободным проходом.
	for i in 18:
		var angle = float(i)/17*PI
		var block = BoxMesh.new(); block.size = Vector3(1.5,2.4,4.5)
		_part(block,Vector3(cos(angle)*8.4,8+sin(angle)*8.4,0),"stone","arch",Basis(Vector3.BACK,angle-PI*.5))
	for x in [-8.4,8.4]:
		_box(Vector3(x,4,0),Vector3(2.4,8,4.5),"stone")
		_box(Vector3(x,8.2,0),Vector3(3,.5,5),"trim")
	_box(Vector3(0,18.3,0),Vector3(20,2,4.4),"stone")
	for x in range(-9,10,3): _box(Vector3(x,20,0),Vector3(1.5,1.6,4.4),"stone")
	_box(Vector3(0,18.4,2.3),Vector3(3.6,1.6,.18),"burgundy")
	var plate = BoxMesh.new(); plate.size = Vector3(.8,.8,.2)
	_part(plate,Vector3(0,18.4,2.5),"ochre","gatecrest",Basis(Vector3.BACK,PI/4))

func _house_details(house: Dictionary):
	var front = house.d*.5+.25
	# Цветочные ящики и поленницы — у фасадов, внутри контура препятствия дома.
	for x in [-house.w*.26,house.w*.26]:
		_box(Vector3(x,4.0,front-.65),Vector3(1.6,.32,.45),"wood")
		for i in 5: _cylinder(Vector3(x-.6+i*.3,4.26,front-.65),.16,.22,"flower" if int(house.h)%2 else "cream")
	for i in 4:
		_box(Vector3(house.w*.32,.25+i*.18,front-1),Vector3(1.6,.15,.35),"wood")
	# Выносная вывеска и карниз создают мелкий силуэт вдоль улицы.
	_box(Vector3(-house.w*.35,3.2,front),Vector3(.12,.12,1.4),"iron")
	_box(Vector3(-house.w*.35,2.7,front+.6),Vector3(.12,.85,.85),"wood")

func _garland(a: Vector3, b: Vector3):
	var wire = BoxMesh.new(); wire.size = Vector3(.025,.025,a.distance_to(b))
	_part(wire,(a+b)*.5,"iron","wire"+str(a.distance_to(b)),Basis.looking_at(b-a,Vector3.UP))
	for i in range(1,13):
		var pos = a.lerp(b,float(i)/13)
		var arrays = []; arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = PackedVector3Array([Vector3(-.35,0,0),Vector3(.35,0,0),Vector3(0,-1,0)])
		arrays[Mesh.ARRAY_NORMAL] = PackedVector3Array([Vector3.BACK,Vector3.BACK,Vector3.BACK])
		arrays[Mesh.ARRAY_TEX_UV] = PackedVector2Array([Vector2(0,0),Vector2(1,0),Vector2(.5,1)])
		var mesh = ArrayMesh.new(); mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays)
		_part(mesh,pos,"pennant","pennant")

func _cart():
	_box(Vector3(0,.9,0),Vector3(2.6,.18,3.5),"wood")
	for x in [-1.25,1.25]:
		for y in [1.15,1.5]: _box(Vector3(x,y,0),Vector3(.12,.25,3.5),"wood")
		for z in [-1.2,1.2]:
			var wheel = CylinderMesh.new(); wheel.top_radius = .58; wheel.bottom_radius = .58; wheel.height = .14; wheel.radial_segments = 16; wheel.rings = 0
			_part(wheel,Vector3(x*1.2,.6,z),"wood","wheel",Basis(Vector3.BACK,PI/2))
			var rim = TorusMesh.new(); rim.inner_radius = .51; rim.outer_radius = .59; rim.rings = 20; rim.ring_segments = 6
			_part(rim,Vector3(x*1.2,.6,z),"iron","rim",Basis(Vector3.BACK,PI/2))
	for z in [-.8,.5]: _box(Vector3(0,1.3,z),Vector3(1.5,.7,1),"ochre")

func _well():
	_cylinder(Vector3(0,.55,0),1.7,1.1,"stone")
	_cylinder(Vector3(0,1.12,0),1.4,.05,"water")
	for x in [-1.4,1.4]: _box(Vector3(x,2.3,0),Vector3(.22,2.5,.22),"wood")
	_box(Vector3(0,3.5,0),Vector3(3.2,.22,.3),"wood")
	_box(Vector3(0,2.5,0),Vector3(.035,1.9,.035),"iron")
	_cylinder(Vector3(0,1.4,0),.28,.4,"wood")

func _surface(vertices: PackedVector3Array, material: String, uv: PackedVector2Array = PackedVector2Array()):
	if vertices.is_empty(): return
	var arrays = []; arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	if not uv.is_empty(): arrays[Mesh.ARRAY_TEX_UV] = uv
	var normals = PackedVector3Array(); normals.resize(vertices.size()); normals.fill(Vector3.UP)
	arrays[Mesh.ARRAY_NORMAL] = normals
	var mesh = ArrayMesh.new(); mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var node = MeshInstance3D.new(); node.mesh = mesh; node.material_override = materials[material]
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; add_child(node)

func _road(road: Dictionary):
	# Shared centerline stays walkable; only the soft shoulders vary in width.
	var vertices = PackedVector3Array(); var uv = PackedVector2Array()
	var points: Array = road.points
	var distance = 0.0
	for i in range(points.size()-1):
		var a = Vector2(points[i][0],points[i][1]); var b = Vector2(points[i+1][0],points[i+1][1])
		var direction = (b-a).normalized()
		var before = (a-Vector2(points[maxi(0,i-1)][0],points[maxi(0,i-1)][1])).normalized() if i > 0 else direction
		var after = (Vector2(points[mini(points.size()-1,i+2)][0],points[mini(points.size()-1,i+2)][1])-b).normalized() if i+2 < points.size() else direction
		var n0 = Vector2(-(before+direction).y,(before+direction).x).normalized()
		var n1 = Vector2(-(after+direction).y,(after+direction).x).normalized()
		var steps = maxi(1,ceili(a.distance_to(b)))
		for j in steps:
			var strip: Array[Vector2] = []
			for end in 2:
				var t = float(j+end)/steps; var center = a.lerp(b,t)
				var along = distance+a.distance_to(b)*t
				var width = float(road.width)*.5 + .35*sin(along*.63)+.18*sin(along*1.71)
				var normal = n0.lerp(n1,t).normalized()*width
				strip.append(center-normal); strip.append(center+normal)
			var middle = (strip[0]+strip[1]+strip[2]+strip[3])*.25
			var on_pier = false
			for pier in GameData.world.get("townPiers", []):
				if middle.x >= pier.x0 and middle.x <= pier.x1 and absf(middle.y-pier.z) <= pier.halfWidth: on_pier = true
			if on_pier: continue
			for k in [0,2,1,1,2,3]:
				var v = strip[k]; vertices.append(GameData.position_at(v.x,v.y)+Vector3.UP*.065)
				uv.append(Vector2(k%2,0))
		distance += a.distance_to(b)
	_surface(vertices,"dirt_road",uv)

func _district_ground(_town: Dictionary):
	# Natural terrain remains between houses; only the fountain has a stone apron.
	_cylinder(Vector3(0,.025,0),9,.05,"paving")

func _temple_terrace():
	for x in range(39,111,3):
		if x > 56 and x < 76: continue
		_box(Vector3(x,8,-44),Vector3(3,7.4,1.4),"stone")
		_box(Vector3(x,12,-44),Vector3(3.1,.5,1.8),"trim")
	for z in range(-40,-55,-2):
		var y = GameData.height_at(origin.x+66*orientation.x.length(),origin.z+z*orientation.z.length())
		_box(Vector3(66,y-.17,z),Vector3(11,.4,2),"stone")
	for x in [51,81]:
		for z in [-59,-72,-87]:
			_cylinder(Vector3(x,15,z),.55,6,"stone")
			_box(Vector3(x,18.3,z),Vector3(1.6,.6,1.6),"cream")
		_box(Vector3(x,18.8,-73),Vector3(1.6,.65,31),"stone")

func _hall(hall: Dictionary):
	var w = float(hall.w); var d = float(hall.d); var h = float(hall.h)
	architecture.house({"model":"SI_SH02","modelScale":1.6,"town":hall.get("town", ""),"x":hall.x,"z":hall.z,"w":w,"d":d,"h":h,"roof":"blue","variant":2 if hall.id == "guild" else 0})
	var label = Label3D.new(); label.text = hall.name; label.font_size = 40; label.pixel_size = .018
	label.position = origin + orientation*Vector3(0,5.3,d*.5+.3); label.modulate = Color("f6e2ac"); label.visibility_range_end = 90; add_child(label)
	if hall.id == "forge":
		_box(Vector3(-w*.36,h+3,0),Vector3(2.2,9,2.2),"stone")
		_barrel(Vector3(w*.35,0,d*.55))

func _harbor():
	# Деревянные причалы лежат на той же отметке, что и поверхность движения.
	var saved_origin = origin; var saved_orientation = orientation
	origin = Vector3.ZERO; orientation = Basis.IDENTITY
	for pier in GameData.world.get("townPiers", []):
		var count = ceili((pier.x1-pier.x0)/.8)
		var plank_width = (pier.x1-pier.x0)/count
		for i in count:
			_box(Vector3(pier.x0+(i+.5)*plank_width,pier.y-.125,pier.z),Vector3(plank_width+.01,.25,pier.halfWidth*2),"wood")
		for i in range(1,count,7):
			for side in [-1,1]: _cylinder(Vector3(pier.x0+i*plank_width,pier.y-3.3,pier.z+side*(pier.halfWidth-.2)),.2,7,"wood")
	origin = saved_origin; orientation = saved_orientation
	for z in range(-24,106,3):
		if absf(z-25)<5 or absf(z-50)<5 or absf(z-75)<5: continue
		var y = GameData.height_at(origin.x+114*orientation.x.length(),origin.z+z*orientation.z.length())
		_box(Vector3(114,y+.65,z),Vector3(.4,1.3,2.8),"stone")
	for z in [34,84]: _ship(Vector3(144,-6.1,z))
	for pos in [Vector3(101,-3,33),Vector3(101,-3,67),Vector3(97,-3,77)]: _barrel(pos)

func _ship(pos: Vector3):
	var outline = [Vector2(-2,-6),Vector2(2,-6),Vector2(3,2),Vector2(1.6,7),Vector2(0,9),Vector2(-1.6,7),Vector2(-3,2)]
	var vertices = PackedVector3Array()
	for i in outline.size():
		var a = outline[i]; var b = outline[(i+1)%outline.size()]
		var p = Vector3(a.x,.7,a.y); var q = Vector3(b.x,.7,b.y)
		var lowp = Vector3(a.x*.55,-1,a.y*.8); var lowq = Vector3(b.x*.55,-1,b.y*.8)
		for v in [p,q,lowp,q,lowq,lowp]: vertices.append(v)
	var mesh = ArrayMesh.new(); var arrays = []; arrays.resize(Mesh.ARRAY_MAX); arrays[Mesh.ARRAY_VERTEX] = vertices
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays)
	_part(mesh,pos,"wood","hull")
	_box(pos+Vector3(0,.6,0),Vector3(4.5,.18,11),"wood")
	_cylinder(pos+Vector3(0,6,0),.14,12,"wood")
	_box(pos+Vector3(0,10.7,0),Vector3(6.4,.12,.12),"wood")
	var sail = QuadMesh.new(); sail.size = Vector2(6,7)
	_part(sail,pos+Vector3(0,7,0),"pennant","sail")
