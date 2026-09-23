extends SceneTree
func _initialize(): _run.call_deferred()
func _run():
 root.size=Vector2i(1280,800)
 var scene=Node3D.new();root.add_child(scene)
 var env=WorldEnvironment.new();env.environment=load("res://resources/daylight.tres");scene.add_child(env)
 var sun=DirectionalLight3D.new();sun.rotation_degrees=Vector3(-45,-25,0);sun.light_energy=1.1;scene.add_child(sun)
 var shop=load("res://local_assets/l2-houses/merchant_complete.glb").instantiate();shop.scale=Vector3.ONE*1.6;scene.add_child(shop)
 var light=OmniLight3D.new();light.position=Vector3(0,3,0);light.light_energy=1.6;light.omni_range=14;scene.add_child(light)
 var camera=Camera3D.new();scene.add_child(camera);camera.current=true;camera.fov=65
 for view in [["outside",Vector3(12,9,15),Vector3(0,3,0)],["inside",Vector3(.8,2.5,3.3),Vector3(.8,1.8,-2)],["back",Vector3(0,2.5,-2),Vector3(0,2,4)]]:
  camera.position=view[1];camera.look_at(view[2]);await create_timer(1).timeout;await RenderingServer.frame_post_draw
  root.get_texture().get_image().save_png("/tmp/shop-"+view[0]+".png")
 quit()
