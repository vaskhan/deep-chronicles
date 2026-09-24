extends Node
## Два музыкальных голоса, плавные переходы и приглушение по событиям боя.
var tracks: Dictionary = {}
var gains: Dictionary = {}
var players: Array = []
var cue = ""
var current_voice = 0
var levels = [0.0, 0.0]
var combat_remaining = 0.0
var duck_remaining = 0.0
var duck_db = 0.0

func setup(bank: Dictionary):
	for id in bank.cues:
		if not str(id).begins_with("music_"): continue
		var stream = load(bank.cues[id].variants[0]).duplicate(); stream.loop = true
		tracks[id] = stream; gains[id] = float(bank.cues[id].gain_db)
	# Optional personal town music stays outside the shipped asset bank.
	if "--test-mode" not in OS.get_cmdline_user_args():
		for town in GameData.world.towns:
			var path = "user://music/" + str(town.id) + ".ogg"
			if not FileAccess.file_exists(path): continue
			var custom = AudioStreamOggVorbis.load_from_file(path)
			if custom == null: continue
			custom.loop = true
			var id = "music_town_" + str(town.id)
			tracks[id] = custom; gains[id] = gains["music_town"]
	for i in 2:
		var player = AudioStreamPlayer.new(); player.bus = "Music"; player.volume_db = -60
		add_child(player); players.append(player)

func combat():
	combat_remaining = 6.0; duck_remaining = 0.65

func follow(dt: float, in_town: bool, dead: bool, town_id: String = ""):
	combat_remaining = maxf(0, combat_remaining - dt)
	duck_remaining = maxf(0, duck_remaining - dt)
	var wanted = "music_battle" if combat_remaining > 0 and not dead and not in_town else ("music_town" if in_town else "music_explore")
	if wanted == "music_town" and tracks.has("music_town_" + town_id): wanted = "music_town_" + town_id
	if wanted != cue:
		current_voice = 1 - current_voice
		var next = players[current_voice]
		next.stop(); next.stream = tracks[wanted]; next.set_meta("cue", wanted); levels[current_voice] = 0.0; next.volume_db = -60; next.play()
		cue = wanted
	duck_db = lerpf(duck_db, -5.0 if duck_remaining > 0 else 0.0, 1 - exp(-dt * (12 if duck_remaining > 0 else 2)))
	for i in players.size():
		var player = players[i]
		levels[i] = move_toward(levels[i], 1.0 if i == current_voice else 0.0, dt / 2.2)
		var track_gain = float(gains.get(player.get_meta("cue", ""), -60.0))
		player.volume_db = track_gain + linear_to_db(maxf(0.00001, levels[i])) + duck_db - (5.0 if dead else 0.0)
		if i != current_voice and levels[i] <= 0: player.stop()

func clear():
	levels = [0.0, 0.0]
	cue = ""; combat_remaining = 0; duck_remaining = 0; duck_db = 0
	for player in players: player.stop(); player.volume_db = -60
