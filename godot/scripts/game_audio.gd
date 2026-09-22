extends Node3D
## Positional voices are bounded; persistent sliders use the existing merged config.
const Settings = preload("res://scripts/interface_settings.gd")
var bank: Dictionary = {}
var variants: Dictionary = {}
var last_variant: Dictionary = {}
const MAX_VOICES = 24
var streams: Dictionary = {}
var voices: Array = []
var last_played: Dictionary = {}
var play_counts: Dictionary = {}
var listener: AudioListener3D
var ambience: AudioStreamPlayer
var music: Node
var step_distance = 0.0
var last_motion_distance = 0.0

func _ready():
	name = "GameAudio"
	var has_limiter = false
	for i in AudioServer.get_bus_effect_count(0):
		if AudioServer.get_bus_effect(0, i) is AudioEffectHardLimiter: has_limiter = true
	if not has_limiter:
		var limiter = AudioEffectHardLimiter.new(); limiter.ceiling_db = -1.0
		AudioServer.add_bus_effect(0, limiter)
	for bus in ["Effects", "Ambience", "Music"]:
		if AudioServer.get_bus_index(bus) < 0:
			AudioServer.add_bus(); AudioServer.set_bus_name(AudioServer.bus_count - 1, bus)
		set_volume(bus, float(Settings.read_value("audio", bus, 0.65 if bus == "Effects" else (0.45 if bus == "Music" else 0.3))), false)
	set_volume("Master", float(Settings.read_value("audio", "Master", 0.75)), false)
	bank = JSON.parse_string(FileAccess.get_file_as_string("res://assets/audio/manifest.json"))
	for id in bank.cues:
		variants[id] = []
		for path in bank.cues[id].variants: variants[id].append(load(path))
		streams[id] = variants[id][0]
	music = load("res://scripts/game_music.gd").new(); add_child(music); music.setup(bank)
	listener = AudioListener3D.new(); add_child(listener)
	ambience = AudioStreamPlayer.new(); ambience.bus = "Ambience"; ambience.volume_db = -2
	var loop = streams.wind.duplicate(); loop.loop = true
	ambience.stream = loop; add_child(ambience)
	for i in MAX_VOICES:
		var voice = AudioStreamPlayer3D.new(); voice.bus = "Effects"; voice.max_distance = 55; voice.unit_size = 7
		voice.max_db = -3; voice.attenuation_filter_cutoff_hz = 9000; add_child(voice); voices.append(voice)

func set_volume(bus: String, value: float, persist = true):
	var index = AudioServer.get_bus_index(bus)
	if index < 0: return
	value = clampf(value, 0, 1)
	AudioServer.set_bus_mute(index, value <= 0)
	AudioServer.set_bus_volume_db(index, linear_to_db(maxf(value, 0.0001)))
	if persist: Settings.write_value("audio", bus, value)

func follow(hero, camera, dt: float):
	if not is_instance_valid(hero) or not hero.visible:
		ambience.stop(); return
	listener.global_position = hero.global_position + Vector3.UP * 1.7
	listener.global_rotation = camera.global_rotation; listener.make_current()
	var in_town = GameData.world.towns.any(func(t): return Vector2(hero.position.x - t.x, hero.position.z - t.z).length() < t.r)
	music.follow(dt, in_town, hero.dead)
	if not ambience.playing: ambience.play()
	# Шаги зависят от реального пути: препятствие, каст и телепорт не
	# создают звук. Длина шага общая с анимацией бега.
	var traveled = maxf(0, hero.motion_distance - last_motion_distance)
	last_motion_distance = hero.motion_distance
	if not hero.moving or hero.dead or hero.casting:
		step_distance = 0; return
	step_distance += minf(traveled, 2)
	if step_distance >= hero.step_length:
		step_distance = fmod(step_distance, hero.step_length)
		var stone = hero.position.x > 2100 or GameData.world.towns.any(func(t): return Vector2(hero.position.x - t.x, hero.position.z - t.z).length() < t.r)
		play_at("step_concrete" if stone else "step_grass", hero.global_position, -5)

func creature(actor, action: String):
	if not is_instance_valid(actor): return
	var id = actor.art_base if not str(actor.art_base).is_empty() else actor.base_model
	if id == "rabbit": return
	var family = "insect" if id in ["spider", "scorpion"] else ("undead" if id in ["skeleton", "ghoul", "wraith", "lich"] else ("heavy" if id in ["golem", "treant", "orc"] else "beast"))
	var cue = family + "_attack" if action == "attack" else ("death" if action == "death" else "beast_hurt")
	if id == "golem" and action != "attack": cue = "stone_hit"
	if id == "treant" and action != "attack": cue = "wood_hit"
	play_at(cue, actor.global_position)

func play_at(id: String, pos: Vector3, gain_db = 0.0):
	if not streams.has(id) or not listener.is_current() or listener.global_position.distance_to(pos) > 55: return
	var now = Time.get_ticks_msec()
	var key = id + str(Vector3i(pos))
	if now - int(last_played.get(key, -1000)) < (250 if id.ends_with("hurt") else 55): return
	last_played[key] = now
	if last_played.size() > 128: last_played.clear()
	for voice in voices:
		if voice.playing: continue
		var choices = variants[id]
		var index = (int(last_variant.get(id, -1)) + 1) % choices.size()
		last_variant[id] = index
		voice.stream = choices[index]; voice.global_position = pos; voice.volume_db = gain_db + float(bank.cues[id].gain_db) - 4
		voice.pitch_scale = randf_range(0.97, 1.03) if id in ["swing", "impact"] or id.begins_with("step_") else 1.0
		voice.play(); play_counts[id] = int(play_counts.get(id, 0)) + 1; return

func clear():
	step_distance = 0; last_motion_distance = 0; last_played.clear()
	if music: music.clear()
	for voice in voices: voice.stop()
	ambience.stop()
