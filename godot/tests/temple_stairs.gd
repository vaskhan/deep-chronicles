extends SceneTree
func _initialize():run.call_deferred()
func run():
 var data=root.get_node("GameData")
 var town=data.world.towns.filter(func(t):return t.id=="harbor")[0]
 var decor=load("res://scripts/town_decor.gd").new();root.add_child(decor)
 decor._material("stone",Color.WHITE);decor._material("trim",Color.WHITE)
 decor.origin=Vector3(town.x,0,town.z);decor.orientation=Basis.IDENTITY.scaled(Vector3(town.scale,1,town.scale))
 decor._temple_terrace()
 var treads=[]
 for group in decor.groups.values():
  if not group.mesh is BoxMesh or absf(group.mesh.size.z-.45)>.001:continue
  for transform in group.transforms:
   var pose:Transform3D=transform;pose.origin+=group.anchor
   var body=StaticBody3D.new();root.add_child(body);body.transform=pose
   var shape=CollisionShape3D.new();shape.shape=group.mesh.create_trimesh_shape();body.add_child(shape)
   treads.append(pose*group.mesh.get_aabb())
 if treads.size()!=32:
  push_error("Expected 32 real temple stair treads");quit(1);return
 await physics_frame;await physics_frame
 var checks=0
 for tread in treads:
  var center:Vector3=tread.get_center();var top:float=tread.end.y
  for offset in [-4.39,-3.7,0,3.7,4.39]:
   for dz in [-.18,0,.18]:
    var p=Vector3(center.x+offset,top+.2,center.z+dz)
    var hit=root.world_3d.direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(p,p-Vector3.UP*.5))
    if hit.is_empty() or absf(hit.position.y-data.height_at(p.x,p.z))>.015:
     push_error("Stair tread and walking height disagree: "+str(p));quit(1);return
    if data.terrain_height_at(p.x,p.z)>top+.015:
     push_error("Terrain protrudes through temple stairs: "+str(p));quit(1);return
    if tread.position.y>data.terrain_height_at(p.x,p.z)-.15:
     push_error("Stair masonry floats above the ground: "+str(p));quit(1);return
    checks+=1
 var stairs=data.world.townStairs
 var first=stairs[0];var last=stairs[-1]
 var lower=data.position_at(first.x,first.z1+.6)
 var upper=data.position_at(last.x,last.z0-.6)
 for route in [[lower,upper],[upper,lower]]:
  var pos:Vector3=route[0];var target:Vector3=route[1]
  for i in 500:
   var d=target-pos;d.y=0
   if d.length()<.04:break
   var next=data.move(pos,d.normalized(),minf(.05,d.length()))
   if absf(next.y-pos.y)>.3:
    push_error("Stair route has an excessive height jump: "+str(next-pos));quit(1);return
   pos=next;checks+=1
  if Vector2(pos.x-target.x,pos.z-target.z).length()>.1:
   push_error("Temple stair route is obstructed: "+str(pos)+" target="+str(target));quit(1);return
 print("TEMPLE_STAIRS_OK checks=",checks)
 quit()
