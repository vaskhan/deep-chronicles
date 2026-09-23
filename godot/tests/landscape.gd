extends SceneTree
## Воспроизводимые обзорные кадры окружения без подключения к серверу.
var output = "/tmp/landscape"
func _initialize(): _run.call_deferred()
func _run():
 for arg in OS.get_cmdline_user_args():
  if arg.begins_with("--output="): output=arg.trim_prefix("--output=")
 DirAccess.make_dir_recursive_absolute(output)
 var world=load("res://scenes/world.tscn").instantiate(); root.add_child(world); world.build()
 var data=root.get_node("GameData")
 var camera=Camera3D.new(); root.add_child(camera); camera.current=true; camera.fov=58; camera.far=root.get_node("Tuning").CAMERA_FAR
 var views=[
  ["horizon",Vector2(-180,80),Vector3(0,48,400)],
  ["meadow",Vector2(-245,165),Vector3(24,12,26)],
  ["forest",Vector2(-20,55),Vector3(22,11,27)],
  ["waste",Vector2(300,-160),Vector3(23,12,30)],
  ["harbor",Vector2(-330,435),Vector3(-25,16,36)],
  ["gardens",Vector2(-444.4,427.2),Vector3(22,14,26)],
  ["town",Vector2(-430,400),Vector3(95,100,110)],
  ["street",Vector2(-486,355),Vector3(14,8,18)],
  ["crypt",Vector2(2233,-150),Vector3(18,18,22)]
 ]
 for view in views:
  var p=data.position_at(view[1].x,view[1].y)
  camera.position=p+view[2]; camera.look_at(p+Vector3.UP*1.5); world.set_region(p)
  await create_timer(2.5).timeout
  for child in world.get_children():
   if child.get_script() != null and child.get_script().resource_path == "res://scripts/world_dressing.gd":
    if child.chunks.size()>81 or (view[0]=="crypt" and not child.chunks.is_empty()):
     push_error("Подлесок не освободил удалённые участки"); quit(1); return
  await RenderingServer.frame_post_draw
  root.get_texture().get_image().save_png(output.path_join(view[0]+".png"))
  print("LANDSCAPE ",view[0]," draws=",Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
 quit()
