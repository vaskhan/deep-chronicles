extends SceneTree
## Equipped weapon poses across the attack, including the impact frame.
func _initialize(): _run.call_deferred()
func _run():
 var Actor = load("res://scripts/actor.gd")
 var scene = Node3D.new();root.add_child(scene)
 var env = WorldEnvironment.new();env.environment = load("res://resources/daylight.tres");scene.add_child(env)
 var sun = DirectionalLight3D.new();sun.rotation_degrees = Vector3(-40,-25,0);scene.add_child(sun)
 var camera = Camera3D.new();scene.add_child(camera);camera.current = true
 camera.projection = Camera3D.PROJECTION_ORTHOGONAL;camera.size = 10
 camera.position = Vector3(0,3,10);camera.look_at(Vector3(0,1.3,0))
 for model in ["warrior", "mage"]:
  var actors = []
  for i in 5:
   var actor = Actor.new();actor.kind="p";scene.add_child(actor)
   actor.setup(model, "");actor.position=Vector3((i-2)*2.0,0,0);actor.set_process(false);actors.append(actor)
   actor.begin_attack(1.47,.81)
   actor.animator.play("attack", 0)
   actor.animator.seek(actor.animator.get_animation("attack").length*i*.2,true)
   actor.animator.advance(0);actor.animator.pause()
  await create_timer(.3).timeout
  await RenderingServer.frame_post_draw
  root.get_texture().get_image().save_png("/tmp/attack-"+model+".png")
  for actor in actors: actor.free()
 quit()
