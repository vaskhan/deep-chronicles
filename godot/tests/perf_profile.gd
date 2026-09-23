extends SceneTree
## Воспроизводимый профиль кадра мира с игровой камеры (не панорамы): город и Громовое ущелье.
## Камера стоит так же, как у героя в main.gd::_update_camera: точка прицела над героем,
## стартовые наклон и дистанция из tuning.gd, четыре направления взгляда на каждой точке.
## Меряется только мир (рельеф, постройки, растительность, свет); героев, мобов и HUD здесь нет.
## Godot --path godot --script res://tests/perf_profile.gd -- --test-mode --output=/tmp/perf.json [--quality=pc] [--seconds=4] [--warmup=2]
const Quality = preload("res://scripts/quality.gd")
var output = "/tmp/perf.json"
var seconds = 4.0
var warmup = 2.0

func _initialize(): _run.call_deferred()

## Точка на оси ущелья: та же формула, что в src/gorge.js::gorgeWorld и tests/gorge_review.gd.
func _gorge_at(u: float, s: float) -> Vector2:
	var g = root.get_node("GameData").world.gorge
	var v = s + 24.0 * sin(u / 440.0 * PI * 1.6)
	return Vector2(g.origin.x + u * g.axis.x + v * g.axis.z, g.origin.z + u * g.axis.z - v * g.axis.x)

## Счётчик памяти в МБ; переполненное (отрицательное беззнаковое) значение драйвера — null.
func _mem_mb(monitor: int):
	var v = Performance.get_monitor(monitor)
	if v < 0 or v > 1.0e12: return null
	return snappedf(v / 1048576.0, 0.1)

func _percentile(sorted: Array, q: float) -> float:
	if sorted.is_empty(): return 0.0
	return sorted[mini(sorted.size() - 1, int(q * sorted.size()))]

func _run():
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--output="): output = arg.trim_prefix("--output=")
		if arg.begins_with("--seconds="): seconds = float(arg.trim_prefix("--seconds="))
		if arg.begins_with("--warmup="): warmup = float(arg.trim_prefix("--warmup="))
	var data = root.get_node("GameData")
	var tuning = root.get_node("Tuning")
	# Ограничители кадра сняты: иначе упор в частоту экрана выглядит «быстрой сценой».
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	Engine.max_fps = 0
	# размер карты теней, действующий в проекте до пресета: мобильный пресет обязан его повторять
	var project_shadow = int(ProjectSettings.get_setting_with_override("rendering/lights_and_shadows/directional_shadow/size"))
	var preset = Quality.preset_from_args(OS.get_cmdline_user_args(), tuning.QUALITY_PRESET)
	var quality = Quality.apply(root, preset)
	var world = load("res://scenes/world.tscn").instantiate(); root.add_child(world); world.build()
	var camera = Camera3D.new(); root.add_child(camera); camera.current = true
	camera.fov = tuning.CAMERA_FOV; camera.near = tuning.CAMERA_NEAR; camera.far = tuning.CAMERA_FAR
	var vp = root.get_viewport_rid()
	RenderingServer.viewport_set_measure_render_time(vp, true)
	var town = data.world.towns[0]
	var terraces = _gorge_at(90, 4)
	var falls = _gorge_at(175, -6)
	# [имя, место героя] — место спавна в городе и две точки охоты в ущелье
	var spots = [["town", Vector2(town.x, town.z - 12)], ["gorge_terraces", terraces], ["gorge_falls", falls]]
	var views = []
	for spot in spots:
		for k in 4:
			var yaw = tuning.CAMERA_YAW_START + k * PI / 2.0
			var hero = data.position_at(spot[1].x, spot[1].y)
			var aim = hero + Vector3.UP * 1.4
			var pitch = tuning.CAMERA_PITCH_START
			var offset = Vector3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch)) * tuning.CAMERA_DISTANCE_START
			var eye = aim + offset
			eye.y = maxf(eye.y, data.height_at(eye.x, eye.z) + 1.0)
			camera.position = eye; camera.look_at(aim)
			world.set_region(hero)
			var warm_until = Time.get_ticks_msec() + int(warmup * 1000)
			while Time.get_ticks_msec() < warm_until: await process_frame
			var frames = []
			var draws = 0.0; var prims = 0.0; var objects = 0.0; var cpu = 0.0; var gpu = 0.0
			var last = Time.get_ticks_usec()
			var stop_at = Time.get_ticks_msec() + int(seconds * 1000)
			while Time.get_ticks_msec() < stop_at:
				await process_frame
				var now = Time.get_ticks_usec()
				frames.append((now - last) / 1000.0); last = now
				draws += Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)
				prims += Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME)
				objects += Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME)
				cpu += RenderingServer.viewport_get_measured_render_time_cpu(vp)
				gpu += RenderingServer.viewport_get_measured_render_time_gpu(vp)
			var n = maxf(1.0, frames.size())
			var sorted = frames.duplicate(); sorted.sort()
			var total = 0.0
			for f in frames: total += f
			var row = {
				"spot": spot[0], "yaw": snappedf(yaw, 0.01), "frames": frames.size(),
				"mean_ms": snappedf(total / n, 0.01), "median_ms": snappedf(_percentile(sorted, 0.5), 0.01),
				"p95_ms": snappedf(_percentile(sorted, 0.95), 0.01), "p99_ms": snappedf(_percentile(sorted, 0.99), 0.01),
				"max_ms": snappedf(sorted[-1] if sorted.size() else 0.0, 0.01),
				"draw_calls": roundi(draws / n), "primitives": roundi(prims / n), "objects": roundi(objects / n),
				"render_cpu_ms": snappedf(cpu / n, 0.01), "render_gpu_ms": snappedf(gpu / n, 0.01),
				"video_mem_mb": _mem_mb(Performance.RENDER_VIDEO_MEM_USED),
				"texture_mem_mb": _mem_mb(Performance.RENDER_TEXTURE_MEM_USED),
				"buffer_mem_mb": _mem_mb(Performance.RENDER_BUFFER_MEM_USED),
			}
			views.append(row)
			print("PERF_VIEW ", JSON.stringify(row))
	var result = {
		"quality": quality, "project_shadow_size": project_shadow,
		"renderer": ProjectSettings.get_setting("rendering/renderer/rendering_method"),
		"adapter": RenderingServer.get_video_adapter_name(), "api": RenderingServer.get_video_adapter_api_version(),
		"os": OS.get_name(), "cpu": OS.get_processor_name(), "godot": Engine.get_version_info().string,
		"window": [root.size.x, root.size.y], "vsync": DisplayServer.window_get_vsync_mode(), "refresh_hz": DisplayServer.screen_get_refresh_rate(), "warmup_s": warmup, "seconds_per_view": seconds,
		"static_mem_mb": snappedf(Performance.get_monitor(Performance.MEMORY_STATIC) / 1048576.0, 0.1),
		"views": views,
	}
	var file = FileAccess.open(output, FileAccess.WRITE)
	file.store_string(JSON.stringify(result, "  ") + "\n"); file.close()
	print("PERF_DONE ", output)
	quit()
