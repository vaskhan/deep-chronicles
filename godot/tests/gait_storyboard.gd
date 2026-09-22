extends SceneTree
## Раскадровка бега в настоящем мире: кадры подряд плюс измерение проскальзывания
## опорной ступни. Сервера и аккаунтов не требует, прогресс не трогает.
var output = "/tmp/gait-storyboard"
var frames = 8
var trace = false

func _initialize(): _run.call_deferred()

func _run():
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--output="): output = arg.trim_prefix("--output=")
		if arg.begins_with("--frames="): frames = int(arg.trim_prefix("--frames="))
		if arg == "--trace": trace = true
	DirAccess.make_dir_recursive_absolute(output)
	var world = load("res://scenes/world.tscn").instantiate(); root.add_child(world); world.build()
	var data = root.get_node("GameData")
	var actor = load("res://scripts/actor.gd").new(); actor.kind = "p"
	root.add_child(actor); actor.setup("warrior", "Проверка бега")
	actor.set_process(false)
	var camera = Camera3D.new(); root.add_child(camera); camera.current = true; camera.fov = 52; camera.far = 1200
	# Открытый луг: ничто не перекрывает ноги, на траве видны опорные точки.
	var origin = Vector2(-258.0, 168.0)
	var speed = 7.15
	var travelled = 0.0
	actor.position = data.position_at(origin.x, origin.y)
	actor.rotation.y = PI * 0.5
	world.set_region(actor.position)
	var skeleton = actor.model.find_child("Skeleton3D", true, false)
	var left = skeleton.find_bone("DEF-foot.L"); var right = skeleton.find_bone("DEF-foot.R")
	var previous_feet = []
	var slips = []
	var shot = 0
	var elapsed = 0.0
	var last = Time.get_ticks_usec()
	while shot < frames:
		await process_frame
		var now = Time.get_ticks_usec()
		var dt = clampf((now - last) / 1000000.0, 0.001, 0.1); last = now
		elapsed += dt
		var before = actor.position
		travelled += speed * dt
		actor.position = data.position_at(origin.x + travelled, origin.y)
		actor.measure_motion(before, dt)
		actor._process(dt)
		# Камера стоит: на неподвижной земле видно, скользит ли опорная нога.
		var centre = data.position_at(origin.x + 1.0 + speed * 1.35, origin.y)
		camera.position = centre + Vector3(0.0, 2.2, 9.5)
		camera.look_at(centre + Vector3.UP * 1.0)
		skeleton.force_update_all_bone_transforms()
		var feet = [
			skeleton.global_transform * skeleton.get_bone_global_pose(left).origin,
			skeleton.global_transform * skeleton.get_bone_global_pose(right).origin,
		]
		if not previous_feet.is_empty() and elapsed > 0.6:
			var ground = []
			for i in 2:
				var step = feet[i] - previous_feet[i]; step.y = 0
				ground.append(step.length() / dt)
			# Опорная нога — нижняя: именно она обязана стоять в мире.
			var support = 0 if feet[0].y < feet[1].y else 1
			slips.append({"slip": ground[support], "height": feet[support].y - actor.position.y, "dt": dt})
		previous_feet = feet
		# Первую секунду отдаём разгону клипа, дальше снимаем равномерно один цикл бега.
		if elapsed < 1.0: continue
		if elapsed >= 1.0 + shot * 0.09:
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png(output.path_join("run-%02d.png" % (shot + 1)))
			shot += 1
	var lowest = INF
	for sample in slips: lowest = minf(lowest, sample.height)
	var planted = []
	for sample in slips:
		if sample.height < lowest + 0.07: planted.append(sample.slip)
	planted.sort()
	var worst = 0.0
	var total = 0.0
	for value in planted: worst = maxf(worst, value); total += value
	if trace:
		for sample in slips: print("GAIT_SAMPLE height=", snappedf(sample.height, 0.001), " slip=", snappedf(sample.slip, 0.01))
	print("GAIT_STORYBOARD ", JSON.stringify({
		"frames": frames, "speed": speed, "clip": actor.last_clip,
		"speed_scale": snappedf(actor.animator.speed_scale, 0.001),
		"measured_speed": snappedf(actor.motion_speed, 0.01),
		"planted_samples": planted.size(),
		"slip_median": snappedf(planted[planted.size() / 2], 0.01) if not planted.is_empty() else -1.0,
		"slip_worst": snappedf(worst, 0.01),
		"slip_mean": snappedf(total / maxf(1, planted.size()), 0.01),
	}))
	quit()
