extends Node3D
## Presentation only: all damage, cast times and skill permission come from the server.
const MAX_EFFECTS = 40
var active: Array = []
var casts: Dictionary = {}
var telegraphs: Dictionary = {}
var auras: Dictionary = {}
var counts: Dictionary = {}
var glow: GradientTexture2D

func _material(color: Color) -> StandardMaterial3D:
	var m = StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	m.cull_mode = BaseMaterial3D.CULL_DISABLED; m.albedo_color = color
	return m

func _mesh(parent: Node3D, mesh: Mesh, color: Color) -> MeshInstance3D:
	var node = MeshInstance3D.new(); node.mesh = mesh; node.material_override = _material(color)
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; parent.add_child(node); return node

func _orb(parent: Node3D, color: Color, radius: float) -> MeshInstance3D:
	if not glow:
		glow = GradientTexture2D.new(); glow.width = 64; glow.height = 64
		glow.fill = GradientTexture2D.FILL_RADIAL; glow.fill_from = Vector2(0.5, 0.5); glow.fill_to = Vector2(1, 0.5)
		glow.gradient = Gradient.new(); glow.gradient.colors = PackedColorArray([Color.WHITE, Color(1, 1, 1, 0.35), Color(1, 1, 1, 0)])
		glow.gradient.offsets = PackedFloat32Array([0, 0.35, 1])
	var mesh = QuadMesh.new(); mesh.size = Vector2.ONE * radius * 5
	var node = _mesh(parent, mesh, color)
	node.material_override.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	node.material_override.albedo_texture = glow
	return node

func _ring(parent: Node3D, color: Color, radius: float) -> MeshInstance3D:
	var mesh = TorusMesh.new(); mesh.inner_radius = radius; mesh.outer_radius = radius + 0.035; mesh.rings = 48; mesh.ring_segments = 6
	return _mesh(parent, mesh, color)

func _spawn(kind: String, pos: Vector3, duration: float) -> Dictionary:
	if active.size() >= MAX_EFFECTS:
		var old = active.pop_front(); _dispose(old)
	var node = Node3D.new(); node.name = "FX_" + kind; add_child(node); node.position = pos
	var fx = {"kind": kind, "node": node, "age": 0.0, "life": duration}
	active.append(fx); counts[kind] = int(counts.get(kind, 0)) + 1; return fx

func _dispose(fx: Dictionary):
	if fx.has("owner_id") and casts.get(fx.owner_id) == fx: casts.erase(fx.owner_id)
	if fx.has("owner_id") and telegraphs.get(fx.owner_id) == fx: telegraphs.erase(fx.owner_id)
	if fx.has("aura_key") and auras.get(fx.aura_key) == fx: auras.erase(fx.aura_key)
	if is_instance_valid(fx.node): fx.node.queue_free()

func stop_cast(actor):
	if not is_instance_valid(actor): return
	var id = actor.get_instance_id()
	if casts.has(id):
		var fx = casts[id]; active.erase(fx); _dispose(fx)

func stop_telegraph(actor):
	if not is_instance_valid(actor): return
	var id = actor.get_instance_id()
	if telegraphs.has(id):
		var fx = telegraphs[id]; active.erase(fx); _dispose(fx)

func telegraph(actor, attack: Dictionary, aimed_at_me: bool):
	stop_telegraph(actor)
	var pos = GameData.position_at(float(attack.x), float(attack.z))
	var fx = _spawn("telegraph", pos, float(attack.t) + 0.25)
	fx.actor = weakref(actor); fx.owner_id = actor.get_instance_id(); fx.fixed = true
	telegraphs[fx.owner_id] = fx
	fx.duration = float(attack.t)
	var mesh = ImmediateMesh.new()
	var color = Color(1, 0.28, 0.12, 0.36) if aimed_at_me else Color(0.94, 0.64, 0.22, 0.22)
	fx.sector = _mesh(fx.node, mesh, color)
	fx.sector.material_override.blend_mode = BaseMaterial3D.BLEND_MODE_MIX
	mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	var facing = float(attack.r); var arc = float(attack.arc); var reach = float(attack.reach)
	for i in 32:
		var a = facing - arc * 0.5 + arc * i / 32.0
		var b = facing - arc * 0.5 + arc * (i + 1) / 32.0
		for v in [Vector3.ZERO, Vector3(sin(a), 0, cos(a)) * reach, Vector3(sin(b), 0, cos(b)) * reach]:
			v.y = GameData.height_at(pos.x + v.x, pos.z + v.z) - pos.y + 0.12
			mesh.surface_add_vertex(v)
	mesh.surface_end()
	fx.warning = Label3D.new(); fx.warning.text = "!"; fx.warning.font_size = 58; fx.warning.pixel_size = 0.013
	fx.warning.billboard = BaseMaterial3D.BILLBOARD_ENABLED; fx.warning.modulate = Color("ffb77d")
	fx.warning.position.y = actor.label.position.y + 0.3; fx.node.add_child(fx.warning)

## Аура эффекта во времени: живёт, пока эффект активен. Урон, лечение и срок считает сервер,
## клиент только рисует. key — «объект:эффект», по нему аура и снимается при спаде.
func aura(actor, key: String, color: Color, duration: float):
	stop_aura(key)
	if not is_instance_valid(actor): return
	var fx = _spawn("aura", actor.global_position, clampf(duration, 0.35, 60.0))
	fx.actor = weakref(actor); fx.aura_key = key; auras[key] = fx
	fx.ring = _ring(fx.node, color, 0.7); fx.ring.position.y = 0.12
	fx.parts = []
	for i in 6:
		var mesh = PrismMesh.new(); mesh.size = Vector3(0.07, 0.24, 0.07)
		fx.parts.append(_mesh(fx.node, mesh, color.lightened(0.15)))

func stop_aura(key: String):
	if not auras.has(key): return
	var fx = auras[key]; active.erase(fx); _dispose(fx)

func begin_cast(actor, color: Color, duration: float):
	if not is_instance_valid(actor): return
	stop_cast(actor)
	var fx = _spawn("cast", actor.global_position, duration + 0.15)
	fx.actor = weakref(actor); fx.owner_id = actor.get_instance_id(); casts[fx.owner_id] = fx
	fx.ring = _ring(fx.node, color, 0.95); fx.ring.position.y = 0.13
	var inner = _ring(fx.ring, color.darkened(0.25), 0.7)
	inner.rotation.z = 0.02
	# Angular rune strokes are geometry, so no texture imports or camera-facing circles.
	for i in 8:
		var rune = PrismMesh.new(); rune.size = Vector3(0.1, 0.06, 0.2)
		var part = _mesh(fx.ring, rune, color)
		part.position = Vector3(cos(i * TAU / 8), 0.03, sin(i * TAU / 8)) * 1.18
		part.rotation.y = -i * TAU / 8
	fx.orbs = []
	for i in 5: fx.orbs.append(_orb(fx.node, color, 0.055 + i * 0.009))
	fx.focus = _orb(fx.node, color.lightened(0.6), 0.13)

func swing(actor, color = Color("ffe3a0"), restart = false):
	if not is_instance_valid(actor) or not is_instance_valid(actor.weapon_node): return
	# Start tracking during the windup; release events reuse the same trail.
	for existing in active.duplicate():
		if existing.kind == "swing" and existing.actor.get_ref() == actor:
			if not restart: return
			active.erase(existing); _dispose(existing)
	var fx = _spawn("swing", actor.global_position, maxf(actor.action_until + .15, .3))
	fx.actor = weakref(actor); fx.points = []
	fx.trail = _mesh(fx.node, ImmediateMesh.new(), color)

func projectile(actor, victim, color: Color):
	if not is_instance_valid(actor) or not is_instance_valid(victim): return
	var start = actor.cast_origin(); var end = victim.global_position + Vector3.UP
	var fx = _spawn("projectile", start, clampf(start.distance_to(end) / 65, 0.12, 0.42))
	fx.start = start; fx.end = end; fx.target = weakref(victim); fx.color = color
	fx.core = _orb(fx.node, color.lightened(0.5), 0.18)
	fx.tail = []
	for i in 7: fx.tail.append(_orb(fx.node, color, 0.15 * (1 - i / 8.0)))

func burst(pos: Vector3, color: Color, kind = "impact", radius = 1.0):
	var fx = _spawn(kind, pos, 0.42 if kind in ["impact", "critical"] else 0.9)
	fx.radius = radius; fx.parts = []; fx.directions = []
	fx.ring = _ring(fx.node, color, 0.45); fx.ring.position.y = 0.18
	var count = 12 if kind in ["impact", "critical"] else 18
	for i in count:
		var mesh = PrismMesh.new(); mesh.size = Vector3(0.06, 0.32 if kind == "frost" else 0.16, 0.07)
		var part = _mesh(fx.node, mesh, color.lightened(0.2))
		var angle = TAU * i / count
		fx.parts.append(part); fx.directions.append(Vector3(cos(angle), 0.4 + (i % 3) * 0.25, sin(angle)))

func _process(dt):
	for fx in active.duplicate():
		fx.age += dt
		var u = clampf(fx.age / fx.life, 0, 1)
		if fx.has("actor"):
			var actor = fx.actor.get_ref()
			if not is_instance_valid(actor) or actor.dead or not actor.visible:
				active.erase(fx); _dispose(fx); continue
			if not fx.get("fixed", false): fx.node.global_position = actor.global_position
		match fx.kind:
			"telegraph":
				fx.sector.material_override.albedo_color.a = 0.18 + minf(1, fx.age / fx.duration) * 0.28
				fx.warning.scale = Vector3.ONE * (1.0 + sin(fx.age * 16) * 0.08)
			"cast":
				var actor = fx.actor.get_ref()
				fx.ring.rotation.y = fx.age * 1.2
				fx.ring.scale = Vector3.ONE * (0.85 + u * 0.15)
				fx.focus.global_position = actor.cast_origin(); fx.focus.scale = Vector3.ONE * (0.5 + u * 1.2)
				for i in fx.orbs.size():
					var a = fx.age * 8 + i * TAU / 5
					fx.orbs[i].global_position = actor.cast_origin() + Vector3(cos(a), sin(a * 1.4) * 0.5, sin(a)) * (0.65 - u * 0.4)
			"swing":
				var actor = fx.actor.get_ref()
				if is_instance_valid(actor.weapon_node):
					var cutting = true
					if actor.animator and actor.animator.current_animation.begins_with("attack"):
						var phase = actor.animator.current_animation_position / actor.animator.current_animation_length
						cutting = phase >= .22 and phase <= .35
					elif actor.animator: cutting = false
					if not cutting:
						fx.points.clear(); fx.trail.mesh.clear_surfaces()
						if u >= 1: active.erase(fx); _dispose(fx)
						continue
					var weapon = actor.weapon_node
					fx.points.append([fx.node.to_local(weapon.to_global(Vector3(0, 0, 0.2))), fx.node.to_local(weapon.to_global(Vector3(0, 0, 1.2)))])
					if fx.points.size() > 5: fx.points.pop_front()
					var mesh: ImmediateMesh = fx.trail.mesh; mesh.clear_surfaces()
					if fx.points.size() > 1:
						mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
						for i in range(1, fx.points.size()):
							for v in [fx.points[i - 1][0], fx.points[i - 1][1], fx.points[i][1], fx.points[i - 1][0], fx.points[i][1], fx.points[i][0]]: mesh.surface_add_vertex(v)
						mesh.surface_end()
			"aura":
				fx.ring.rotation.y = fx.age * 2.0
				fx.ring.scale = Vector3.ONE * (0.92 + sin(fx.age * 4.0) * 0.07)
				for i in fx.parts.size():
					var a = fx.age * 2.6 + i * TAU / fx.parts.size()
					fx.parts[i].position = Vector3(cos(a) * 0.78, 0.35 + sin(fx.age * 4.0 + i) * 0.28, sin(a) * 0.78)
					fx.parts[i].rotation.y = -a
			"projectile":
				var victim = fx.target.get_ref()
				if is_instance_valid(victim): fx.end = victim.global_position + Vector3.UP
				fx.node.global_position = fx.start.lerp(fx.end, u)
				var back = (fx.start - fx.end).normalized()
				for i in fx.tail.size(): fx.tail[i].position = back * (i + 1) * 0.18
			_:
				fx.ring.mesh.inner_radius = 0.25 + u * fx.radius
				fx.ring.mesh.outer_radius = fx.ring.mesh.inner_radius + 0.06
				for i in fx.parts.size():
					var part = fx.parts[i]; var direction = fx.directions[i]
					if fx.kind == "heal":
						var a = TAU * i / fx.parts.size() + u * 4
						part.position = Vector3(cos(a) * 0.9, 0.3 + u * 2.8, sin(a) * 0.9)
					else: part.position = direction * u * fx.radius + Vector3.UP * (1 if fx.kind in ["impact", "critical"] else 0.15)
					part.rotation = Vector3(u * 2, i, u)
		if fx.kind == "aura":
			for mesh in fx.node.find_children("*", "MeshInstance3D", true, false): mesh.material_override.albedo_color.a = clampf((1.0 - u) * 4.0, 0.0, 1.0)
		elif fx.kind not in ["cast", "telegraph"]:
			for mesh in fx.node.find_children("*", "MeshInstance3D", true, false): mesh.material_override.albedo_color.a = 1.0 - u
		if u >= 1:
			active.erase(fx); _dispose(fx)
			if fx.kind == "projectile": burst(fx.end - Vector3.UP, fx.color, "impact", 1.4)

func clear():
	for fx in active: _dispose(fx)
	active.clear(); casts.clear(); telegraphs.clear(); auras.clear()
