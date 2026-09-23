extends SceneTree
## Dedicated regression: canonical clips, transformed poses, server-driven stone shield.
const Art = preload("res://scripts/art_assets.gd")
var failures = 0
var output = "/tmp/gorge-models"
var before = false
func check(ok: bool, message: String):
 if not ok:
  failures += 1
  push_error(message)
func _initialize(): _run.call_deferred()
func _run():
 for arg in OS.get_cmdline_user_args():
  if arg.begins_with("--output="): output = arg.trim_prefix("--output=")
 before = "--before" in OS.get_cmdline_user_args()
 if before:
  for pair in [["fang_warrior","orc",3.3,"d0a27a"],["fang_shaman","orc",3.0,"b884a8"],["stone_guard","golem",4.6,"a9bcc6"]]:
   Art.manifest().actors[pair[0]] = {"base":pair[1],"height":pair[2],"tint":pair[3]}
 DirAccess.make_dir_recursive_absolute(output)
 root.size = Vector2i(1280,800)
 var scene = Node3D.new(); root.add_child(scene)
 var env = WorldEnvironment.new(); env.environment = load("res://resources/daylight.tres"); scene.add_child(env)
 var sun = DirectionalLight3D.new(); sun.rotation_degrees = Vector3(-45,-30,0); sun.light_energy = 1.1; sun.shadow_enabled = true; scene.add_child(sun)
 var ground = MeshInstance3D.new(); ground.mesh = PlaneMesh.new(); ground.mesh.size = Vector2(60,60)
 var material = StandardMaterial3D.new(); material.albedo_color = Color("626c60"); ground.material_override = material; scene.add_child(ground)
 var camera = Camera3D.new(); scene.add_child(camera); camera.current = true; camera.fov = 42
 var Actor = load("res://scripts/actor.gd")
 var titles = {"fang_warrior":"Воин племени Клыка", "fang_shaman":"Шаман племени Клыка", "stone_guard":"Каменный страж"}
 for id in titles:
  var actor = Actor.new(); actor.kind = "m"; scene.add_child(actor); actor.setup(id,titles[id]); actor.set_process(false)
  check(actor.art_model, id+": real model")
  if not before: check(not Art.entry_of(id).has("base"), id+": distinct source")
  var skeleton: Skeleton3D = actor.model.find_child("Skeleton3D",true,false)
  check(skeleton != null, id+": skeleton")
  var box = actor.model.transform * Art.aabb(actor.model)
  check(absf(box.size.y - float(Art.entry_of(id).height)) < .01, id+": height")
  camera.position = Vector3(2.8,3.5,7.3) * (box.size.y/3.3); camera.look_at(Vector3(0,box.size.y*.49,0))
  for clip in ["idle","walk","run","attack","cast","hit","death"]:
   check(actor.animator.has_animation(clip),id+": "+clip)
   if not actor.animator.has_animation(clip): continue
   var anim = actor.animator.get_animation(clip)
   for track in anim.get_track_count():
    var track_path = anim.track_get_path(track)
    var target = actor.animator.get_node(actor.animator.root_node).get_node_or_null(NodePath(track_path.get_concatenated_names()))
    check(target != null,id+": animation target "+str(track_path))
    if target is Skeleton3D and track_path.get_subname_count(): check(target.find_bone(track_path.get_subname(0))>=0,id+": animation bone")
   actor.animator.play(clip)
   for phase in [0.0,.25,.5,.75,.98]:
    actor.animator.seek(anim.length*phase,true);actor.animator.advance(0)
    for bone in skeleton.get_bone_count():
     var pos = skeleton.get_bone_global_pose(bone).origin
     check(pos.is_finite() and pos.length()<8,id+": finite pose "+clip)
   actor.animator.seek(anim.length*(.95 if clip=="death" else .3),true);actor.animator.advance(0);actor.animator.pause()
   await create_timer(.25).timeout
   if DisplayServer.get_name() != "headless":
    await RenderingServer.frame_post_draw
    root.get_texture().get_image().save_png(output.path_join(("before-" if before else "after-")+id+"-"+clip+".png"))
  if id == "stone_guard" and not before:
   check(actor.stone_ward != null,"StoneWard mesh")
   actor.snapshot([1,0,0,0,0,0,40,0],0)
   check(not actor.stone_ward.visible,"Low HP alone must not create shield")
   actor.snapshot([1,0,0,0,0,0,40,0,[["stone_guard:guard","buff",4000]]],1)
   check(actor.stone_ward.visible,"Server guard displays shield")
   actor.animator.play("idle");actor.animator.seek(.3,true);actor.animator.advance(0);actor.animator.pause()
   if DisplayServer.get_name() != "headless":
    await RenderingServer.frame_post_draw
    root.get_texture().get_image().save_png(output.path_join("after-stone_guard-shield.png"))
   actor.snapshot([1,0,0,0,0,0,40,0,[]],2)
   check(not actor.stone_ward.visible,"Expired shield disappears")
   actor.snapshot([1,0,0,0,0,8,0,0,[["stone_guard:guard","buff",4000]]],3)
   check(not actor.stone_ward.visible,"Death hides shield")
  actor.free()
 print("GORGE_MODELS models=3 clips=21 failures=",failures)
 quit(1 if failures else 0)
