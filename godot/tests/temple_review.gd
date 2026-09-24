extends SceneTree
func _initialize():run.call_deferred()
func run():
 root.size=Vector2i(1440,900)
 var data=root.get_node("GameData")
 var world=load("res://scenes/world.tscn").instantiate();root.add_child(world);world.build()
 var temple=data.world.townTemples.filter(func(t):return t.get("interior",false))[0]
 var center=data.position_at(temple.x,temple.z)
 var door=data.position_at(temple.x,temple.z+7.3*temple.modelScale)
 var actor=load("res://scripts/actor.gd").new();actor.kind="p";root.add_child(actor);actor.setup("warrior","Герой · рост 2,5 м");actor.position=door
 var priest=data.world.npcs.filter(func(n):return n.id=="harbor:priest")[0]
 var npc=load("res://scripts/actor.gd").new();npc.kind="n";root.add_child(npc);npc.setup("priest",priest.name);npc.position=data.position_at(priest.x,priest.z)
 var camera=Camera3D.new();root.add_child(camera);camera.current=true;camera.fov=55;camera.far=1500
 var stairs=data.world.townStairs
 var stair_mid=data.position_at(stairs[16].x,(stairs[16].z0+stairs[16].z1)*.5)
 var out="/tmp/temple-review"
 for arg in OS.get_cmdline_user_args():
  if arg.begins_with("--output="):out=arg.trim_prefix("--output=")
 DirAccess.make_dir_recursive_absolute(out)
 for view in [["stairs",stair_mid+Vector3(9,5,12),stair_mid+Vector3(0,2,-4)],["city",center+Vector3(38,26,48),center+Vector3(0,9,0)],["entrance",door+Vector3(4,3,12),door+Vector3(0,2.3,0)],["interior",center+Vector3(0,3,10),center+Vector3(0,3,-9)]]:
  if view[0]=="stairs":actor.position=stair_mid
  elif view[0]=="entrance":actor.position=door
  elif view[0]=="interior":actor.position=data.position_at(temple.x,temple.z+6)
  camera.position=view[1];camera.look_at(view[2]);world.set_region(center)
  await create_timer(3).timeout;await RenderingServer.frame_post_draw
  root.get_texture().get_image().save_png(out.path_join(view[0]+".png"))
 print("TEMPLE_REVIEW_OK")
 quit()
