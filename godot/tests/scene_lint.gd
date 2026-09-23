extends Node
## Линтер сцены: ищет молчаливые ошибки графики, которые не роняют игру и не видны
## на скриншоте — вывернутые нормали, пропавший свет, пустые меши, потерянные
## материалы и объекты, провалившиеся под рельеф. Сервер и сеть не используются.
const WorldScene = preload("res://scenes/world.tscn")

var errors: Array[String] = []
var warnings: Array[String] = []
var counts := {"meshes": 0, "lights": 0, "surfaces": 0, "vertices": 0, "multimeshes": 0, "instances": 0}
## Общий меш множества MultiMesh (деревья, трава, уровни LOD) проверяется один раз.
var checked_meshes := {}
var strict = false
var world: Node3D

func _ready():
	strict = "--strict" in OS.get_cmdline_user_args()
	Engine.print_to_stdout = true
	world = WorldScene.instantiate()
	add_child(world)
	world.build()
	# Один кадр, чтобы отложенные ноды и материалы успели встать в дерево.
	await get_tree().process_frame
	await get_tree().process_frame
	_walk(world)
	_check_lighting()
	_check_ground_level()
	_report()

func _walk(node: Node):
	if node is MeshInstance3D: _check_mesh(node)
	if node is MultiMeshInstance3D: _check_multimesh(node)
	if node is GeometryInstance3D: _check_visibility_range(node)
	if node is Light3D: _check_light(node)
	if node is Node3D: _check_transform(node)
	for child in node.get_children(): _walk(child)

func _path(node: Node) -> String:
	return str(world.get_path_to(node))

func _check_transform(node: Node3D):
	var origin = node.global_transform.origin
	for axis in 3:
		if is_nan(origin[axis]) or is_inf(origin[axis]):
			errors.append("NaN/inf в позиции: " + _path(node)); return
	var scale = node.scale
	for axis in 3:
		if absf(scale[axis]) < 0.0001:
			errors.append("Нулевой масштаб по оси %d: %s" % [axis, _path(node)]); return
	if scale.x * scale.y * scale.z < 0.0:
		errors.append("Отрицательный масштаб выворачивает нормали: " + _path(node))

func _check_light(light: Light3D):
	counts.lights += 1
	if light.light_energy <= 0.0: warnings.append("Свет с нулевой энергией: " + _path(light))
	if light is OmniLight3D and light.omni_range <= 0.0: errors.append("Нулевой радиус OmniLight3D: " + _path(light))
	if light is SpotLight3D and light.spot_range <= 0.0: errors.append("Нулевой радиус SpotLight3D: " + _path(light))

func _check_mesh(instance: MeshInstance3D):
	var mesh := instance.mesh
	var path := _path(instance)
	if mesh == null:
		errors.append("MeshInstance3D без меша: " + path); return
	counts.meshes += 1
	var surfaces := mesh.get_surface_count()
	if surfaces == 0: errors.append("Меш без поверхностей: " + path); return
	var aabb := mesh.get_aabb()
	if aabb.size.length() <= 0.0001: errors.append("Пустой AABB у меша: " + path)
	for surface in surfaces:
		counts.surfaces += 1
		if instance.get_active_material(surface) == null:
			errors.append("Поверхность %d без материала: %s" % [surface, path])
		if mesh is ArrayMesh: _check_surface_arrays(mesh, surface, path)

## Инстансинг: пустой MultiMesh, меш без поверхностей или без материала не роняют игру,
## а просто не рисуются. Массивы общего меша проверяются теми же правилами, что у MeshInstance3D.
func _check_multimesh(instance: MultiMeshInstance3D):
	var path := _path(instance)
	var mm := instance.multimesh
	if mm == null: errors.append("MultiMeshInstance3D без MultiMesh: " + path); return
	counts.multimeshes += 1
	if mm.instance_count <= 0: errors.append("MultiMesh без экземпляров: " + path); return
	counts.instances += mm.instance_count if mm.visible_instance_count < 0 else mm.visible_instance_count
	var mesh := mm.mesh
	if mesh == null: errors.append("MultiMesh без меша: " + path); return
	if mesh.get_surface_count() == 0: errors.append("Меш MultiMesh без поверхностей: " + path); return
	# AABB самого MultiMesh считает сервер отрисовки (в headless он пуст) — проверяем меш.
	if mesh.get_aabb().size.length() <= 0.0001: errors.append("Пустой AABB у меша MultiMesh: " + path)
	for surface in mesh.get_surface_count():
		if instance.material_override == null and mesh.surface_get_material(surface) == null:
			errors.append("Поверхность %d MultiMesh без материала: %s" % [surface, path])
	var id := mesh.get_instance_id()
	if checked_meshes.has(id): return
	checked_meshes[id] = true
	for surface in mesh.get_surface_count():
		counts.surfaces += 1
		if mesh is ArrayMesh: _check_surface_arrays(mesh, surface, path)

## Уровни детализации: диапазон видимости с началом дальше конца прячет объект навсегда.
func _check_visibility_range(instance: GeometryInstance3D):
	if instance.visibility_range_end > 0.0 and instance.visibility_range_begin >= instance.visibility_range_end:
		errors.append("Пустой диапазон видимости %.0f..%.0f: %s" % [instance.visibility_range_begin, instance.visibility_range_end, _path(instance)])

func _check_surface_arrays(mesh: ArrayMesh, surface: int, path: String):
	var arrays := mesh.surface_get_arrays(surface)
	if arrays.is_empty(): return
	var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	var normals = arrays[Mesh.ARRAY_NORMAL]
	var indices = arrays[Mesh.ARRAY_INDEX]
	counts.vertices += vertices.size()
	if vertices.is_empty(): errors.append("Поверхность %d без вершин: %s" % [surface, path]); return
	if indices != null and indices.size() % 3 != 0:
		errors.append("Индексы поверхности %d не кратны трём: %s" % [surface, path])
	if normals == null or normals.is_empty():
		warnings.append("Поверхность %d без нормалей: %s" % [surface, path]); return
	var degenerate = 0
	for normal in normals:
		if normal.length_squared() < 0.9 or normal.length_squared() > 1.1: degenerate += 1
	if degenerate > 0:
		errors.append("Ненормализованных нормалей %d на поверхности %d: %s" % [degenerate, surface, path])
	if indices == null or indices.is_empty() or normals.size() != vertices.size(): return
	# Вывернутая геометрия: нормаль вершины смотрит против нормали её треугольника.
	var flipped = 0
	var triangles = 0
	for i in range(0, indices.size() - 2, 3):
		var a: Vector3 = vertices[indices[i]]
		var b: Vector3 = vertices[indices[i + 1]]
		var c: Vector3 = vertices[indices[i + 2]]
		# В Godot лицевая сторона обходится по часовой стрелке.
		var face := (c - a).cross(b - a)
		if face.length_squared() < 1e-12: continue
		triangles += 1
		var shading: Vector3 = normals[indices[i]] + normals[indices[i + 1]] + normals[indices[i + 2]]
		if face.normalized().dot(shading.normalized()) < -0.5: flipped += 1
	if triangles > 0 and flipped * 10 > triangles:
		errors.append("Вывернуто %d из %d треугольников на поверхности %d: %s" % [flipped, triangles, surface, path])

func _check_lighting():
	if counts.lights == 0: errors.append("В сцене нет ни одного источника света")
	var sun := world.get_node_or_null("Sun")
	if sun == null: errors.append("Нет направленного света Sun")
	elif sun is DirectionalLight3D:
		if sun.light_energy <= 0.0: errors.append("Sun выключен: нулевая энергия")
		# Солнце обязано светить сверху вниз, иначе рельеф освещён снизу.
		if (-sun.global_transform.basis.z).y > -0.1: errors.append("Sun светит не вниз: " + str(-sun.global_transform.basis.z))
	var environment := world.get_node_or_null("WorldEnvironment")
	if environment == null or environment.environment == null: errors.append("Нет WorldEnvironment с окружением")
	elif environment.environment.ambient_light_energy <= 0.0: warnings.append("Нулевой ambient: тени будут чёрными")

func _check_ground_level():
	# Свет и порталы, провалившиеся под рельеф, не видно в игре.
	for node in world.get_children():
		if not (node is Light3D or node is MeshInstance3D): continue
		var origin: Vector3 = node.global_transform.origin
		if absf(origin.x) > 1000.0 or absf(origin.z) > 1000.0: continue
		var ground: float = GameData.height_at(origin.x, origin.z)
		if origin.y < ground - 2.0:
			warnings.append("Под рельефом (%.1f < %.1f): %s" % [origin.y, ground, _path(node)])

func _report():
	for warning in warnings: print("SCENE_LINT_WARN: ", warning)
	for error in errors: print("SCENE_LINT_ERROR: ", error)
	var failures := errors.size() + (warnings.size() if strict else 0)
	print("SCENE_LINT ", JSON.stringify({
		"meshes": counts.meshes, "surfaces": counts.surfaces, "vertices": counts.vertices,
		"lights": counts.lights, "multimeshes": counts.multimeshes, "instances": counts.instances, "warnings": warnings.size(), "errors": errors.size(), "strict": strict,
	}))
	if failures == 0: print("SCENE_LINT_OK failures=0")
	else: print("SCENE_LINT_FAILED failures=", failures)
	get_tree().quit(0 if failures == 0 else 1)
