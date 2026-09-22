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
  var u=rng.randf_range(0,190)
  var s=rng.randf_range(-38,35)
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
  var scale3=Vector3.ONE*rng.randf_range(1.4,2.5)
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
