extends SceneTree
func _initialize(): _run.call_deferred()
func _run():
 var data=root.get_node("GameData")
 var checks=0
 for shop in data.world.townShops+data.world.townCivic:
  if not shop.get("frontage",false):continue
  var f=float(shop.modelScale)
  var center=Vector3(shop.x,0,shop.z-7*shop.scale)
  var pos=data.position_at(center.x+.48*f,center.z+3.8*f)
  for target in [data.position_at(center.x+.48*f,center.z+1.5*f),data.position_at(center.x+shop.interior.customerX*f,center.z+1.5*f)]:
   for i in 200:
    var direction=target-pos;direction.y=0
    if direction.length()<.05:break
    pos=data.move(pos,direction.normalized(),minf(.1,direction.length()))
   if Vector2(pos.x-target.x,pos.z-target.z).length()>.15:
    push_error("Shop entrance/aisle blocked: "+shop.id);quit(1);return
   checks+=1
 var model=load("res://assets/town/houses/merchant_complete.glb").instantiate()
 var scale_factor=float(data.world.townShops.filter(func(s):return s.get("frontage",false))[0].modelScale)
 model.scale=Vector3.ONE*scale_factor;root.add_child(model)
 for mesh in model.find_children("*","MeshInstance3D",true,false):
  if not mesh.name.begins_with("SI_SH02") and not mesh.name.begins_with("bsp_"):continue
  var body=StaticBody3D.new();mesh.add_child(body)
  var shape=CollisionShape3D.new();shape.shape=mesh.mesh.create_trimesh_shape();body.add_child(shape)
 await physics_frame;await physics_frame
 var floor_y=.13175*scale_factor
 var lowest=INF
 var roof_hits=0
 for lateral in [-.6,0,.6]:
  for depth in 17:
   var from=Vector3(.48*scale_factor+lateral,floor_y+.15,(2.1+depth*.1)*scale_factor)
   var query=PhysicsRayQueryParameters3D.create(from,from+Vector3.UP*8)
   var hit=root.world_3d.direct_space_state.intersect_ray(query)
   if hit.is_empty():continue
   var clearance=hit.position.y-floor_y
   lowest=minf(lowest,clearance);roof_hits+=1
   if clearance<2.7:
    push_error("Shop doorway headroom insufficient: "+str(clearance));quit(1);return
   checks+=1
 if roof_hits<3:
  push_error("Doorway geometry was not measured");quit(1);return
 # Ground sits 8 cm below the interior floor; the source steps meet this ground.
 var ground=StaticBody3D.new();root.add_child(ground)
 var ground_shape=CollisionShape3D.new();var box=BoxShape3D.new();box.size=Vector3(60,.02,60);ground_shape.shape=box;ground.add_child(ground_shape)
 ground.position.y=floor_y-.09
 await physics_frame;await physics_frame
 var floor_hits=0
 for depth in 28:
  var from=Vector3(.48*scale_factor,floor_y+.35,(3.8-depth*.1)*scale_factor)
  var hit=root.world_3d.direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(from,from-Vector3.UP*.8))
  if hit.is_empty():continue
  var building=data.world.townShops.filter(func(s):return s.get("frontage",false))[0]
  var floor=data.world.townFloors.filter(func(p):return absf(p.x-building.x)<.01 and absf(p.z-(building.z-7*building.scale))<.01)[0]
  var walk=data.height_at(building.x+from.x,building.z-7*building.scale+from.z)-floor.y+floor_y
  if absf(hit.position.y-walk)>.025:
   push_error("Visible threshold/floor does not match the walking plane: "+str(hit.position.y-floor_y));quit(1);return
  floor_hits+=1;checks+=1
 if floor_hits<10:
  push_error("Too few actual floor samples");quit(1);return
 for building in data.world.townShops+data.world.townCivic:
  if not building.get("frontage",false):continue
  var f=float(building.modelScale)
  var floor=data.world.townFloors.filter(func(p):return absf(p.x-building.x)<.01 and absf(p.z-(building.z-7*building.scale))<.01)[0]
  for source_z in [3.6,2.7,2.5,2.1,1.5]:
   var x=building.x+.48*f;var z=building.z-7*building.scale+source_z*f
   if source_z<=2.5 and absf(data.height_at(x,z)-floor.y)>.01:
    push_error("Walking height differs from indoor floor: "+building.id);quit(1);return
   checks+=1
 print("SHOP_MIN_HEADROOM ",lowest)
 model.queue_free();ground.queue_free()
 print("SHOP_ACCESS_OK checks=",checks)
 quit()
