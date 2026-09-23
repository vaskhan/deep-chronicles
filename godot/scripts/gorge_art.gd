extends Node3D
## Декоративные сканы внутри существующих стен. Проходы и серверный рельеф не меняются.
const Art = preload("res://scripts/art_assets.gd")
var rng = RandomNumberGenerator.new()

func _at(u: float, s: float) -> Vector3:
 var g = GameData.world.gorge
 var v = s + 24.0*sin(u/440.0*PI*1.6)
 return GameData.position_at(g.origin.x+u*g.axis.x+v*g.axis.z,g.origin.z+u*g.axis.z-v*g.axis.x)

func build():
 name="GorgeArt"
 rng.seed=23092026
 _cliffs()
 _ferns()
 _boulders()

func _cliffs():
 var source=load("res://assets/gorge/coastal_cliff_02.glb").instantiate()
 var mesh_node=source.find_children("*","MeshInstance3D",true,false)[0]
 var mesh: Mesh=mesh_node.mesh
 var original: StandardMaterial3D=mesh.surface_get_material(0)
 var mat=ShaderMaterial.new(); mat.shader=preload("res://shaders/gorge_cliff.gdshader")
 mat.set_shader_parameter("stone",original.albedo_texture)
 mat.set_shader_parameter("stone_normal",original.normal_texture)
 mat.set_shader_parameter("stone_arm",original.roughness_texture)
 mat.set_shader_parameter("moss",load("res://assets/gorge/mossy_rock_diff.jpg"))
 var f=GameData.world.gorge.falls
 mat.set_shader_parameter("falls_position",Vector3(f.x,f.bottom,f.z))
 var placements: Array=[]
 for side in [-1,1]:
  for u in [12,65,118,171,224]:
   var w=lerpf(46,34,smoothstep(170,215,u))
   var floor_y=_at(u,0).y
   for tier in 2:
    var pos=_at(u+sin(u)*3,side*(w+12+tier*18))
    pos.y=floor_y-15+tier*35
    placements.append([pos,atan2(-side*.8,side*.6),Vector3(rng.randf_range(62,74),rng.randf_range(51,57),20.0)])
 # Низ уступа находится перед серверным обрывом, верх совпадает с кромкой.
 var pos=_at(196,-24); pos.y=float(f.bottom)-4.0
 placements.append([pos,atan2(-.6,-.8),Vector3(35,26,3)])
 for i in placements.size():
  var p=placements[i]
  var node=MeshInstance3D.new(); node.name="Cliff_%02d"%i
  node.mesh=mesh; node.material_override=mat
  var scale3=p[2]
  var basis=Basis(Vector3.UP,p[1]).scaled_local(scale3)
  node.transform=Transform3D(basis,p[0])
  node.visibility_range_end=Tuning.GORGE_CLIFF_RANGE
  node.visibility_range_end_margin=35
  add_child(node)
 source.free()

func _ferns():
 var source=load("res://assets/gorge/fern_02.glb").instantiate()
 var fern=source.find_children("*","MeshInstance3D",true,false)[0]
 var mesh: Mesh=fern.mesh
 var original: StandardMaterial3D=mesh.surface_get_material(0)
 var material=ShaderMaterial.new(); material.shader=preload("res://shaders/gorge_fern.gdshader")
 material.set_shader_parameter("leaf",original.albedo_texture)
 material.set_shader_parameter("leaf_normal",original.normal_texture)
 material.set_shader_parameter("fade_end",Tuning.GORGE_FERN_RANGE)
 var groups: Dictionary={}
 for i in Tuning.GORGE_FERN_COUNT:
  var cluster=i/16
  var u=fmod(float(cluster)*27.7,186.0)+rng.randf_range(-4,4)
  var s=(-32.0 if cluster%3==0 else (29.0 if cluster%3==1 else -8.0))+rng.randf_range(-4,4)
  if absf(s-(10-18*smoothstep(110,185,u)+3*sin(u*.04)))<4: continue
  var river=-20+3*sin(u*.045)
  if absf(s-river)<6: continue
  var pos=_at(u,s)
  if absf(GameData.height_at(pos.x+1,pos.z)-pos.y)>.6: continue
  if absf(GameData.height_at(pos.x,pos.z+1)-pos.y)>.6: continue
  var blocked=false
  for o in GameData.grid.get(Vector2i(floori(pos.x/24),floori(pos.z/24)),[]):
   if Vector2(pos.x-o.x,pos.z-o.z).length()<o.r+1: blocked=true; break
  if blocked: continue
  var key=Vector2i(floori(pos.x/32),floori(pos.z/32))
  if not groups.has(key): groups[key]=[]
  var scale3=Vector3.ONE*rng.randf_range(.35,.85)/maxf(mesh.get_aabb().size.y,.01)
  var basis=Basis(Vector3.UP,rng.randf()*TAU).scaled_local(scale3)
  var box=mesh.get_aabb()
  var offset=Vector3(-box.get_center().x,-box.position.y-.025,-box.get_center().z)
  groups[key].append(Transform3D(basis,pos+basis*offset))
 for key in groups:
  var mm=MultiMesh.new(); mm.transform_format=MultiMesh.TRANSFORM_3D
  mm.mesh=mesh; mm.instance_count=groups[key].size()
  var origin=Vector3(key.x*32,0,key.y*32)
  for i in mm.instance_count:
   var transform: Transform3D=groups[key][i]; transform.origin-=origin
   mm.set_instance_transform(i,transform)
  var node=MultiMeshInstance3D.new(); node.name="FernPatch"; node.position=origin
  node.multimesh=mm; node.material_override=material
  node.visibility_range_end=Tuning.GORGE_FERN_RANGE
  node.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
  node.extra_cull_margin=.3
  add_child(node)
 source.free()

## Камни с теми же CC0 UV, сгруппированные по ячейкам для отсечения.
## Крупные группы — у стен; в проходимом русле только низкие камни.
var bank_rocks: Array = []
func _boulders():
 var source=load("res://assets/gorge/moss_boulder.glb").instantiate()
 var box=Art.aabb(source)
 var placements: Array=[]
 for u in range(4,188,13):
  for side in [-1,1]:
   var centre=_at(u,side*rng.randf_range(34,39))
   for j in 3:
    var p=GameData.position_at(centre.x+rng.randf_range(-3,3),centre.z+rng.randf_range(-3,3))
    var size3=Vector3(rng.randf_range(2,4),rng.randf_range(.8,2.6),rng.randf_range(2,4))
    placements.append([p,size3,rng.randf()*TAU])
  var s=-20+3*sin(u*.045)
  for side in [-1,1]:
   var p=_at(u+rng.randf_range(-2,2),s+side*rng.randf_range(3.4,5.0))
   var size3=Vector3(rng.randf_range(1.0,2.0),rng.randf_range(.5,1.1),rng.randf_range(1.0,2.0))
   placements.append([p,size3,rng.randf()*TAU])
   bank_rocks.append(Vector4(p.x,p.y,p.z,maxf(size3.x,size3.z)*.6))
 # Плоские мшистые сканы — кочки, а не ещё один слой высокой травы.
 for i in 70:
  var u=rng.randf_range(-10,184); var s=rng.randf_range(-9,32)
  if absf(s-(10-18*smoothstep(110,185,u)+3*sin(u*.04)))<4: continue
  placements.append([_at(u,s),Vector3(rng.randf_range(.6,1.3),rng.randf_range(.12,.28),rng.randf_range(.6,1.3)),rng.randf()*TAU])
 for part in source.find_children("*","MeshInstance3D",true,false):
  var local=part.transform; var parent=part.get_parent()
  while parent != source and parent is Node3D:
   local=parent.transform*local; parent=parent.get_parent()
  var groups: Dictionary={}
  for p in placements:
   var scale3: Vector3=p[1]/box.size
   var basis=Basis(Vector3.UP,p[2]).scaled_local(scale3)
   var offset=Vector3(-box.get_center().x,-box.position.y,-box.get_center().z)
   var pos: Vector3=p[0]-Vector3.UP*p[1].y*.28
   var transform=Transform3D(basis,pos+basis*offset)*local
   var key=Vector2i(floori(pos.x/48),floori(pos.z/48))
   if not groups.has(key): groups[key]=[]
   groups[key].append(transform)
  var material=boulder_material(part.mesh.surface_get_material(0))
  for key in groups:
   var mm=MultiMesh.new(); mm.transform_format=MultiMesh.TRANSFORM_3D; mm.mesh=part.mesh; mm.instance_count=groups[key].size()
   var origin=Vector3(key.x*48,0,key.y*48)
   for i in mm.instance_count:
    var transform: Transform3D=groups[key][i]; transform.origin-=origin; mm.set_instance_transform(i,transform)
   var node=MultiMeshInstance3D.new(); node.name="BankStoneCluster"; node.position=origin; node.multimesh=mm
   node.material_override=material
   node.visibility_range_end=Tuning.GORGE_STONE_RANGE
   add_child(node)
 source.free()

static func boulder_material(original: StandardMaterial3D) -> ShaderMaterial:
 var mat=ShaderMaterial.new(); mat.shader=preload("res://shaders/gorge_boulder.gdshader")
 mat.set_shader_parameter("stone",original.albedo_texture)
 mat.set_shader_parameter("stone_normal",original.normal_texture)
 mat.set_shader_parameter("moss",load("res://assets/gorge/mossy_rock_diff.jpg"))
 return mat
