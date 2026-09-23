extends SceneTree
func _initialize(): _run.call_deferred()
func _run():
 var Art=load('res://scripts/art_assets.gd');var failures=0
 for model in ['warrior','warrior_chain','mage']:
  var actor=Art.actor(model);root.add_child(actor)
  var skeleton=actor.find_child('Skeleton3D',true,false);var player=actor.find_child('AnimationPlayer',true,false)
  var clip=player.get_animation('run');player.play('run',0)
  for frame in 40:
   player.seek(clip.length*frame/40.0,true);player.advance(0);skeleton.force_update_all_bone_transforms()
   var chest=skeleton.get_bone_global_pose(skeleton.find_bone('DEF-spine.003')).basis.get_euler()
   if absf(chest.y)>.07 or absf(chest.z)>.05:failures+=1
   for side in ['L','R']:
    var shoulder=skeleton.get_bone_global_pose(skeleton.find_bone('DEF-upper_arm.'+side)).origin
    var elbow=skeleton.get_bone_global_pose(skeleton.find_bone('DEF-forearm.'+side)).origin
    var wrist=skeleton.get_bone_global_pose(skeleton.find_bone('DEF-hand.'+side)).origin
    if absf(elbow.x-shoulder.x)>.04 or absf(wrist.x-shoulder.x)>.07:failures+=1
  # Upper-body editing must not change the leg trajectories or stride timing.
  var source=Art.canonical_clips['Jog_Fwd']
  for track in clip.get_track_count():
   var path=clip.track_get_path(track);var bone=str(path)
   if not ('thigh' in bone or 'shin' in bone or 'foot' in bone or 'toe' in bone):continue
   var original=source.find_track(path,clip.track_get_type(track))
   if original<0 or clip.track_get_key_count(track)!=source.track_get_key_count(original):failures+=1;continue
   for key in clip.track_get_key_count(track):
    if clip.track_get_key_value(track,key)!=source.track_get_key_value(original,key):failures+=1
  print('RUN_ARMS ',model,' checked 40 poses')
  actor.free()
 print('RUN_ARMS_RESULT failures=',failures)
 quit(0 if failures==0 else 1)
