extends SceneTree
var failures = 0
func check(ok: bool, message: String):
	if not ok: failures += 1; push_error(message)
func _initialize(): _run.call_deferred()
func _run():
	var data = root.get_node("GameData")
	var actor_script = load("res://scripts/actor.gd")
	var scene = Node3D.new(); root.add_child(scene)
	var env = WorldEnvironment.new(); env.environment = load("res://resources/daylight.tres"); scene.add_child(env)
	var sun = DirectionalLight3D.new(); sun.rotation_degrees = Vector3(-55,-25,0); sun.shadow_enabled = true; scene.add_child(sun)
	var plane = MeshInstance3D.new(); var mesh = PlaneMesh.new(); mesh.size = Vector2(35,25); plane.mesh = mesh; scene.add_child(plane)
	var row = 0
	for id in ["orc","wolf","golem"]:
		var control = actor_script.new(); scene.add_child(control); control.setup(id,id,data.catalog.MOBS[id]); control.hide(); control.set_process(false)
		for stage in 4:
			var actor = actor_script.new(); scene.add_child(actor); actor.setup(id,id,data.catalog.MOBS[id]); actor.set_process(false)
			actor.position = Vector3((stage-1.5)*4.2,0,-row*5)
			check(actor.animator.has_animation("death"),id+" has a fall animation")
			var fall = actor.animator.get_animation("death").length
			check(fall+6.5 < float(data.catalog.UI_RULES.corpse.lifetimeMs)/1000,id+" fits server corpse lifetime")
			actor.dead = true; actor.death_elapsed = [.4,fall+4.9,fall+5.75,fall+6.6][stage]; actor._process(0)
			actor.animator.speed_scale = 0
			check(is_equal_approx(actor.model.position.y,actor.model_rest_y),id+" must not sink")
			if stage == 1: check(actor.model.visible and actor.corpse_materials.is_empty(),id+" remains opaque for five seconds after fall")
			if stage == 2:
				check(not actor.corpse_materials.is_empty(),id+" has fade materials")
				for entry in actor.corpse_materials:
					check(is_equal_approx(entry.material.albedo_color.a,entry.alpha*.5),id+" is half transparent")
			if stage == 3:
				check(not actor.model.visible,id+" is invisible after fading")
				actor.dead = false; actor._process(0)
				check(actor.model.visible and actor.corpse_materials.is_empty(),id+" restores on respawn")
				actor.hide()
		check(control.corpse_materials.is_empty(),id+" living neighbour is unaffected")
		for node in control.model.find_children("*","MeshInstance3D",true,false):
			for surface in node.mesh.get_surface_count():
				var material = node.get_active_material(surface)
				if material is BaseMaterial3D: check(is_equal_approx(material.albedo_color.a,1.0),id+" shared live material remains opaque")
		row += 1
	var camera = Camera3D.new(); scene.add_child(camera); camera.position = Vector3(1,16,15); camera.look_at(Vector3(0,0,-4)); camera.current = true
	await create_timer(.3).timeout
	await RenderingServer.frame_post_draw
	var output = "/tmp/corpse-review.png"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--output="): output=arg.trim_prefix("--output=")
	root.get_texture().get_image().save_png(output)
	print("CORPSE_REVIEW failures=",failures)
	quit(1 if failures else 0)
