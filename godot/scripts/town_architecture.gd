extends RefCounted
## Собственные модульные дома: объём, фасады и крыши создаются в метрах.
var b: Node3D
func _init(builder: Node3D):
	b = builder
	b._material("plaster_ivory",Color("afa080"))
	b._material("plaster_sage",Color("888773"))
	b._material("plaster_ochre",Color("a58c66"))
	b._material("plaster_rose",Color("9b806d"))
	b._material("timber",Color("342b24"))
	b._material("masonry",Color("807c6e"),"res://assets/materials/masonry_albedo.jpg")
	b._material("slate",Color("424c50"),"res://generated/tex/roof.png")
	b._material("tile",Color("774939"),"res://generated/tex/roof.png")
	b._material("glass",Color("202925"))
	var weather = load("res://shaders/aged_plaster.gdshader")
	for id in ["plaster_ivory","plaster_sage","plaster_ochre","plaster_rose"]:
		var material = ShaderMaterial.new(); material.shader = weather
		material.set_shader_parameter("base_color",b.materials[id].albedo_color)
		b.materials[id] = material
	b.materials.slate.cull_mode = BaseMaterial3D.CULL_DISABLED
	b.materials.tile.cull_mode = BaseMaterial3D.CULL_DISABLED

func beam(a: Vector3, c: Vector3, thickness: float, material = "timber"):
	var mesh = BoxMesh.new(); mesh.size = Vector3(thickness,thickness,a.distance_to(c))
	b._part(mesh,(a+c)*.5,material,"beam"+str(mesh.size),Basis.looking_at(c-a,Vector3.UP))

func roof(w: float, d: float, y: float, rise: float, material: String):
	var vertices = PackedVector3Array([
		Vector3(-w/2,y,-d/2),Vector3(0,y+rise,-d/2),Vector3(-w/2,y,d/2),
		Vector3(0,y+rise,-d/2),Vector3(0,y+rise,d/2),Vector3(-w/2,y,d/2),
		Vector3(0,y+rise,-d/2),Vector3(w/2,y,-d/2),Vector3(w/2,y,d/2),
		Vector3(0,y+rise,-d/2),Vector3(w/2,y,d/2),Vector3(0,y+rise,d/2),
		Vector3(-w/2,y,d/2),Vector3(0,y+rise,d/2),Vector3(w/2,y,d/2),
		Vector3(w/2,y,-d/2),Vector3(0,y+rise,-d/2),Vector3(-w/2,y,-d/2)])
	var normals = PackedVector3Array()
	for i in range(0,vertices.size(),3):
		var normal = -(vertices[i+1]-vertices[i]).cross(vertices[i+2]-vertices[i]).normalized()
		for j in 3: normals.append(normal)
	var arrays = []; arrays.resize(Mesh.ARRAY_MAX); arrays[Mesh.ARRAY_VERTEX] = vertices; arrays[Mesh.ARRAY_NORMAL] = normals
	var mesh = ArrayMesh.new(); mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays)
	b._part(mesh,Vector3.ZERO,material,"roof%s,%s,%s,%s"%[w,d,y,rise])
	beam(Vector3(0,y+rise,-d/2-.12),Vector3(0,y+rise,d/2+.12),.22)
	for z in [-d/2,d/2]:
		beam(Vector3(-w/2,y,z),Vector3(0,y+rise,z),.22)
		beam(Vector3(w/2,y,z),Vector3(0,y+rise,z),.22)

func window(x: float, y: float, z: float, shutters: bool, color: String):
	b._box(Vector3(x,y,z),Vector3(1.05,1.45,.18),"timber")
	b._box(Vector3(x,y,z+.09),Vector3(.8,1.18,.08),"glass")
	b._box(Vector3(x,y,z+.15),Vector3(.12,1.28,.09),"timber")
	b._box(Vector3(x,y,z+.15),Vector3(.86,.12,.09),"timber")
	b._box(Vector3(x,y-.8,z+.12),Vector3(1.35,.22,.45),"masonry")
	if shutters:
		for side in [-1,1]:
			b._box(Vector3(x+side*.79,y,z+.06),Vector3(.42,1.4,.18),color)
			for dy in [-.45,.45]: b._box(Vector3(x+side*.79,y+dy,z+.14),Vector3(.42,.12,.05),"timber")

func house(data: Dictionary):
	if data.get("town", "") == "harbor" and _local_house(data): return
	var w = float(data.w); var d = float(data.d); var h = float(data.h)
	var variant = int(data.get("variant",abs(int(data.x*3+data.z)))) % 4
	var plaster = ["plaster_ivory","plaster_sage","plaster_ochre","plaster_rose"][variant]
	var roof_material = "slate" if data.roof == "blue" else "tile"
	var floors = maxi(2,roundi(h/3.8)); var level = h/floors
	b._box(Vector3(0,.18,0),Vector3(w+.35,.36,d+.35),"masonry")
	b._box(Vector3(0,level/2,0),Vector3(w,level,d),"masonry")
	b._box(Vector3(0,(h+level)/2,0),Vector3(w+.18,h-level,d+.18),plaster)
	var original = b.orientation
	for side in 4:
		b.orientation = original * Basis(Vector3.UP,side*PI/2)
		var span = w if side%2==0 else d; var front = (d if side%2==0 else w)/2+.12
		for floor in range(1,floors+1):
			b._box(Vector3(0,floor*level,front),Vector3(span+.4,.32,.3),"timber")
		for x in [-span/2+.1,0,span/2-.1]:
			b._box(Vector3(x,(h+level)/2,front),Vector3(.32,h-level,.28),"timber")
		for floor in range(floors):
			for x in [-span*.25,span*.29]:
				if side == 2 and floor == 0: continue
				window(x,floor*level+level*.55,front+.04,floor>0,"green" if variant%2 else "burgundy")
		for course in 3:
			for stone in 5:
				var sx = -span*.4+stone*span*.2+(course%2)*.18
				b._box(Vector3(sx,.32+course*.42,front+.04),Vector3(span*.17,.34,.12),"masonry")
		if side%2==0:
			for sign in [-1,1]: beam(Vector3(sign*span*.39,level+.3,front+.15),Vector3(sign*(span/2-.3),2*level-.3,front+.15),.2)
		if side == 0:
			b._box(Vector3(0,1.45,front+.04),Vector3(1.8,2.9,.2),"timber")
			for x in [-.62,-.31,0,.31,.62]: b._box(Vector3(x,1.4,front+.18),Vector3(.24,2.65,.08),"wood")
			b._box(Vector3(.5,1.35,front+.25),Vector3(.1,.3,.1),"ochre")
			b._box(Vector3(0,.1,front+.5),Vector3(2.3,.2,1),"masonry")
			b._box(Vector3(0,3.2,front+.6),Vector3(2.8,.18,1.4),roof_material,.16)
			for x in [-1.1,1.1]: beam(Vector3(x,2.55,front+.05),Vector3(x,3.1,front+1.1),.12)
	b.orientation = original
	roof(w+1,d+1,h+.12,w*.52,roof_material)
	# Труба с оголовком и тёмным устьем.
	b._box(Vector3(w*.29,h+1.7,-d*.22),Vector3(1,4.6,1.15),"masonry")
	b._box(Vector3(w*.29,h+4.02,-d*.22),Vector3(1.3,.25,1.45),"masonry")
	b._box(Vector3(w*.29,h+4.16,-d*.22),Vector3(.7,.02,.85),"iron")
	# Разные силуэты: эркер, балкон или мансардное окно.
	if variant == 0:
		b._box(Vector3(w*.27,level*1.55,d/2+.6),Vector3(2.3,2.7,1.25),plaster)
		window(w*.27,level*1.6,d/2+1.25,false,"green")
		b._box(Vector3(w*.27,level*1.55+1.5,d/2+.6),Vector3(2.7,.2,1.5),roof_material)
	elif variant == 1:
		b._box(Vector3(0,level+.05,d/2+.65),Vector3(4,.2,1.5),"wood")
		for x in [-1.9,-1.3,-.65,0,.65,1.3,1.9]: b._box(Vector3(x,level+.65,d/2+1.35),Vector3(.09,1.2,.09),"timber")
		b._box(Vector3(0,level+1.2,d/2+1.35),Vector3(4,.12,.12),"timber")
	else:
		b._box(Vector3(0,h+1,d/2+.04),Vector3(1.9,1.7,.15),plaster)
		window(0,h+1,d/2+.15,false,"green")

# Optional reference kit. Missing files retain the distributable procedural town.
var _house_cache: Dictionary = {}
func _local_house(data: Dictionary) -> bool:
	var names = ["SI_H01", "SI_H02", "SI_H03", "SI_H04", "SI_SH01", "SI_SH02", "SI_SH03"]
	var id: String = str(data.get("model", names[posmod(int(data.x * 3 + data.z * 7), names.size())]))
	var path = "res://local_assets/l2-houses/%s.glb" % id
	if not ResourceLoader.exists(path): return false
	if not _house_cache.has(id):
		var source = load(path).instantiate()
		var parts: Array = []
		for part in preload("res://scripts/lod.gd").scene_parts(source):
			for surface in part.mesh.get_surface_count():
				var mesh = ArrayMesh.new()
				mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, part.mesh.surface_get_arrays(surface))
				var material = part.mesh.surface_get_material(surface)
				if material is BaseMaterial3D:
					material = material.duplicate()
					material.cull_mode = BaseMaterial3D.CULL_DISABLED
					material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
					material.roughness = .9
				var key = "local_house_%s_%s" % [id, parts.size()]
				b.materials[key] = material
				parts.append({"mesh":mesh, "transform":part.transform, "key":key})
		_house_cache[id] = {"box":preload("res://scripts/art_assets.gd").aabb(source), "parts":parts}
		source.free()
	# Closed ground floor and a stone plinth; imported exterior shells have no underside.
	b._box(Vector3(0, .12, 0), Vector3(_house_cache[id].box.size.x * float(data.get("modelScale",2.4)) / b.orientation.x.length(), .24, _house_cache[id].box.size.z * float(data.get("modelScale",2.4)) / b.orientation.z.length()), "masonry")
	var entry = _house_cache[id]
	var box: AABB = entry.box
	# Preserve source proportions: one scale for all three model axes.
	var factor = float(data.get("modelScale", 2.4))
	# Town plan scales horizontal coordinates by .8. Cancel that for the imported model.
	var basis = Basis.from_scale(Vector3(factor / b.orientation.x.length(), factor, factor / b.orientation.z.length()))
	var offset = Vector3(-box.get_center().x, -box.position.y, -box.get_center().z)
	var fit = Transform3D(basis, basis * offset)
	for part in entry.parts:
		var tr: Transform3D = fit * part.transform
		b._part(part.mesh, tr.origin, part.key, part.key, tr.basis)
	return true
