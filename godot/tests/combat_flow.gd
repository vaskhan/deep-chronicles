extends SceneTree
func _initialize():run.call_deferred()
func run():
 var checks=0
 for id in ["warrior","warrior_chain"]:
  var actor=load("res://scripts/actor.gd").new();actor.kind="p";root.add_child(actor);actor.setup(id,"Проверка боя");actor.set_process(false)
  actor.combat_active=true;actor.begin_attack(.8,.3);actor.release_attack();actor._process(.7)
  if actor.last_clip!="combat_idle" or actor.animator.current_animation!="combat_idle":
   push_error("Hero returned to peaceful idle between attacks: "+id);quit(1);return
  checks+=1
  actor.begin_attack(.8,.3);actor.animator.advance(.1)
  actor.begin_attack(1.2,.6)
  if not actor.winding_up or absf(actor.windup_remaining-.6)>.001 or actor.animator.current_animation_position>.01:
   push_error("Skill did not replace the previous windup");quit(1);return
  checks+=1
  actor.cancel_presentation();actor._process(.02)
  if actor.last_clip!="idle":
   push_error("Explicit combat cancellation must restore peaceful idle");quit(1);return
  checks+=1
  actor.snapshot([1,0,0,0,0,16,100,0],0);actor._process(.02)
  if actor.last_clip!="combat_idle":
   push_error("Remote warrior did not retain the authoritative combat stance");quit(1);return
  checks+=1;actor.free()
 var mage=load("res://scripts/actor.gd").new();mage.kind="p";root.add_child(mage);mage.setup("mage","Маг");mage.set_process(false)
 mage.begin_attack(1,.5);mage.begin_cast("fire_bolt",1.5);mage._process(.05)
 if mage.winding_up or mage.attack_time>0 or mage.last_clip!="cast_enter" or mage.animator.speed_scale<=0:
  push_error("Spell retained or froze the interrupted staff attack");quit(1);return
 checks+=1;mage.free()
 print("COMBAT_FLOW_OK checks=",checks)
 quit()
