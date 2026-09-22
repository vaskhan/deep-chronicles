extends SceneTree
## Обзорные кадры Громового ущелья без сервера: общий план с водопадом и три яруса.
## Godot --path godot --script res://tests/gorge_review.gd -- --test-mode --output=/tmp/gorge
var output = "/tmp/gorge"
func _initialize(): _run.call_deferred()
func _at(u: float, s: float) -> Vector2:
 # Та же ось, что в src/gorge.js::gorgeWorld (изгиб 24·sin).
 var g = root.get_node("GameData").world.gorge
 var v = s + 24.0 * sin(u / 440.0 * PI * 1.6)
 return Vector2(g.origin.x + u * g.axis.x + v * g.axis.z, g.origin.z + u * g.axis.z - v * g.axis.x)
func _run():
 for arg in OS.get_cmdline_user_args():
  if arg.begins_with("--output="): output=arg.trim_prefix("--output=")
 DirAccess.make_dir_recursive_absolute(output)
 var world=load("res://scenes/world.tscn").instantiate(); root.add_child(world); world.build()
 var data=root.get_node("GameData")
 var camera=Camera3D.new(); root.add_child(camera); camera.current=true; camera.fov=58; camera.far=1800
 var falls=data.world.gorge.falls
 var fall_foot=Vector3(falls.x,float(falls.bottom),falls.z)
 # [имя, точка взгляда (u,s), смещение камеры в осях ущелья (du, ds, dy)]
 var views=[
  ["overview",Vector2(200,-10),Vector3(-190,60,95)],
  ["falls",Vector2(195,-18),Vector3(-62,26,22)],
  ["terraces",Vector2(90,4),Vector3(-70,12,26)],
  ["grottos",Vector2(262,-4),Vector3(-58,-20,24)],
  ["summit",Vector2(430,0),Vector3(-80,30,30)],
 ]
 for view in views:
  var target2=_at(view[1].x,view[1].y)
  var eye2=_at(view[1].x+view[2].x,view[1].y+view[2].y)
  var target=data.position_at(target2.x,target2.y)
  if view[0]=="falls": target=fall_foot+Vector3.UP*9
  var eye=data.position_at(eye2.x,eye2.y)
  eye.y=maxf(eye.y,target.y)+view[2].z
  camera.position=eye; camera.look_at(target+Vector3.UP*1.5); world.set_region(target)
  await create_timer(3.0).timeout
  await RenderingServer.frame_post_draw
  root.get_texture().get_image().save_png(output.path_join("gorge-"+view[0]+".png"))
  print("GORGE_VIEW ",view[0]," draws=",Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
 quit()
