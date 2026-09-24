extends SceneTree
func _initialize():run.call_deferred()
func run():
 var data=root.get_node("GameData")
 var temple=data.world.townTemples.filter(func(t):return t.get("interior",false))[0]
 var f=float(temple.modelScale)
 var model=load("res://assets/town/houses/temple_complete.glb").instantiate();model.scale=Vector3.ONE*f;root.add_child(model)
 for mesh in model.find_children("*","MeshInstance3D",true,false):
  var body=StaticBody3D.new();mesh.add_child(body)
  var shape=CollisionShape3D.new();shape.shape=mesh.mesh.create_trimesh_shape();body.add_child(shape)
 await physics_frame;await physics_frame
 var checks=0;var headroom=INF;var floor_hits=0
 var temple_floor=data.world.townFloors.filter(func(p):return p.triangles=="templeFloorTriangles")[0]
 var start=data.position_at(temple.x,temple.z+9*f)
 var finish=data.position_at(temple.x,temple.z-1*f)
 for endpoints in [[start,finish],[finish,start]]:
  var pos:Vector3=endpoints[0];var target:Vector3=endpoints[1]
  for i in 500:
   var direction=target-pos;direction.y=0
   if direction.length()<.05:break
   pos=data.move(pos,direction.normalized(),minf(.1,direction.length()))
  if Vector2(pos.x-target.x,pos.z-target.z).length()>.15:
   push_error("Temple entrance is blocked: "+str(pos));quit(1);return
  checks+=1
 for i in 91:
  var z=(7.2-i*.1)*f
  for x in [-.55,0,.55]:
   var walk=data.height_at(temple.x+x,temple.z+z)-temple_floor.y
   var origin=Vector3(x,walk+.2,z)
   var down=root.world_3d.direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(origin,origin-Vector3.UP*.5))
   if not down.is_empty():
    if absf(down.position.y-walk)>.035:
     push_error("Temple floor height mismatch: "+str(Vector3(x,down.position.y-walk,z)));quit(1);return
    floor_hits+=1
   var up=root.world_3d.direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(origin,origin+Vector3.UP*15))
   if not up.is_empty():
    headroom=minf(headroom,up.position.y-walk)
    if up.position.y-walk<2.65:
     push_error("Temple doorway/ceiling too low: "+str(Vector3(x,up.position.y-walk,z)));quit(1);return
   checks+=1
 if floor_hits<100 or headroom==INF:
  push_error("Temple geometry coverage is incomplete");quit(1);return
 model.free()
 print("TEMPLE_ACCESS_OK checks=",checks," floor_samples=",floor_hits," headroom=",headroom)
 quit()
