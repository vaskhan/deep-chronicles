extends Node3D
## Громовое ущелье: река, водопад с уступа, бочаг, туман и брызги у подножия.
## Только вид: рельеф, стены-препятствия и стаи задаёт общий src/gorge.js через world.json.

var river_material: ShaderMaterial
var falls: Dictionary = {}

func build():
	var info: Dictionary = GameData.world.get("gorge", {})
	if info.is_empty(): return
	name = "ThunderGorge"
	river_material = ShaderMaterial.new(); river_material.shader = preload("res://shaders/river_water.gdshader")
	falls = info.falls
	_river(info.river)
	_pool(info.pool)
	_waterfall(info.falls)
	_mist(info.falls, info.pool)
	var art = preload("res://scripts/gorge_art.gd").new()
	add_child(art); art.build()

## Треугольник с заданной лицевой стороной: линтер сцены проверяет, что нормали не вывернуты.
func _tri(st: SurfaceTool, verts: Array, normal: Vector3):
	var a: Dictionary = verts[0]; var b: Dictionary = verts[1]; var c: Dictionary = verts[2]
	if (c.p - a.p).cross(b.p - a.p).dot(normal) < 0.0:
		var t = b; b = c; c = t
	for v in [a, b, c]:
		st.set_normal(v.n); st.set_uv(v.uv); st.set_color(v.color); st.add_vertex(v.p)

## Русло: лента воды по точкам из src/world-core.js::gorgeOutline. Отвес водопада рисуется отдельно.
func _river(rows: Array):
	var st = SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var travelled = 0.0
	for i in range(rows.size() - 1):
		var a = rows[i]; var b = rows[i + 1]
		var drop = float(b[2]) - float(a[2])
		var run = Vector2(b[0] - a[0], b[1] - a[1]).length()
		if absf(drop) > 3.0: travelled += run; continue
		var steep = clampf(absf(drop) / maxf(run, 0.1), 0.0, 1.0)
		for step in 4:
			var quad = []
			for end in [step,step+1]:
				var t = float(end)/4.0
				var centre = Vector3(lerpf(a[0],b[0],t),0,lerpf(a[1],b[1],t))
				centre.y = GameData.height_at(centre.x,centre.z)+0.42
				var across = Vector3(lerpf(a[3],b[3],t),0,lerpf(a[4],b[4],t))*0.52
				for side in [0,1]:
					var p = centre+across*(1.0-2.0*side)
					quad.append({"p":p,"n":Vector3.UP,"uv":Vector2(side,(travelled+run*t)/6.0),"color":Color(steep,0,0)})
			_tri(st,[quad[0],quad[1],quad[2]],Vector3.UP)
			_tri(st,[quad[1],quad[3],quad[2]],Vector3.UP)
		travelled += run
	var node = MeshInstance3D.new(); node.name = "River"; node.mesh = st.commit()
	node.material_override = river_material; node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(node)

## Бочаг: круглая взбитая вода, в которую бьёт водопад.
func _pool(pool: Dictionary):
	var material: ShaderMaterial = river_material.duplicate()
	material.set_shader_parameter("radial", true)
	var st = SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var centre = Vector3(pool.x, float(pool.y), pool.z); var segments = 28
	for i in segments:
		var a0 = TAU * i / segments; var a1 = TAU * (i + 1) / segments
		var verts = [{"p": centre, "uv": Vector2(0.5, 0.5)}]
		for angle in [a0, a1]:
			var offset = Vector3(cos(angle), 0, sin(angle)) * float(pool.r)
			verts.append({"p": centre + offset, "uv": Vector2(0.5 + cos(angle) * 0.5, 0.5 + sin(angle) * 0.5)})
		for v in verts: v.n = Vector3.UP; v.color = Color(0.9, 0, 0)
		_tri(st, verts, Vector3.UP)
	var node = MeshInstance3D.new(); node.name = "FallsPool"; node.mesh = st.commit()
	node.material_override = material; node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(node)

## Водопад: плотное полотно с уступа и более широкая пелена брызг поверх него.
## Вода срывается с кромки и дугой уходит вниз по течению (к устью, против оси ущелья).
func _waterfall(info: Dictionary):
	var across = Vector3(info.ax, 0, info.az).normalized()
	var downstream = Vector3(-across.z, 0, across.x) # поперёк русла → вдоль оси
	var axis = Vector3(GameData.world.gorge.axis.x, 0, GameData.world.gorge.axis.z)
	if downstream.dot(axis) > 0.0: downstream = -downstream
	var lip = Vector3(info.x, float(info.top), info.z) + downstream * 1.2
	var height = float(info.top) - float(info.bottom)
	for layer in [{"width": float(info.width) * 1.15, "push": 3.2, "veil": 0.0, "name": "Waterfall"}, {"width": float(info.width) * 1.45, "push": 4.4, "veil": 1.0, "name": "WaterfallVeil"}]:
		var st = SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
		var rows = 14; var cols = 8
		var grid = []
		for r in rows + 1:
			var t = float(r) / rows
			var line = []
			for c in cols + 1:
				var u = float(c) / cols
				var bulge = sin(u * PI) * 0.5
				var p = lip + Vector3.DOWN * height * t + downstream * (layer.push * pow(t, 1.4) + bulge * (1.0 - t)) + across * (u - 0.5) * layer.width * (1.0 + t * 0.25)
				line.append({"p": p, "n": downstream, "uv": Vector2(u, t), "color": Color.WHITE})
			grid.append(line)
		for r in rows:
			for c in cols:
				_tri(st, [grid[r][c], grid[r][c + 1], grid[r + 1][c]], downstream)
				_tri(st, [grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]], downstream)
		var material = ShaderMaterial.new(); material.shader = preload("res://shaders/waterfall.gdshader")
		material.set_shader_parameter("veil", layer.veil)
		material.render_priority = 1 if layer.veil > 0.0 else 0
		st.generate_tangents()
		var node = MeshInstance3D.new(); node.name = layer.name; node.mesh = st.commit()
		node.material_override = material; node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(node)
	falls.downstream = downstream; falls.across = across

## Туман и брызги: клубы у подножия поднимаются и сносятся по течению, мелкая пыль у кромки.
func _mist(info: Dictionary, pool: Dictionary):
	var base = Vector3(info.x, float(info.bottom) + 1.0, info.z) + falls.downstream * 3.0
	var top = Vector3(info.x, float(info.top), info.z) + falls.downstream * 1.5
	for cfg in [
		{"name": "FallsMist", "pos": base, "amount": 60, "life": 5.5, "box": Vector3(9, 1.2, 4), "vel": Vector2(1.0, 2.2), "size": Vector2(6.0, 12.0), "alpha": 0.055},
		{"name": "FallsSpray", "pos": base + Vector3.UP * 1.5, "amount": 120, "life": 1.6, "box": Vector3(6, 0.5, 2), "vel": Vector2(3.0, 6.5), "size": Vector2(1.4, 3.2), "alpha": 0.10},
		{"name": "FallsLipSpray", "pos": top, "amount": 30, "life": 1.4, "box": Vector3(6, 0.2, 0.8), "vel": Vector2(0.6, 1.4), "size": Vector2(1.0, 2.2), "alpha": 0.07},
	]:
		var particles = GPUParticles3D.new(); particles.name = cfg.name
		particles.amount = cfg.amount; particles.lifetime = cfg.life; particles.preprocess = cfg.life
		particles.position = cfg.pos; particles.visibility_aabb = AABB(Vector3(-30, -10, -30), Vector3(60, 40, 60))
		particles.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var process = ParticleProcessMaterial.new()
		process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
		process.emission_box_extents = cfg.box
		process.direction = Vector3(falls.downstream.x * 0.6, 1.0, falls.downstream.z * 0.6)
		process.spread = 35.0
		process.initial_velocity_min = cfg.vel.x; process.initial_velocity_max = cfg.vel.y
		process.gravity = Vector3(0, -1.2, 0) if cfg.name != "FallsMist" else Vector3(0, 0.15, 0)
		process.damping_min = 0.4; process.damping_max = 1.2
		process.scale_min = cfg.size.x; process.scale_max = cfg.size.y
		var curve = Curve.new(); curve.add_point(Vector2(0, 0.45)); curve.add_point(Vector2(0.4, 1.0)); curve.add_point(Vector2(1, 1.3))
		var scale_curve = CurveTexture.new(); scale_curve.curve = curve; process.scale_curve = scale_curve
		var ramp = Gradient.new(); ramp.set_color(0, Color(1, 1, 1, 0.0)); ramp.set_color(1, Color(1, 1, 1, 0.0))
		ramp.add_point(0.2, Color(1, 1, 1, 1.0)); ramp.add_point(0.7, Color(1, 1, 1, 0.7))
		var ramp_texture = GradientTexture1D.new(); ramp_texture.gradient = ramp; process.color_ramp = ramp_texture
		particles.process_material = process
		var quad = QuadMesh.new(); quad.size = Vector2.ONE
		var material = ShaderMaterial.new(); material.shader = preload("res://shaders/mist.gdshader")
		material.set_shader_parameter("tint", Color(0.9, 0.95, 0.97, cfg.alpha))
		quad.material = material
		particles.draw_pass_1 = quad
		add_child(particles)
