extends SceneTree
## Front/back closeups expose knee alignment and equipment floating above hands.
func _initialize(): _run.call_deferred()
func _run():
 var Actor=load('res://scripts/actor.gd')
 var scene=Node3D.new();root.add_child(scene)
 var env=WorldEnvironment.new();env.environment=load('res://resources/daylight.tres');scene.add_child(env)
 var sun=DirectionalLight3D.new();sun.rotation_degrees=Vector3(-40,-25,0);scene.add_child(sun)
 var cam=Camera3D.new();scene.add_child(cam);cam.current=true;cam.projection=Camera3D.PROJECTION_ORTHOGONAL
 for model in ['warrior','warrior_chain']:
  var actor=Actor.new();actor.kind='p';scene.add_child(actor);actor.setup(model,'');actor.set_process(false)
  for clip in ['run','idle','attack']:
   actor.animator.play(clip,0);actor.animator.seek(.23,true);actor.animator.advance(0);actor.animator.pause()
   await create_timer(.15).timeout
   for rear in [false,true]:
    if clip=='attack':
     var wrist=actor.weapon_node.get_parent().get_parent().global_position
     cam.size=.65;cam.position=wrist+Vector3(0,.1,2 if not rear else -2);cam.look_at(wrist)
    else:
     cam.size=1.8 if clip=='run' else 3.4
     cam.position=Vector3(0,1.25,5 if not rear else -5);cam.look_at(Vector3(0,1.25,0))
    await RenderingServer.frame_post_draw
    root.get_texture().get_image().save_png('/tmp/pose-'+model+'-'+clip+('-rear' if rear else '-front')+'.png')
  actor.free()
 quit()
