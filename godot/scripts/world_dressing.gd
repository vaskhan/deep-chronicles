extends Node3D
## Декоративный подлесок: детерминированные участки, без игровых коллизий.
const TILE = 48.0
const RADIUS = 2
var chunks: Dictionary = {}
var pending: Array[Vector2i] = []
var current = Vector2i(9999, 9999)
var meshes: Dictionary = {}
var material: ShaderMaterial
var patches = FastNoiseLite.new()
var tree_grid: Dictionary = {}
var shrubs: Dictionary = {}
var lod_split = 40.0

func _ready():
 patches.seed=34821; patches.frequency=.022; patches.fractal_octaves=3
 for row in GameData.world.get("modelPlacements",[]):
  if row[0] not in ["oak","pine"]: continue
  var cell=Vector2i(floori(row[1]/32.0),floori(row[3]/32.0))
  if not tree_grid.has(cell): tree_grid[cell]=[]
  tree_grid[cell].append(Vector2(row[1],row[3]))
 material = ShaderMaterial.new()
 material.shader = preload("res://shaders/field_foliage.gdshader")
 meshes.grass = _tuft(Color("709744"), false)
 meshes.dry = _tuft(Color("b7a366"), false)
 meshes.fern = _tuft(Color("3b8256"), true)
 meshes.gold = _flowers(Color("f3c64b"))
 meshes.blue = _flowers(Color("859fea"))
 meshes.pink = _flowers(Color("d779a2"))
 # Дальние участки — упрощённые кустики того же цвета и размера (в 3–5 раз меньше треугольников).
 meshes.grass_far = _tuft(Color("709744"), false, true)
 meshes.dry_far = _tuft(Color("b7a366"), false, true)
 meshes.fern_far = _tuft(Color("3b8256"), true, true)
 meshes.gold_far = _flowers(Color("f3c64b"), true)
 meshes.blue_far = _flowers(Color("859fea"), true)
 meshes.pink_far = _flowers(Color("d779a2"), true)
 lod_split = Tuning.UNDERSTORY_LOD_PC if preload("res://scripts/quality.gd").current == 1 else Tuning.UNDERSTORY_LOD_MOBILE
 _load_shrubs()
 _gardens()

func _process(_dt):
 var camera = get_viewport().get_camera_3d()
 if camera == null: return
 var p = camera.global_position
 if p.x > 2100:
  for node in chunks.values(): node.queue_free()
  chunks.clear(); pending.clear(); current = Vector2i(9999,9999)
  return
 var key = Vector2i(floori(p.x / TILE), floori(p.z / TILE))
 if key != current:
  current = key; pending.clear()
  for old in chunks.keys():
   if absi(old.x-key.x)>RADIUS or absi(old.y-key.y)>RADIUS:
    chunks[old].queue_free(); chunks.erase(old)
  for z in range(-RADIUS,RADIUS+1):
   for x in range(-RADIUS,RADIUS+1):
    var cell = key+Vector2i(x,z)
    if not chunks.has(cell): pending.append(cell)
  pending.sort_custom(func(a,b): return a.distance_squared_to(key)<b.distance_squared_to(key))
 # Не создавать весь подлесок в одном кадре при телепорте.
 for i in mini(1,pending.size()): _chunk(pending.pop_front())

func _chunk(key: Vector2i):
 var root = Node3D.new(); root.name = "Understory_%s_%s" % [key.x,key.y]
 root.position = Vector3(key.x*TILE,0,key.y*TILE); add_child(root); chunks[key] = root
 var rng = RandomNumberGenerator.new(); rng.seed = hash("landscape:%s:%s" % [key.x,key.y])
 var groups: Dictionary = {}
 for i in 1250:
  var p = GameData.position_at(root.position.x+rng.randf()*TILE,root.position.z+rng.randf()*TILE)
  if absf(p.x)>790 or absf(p.z)>790 or p.y < -5.6: continue
  var zone = GameData.zone_at(p)
  if p.y>(76.0 if zone.id=="gorge" else 65.0): continue
  if zone.get("town",false): continue
  if Vector2(p.x-150,p.z-250).length()<24: continue
  if absf(GameData.height_at(p.x+1,p.z)-p.y)>1.0 or absf(GameData.height_at(p.x,p.z+1)-p.y)>1.0: continue
  var blocked = false
  for o in GameData.grid.get(Vector2i(floori(p.x/24),floori(p.z/24)),[]):
   if Vector2(p.x-o.x,p.z-o.z).length()<o.r+.7: blocked=true; break
  if blocked: continue
  # Пятна вместо равномерной сетки, свободные просветы между куртинами.
  var patch = patches.get_noise_2d(p.x,p.z)
  if patch < -.22 or rng.randf() > .58+patch: continue
  var near_tree = 40.0
  var cell=Vector2i(floori(p.x/32.0),floori(p.z/32.0))
  for dz in range(-1,2):
   for dx in range(-1,2):
    for tree in tree_grid.get(cell+Vector2i(dx,dz),[]):
     near_tree=minf(near_tree,Vector2(p.x,p.z).distance_to(tree))
  var kind = "grass"
  if zone.id == "gorge":
   # Громовое ущелье: на мокрых террасах папоротник и трава, у водопада — редкий папоротник
   # в сырых нишах, на вершине — сухая трава клочьями между камней.
   var tier = str(GameData.gorge_tier(p).get("id","terraces"))
   if tier == "terraces":
    var g=GameData.world.gorge
    var delta=Vector2(p.x-g.origin.x,p.z-g.origin.z)
    var u=delta.dot(Vector2(g.axis.x,g.axis.z))
    var s=delta.dot(Vector2(g.axis.z,-g.axis.x))-24*sin(u/440.0*PI*1.6)
    var river=-20+3*sin(u*.045)
    var trail=10-18*smoothstep(110,185,u)+3*sin(u*.04)
    if absf(s-river)<7 or absf(s-trail)<3.6: continue
    if patch<-.04 or rng.randf()>.65: continue
    kind = "shrub_hazel" if patch>.12 and rng.randf()<.08 else "grass"
   elif tier == "falls":
    if rng.randf()>.45: continue
    kind = "fern" if rng.randf()<.7 else "grass"
   else:
    if rng.randf()>.3: continue
    kind = "dry"
  elif zone.id == "waste":
   if rng.randf()>.26: continue
   kind = "shrub_dry" if rng.randf()<.15 else "dry"
  elif zone.id == "forest":
   if near_tree<13 and rng.randf()<.16: kind = "shrub_hazel" if patch>0 else "shrub_wild"
   else: kind = "fern" if near_tree<10 and rng.randf()<.55 else "grass"
  elif patch>.12 and rng.randf()<.10: kind = "gold" if patches.get_noise_2d(p.x+400,p.z)>.05 else "blue"
  if zone.id == "meadow" and near_tree<12 and rng.randf()<.06: kind = "shrub_wild"
  var scale_value = rng.randf_range(.7,1.2)
  if not groups.has(kind): groups[kind]=[]
  groups[kind].append(Transform3D(Basis(Vector3.UP,rng.randf()*TAU).scaled(Vector3.ONE*scale_value),p-root.position-Vector3.UP*.04))
 for kind in groups: _batch(root,kind,groups[kind])

func _batch(parent: Node3D, kind: String, transforms: Array):
 if transforms.is_empty(): return
 if shrubs.has(kind):
  for part in shrubs[kind]:
   var placed: Array=[]
   for transform in transforms: placed.append(transform*part.transform)
   _make_batch(parent,part.mesh,part.material,placed)
 else:
  _make_batch(parent,meshes[kind],material,transforms,0.0,lod_split)
  _make_batch(parent,meshes[kind+"_far"],material,transforms,lod_split,190.0)

## begin/end — дальности по центру участка; ближний и дальний уровни делят их без зазора.
func _make_batch(parent: Node3D, mesh: Mesh, mat: Material, transforms: Array, begin := 0.0, end := 190.0):
 var mm = MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D
 mm.mesh = mesh; mm.instance_count = transforms.size()
 for i in transforms.size(): mm.set_instance_transform(i,transforms[i])
 var node = MultiMeshInstance3D.new(); node.multimesh=mm; node.material_override=mat
 node.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
 node.visibility_range_begin=begin; node.visibility_range_end=end; node.extra_cull_margin=2.0
 parent.add_child(node)

func _load_shrubs():
 for kind in ["shrub_hazel","shrub_wild","shrub_dry"]:
  var packed=load("res://assets/props/%s.glb" % kind) as PackedScene
  if packed == null: continue
  var source=packed.instantiate()
  var bounds=preload("res://scripts/art_assets.gd").aabb(source)
  var scale_value=.7/maxf(bounds.size.y,.01)
  var parts: Array=[]
  for node in source.find_children("*","MeshInstance3D",true,false):
   var local=node.transform; var ancestor=node.get_parent()
   while ancestor != source and ancestor is Node3D:
    local=ancestor.transform*local; ancestor=ancestor.get_parent()
   var transform=Transform3D(Basis.IDENTITY.scaled(Vector3.ONE*scale_value),Vector3.ZERO)*local
   for surface in node.mesh.get_surface_count():
    var st=SurfaceTool.new(); st.create_from(node.mesh,surface)
    var mesh=st.commit(); var original=node.mesh.surface_get_material(surface)
    var mat: Material=original
    if original is StandardMaterial3D and "foliage" in original.resource_name:
     var leaf=ShaderMaterial.new(); leaf.shader=preload("res://shaders/tree_leaf.gdshader")
     leaf.set_shader_parameter("leaf_texture",load("res://assets/terrain/pbr/elm-leaf.png")); leaf.set_shader_parameter("fade_end",95.0); mat=leaf
    parts.append({"mesh":mesh,"material":mat,"transform":transform})
  shrubs[kind]=parts; source.free()

func _gardens():
 # Заполняем уже существующие газоны; проходы и магазины остаются свободными.
 var rng = RandomNumberGenerator.new(); rng.seed=4172
 for town in GameData.world.towns:
  for side in [-18,18]:
   var root = Node3D.new(); root.position=GameData.position_at(town.x+side*town.scale,town.z+34*town.scale)+Vector3.UP*.12
   root.scale=Vector3(town.scale,1,town.scale)
   add_child(root)
   var grass: Array=[]; var flowers: Array=[]
   for i in 100:
    var p=Vector3(rng.randf_range(-7.3,7.3),0,rng.randf_range(-2.8,2.8))
    var transform=Transform3D(Basis(Vector3.UP,rng.randf()*TAU).scaled(Vector3.ONE*rng.randf_range(.6,.95)),p)
    if i%3==0: flowers.append(transform)
    else: grass.append(transform)
   _batch(root,"grass",grass); _batch(root,"pink" if side<0 else "gold",flowers)

func _vertex(st: SurfaceTool, p: Vector3, uv: Vector2, color: Color):
 st.set_color(color.srgb_to_linear()); st.set_uv(uv); st.add_vertex(p)

func _triangle(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, color: Color, tip: float = 1.0):
 _vertex(st,a,Vector2(0,0),color.darkened(.22))
 _vertex(st,b,Vector2(1,tip*.6),color)
 _vertex(st,c,Vector2(.5,tip),color.lightened(.08))

func _tuft(color: Color, fern: bool, low := false) -> ArrayMesh:
 var st=SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
 var rng=RandomNumberGenerator.new(); rng.seed=731 if fern else 123
 # Дальний вариант: вдвое меньше и шире травинки, два сегмента вместо пяти, меньше листочков.
 var segments = 2 if low else 5
 for blade in (6 if fern else (12 if low else 24)):
  var angle=blade*2.399+rng.randf()*.7
  var dir=Vector3(cos(angle),0,sin(angle)); var across=Vector3(-dir.z,0,dir.x)
  var base=dir*rng.randf_range(.03,.5)
  var height=rng.randf_range(.3,.75)*(1.35 if fern else 1.0)
  var width=.014 if fern else rng.randf_range(.012,.031)*(1.6 if low else 1.0)
  var c=color.darkened(rng.randf_range(0,.23))
  for segment in segments:
   var t=float(segment)/segments; var u=float(segment+1)/segments
   var a=base+dir*height*t*t*.75+Vector3.UP*height*sin(t*1.4)
   var b=base+dir*height*u*u*.75+Vector3.UP*height*sin(u*1.4)
   var aw=across*width*(1-t); var bw=across*width*(1-u)
   _vertex(st,a-aw,Vector2(0,t),c); _vertex(st,a+aw,Vector2(1,t),c); _vertex(st,b+bw,Vector2(1,u),c)
   _vertex(st,a-aw,Vector2(0,t),c); _vertex(st,b+bw,Vector2(1,u),c); _vertex(st,b-bw,Vector2(0,u),c)
  if fern:
   var leaflets=4 if low else 9
   for j in leaflets:
    var t=(j+1)/(leaflets+2.0)
    var center=base+dir*height*t*t*.75+Vector3.UP*height*sin(t*1.4)
    var leaf_size=sin(t*PI)*height*.32
    for sign_value in [-1,1]:
     var end=center+across*sign_value*leaf_size+dir*.055+Vector3.UP*.025
     var mid=center.lerp(end,.55)
     _triangle(st,center,mid-dir*.033,end,c,t)
     _triangle(st,center,end,mid+dir*.035,c,t)
 st.generate_normals(); return st.commit()

func _flowers(color: Color, low := false) -> ArrayMesh:
 var st=SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
 for f in 3:
  var angle=f*2.399; var base=Vector3(cos(angle)*.31,0,sin(angle)*.31)
  var top=base+Vector3(.07,.32+f*.055,.04)
  _triangle(st,base-Vector3(.008,0,0),base+Vector3(.008,0,0),top,Color("385b2b"))
  var petals=4 if low else 8
  for petal in petals:
   var a=petal*TAU/petals; var d=Vector3(cos(a),0,sin(a)); var side=Vector3(-d.z,0,d.x)
   var mid=top+d*.085+Vector3.UP*.012
   var tip=top+d*.14+Vector3.UP*.037
   _triangle(st,top,mid-side*.035,tip,color)
   _triangle(st,top,tip,mid+side*.035,color)
   if not low: _triangle(st,top+Vector3.UP*.015,top+d*.035+Vector3.UP*.019,top+d.rotated(Vector3.UP,TAU/8)*.035+Vector3.UP*.019,Color("bd8a26"))
  for side in [-1,1]:
   var stem=base+Vector3(0,.14,0)
   _triangle(st,stem,stem+Vector3(side*.15,.07,.018),stem+Vector3(side*.07,.075,-.025),Color("426b30"))
 st.generate_normals(); return st.commit()
