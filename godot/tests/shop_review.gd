extends SceneTree
func _initialize(): _run.call_deferred()
func _run():
 root.size=Vector2i(1440,900)
 var data=root.get_node("GameData")
 var world=load("res://scenes/world.tscn").instantiate();root.add_child(world);world.build()
 var shop=data.world.townShops.filter(func(s):return s.town=="harbor" and s.id=="clothes")[0]
 var door=data.position_at(shop.x+.48*shop.modelScale,shop.z-7*shop.scale+2.6*shop.modelScale)
 var actor=load("res://scripts/actor.gd").new();actor.kind="p";root.add_child(actor);actor.setup("warrior","Герой · рост 2,5 м");actor.position=door+Vector3(0,.08,1.2)
 for entry in data.world.npcs:
  if entry.town!="harbor" or entry.role!="merchant":continue
  var npc=load("res://scripts/actor.gd").new();npc.kind="n";root.add_child(npc);npc.setup("merchant",entry.name)
  npc.position=data.position_at(entry.x,entry.z);npc.rotation.y=entry.get("rotation",0)
 var camera=Camera3D.new();root.add_child(camera);camera.current=true;camera.fov=55;camera.far=1500
 var out="/tmp/shop-access"
 for arg in OS.get_cmdline_user_args():
  if arg.begins_with("--output="):out=arg.trim_prefix("--output=")
 DirAccess.make_dir_recursive_absolute(out)
 for view in [["entrance",door+Vector3(0,3.1,16),door+Vector3(0,2.5,0)],["street",door+Vector3(12,8,18),door+Vector3(0,4,0)],["counter",data.position_at(shop.x+shop.interior.customerX*shop.modelScale,shop.z-7*shop.scale+1.8*shop.modelScale)+Vector3.UP*2.1,data.position_at(shop.x+shop.interior.sellerX*shop.modelScale,shop.z-7*shop.scale+shop.interior.generalSellerZ*shop.modelScale)+Vector3.UP*1.6]]:
  camera.position=view[1];camera.look_at(view[2]);world.set_region(door)
  await create_timer(3).timeout;await RenderingServer.frame_post_draw
  root.get_texture().get_image().save_png(out.path_join(view[0]+".png"))
 var map=load("res://scripts/map.gd").new();map.player_position=door;map.position=Vector2(70,60);map.size=Vector2(880,700);root.add_child(map)
 var mini=load("res://scripts/map.gd").new();mini.compact=true;mini.player_position=door;mini.position=Vector2(1000,60);mini.size=Vector2(320,260);root.add_child(mini)
 await create_timer(2).timeout;await RenderingServer.frame_post_draw
 root.get_texture().get_image().save_png(out.path_join("map.png"))
 print("SHOP_REVIEW_OK")
 quit()
