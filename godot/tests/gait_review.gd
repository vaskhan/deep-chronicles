extends SceneTree
func _initialize(): _run.call_deferred()
func _run():
 var art=load("res://scripts/art_assets.gd")
 var scene=Node3D.new(); root.add_child(scene)
 var env=WorldEnvironment.new(); env.environment=load("res://resources/daylight.tres"); scene.add_child(env)
 var sun=DirectionalLight3D.new(); sun.rotation_degrees=Vector3(-50,-25,0); sun.light_energy=1.1; sun.shadow_enabled=true; scene.add_child(sun)
 var plane=MeshInstance3D.new(); var mesh=PlaneMesh.new(); mesh.size=Vector2(30,30); plane.mesh=mesh
 var mat=StandardMaterial3D.new(); mat.albedo_color=Color("5b6063"); plane.material_override=mat; scene.add_child(plane)
 var first=art.actor("warrior"); first.free()
 print("CLIPS ",art.canonical_clips.keys())
 var candidates=[]
 for key in art.canonical_clips:
  if "Sprint" in key or "Jog" in key: candidates.append(key)
 for row in candidates.size():
  var clip=art.canonical_clips[candidates[row]].duplicate()
  for phase in 3:
   var actor=art.actor("warrior"); scene.add_child(actor);actor.position+=Vector3((phase-1)*2.8,0,row*-4)
   var player=actor.find_child("AnimationPlayer",true,false)
   player.get_animation_library("").add_animation("review",clip)
   player.play("review"); player.seek(clip.length*(.12+phase*.28),true); player.speed_scale=0
  var actor=art.actor("warrior"); scene.add_child(actor)
  var player=actor.find_child("AnimationPlayer",true,false); player.get_animation_library("").add_animation("review",clip)
  var skeleton=actor.find_child("Skeleton3D",true,false)
  var left=skeleton.find_bone("DEF-foot.L");var right=skeleton.find_bone("DEF-foot.R")
  var samples=[]
  player.play("review")
  for i in 61:
   player.seek(clip.length*i/60.0,true);skeleton.force_update_all_bone_transforms()
   samples.append([skeleton.get_bone_global_pose(left).origin,skeleton.get_bone_global_pose(right).origin])
  for phase in [0.0,.25,.5,.75]:
   player.seek(clip.length*phase,true);skeleton.force_update_all_bone_transforms()
   var coords={}
   for name in ["DEF-thigh.L","DEF-shin.L","DEF-foot.L","DEF-toe.L","DEF-thigh.R","DEF-shin.R","DEF-foot.R","DEF-toe.R"]:
    var bone=skeleton.find_bone(name)
    if bone>=0: coords[name]=skeleton.get_bone_global_pose(bone).origin
   print("POSE ",candidates[row]," ",phase," ",coords)
  var gap=0.0;var step=0.0
  for sample in samples: gap=maxf(gap,absf(sample[0].x-sample[1].x))
  for foot in 2:
   var low=INF
   for sample in samples: low=minf(low,sample[foot].y)
   var speeds=[]
   for i in 60:
    if samples[i][foot].y < low+.055:
     var speed=absf(samples[i+1][foot].z-samples[i][foot].z)/(clip.length/60.0)
     if speed>.5: speeds.append(speed)
   speeds.sort()
   if not speeds.is_empty(): step+=speeds[speeds.size()/2]*.5
  print("GAIT ",candidates[row]," duration=",clip.length," max_foot_width=",gap," planted_speed=",step)
  actor.queue_free()
 var camera=Camera3D.new();scene.add_child(camera);camera.position=Vector3(0,4.6,9);camera.look_at(Vector3(0,1,-1.5));camera.fov=48;camera.current=true
 if DisplayServer.get_name()=="headless": quit(); return
 await create_timer(1).timeout
 await RenderingServer.frame_post_draw
 root.get_texture().get_image().save_png("/tmp/gait-review.png")
 quit()
