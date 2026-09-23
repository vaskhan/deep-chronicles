extends SceneTree
## Material comparison stand in the actual world. Gameplay/HUD captures use smoke --gorge-bench.
const Art = preload("res://scripts/art_assets.gd")
var output = "/tmp/model-style"
var actors: Array = []
func _initialize(): _run.call_deferred()
func _run():
 for arg in OS.get_cmdline_user_args():
  if arg.begins_with("--output="): output = arg.trim_prefix("--output=")
 DirAccess.make_dir_recursive_absolute(output)
 root.size = Vector2i(1280,800)
 var data = root.get_node("GameData")
 var world = load("res://scenes/world.tscn").instantiate(); root.add_child(world); world.build()
 var camera = Camera3D.new(); root.add_child(camera); camera.current = true; camera.fov = 55
 var axis = Vector3(float(data.world.gorge.axis.x),0,float(data.world.gorge.axis.z))
 var across = Vector3(axis.z,0,-axis.x)
 var caption = Label.new(); caption.position = Vector2(20,18); caption.text = "Стенд материалов · реальное окружение · без симуляции боя"; root.add_child(caption)
 var Actor = load("res://scripts/actor.gd")
 var views = [
  ["heroes-fang-waterfall", "gorge7", ["warrior", "mage", "fang_warrior", "fang_shaman"], 18.0],
  ["heroes-outpost-summit", "gorge19", ["warrior", "mage", "outpost_guard"], 16.0],
  ["spider-rocks", "gorge0", ["cliff_spider", "warrior"], 14.0],
  ["fang-warrior-close-rocks", "gorge7", ["fang_warrior"], 8.0],
  ["fang-shaman-close-rocks", "gorge7", ["fang_shaman"], 8.0],
  ["outpost-close-rocks", "gorge19", ["outpost_guard"], 8.0],
  ["hero-warrior-close-rocks", "gorge7", ["warrior"], 7.0],
  ["hero-mage-close-rocks", "gorge7", ["mage"], 7.0],
 ]
 for view in views:
  for actor in actors: actor.free()
  actors.clear()
  var spawn = data.world.spawns.filter(func(s): return s.get("pack", "") == view[1])[0]
  var center = data.position_at(spawn.x,spawn.z)-axis*5.0
  center = data.position_at(center.x,center.z)
  var eye = center-axis*view[3]+across*view[3]*.23+Vector3.UP*view[3]*.48
  camera.position = eye; camera.look_at(center+Vector3.UP*1.5); world.set_region(center)
  for i in view[2].size():
   var id = view[2][i]; var actor = Actor.new(); actor.kind = "m" if id not in ["warrior","mage"] else "p"
   root.add_child(actor); actor.setup(id,{"warrior":"Воин", "mage":"Маг", "fang_warrior":"Воин Клыка", "fang_shaman":"Шаман Клыка", "outpost_guard":"Страж заставы", "cliff_spider":"Скальный паук"}[id])
   var p = center+across*(i-(view[2].size()-1)*.5)*3.5
   actor.position = data.position_at(p.x,p.z); actor.rotation.y = atan2((eye-p).x,(eye-p).z)
   actors.append(actor); actor.set_process(false)
   actor.animator.play("idle");actor.animator.seek(.3,true);actor.animator.advance(0);actor.animator.pause()
  await create_timer(2).timeout
  await RenderingServer.frame_post_draw
  root.get_texture().get_image().save_png(output.path_join(view[0]+".png"))
  print("STYLE_REVIEW ",view[0])
 if "--hold" not in OS.get_cmdline_user_args(): quit()
