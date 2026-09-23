extends SceneTree
func _initialize(): _run.call_deferred()
func _run():
 var data=root.get_node("GameData")
 var checks=0
 for p in data.world.townPiers:
  for i in 110:
   var x=lerpf(p.x0,p.x1,float(i)/109)
   for offset in [-p.halfWidth+.02,0,p.halfWidth-.02]:
    if absf(data.height_at(x,p.z+offset)-p.y)>.001:
     push_error("Pier walking height differs from deck");quit(1);return
    checks+=1
  if data.terrain_height_at(p.x1-1,p.z)>p.y-5:
   push_error("Pier seabed rises into deck");quit(1);return
 print("PIER_HEIGHT_OK checks=",checks)
 quit()
