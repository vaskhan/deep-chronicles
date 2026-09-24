extends SceneTree
const Art=preload("res://scripts/art_assets.gd")
const DOORS={"SI_H01":Vector3(-.99474,.07677,1.57238),"SI_H02":Vector3(-.08315,.0623,1.29268),"SI_H03":Vector3(2.04168,.07969,1.96871),"SI_H04":Vector3(1.14604,.06398,2.42328)}
func _initialize():_run.call_deferred()
func _run():
 root.size=Vector2i(1280,800)
 var out="/tmp/town-scale"
 for arg in OS.get_cmdline_user_args():
  if arg.begins_with("--output="):out=arg.trim_prefix("--output=")
 DirAccess.make_dir_recursive_absolute(out)
 var environment=WorldEnvironment.new();environment.environment=Environment.new()
 environment.environment.background_mode=Environment.BG_COLOR;environment.environment.background_color=Color("9bc5df")
 environment.environment.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR;environment.environment.ambient_light_color=Color.WHITE;environment.environment.ambient_light_energy=.65;root.add_child(environment)
 var sun=DirectionalLight3D.new();sun.rotation_degrees=Vector3(-45,-25,0);sun.light_energy=1.3;root.add_child(sun)
 var floor=MeshInstance3D.new();var plane=PlaneMesh.new();plane.size=Vector2(120,120);floor.mesh=plane;root.add_child(floor)
 var actor=load("res://scripts/actor.gd").new();actor.kind="p";root.add_child(actor);actor.setup("warrior","Герой · 2,5 м")
 var camera=Camera3D.new();root.add_child(camera);camera.current=true;camera.fov=55
 for id in DOORS:
  var model=load("res://assets/town/houses/%s.glb"%id).instantiate();model.scale=Vector3.ONE*4.4;root.add_child(model)
  var door=DOORS[id]*4.4;actor.position=Vector3(door.x,0,door.z+1.1)
  camera.position=Vector3(door.x+1,4,door.z+17);camera.look_at(Vector3(door.x,3,door.z))
  await create_timer(1).timeout;await RenderingServer.frame_post_draw
  root.get_texture().get_image().save_png(out.path_join(id+".png"));model.queue_free();await process_frame
 print("TOWN_SCALE_REVIEW_OK")
 quit()
