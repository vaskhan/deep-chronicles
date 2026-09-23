extends Node3D
## Громовое ущелье: река, водопад с уступа, бочаг, туман и брызги у подножия.
## Только вид: рельеф, стены-препятствия и стаи задаёт общий src/gorge.js через world.json.

var river_material: ShaderMaterial
var falls: Dictionary = {}
var bank_rocks: Array = []

func build():
	var info: Dictionary = GameData.world.get("gorge", {})
	if info.is_empty(): return
	name = "ThunderGorge"
	river_material = ShaderMaterial.new(); river_material.shader = preload("res://shaders/river_water.gdshader")
	falls = info.falls
	var art = preload("res://scripts/gorge_art.gd").new()
	add_child(art); art.build()
	bank_rocks = art.bank_rocks
	_river(info.river)
	_pool(info.pool)
	_waterfall(info.falls)
	_mist(info.falls, info.pool)
	add_child(preload("res://scripts/gorge_labels.gd").new())

## Треугольник с заданной лицевой стороной: линтер сцены проверяет, что нормали не вывернуты.
func _tri(st: SurfaceTool, verts: Array, normal: Vector3):
	var a: Dictionary = verts[0]; var b: Dictionary = verts[1]; var c: Dictionary = verts[2]
	if (c.p - a.p).cross(b.p - a.p).dot(normal) < 0.0:
		var t = b; b = c; c = t
	for v in [a, b, c]:
		st.set_normal(v.n); st.set_uv(v.uv); st.set_color(v.color); st.add_vertex(v.p)

## Единая индексированная сетка русла и бассейна. Шаг 1 м делит исходные
## треугольники земли (4 м), поэтому берег не прорезает воду по диагонали.
## COLOR: R — перекат, G — бассейн, B — пена у камня, A — глубина/мягкий берег.
func _river(rows: Array):
	var st = SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var vertices: Dictionary = {}
	var info = GameData.world.gorge
	var pool = info.pool
	var low = Vector2(INF,INF); var high = Vector2(-INF,-INF)
	for row in rows:
		low = low.min(Vector2(row[0],row[1])-Vector2.ONE*13)
		high = high.max(Vector2(row[0],row[1])+Vector2.ONE*13)
	for z in range(floori(low.y),ceili(high.y)):
		for x in range(floori(low.x),ceili(high.x)):
			var centre = _water_vertex(Vector2(x+.5,z+.5),rows,pool)
			if centre.is_empty(): continue
			var ids = []
			for corner in [Vector2i(x,z),Vector2i(x+1,z),Vector2i(x,z+1),Vector2i(x+1,z+1)]:
				if not vertices.has(corner):
					var v = _water_vertex(Vector2(corner),rows,pool,true)
					vertices[corner] = vertices.size()
					st.set_normal(Vector3.UP); st.set_uv(v.uv); st.set_color(v.color); st.add_vertex(v.p)
				ids.append(vertices[corner])
			for index in [0,1,2,1,3,2]: st.add_index(ids[index])
	var node = MeshInstance3D.new(); node.name = "River"; node.mesh = st.commit()
	node.material_override = river_material; node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(node)
	river_material.set_shader_parameter("pool_center",Vector2(pool.x,pool.z))

func _water_vertex(p: Vector2, rows: Array, pool: Dictionary, force = false) -> Dictionary:
	var g = GameData.world.gorge
	var d = p-Vector2(g.origin.x,g.origin.z)
	var u = d.dot(Vector2(g.axis.x,g.axis.z))
	var s = d.dot(Vector2(g.axis.z,-g.axis.x))-24.0*sin(u/440.0*PI*1.6)
	var river_s = -lerpf(20,13,smoothstep(200,300,u))+3*sin(u*.045)
	var bank = absf(s-river_s)
	var pd = p.distance_to(Vector2(pool.x,pool.z))
	if not force and (u < -34 or u > 304 or (u>193 and u<197) or (bank>6.5 and pd>float(pool.r)+1)): return {}
	# Продольная отметка из общего каталога; один уровень на поперечник.
	var fraction = clampf((u+34)/4.0,0,rows.size()-1.001)
	var i = int(fraction)
	var level = lerpf(rows[i][2],rows[i+1][2],fraction-i)
	var pool_weight = 1.0-smoothstep(float(pool.r)-2,float(pool.r)+1,pd)
	level = lerpf(level,float(pool.y),pool_weight)
	var ground = GameData.height_at(p.x,p.y)
	var depth = level-ground
	var coverage = smoothstep(-.08,.4,depth)*maxf(1-smoothstep(4.8,6.5,bank),pool_weight)
	coverage *= smoothstep(-34,-29,u)*(1-smoothstep(299,304,u))
	var foam = 0.0
	for rock in bank_rocks:
		var offset = p-Vector2(rock.x,rock.z)
		foam = maxf(foam,1-smoothstep(rock.w*.65,rock.w*1.6,offset.length()))
	return {"p":Vector3(p.x,maxf(level,ground+.025),p.y),"uv":Vector2((s-river_s)/10.0+.5,u/6.0),"color":Color(clampf(absf(rows[i+1][2]-rows[i][2])/4,0,1),pool_weight,foam,coverage)}

## Бассейн объединён с рекой, без наложенных друг на друга прозрачных поверхностей.
func _pool(_pool_info: Dictionary):
	var node = Node3D.new(); node.name = "FallsPool"; add_child(node)

## Водопад: плотное полотно с уступа и более широкая пелена брызг поверх него.
## Вода срывается с кромки и дугой уходит вниз по течению (к устью, против оси ущелья).
func _waterfall(info: Dictionary):
	var across = Vector3(info.ax, 0, info.az).normalized()
	var downstream = Vector3(-across.z, 0, across.x) # поперёк русла → вдоль оси
	var axis = Vector3(GameData.world.gorge.axis.x, 0, GameData.world.gorge.axis.z)
	if downstream.dot(axis) > 0.0: downstream = -downstream
	var lip = Vector3(info.x, float(info.top), info.z) + downstream * 1.2
	var height = float(info.top) - float(info.bottom)
	for layer in [{"width": float(info.width) * 1.15, "push": 2.8, "veil": 0.0, "name": "Waterfall"}, {"width": float(info.width) * 1.45, "push": 4.6, "veil": 1.0, "name": "WaterfallVeil"}, {"width": float(info.width)*.64, "push": 3.7, "veil": .45, "name": "WaterfallJets"}]:
		var st = SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
		var rows = 14; var cols = 8
		var grid = []
		for r in rows + 1:
			var t = float(r) / rows
			var line = []
			for c in cols + 1:
				var u = float(c) / cols
				var bulge = sin(u * PI) * 0.5
				var p = lip + Vector3.DOWN * height * t + downstream * (layer.push * sqrt(t) + bulge * (1.0 - t) + sin(u*PI*8.0+t*5.0)*.18*t) + across * (u - 0.5) * layer.width * (1.0 + t * 0.25)
				line.append({"p": p, "n": downstream, "uv": Vector2(u, t), "color": Color.WHITE})
			grid.append(line)
		for r in rows:
			for c in cols:
				_tri(st, [grid[r][c], grid[r][c + 1], grid[r + 1][c]], downstream)
				_tri(st, [grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]], downstream)
		var material = ShaderMaterial.new(); material.shader = preload("res://shaders/waterfall.gdshader")
		material.set_shader_parameter("veil", layer.veil)
		material.set_shader_parameter("speed",1.0+layer.push*.22)
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
		{"name": "FallsMist", "pos": base, "amount": 28, "life": 5.5, "box": Vector3(9, 1.2, 4), "vel": Vector2(1.0, 2.2), "size": Vector2(3.0, 6.0), "alpha": 0.18},
		{"name": "FallsSpray", "pos": base + Vector3.UP * 1.5, "amount": 64, "life": 1.6, "box": Vector3(6, 0.5, 2), "vel": Vector2(3.0, 6.5), "size": Vector2(.4, 1.4), "alpha": 0.18},
		{"name": "FallsLipSpray", "pos": top, "amount": 18, "life": 1.4, "box": Vector3(6, 0.2, 0.8), "vel": Vector2(0.6, 1.4), "size": Vector2(1.0, 2.2), "alpha": 0.07},
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
