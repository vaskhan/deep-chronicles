extends SceneTree
func _initialize(): _run.call_deferred()
func _run():
 root.size=Vector2i(1440,900)
 var world=load("res://scenes/world.tscn").instantiate(); root.add_child(world); world.build()
 var data=root.get_node("GameData")
 var actor=load("res://scripts/actor.gd").new(); actor.kind="p";root.add_child(actor);actor.setup("warrior", "Герой · масштаб");actor.position=data.position_at(-476,347);actor.rotation.y=PI/2
 for entry in data.world.npcs:
  if entry.town!="harbor" or entry.role!="merchant":continue
  var npc=load("res://scripts/actor.gd").new();npc.kind="n";root.add_child(npc);npc.setup("merchant",entry.name)
  npc.position=data.position_at(entry.x,entry.z);npc.rotation.y=entry.get("rotation",0)
 var camera=Camera3D.new();root.add_child(camera);camera.current=true;camera.fov=65;camera.far=1800
 var out="/tmp/harbor-rebuild"
 for arg in OS.get_cmdline_user_args():
  if arg.begins_with("--output="): out=arg.trim_prefix("--output=")
 DirAccess.make_dir_recursive_absolute(out)
 for view in [["entrance",Vector3(-473.23,6,421.6),Vector3(-473.23,6,410.56)],["waterfront",Vector3(-304,21,478),Vector3(-363,0,438)],["pier",Vector3(-320,1,443),Vector3(-348,-1,440)],["overview",Vector3(-480,105,490),Vector3(-465,5,345)],["street",Vector3(-466,7,347),Vector3(-510,7,347)],["quarter",Vector3(-535,35,393),Vector3(-485,5,342)],["shops",Vector3(-451,12,403),Vector3(-474,8,414)],["interior",Vector3(-473.2,6.5,415.3),Vector3(-473.2,5.8,407.0)],["merchant",Vector3(-472,6.1,413),Vector3(-467.76,5.4,412)],["landscape",Vector3(-390,42,260),Vector3(-435,6,135)]]:
  camera.position=view[1];camera.look_at(view[2]);world.set_region(view[2])
  await create_timer(4).timeout
  await RenderingServer.frame_post_draw
  root.get_texture().get_image().save_png(out.path_join(view[0]+".png"))
  print("HARBOR_VIEW ",view[0])
 quit()
