extends SceneTree
## A cut must travel through the blade's edge plane, not its broad face.
func _initialize(): _run.call_deferred()
func _run():
 var Actor=load('res://scripts/actor.gd')
 var failures=0
 for model in ['warrior','warrior_chain']:
  var actor=Actor.new();root.add_child(actor);actor.setup(model,'');actor.set_process(false)
  var skeleton=actor.model.find_child('Skeleton3D',true,false)
  var hand=skeleton.find_bone('DEF-hand.R')
  var player=actor.animator;var clip=player.get_animation('attack')
  var points=[];var frames=[]
  player.play('attack',0)
  for i in 21:
   player.seek(clip.length*(.28+i*.008),true);player.advance(0);skeleton.force_update_all_bone_transforms()
   var pose=skeleton.global_transform*skeleton.get_bone_global_pose(hand)*actor.weapon_node.get_parent().transform*actor.weapon_node.transform
   points.append(pose*Vector3(0,0,.95));frames.append(pose.basis.orthonormalized())
  var face=0.0;var edge=0.0
  for i in range(1,20):
   var velocity=points[i+1]-points[i-1]
   velocity-=frames[i].z*velocity.dot(frames[i].z)
   face+=absf(velocity.dot(frames[i].y));edge+=absf(velocity.dot(frames[i].x))
  var ratio=face/maxf(edge,.00001)
  print('SWORD_EDGE ',model,' face/edge=',ratio)
  if ratio>.5:failures+=1;push_error('Sword strikes with its broad face: '+model)
  actor.begin_attack(1.3,.7);actor.release_attack();player.advance(0);skeleton.force_update_all_bone_transforms()
  var impact=skeleton.global_transform*skeleton.get_bone_global_pose(hand)*actor.weapon_node.get_parent().transform*actor.weapon_node.transform*Vector3(0,0,.95)
  if absf(impact.x)>.15 or impact.z<1.5:
   failures+=1;push_error('Impact marker misses forward target: '+str(impact))
  actor.free()
 print('SWORD_EDGE_RESULT failures=',failures)
 quit(0 if failures==0 else 1)
