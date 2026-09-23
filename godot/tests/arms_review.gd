extends SceneTree
func _initialize(): _run.call_deferred()
func _run():
 root.size=Vector2i(1440,900)
 var scene=Node3D.new();root.add_child(scene)
 var env=WorldEnvironment.new();env.environment=load("res://resources/daylight.tres");scene.add_child(env)
 var sun=DirectionalLight3D.new();sun.rotation_degrees=Vector3(-45,-25,0);sun.light_energy=1.2;scene.add_child(sun)
 var camera=Camera3D.new();scene.add_child(camera);camera.current=true;camera.projection=Camera3D.PROJECTION_ORTHOGONAL;camera.size=12
 camera.position=Vector3(0,4,13);camera.look_at(Vector3(0,1.5,0))
 var out="/tmp/arms-review";DirAccess.make_dir_recursive_absolute(out)
 for clip in ["idle","run","attack"]:
  var actors=[]
  for row in 3:
   for phase in 4:
    var actor=load("res://scripts/actor.gd").new();actor.kind="p";scene.add_child(actor);actor.setup(["warrior","warrior_chain","mage"][row],"");actor.set_process(false)
    actor.position=Vector3((phase-1.5)*2.8,0,(row-1)*-3.5);actor.rotation.y=.35
    actor.animator.play(clip,0);actor.animator.seek(actor.animator.get_animation(clip).length*(phase+.25)/4,true);actor.animator.advance(0);actor.animator.pause();actors.append(actor)
  await create_timer(.5).timeout
  await RenderingServer.frame_post_draw
  root.get_texture().get_image().save_png(out.path_join(clip+".png"))
  for actor in actors: actor.free()
 quit()
