extends Node
signal message(data: Dictionary)
signal status_changed(text: String)
signal connected
var socket: WebSocketPeer
var endpoint = "wss://realms.neuraldeep.ru/ws"
var online = false
var authed = false
var retry_at = 0
var retry_delay = 1000
var stopped = false
var session: Dictionary = {}
var sessions: Dictionary = {}
var online_count = 0
var connecting_at = 0
var test_mode = false
var last_packet_at = 0
var last_ping_at = 0
var closing_at = 0
var opened_at = 0
var reconnect_count = 0
var last_disconnect: Dictionary = {}
var heartbeat_supported = false
var rates: Dictionary = {}  # действующие коэффициенты сервера: только для показа, клиент по ним ничего не считает

func _ready():
	process_mode = Node.PROCESS_MODE_ALWAYS
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--server="): endpoint = a.trim_prefix("--server=")
		if a == "--test-mode": test_mode = true
	if not test_mode and FileAccess.file_exists("user://sessions.json"):
		var saved = JSON.parse_string(FileAccess.get_file_as_string("user://sessions.json"))
		if saved is Dictionary: sessions = saved
	elif not test_mode and FileAccess.file_exists("user://session.json"):
		var saved = JSON.parse_string(FileAccess.get_file_as_string("user://session.json"))
		if saved is Dictionary and saved.has("endpoint"): sessions[saved.endpoint] = saved
	session = sessions.get(endpoint, {})

func start(url = ""):
	if not url.is_empty():
		if not url.begins_with("ws://") and not url.begins_with("wss://"):
			status_changed.emit("Адрес сервера должен начинаться с ws:// или wss://"); return
		endpoint = url
	session = sessions.get(endpoint, {})
	if socket: socket.close()
	online = false; authed = false; stopped = false; online_count = 0
	connecting_at = Time.get_ticks_msec(); retry_at = 0
	socket = WebSocketPeer.new()
	socket.inbound_buffer_size = 4194304
	socket.outbound_buffer_size = 1048576
	closing_at = 0; opened_at = 0; last_ping_at = 0; heartbeat_supported = false
	var error = socket.connect_to_url(endpoint)
	status_changed.emit("Подключение…")
	_record("connecting", {"platform": OS.get_name()})
	if error != OK: _disconnected("connect_error", error)

func _process(_dt):
	if stopped: return
	if socket == null:
		if retry_at > 0 and Time.get_ticks_msec() >= retry_at: start()
		return
	# Signals can replace the socket (logout, rejected token, changing server).
	# Never continue polling the replacement as though it were the old peer.
	var current = socket
	current.poll()
	var now = Time.get_ticks_msec()
	var state = current.get_ready_state()
	if state == WebSocketPeer.STATE_OPEN:
		if not online:
			online = true; opened_at = now; last_packet_at = now
			status_changed.emit("Подключено · %s" % endpoint); connected.emit()
			_record("connected")
			if socket != current: return
		if not _drain(current): return
		if now - opened_at >= 10000: retry_delay = 1000
		# JSON heartbeat also works at the login screen, through NAT and proxies.
		if heartbeat_supported and now - last_ping_at >= 10000:
			last_ping_at = now; send({"t": "ping"})
		if socket != current: return
		if (authed or heartbeat_supported) and now - last_packet_at > 45000:
			current.close(1001, "server timeout"); _disconnected("server_timeout")
	elif state == WebSocketPeer.STATE_CLOSED:
		if not _drain(current): return
		if current.get_close_code() == 4001:
			stopped = true; online = false; authed = false
			_record("session_replaced", {"code": 4001}); message.emit({"t": "kicked"}); return
		_disconnected("closed", current.get_close_code())
	elif state == WebSocketPeer.STATE_CONNECTING and now - connecting_at > 15000:
		current.close(); _disconnected("connect_timeout")
	elif state == WebSocketPeer.STATE_CLOSING:
		if not _drain(current): return
		if closing_at == 0: closing_at = now
		elif now - closing_at > 3000: _disconnected("close_timeout")

func _drain(current: WebSocketPeer) -> bool:
	while current.get_available_packet_count() > 0:
		var data = JSON.parse_string(current.get_packet().get_string_from_utf8())
		if not data is Dictionary: continue
		last_packet_at = Time.get_ticks_msec()
		if data.get("t") == "hi":
			heartbeat_supported = int(data.get("features", {}).get("heartbeat", 0)) >= 1
			rates = data.get("rates", {}) if data.get("rates") is Dictionary else {}
		if data.get("t") == "authok":
			authed = true
			_record("authenticated")
			if data.has("token"):
				session = {"endpoint": endpoint, "name": data.name, "token": data.token}
				sessions[endpoint] = session; _save_sessions()
		if data.get("t") in ["hi", "authok"]: online_count = int(data.get("online", 0))
		if data.get("t") == "online": online_count = int(data.n)
		if data.get("t") == "autherr" and data.get("kind") == "auth": forget_session()
		if data.get("t") == "kicked": stopped = true; authed = false
		message.emit(data)
		if socket != current or stopped: return false
	return true

func _disconnected(reason = "closed", code = -1):
	last_disconnect = {"reason": reason, "code": code, "authenticated": authed, "uptime_ms": Time.get_ticks_msec() - opened_at if opened_at else 0}
	_record("disconnected", last_disconnect)
	socket = null; online = false; authed = false
	retry_at = Time.get_ticks_msec() + retry_delay
	retry_delay = mini(15000, retry_delay * 2)
	reconnect_count += 1
	status_changed.emit("Связь потеряна (%s, %s). Повтор через %.0f с…" % [reason, code, (retry_at - Time.get_ticks_msec()) / 1000.0])

func send(data: Dictionary):
	if online and socket != null and socket.get_ready_state() == WebSocketPeer.STATE_OPEN:
		var error = socket.send_text(JSON.stringify(data))
		if error != OK: socket.close(); _disconnected("send_error", error)

func resume_session() -> bool:
	if session.get("endpoint") == endpoint and session.has("token"):
		send({"t": "auth", "token": session.token}); return true
	return false

func logout():
	if session.has("token"): send({"t": "logout", "token": session.token})
	forget_session()
	authed = false

func forget_session():
	sessions.erase(endpoint); session = {}; _save_sessions()

func _save_sessions():
	if test_mode: return
	var file = FileAccess.open("user://sessions.json", FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(sessions)); file.close()
		DirAccess.remove_absolute("user://session.json")

func _notification(what):
	if what == NOTIFICATION_APPLICATION_RESUMED and not stopped:
		# Drain packets first: an old timestamp during minimization does not mean
		# the transport died. Avoid reconnecting just because focus returned.
		_process(0)

func _record(event: String, details: Dictionary = {}):
	if test_mode: return
	var filename = "user://network.jsonl"
	var file = FileAccess.open(filename, FileAccess.READ_WRITE if FileAccess.file_exists(filename) else FileAccess.WRITE)
	if not file: return
	if file.get_length() > 262144:
		file.close(); DirAccess.remove_absolute(filename + ".old")
		DirAccess.rename_absolute(filename, filename + ".old")
		file = FileAccess.open(filename, FileAccess.WRITE)
	if not file: return
	file.seek_end()
	var entry = details.duplicate(); entry.event = event; entry.time = Time.get_datetime_string_from_system(true)
	file.store_line(JSON.stringify(entry)); file.close()
