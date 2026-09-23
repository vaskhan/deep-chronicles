extends RefCounted
## Уровни детализации мира: только отрисовка, коллизии и данные сервера не затрагиваются.
##
## Повторяющиеся модели (деревья, камни, кусты, папоротники) раскладываются по ячейкам
## Tuning.LOD_CELL. Каждая ячейка — несколько MultiMeshInstance3D, по одному на уровень;
## движок показывает ровно один из них по расстоянию от камеры до центра AABB ячейки
## (visibility_range). Соседние уровни делят диапазон встык и без полей: движок применяет
## поле как гистерезис только к уже видимому узлу, и с полями ячейка на границе при первом
## кадре не показывала ни один уровень. Draw calls равны прежним — рисуется один уровень.
##
## Уровни берутся из LOD, которые Godot уже сгенерировал при импорте GLB: для каждой
## поверхности выбирается самый грубый уровень, где осталось не меньше заданной доли
## треугольников. Вершины уплотняются под новый индекс, чтобы грубый уровень не тащил
## в видеопамять полный вершинный буфер.
const Quality = preload("res://scripts/quality.gd")

static var _levels: Dictionary = {}

## Дальности уровней для текущего пресета качества: [{ratio, foliage, end}], последний — до end.
static func bands(kind: String, end: float) -> Array:
	var pc = Quality.current == Quality.PC
	var near: float; var far: float
	match kind:
		"tree":
			near = Tuning.LOD_TREE_NEAR_PC if pc else Tuning.LOD_TREE_NEAR_MOBILE
			far = Tuning.LOD_TREE_FAR_PC if pc else Tuning.LOD_TREE_FAR_MOBILE
		"small":
			near = Tuning.LOD_SMALL_NEAR_PC if pc else Tuning.LOD_SMALL_NEAR_MOBILE
			far = Tuning.LOD_SMALL_FAR_PC if pc else Tuning.LOD_SMALL_FAR_MOBILE
		_:
			near = Tuning.LOD_PROP_NEAR_PC if pc else Tuning.LOD_PROP_NEAR_MOBILE
			far = Tuning.LOD_PROP_FAR_PC if pc else Tuning.LOD_PROP_FAR_MOBILE
	var result = [{"ratio": 1.0, "end": minf(near, end)}]
	if near < end: result.append({"ratio": Tuning.LOD_MID_RATIO, "end": minf(far, end)})
	if far < end: result.append({"ratio": Tuning.LOD_FAR_RATIO, "foliage_ratio": Tuning.LOD_FAR_FOLIAGE_RATIO, "end": end})
	return result

## Меш из импортированных уровней LOD; ratio 1 — исходный меш без копирования.
static func level(mesh: Mesh, ratio: float) -> Mesh:
	if ratio >= 1.0 or not (mesh is ArrayMesh): return mesh
	var key = "%d:%.3f" % [mesh.get_instance_id(), ratio]
	if _levels.has(key): return _levels[key]
	var result = ArrayMesh.new(); result.resource_name = mesh.resource_name + "_lod"
	var reduced = false
	for surface in mesh.get_surface_count():
		var arrays = mesh.surface_get_arrays(surface)
		var info = RenderingServer.mesh_get_surface(mesh.get_rid(), surface)
		var full: int = info.get("index_count", 0)
		var chosen = PackedInt32Array()
		if full > 0:
			var width = int(info.index_data.size() / full)
			for lod in info.get("lods", []):
				var data: PackedByteArray = lod.index_data
				var count = int(data.size() / width)
				if count < full * ratio: break
				chosen = _decode(data, width)
		if chosen.is_empty():
			result.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
		else:
			# Сжатые атрибуты, как у импортированного GLB: иначе уровни LOD раздувают видеопамять.
			result.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, _compact(arrays, chosen), [], {}, Mesh.ARRAY_FLAG_COMPRESS_ATTRIBUTES); reduced = true
		result.surface_set_material(surface, mesh.surface_get_material(surface))
	if not reduced: result = mesh
	_levels[key] = result
	return result

static func _decode(data: PackedByteArray, width: int) -> PackedInt32Array:
	if width == 4: return data.to_int32_array()
	var out = PackedInt32Array(); out.resize(data.size() / 2)
	for i in out.size(): out[i] = data.decode_u16(i * 2)
	return out

## Оставляет только вершины, на которые ссылается новый индекс.
static func _compact(arrays: Array, indices: PackedInt32Array) -> Array:
	var remap: Dictionary = {}
	var order = PackedInt32Array()
	var index = PackedInt32Array(); index.resize(indices.size())
	for i in indices.size():
		var old = indices[i]
		if not remap.has(old):
			remap[old] = order.size(); order.append(old)
		index[i] = remap[old]
	var out = []; out.resize(Mesh.ARRAY_MAX)
	for slot in Mesh.ARRAY_MAX:
		var source = arrays[slot]
		if source == null or slot == Mesh.ARRAY_INDEX: continue
		var stride = 1
		if slot == Mesh.ARRAY_TANGENT: stride = 4
		elif slot in [Mesh.ARRAY_BONES, Mesh.ARRAY_WEIGHTS]: stride = int(source.size() / maxi(1, arrays[Mesh.ARRAY_VERTEX].size()))
		var copy = source.duplicate(); copy.resize(order.size() * stride)
		for i in order.size():
			for k in stride: copy[i * stride + k] = source[order[i] * stride + k]
		out[slot] = copy
	out[Mesh.ARRAY_INDEX] = index
	return out

## Раскладка модели по ячейкам и уровням.
## parts: [{mesh, transform, foliage}] — части модели в её пространстве;
## transforms: мировые трансформы экземпляров; band_list — из bands().
## Листва на среднем уровне не прореживается ниже Tuning.LOD_FOLIAGE_MIN_RATIO: вблизи поредевшая
## крона заметна; дальний уровень берёт свою долю листвы (foliage_ratio).
## Тени (options.shadow_lod) рисует отдельный узел «только тень» с более грубым уровнем: контур
## тени на земле почти не меняется, а каскады теней перерисовывают в разы меньше треугольников.
## ArrayMesh.shadow_mesh для этого не годится: движок берёт его только для непрозрачных
## стандартных материалов, а листва и сканы ущелья идут через собственные шейдеры.
static func place(parent: Node3D, node_name: String, parts: Array, transforms: Array, band_list: Array, options: Dictionary = {}) -> Array:
	var cells: Dictionary = {}
	var cell_size = float(options.get("cell", Tuning.LOD_CELL))
	for t in transforms:
		var key = Vector2i(floori(t.origin.x / cell_size), floori(t.origin.z / cell_size))
		if not cells.has(key): cells[key] = []
		cells[key].append(t)
	var nodes: Array = []
	for key in cells:
		var list: Array = cells[key]
		var centre = Vector3.ZERO
		for t in list: centre += t.origin
		centre /= list.size()
		for part in parts:
			var begin = 0.0
			var previous: Mesh = null
			var last_node: MultiMeshInstance3D = null
			var chain: Array = []
			for band in band_list:
				var ratio = band.ratio
				if part.get("foliage", false): ratio = band.get("foliage_ratio", maxf(band.ratio, Tuning.LOD_FOLIAGE_MIN_RATIO))
				chain.append(level(part.mesh, ratio))
			# Меш тени каждого уровня. Листва: ближний уровень отбрасывает тень средним, дальше —
			# своим (тень дальним мешем заметно редеет). Ствол и камень — самым грубым.
			var shadows: Array = chain.duplicate()
			if options.get("shadow_lod", false):
				var foliage = part.get("foliage", false)
				for i in range(mini(1, chain.size() - 1) if foliage else chain.size() - 1):
					shadows[i] = chain[i + 1] if foliage else chain[-1]
			for band_index in band_list.size():
				var band = band_list[band_index]
				var mesh = chain[band_index]
				if mesh == previous and last_node and shadows[band_index] == shadows[band_index - 1]:
					# Тот же меш на следующем уровне — продлеваем прежний узел, без лишнего объекта.
					last_node.visibility_range_end = band.end
					if last_node.has_meta("shadow_twin"): last_node.get_meta("shadow_twin").visibility_range_end = band.end
					begin = band.end; continue
				var node = _instance(parent, mesh, list, centre, part, options)
				# Уникальное читаемое имя: иначе движок называет повтор «@MultiMeshInstance3D@N».
				node.name = "%s_%d_%d_%d_%d" % [node_name, key.x, key.y, parts.find(part), band_index]
				node.visibility_range_begin = begin
				node.visibility_range_end = band.end
				nodes.append(node)
				var casts = options.get("shadow", GeometryInstance3D.SHADOW_CASTING_SETTING_ON) != GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
				if casts and shadows[band_index] != mesh:
					node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
					var twin = _instance(parent, shadows[band_index], list, centre, part, options)
					twin.name = node.name + "_shadow"
					twin.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY
					twin.visibility_range_begin = begin; twin.visibility_range_end = band.end
					node.set_meta("shadow_twin", twin)
				previous = mesh; last_node = node; begin = band.end
			# Поле только у дальнего края: там объект и раньше гас с тем же полем.
			if last_node:
				last_node.visibility_range_end_margin = float(options.get("end_margin", 0.0))
				if last_node.has_meta("shadow_twin"): last_node.get_meta("shadow_twin").visibility_range_end_margin = last_node.visibility_range_end_margin
	return nodes

static func _instance(parent: Node3D, mesh: Mesh, list: Array, centre: Vector3, part: Dictionary, options: Dictionary) -> MultiMeshInstance3D:
	var mm = MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = mesh; mm.instance_count = list.size()
	for i in list.size():
		var t: Transform3D = list[i] * part.get("transform", Transform3D.IDENTITY)
		t.origin -= centre
		mm.set_instance_transform(i, t)
	var node = MultiMeshInstance3D.new(); node.multimesh = mm
	node.position = centre
	if options.has("material"): node.material_override = options.material
	if options.has("shadow"): node.cast_shadow = options.shadow
	if options.has("cull_margin"): node.extra_cull_margin = options.cull_margin
	parent.add_child(node)
	return node

## Части сцены GLB с накопленными трансформами узлов (без корня).
static func scene_parts(source: Node3D) -> Array:
	var parts: Array = []
	for mesh in source.find_children("*", "MeshInstance3D", true, false):
		var local = mesh.transform; var parent = mesh.get_parent()
		while parent != source and parent is Node3D:
			local = parent.transform * local; parent = parent.get_parent()
		parts.append({"mesh": mesh.mesh, "transform": local, "node": mesh})
	return parts
