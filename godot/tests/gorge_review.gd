extends SceneTree
## Обзорные кадры Громового ущелья без сервера: общий план с водопадом и три яруса.
## Godot --path godot --script res://tests/gorge_review.gd -- --test-mode --output=/tmp/gorge
var output = "/tmp/gorge"
var measurements: Array = []
func _initialize(): _run.call_deferred()
func _at(u: float, s: float) -> Vector2:
 # Та же ось, что в src/gorge.js::gorgeWorld (изгиб 24·sin).
 var g = root.get_node("GameData").world.gorge
 var v = s + 24.0 * sin(u / 440.0 * PI * 1.6)
 return Vector2(g.origin.x + u * g.axis.x + v * g.axis.z, g.origin.z + u * g.axis.z - v * g.axis.x)
func _run():
 for arg in OS.get_cmdline_user_args():
  if arg.begins_with("--output="): output=arg.trim_prefix("--output=")
 DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
 root.size = Vector2i(1280,800)
 RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
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
  ["bank",Vector2(175,-4),Vector3(-16,8,3)],
 ]
 for view in views:
  var target2=_at(view[1].x,view[1].y)
  var eye2=_at(view[1].x+view[2].x,view[1].y+view[2].y)
  var target=data.position_at(target2.x,target2.y)
  if view[0] in ["falls","bank"]: target=fall_foot+Vector3.UP*9
  var eye=data.position_at(eye2.x,eye2.y)
  eye.y=(eye.y if view[0]=="bank" else maxf(eye.y,target.y))+view[2].z
  camera.position=eye; camera.look_at(target+Vector3.UP*1.5); world.set_region(target)
  await create_timer(3.0).timeout
  var frames: Array = []
  var gpu_total = 0.0
  var cpu_total = 0.0
  var last = Time.get_ticks_usec()
  for sample in 180:
   await process_frame
   gpu_total += RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid())
   cpu_total += RenderingServer.viewport_get_measured_render_time_cpu(root.get_viewport_rid())
   var now = Time.get_ticks_usec()
   frames.append(float(now-last)/1000.0); last=now
  frames.sort()
  var total = 0.0
  for ms in frames: total += ms
  var result = {"view":view[0], "fps":180000.0/total, "gpu_ms":gpu_total/180.0 if gpu_total>0.0 else null, "render_cpu_ms":cpu_total/180.0, "median_ms":frames[90], "p95_ms":frames[171], "draw_calls":Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME), "primitives":Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME)}
  measurements.append(result)
  print("GORGE_BENCH ", JSON.stringify(result))
  await RenderingServer.frame_post_draw
  root.get_texture().get_image().save_png(output.path_join("gorge-"+view[0]+".png"))
  print("GORGE_VIEW ",view[0]," draws=",Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
 var report = FileAccess.open(output.path_join("performance.json"),FileAccess.WRITE)
 report.store_string(JSON.stringify({"renderer":RenderingServer.get_current_rendering_method(),"adapter":RenderingServer.get_video_adapter_name(),"resolution":[1280,800],"vsync":false,"samples":180,"views":measurements},"  "))
 quit()
