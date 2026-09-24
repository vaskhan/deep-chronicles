extends SceneTree
func _initialize():run.call_deferred()
func run():
 var world=load("res://scenes/world.tscn").instantiate();root.add_child(world);world.build()
 var decor=world.get_children().filter(func(n):return n.get_script()==load("res://scripts/town_decor.gd"))[0]
 var buildings=decor.find_children("Building_*","Node3D",false,false)
 if buildings.size()!=6:
  push_error("Expected six public harbor buildings");quit(1);return
 var checks=0
 for building in buildings:
  var signs=0
  for mesh in building.find_children("*","MeshInstance3D",true,false):
   if not (mesh.name.begins_with("interior_B_fsign") or mesh.name.begins_with("interior_B_sign")):continue
   signs+=1
   if mesh.visible != (building.name=="Building_weapons"):
    push_error("Wrong embedded weapon sign on "+building.name);quit(1);return
   checks+=1
  if signs!=2:
   push_error("Source sign geometry was not checked on "+building.name);quit(1);return
 print("SHOP_SIGNS_OK checks=",checks)
 quit()
