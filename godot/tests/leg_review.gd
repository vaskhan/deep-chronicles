extends SceneTree
## Frontal checks of the whole leg in both warrior outfits.
var failures = 0
const Art = preload("res://scripts/art_assets.gd")
func _initialize(): _run.call_deferred()
func _run():
 var scene = Node3D.new(); root.add_child(scene)
 var env = WorldEnvironment.new(); env.environment = load("res://resources/daylight.tres"); scene.add_child(env)
 var sun = DirectionalLight3D.new();sun.rotation_degrees = Vector3(-40,-25,0);scene.add_child(sun)
 var camera = Camera3D.new();scene.add_child(camera);camera.current = true
 camera.projection = Camera3D.PROJECTION_ORTHOGONAL;camera.size = 8.0
 camera.position = Vector3(0,1.5,8);camera.look_at(Vector3(0,1.2,0))
 for outfit in ["warrior", "warrior_chain"]:
  var actors = []
  var rest = Art.actor(outfit); _check_axes(rest, outfit); rest.free()
  for i in 5:
   var actor = Art.actor(outfit);scene.add_child(actor);actors.append(actor)
   actor.position += Vector3((i-2)*1.55,0,0)
   var player = actor.find_child("AnimationPlayer",true,false)
   var clip = "idle" if i==0 else "run"
   player.play(clip, 0);player.seek(player.get_animation(clip).length*(i-1)*.25 if i>0 else .2,true)
   player.advance(0);player.pause()
  if DisplayServer.get_name() != "headless":
   for rear in [false, true]:
    camera.position.z = -8 if rear else 8; camera.look_at(Vector3(0,1.2,0))
    await create_timer(.2).timeout
    await RenderingServer.frame_post_draw
    root.get_texture().get_image().save_png("/tmp/legs-"+outfit+("-rear" if rear else "")+".png")
  for actor in actors:actor.free()
 print("LEG_ALIGNMENT failures=", failures)
 quit(0 if failures == 0 else 1)

## The mesh, not just bones: catch lateral kinks left by calf-only warps.
func _check_axes(actor, outfit):
 for mesh in actor.find_children("*", "MeshInstance3D", true, false):
  if not mesh.skin: continue
  for surface in mesh.mesh.get_surface_count():
   var arrays = mesh.mesh.surface_get_arrays(surface)
   var vertices = arrays[Mesh.ARRAY_VERTEX]
   for side in [-1, 1]:
    for height in [.16,.24,.32,.40,.48,.56,.64,.72]:
     var xs = []
     for point in vertices:
      if point.x*side > 0 and absf(point.y-height)<.018: xs.append(point.x*side)
     if xs.size()<10: continue
     xs.sort()
     var center = (xs[int(xs.size()*.1)]+xs[int(xs.size()*.9)])*.5
     if absf(center-.089) > .035:
      failures += 1; push_error("%s leg axis at %.2f: %.3f" % [outfit,height,center])
