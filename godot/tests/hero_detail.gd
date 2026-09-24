extends SceneTree
func _initialize():
 var checks=0
 for id in ["warrior_cloth","warrior_chain","mage_native"]:
  var model=load("res://assets/characters/"+id+".glb").instantiate()
  var triangles=0
  for part in model.find_children("*","MeshInstance3D",true,false):
   for surface in part.mesh.get_surface_count():
    var info=RenderingServer.mesh_get_surface(part.mesh.get_rid(),surface)
    triangles+=int(info.get("index_count",0))/3
    if not info.get("lods",[]).is_empty():
     push_error("Player mesh has automatic simplification: "+id);model.free();quit(1);return
    checks+=1
  if triangles<25000:
   push_error("Player model lost source detail: "+id);model.free();quit(1);return
  model.free()
 print("HERO_DETAIL_OK checks=",checks)
 quit()
