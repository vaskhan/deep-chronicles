extends SceneTree
func _initialize():_run.call_deferred()
func _run():
 root.size=Vector2i(1440,900)
 var data=root.get_node("GameData");var world=load("res://scenes/world.tscn").instantiate();root.add_child(world);world.build()
 var out="/tmp/town-walk"
 for arg in OS.get_cmdline_user_args():
  if arg.begins_with("--output="):out=arg.trim_prefix("--output=")
 DirAccess.make_dir_recursive_absolute(out)
 var actor=load("res://scripts/actor.gd").new();actor.kind="p";root.add_child(actor);actor.setup("warrior","Проверка пола")
 var camera=Camera3D.new();root.add_child(camera);camera.current=true;camera.fov=55
 for hall in data.world.townCivic:
  var f=float(hall.modelScale);var door=data.position_at(hall.x+.48*f,hall.z-7*hall.scale+2.6*f)
  world.set_region(door)
  for depth in [1.2,-.5,-3.5]:
   actor.position=data.position_at(door.x,door.z+depth)
   camera.position=door+Vector3(1.8,2.4,9);camera.look_at(actor.position+Vector3.UP*1.2)
   await create_timer(1).timeout;await RenderingServer.frame_post_draw
   root.get_texture().get_image().save_png(out.path_join(hall.id+"_"+str(depth)+".png"))
 print("TOWN_WALK_REVIEW_OK");quit()
