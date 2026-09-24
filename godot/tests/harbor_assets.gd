extends SceneTree
func _initialize(): _run.call_deferred()
func _run():
 var surfaces=0
 for id in ["SI_H01","SI_H02","SI_H03","SI_H04","SI_SH01","SI_SH02","SI_SH03","merchant_complete","temple_complete"]:
  var path="res://assets/town/houses/%s.glb"%id
  if not ResourceLoader.exists(path):
   push_error("Missing shipped harbor model: "+path);quit(1);return
  var model=load(path).instantiate()
  var meshes=model.find_children("*","MeshInstance3D",true,false)
  if meshes.is_empty():
   push_error("Empty harbor model: "+id);model.free();quit(1);return
  for part in meshes:
   for i in part.mesh.get_surface_count():
    var material=part.mesh.surface_get_material(i)
    if not material is BaseMaterial3D or material.albedo_texture == null:
     push_error("Missing harbor texture: "+id);model.free();quit(1);return
    surfaces+=1
  model.free()
 print("HARBOR_ASSETS_OK models=9 textured_surfaces=",surfaces)
 quit()
