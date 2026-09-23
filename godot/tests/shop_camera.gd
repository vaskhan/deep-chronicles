extends SceneTree
func _initialize(): _run.call_deferred()
func _run():
 var main=load("res://scripts/main.gd").new()
 var hero=Node3D.new();root.add_child(hero);main.hero=hero
 var camera=Camera3D.new();root.add_child(camera);main.camera=camera
 var data=root.get_node("GameData")
 var checks=0
 for shop in data.world.townShops:
  if not shop.get("frontage",false):continue
  var centre=Vector2(shop.x,shop.z-7*shop.scale)
  var half=(Vector2(shop.w,shop.d)-Vector2.ONE*2.4)*shop.scale*.5
  for point in [Vector2.ZERO,Vector2(half.x-.2,0),Vector2(0,half.y-.1)]:
   hero.position=data.position_at(centre.x+point.x,centre.y+point.y)
   for direction in 8:
    main.camera_yaw=direction*TAU/8;main.camera_distance=40;main._update_camera(.016)
    assert(absf(camera.position.x-centre.x)<=half.x-.59)
    assert(absf(camera.position.z-centre.y)<=half.y-.59)
    assert(camera.position.y<hero.position.y+4.4)
    assert(main.camera_distance==40) # outdoor zoom preference survives indoors
    checks+=1
 hero.position=data.position_at(-430,400);main.initial_camera=true;main._update_camera(.016)
 assert(camera.position.distance_to(hero.position)>35)
 print("SHOP_CAMERA_OK checks=",checks+1)
 main.free();hero.free();camera.free();quit()
