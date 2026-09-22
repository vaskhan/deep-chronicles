extends CanvasLayer
signal action(kind: String, value)
signal login_requested(data: Dictionary)
var root: Control
var login_panel: PanelContainer
var login_name: LineEdit
var login_pass: LineEdit
var server_field: LineEdit
var class_select: OptionButton
var login_message: Label
var login_online: Label
var continue_button: Button
var game_ui: Control
var info: Label
var zone: Label
var target_info: Label
var hp_bar: ProgressBar
var mp_bar: ProgressBar
var hp_text: Label
var mp_text: Label
var xp_bar: ProgressBar
var cast_bar: ProgressBar
var chat_log: RichTextLabel
var chat_input: LineEdit
var chat_channel: OptionButton
var skill_buttons: Array = []
var window: PanelContainer
var window_body: VBoxContainer
var window_kind = ""
var profile: Dictionary = {}
var current_stats: Dictionary = {}
var enchant_scroll = ""
var map_control: Control
var dead_panel: PanelContainer
var status_label: Label
var touch = false
var joystick: Control
var quick_hint: Label
var item_details: VBoxContainer
var minimap: Control
var chat: VBoxContainer
var xp_text: Label
var buff_text: Label
var target_bar: ProgressBar
var cast_text: Label
var cast_duration = 1.0
var cast_name = ""
var active_buffs: Array = []
var selected_item: Dictionary = {}
var bag_filter = 0
var bag_query = ""
var bag_sort = 0
var bag_search: LineEdit
var bag_grid: GridContainer
var wallet_label: Label
var shop_tab = "buy"
var window_scroll: ScrollContainer
var pvp_enabled = false
var target_panel: PanelContainer
var target_hint: Label
var status_panel: PanelContainer
var buffs_row: HBoxContainer
var hotbar_labels: Array = []
const Settings = preload("res://scripts/interface_settings.gd")
var hotbar_bindings: Array = []
var hotbar_class = ""
var hotbar_locked = true
var hotbar_lock: CheckBox
var party_state: Dictionary = {}
var party_invite: Dictionary = {}
var party_summary: Button
var party_members_box: VBoxContainer
var party_signature = ""
var chat_frame: Control
var autoloot_button: CheckBox
var pickup_button: Button
const ACTION_NAMES = {"attack": "Атака", "target": "Следующая цель", "talk": "Разговор", "pickup": "Поднять добычу", "skills": "Умения", "inventory": "Сумка", "character": "Персонаж", "map": "Карта", "empty": "Пусто"}

var login_decoration: Control
var registration_mode = false
var login_submit: Button
var login_switch: Button
var creation_preview: Control
var window_positions: Dictionary = {}
const STAT_NAMES = {"patk": "Физ. атака", "matk": "Маг. атака", "pdef": "Физ. защита", "mdef": "Маг. защита", "hp": "Здоровье", "mp": "Мана", "maxHp": "Макс. здоровье", "maxMp": "Макс. мана", "crit": "Критический удар", "aspd": "Атак в секунду", "cast": "Скорость заклинаний", "speed": "Скорость бега", "range": "Дальность атаки", "acc": "Точность", "eva": "Уклонение", "lvl": "Уровень", "w": "Вес"}

func _ready():
	touch = OS.has_feature("mobile") or "--touch" in OS.get_cmdline_user_args()
	root = Control.new(); root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root); root.theme = _theme()
	_game_hud(); _login()

func _theme() -> Theme:
	var t = Theme.new(); t.default_font_size = 14 if touch else 12
	t.set_stylebox("panel", "PanelContainer", _metal_style("bronze-panel", 7))
	for state in ["normal", "hover", "pressed", "disabled", "focus"]:
		var button_style = _metal_style("bronze-selected" if state in ["hover", "pressed", "focus"] else "bronze-button", 4)
		for control in ["Button", "OptionButton"]: t.set_stylebox(state, control, button_style)
		t.set_stylebox(state, "LineEdit", _style(Color("090c10"), Color("58544a"), 0))
	t.set_color("font_color", "Label", Color("d8d7ce"))
	t.set_color("font_color", "Button", Color("e8e1cf"))
	t.set_color("font_disabled_color", "Button", Color("73736d"))
	t.set_color("font_shadow_color", "Label", Color(0, 0, 0, 0.8)); t.set_constant("shadow_offset_y", "Label", 1)
	t.set_constant("line_separation", "RichTextLabel", 0)
	for state in ["scroll", "grabber", "grabber_highlight", "grabber_pressed"]:
		var bar = _style(Color("615640") if state.begins_with("grabber") else Color(0.05, 0.06, 0.05, 0.65), Color("867759"), 0)
		bar.content_margin_left = 3; bar.content_margin_right = 3; bar.content_margin_top = 2; bar.content_margin_bottom = 2
		t.set_stylebox(state, "VScrollBar", bar)
	t.set_constant("separation", "VBoxContainer", 4); t.set_constant("separation", "HBoxContainer", 4)
	t.set_stylebox("background", "ProgressBar", _style(Color("12151c"), Color("72716b"), 0))
	t.set_stylebox("fill", "ProgressBar", _style(Color("a32233"), Color.TRANSPARENT, 0))
	for key in ["background", "fill"]:
		var bar_style = t.get_stylebox(key, "ProgressBar")
		bar_style.content_margin_top = 0; bar_style.content_margin_bottom = 0
	return t

func _metal_style(asset: String, padding: float) -> StyleBoxTexture:
	var s = StyleBoxTexture.new(); s.texture = load("res://assets/ui/" + asset + ".svg")
	for side in [SIDE_LEFT, SIDE_TOP, SIDE_RIGHT, SIDE_BOTTOM]: s.set_texture_margin(side, 6); s.set_content_margin(side, padding)
	return s

func _style(bg: Color, border: Color, _radius: int) -> StyleBoxFlat:
	var s = StyleBoxFlat.new(); s.bg_color = bg; s.border_color = border
	s.set_border_width_all(1); s.set_corner_radius_all(0)
	s.content_margin_left = 6; s.content_margin_right = 6; s.content_margin_top = 3; s.content_margin_bottom = 3
	return s

func _label(parent: Node, text: String, font_size = 13) -> Label:
	var n = Label.new(); n.text = text; n.add_theme_font_size_override("font_size", font_size); parent.add_child(n); return n

func _button(parent: Node, text: String, callback: Callable) -> Button:
	var b = Button.new(); b.text = text; b.custom_minimum_size.y = 36 if touch else 22; b.pressed.connect(callback); parent.add_child(b); return b

func _row(parent: Node) -> HBoxContainer:
	var n = HBoxContainer.new(); parent.add_child(n); return n

func _panel(parent: Node, pos: Vector2, width: float) -> VBoxContainer:
	var p = PanelContainer.new(); p.position = pos; p.custom_minimum_size.x = width; parent.add_child(p); p.mouse_force_pass_scroll_events = false
	var v = VBoxContainer.new(); p.add_child(v); return v

func _login():
	login_decoration = Control.new(); root.add_child(login_decoration); login_decoration.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); login_decoration.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var title = _label(login_decoration, "ХРОНИКИ ГЛУБИН", 44)
	title.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP); title.offset_left = -380; title.offset_right = 380; title.offset_top = 100; title.offset_bottom = 164
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; title.modulate = Color("eee1bc"); title.add_theme_color_override("font_shadow_color", Color("171c20")); title.add_theme_constant_override("shadow_offset_x", 2); title.add_theme_constant_override("shadow_offset_y", 3)
	var subtitle = _label(login_decoration, "ДВА ГОРОДА  ·  ДРЕВНИЕ КАТАКОМБЫ  ·  ОБЩИЙ МИР", 12)
	subtitle.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP); subtitle.offset_left = -350; subtitle.offset_right = 350; subtitle.offset_top = 166; subtitle.offset_bottom = 190; subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	login_panel = load("res://scripts/window_frame.gd").new(); root.add_child(login_panel)
	login_panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	login_panel.offset_left = -185; login_panel.offset_right = 185; login_panel.offset_top = -55; login_panel.offset_bottom = 130
	var v = VBoxContainer.new(); v.add_theme_constant_override("separation", 8); login_panel.add_child(v)
	_label(v, "Вход в мир", 15).horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var row = _row(v); _label(row, "Имя").custom_minimum_size.x = 58
	login_name = LineEdit.new(); login_name.placeholder_text = "Имя персонажа"; login_name.max_length = 16; login_name.size_flags_horizontal = Control.SIZE_EXPAND_FILL; row.add_child(login_name)
	row = _row(v); _label(row, "Пароль").custom_minimum_size.x = 58
	login_pass = LineEdit.new(); login_pass.secret = true; login_pass.placeholder_text = "Пароль аккаунта"; login_pass.size_flags_horizontal = Control.SIZE_EXPAND_FILL; row.add_child(login_pass)
	login_pass.text_submitted.connect(func(_s): _auth("register" if registration_mode else "login"))
	class_select = OptionButton.new(); class_select.add_item("Воин — меч и тяжёлая броня"); class_select.add_item("Маг — заклинания и исцеление"); v.add_child(class_select); class_select.hide()
	class_select.item_selected.connect(func(_i): _refresh_creation_preview())
	row = _row(v)
	login_submit = _button(row, "Войти", func(): _auth("register" if registration_mode else "login")); login_submit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	login_switch = _button(row, "Создать героя", func():
		registration_mode = not registration_mode; class_select.visible = registration_mode
		login_submit.text = "Создать и войти" if registration_mode else "Войти"
		login_switch.text = "Уже есть герой" if registration_mode else "Создать героя"
		_refresh_creation_preview())
	login_switch.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	continue_button = _button(v, "Продолжить", func(): login_requested.emit({"t": "auth", "token": Network.sessions.get(server_field.text.strip_edges(), {}).get("token", "")}))
	continue_button.visible = not Network.session.is_empty()
	if continue_button.visible: continue_button.text = "Продолжить: " + Network.session.get("name", ""); login_name.text = Network.session.get("name", "")
	var server_toggle = _button(v, "Сервер: Хроники Глубин ▾", func(): server_field.visible = not server_field.visible)
	server_toggle.add_theme_font_size_override("font_size", 11)
	server_field = LineEdit.new(); server_field.text = Network.endpoint; v.add_child(server_field); server_field.hide()
	server_field.text_changed.connect(func(text):
		var saved = Network.sessions.get(text.strip_edges(), {})
		continue_button.visible = not saved.is_empty(); continue_button.text = "Продолжить: " + saved.get("name", ""))
	server_field.tooltip_text = "Общий мир: wss://realms.neuraldeep.ru/ws\nЛокально: ws://127.0.0.1:8790"
	login_message = _label(v, "Подключение…", 11); login_message.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	login_online = _label(v, "Игроков онлайн: —", 12); login_online.modulate = Color("d5c49a")
	var footer = _label(login_decoration, "ХРОНИКИ ГЛУБИН  /  NATIVE CLIENT\nWindows · macOS · Android · iOS", 11)
	footer.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM); footer.offset_left = -250; footer.offset_right = 250; footer.offset_top = -62; footer.offset_bottom = -20; footer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER

func _refresh_creation_preview():
	if is_instance_valid(creation_preview): creation_preview.hide(); creation_preview.queue_free()
	if not registration_mode: return
	creation_preview = load("res://scripts/character_preview.gd").new()
	creation_preview.profile = GameData.catalog.UI_RULES.previewCharacters["warrior" if class_select.selected == 0 else "mage"]
	login_decoration.add_child(creation_preview)
	creation_preview.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	creation_preview.offset_left = 230; creation_preview.offset_right = 490; creation_preview.offset_top = -100; creation_preview.offset_bottom = 215

func _process(_dt):
	login_decoration.visible = login_panel.visible
	login_online.text = "Игроков онлайн: %s" % Network.online_count if Network.online and server_field.text.strip_edges() == Network.endpoint else "Игроков онлайн: — · нет связи с сервером"

func _auth(kind: String):
	login_requested.emit({"t": kind, "name": login_name.text.strip_edges(), "pass": login_pass.text, "cls": "warrior" if class_select.selected == 0 else "mage"})
	login_message.text = "Вход…"

func _game_hud():
	game_ui = Control.new(); root.add_child(game_ui); game_ui.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); game_ui.mouse_filter = Control.MOUSE_FILTER_IGNORE; game_ui.hide()
	var v = _panel(game_ui, Vector2(6, 6), 190 if not touch else 222)
	status_panel = v.get_parent(); v.add_theme_constant_override("separation", 1)
	info = _label(v, "", 11 if not touch else 13)
	hp_bar = ProgressBar.new(); hp_bar.custom_minimum_size = Vector2(174 if not touch else 206, 12 if not touch else 15); v.add_child(hp_bar)
	mp_bar = ProgressBar.new(); mp_bar.custom_minimum_size = hp_bar.custom_minimum_size; v.add_child(mp_bar)
	mp_bar.add_theme_stylebox_override("fill", _style(Color("285897"), Color.TRANSPARENT, 0))
	hp_bar.show_percentage = false; mp_bar.show_percentage = false
	hp_text = _label(hp_bar, "", 11); hp_text.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); hp_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; hp_text.mouse_filter = Control.MOUSE_FILTER_IGNORE
	mp_text = _label(mp_bar, "", 11); mp_text.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); mp_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; mp_text.mouse_filter = Control.MOUSE_FILTER_IGNORE
	xp_bar = ProgressBar.new(); xp_bar.custom_minimum_size.y = 11; xp_bar.show_percentage = false; v.add_child(xp_bar)
	xp_bar.add_theme_stylebox_override("fill", _style(Color("615d93"), Color.TRANSPARENT, 0))
	xp_text = _label(xp_bar, "", 10); xp_text.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); xp_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; xp_text.mouse_filter = Control.MOUSE_FILTER_IGNORE
	zone = _label(v, "", 10); status_label = _label(v, "", 10)
	buffs_row = HBoxContainer.new(); game_ui.add_child(buffs_row); buffs_row.position = Vector2(232 if touch else 204, 8)
	buff_text = _label(buffs_row, "", 11)
	target_panel = PanelContainer.new(); game_ui.add_child(target_panel); target_panel.hide()
	target_panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	target_panel.offset_left = -120; target_panel.offset_right = 120; target_panel.offset_top = 6; target_panel.offset_bottom = 58
	var target_v = VBoxContainer.new(); target_panel.add_child(target_v)
	target_info = _label(target_v, "", 12); target_info.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	target_bar = ProgressBar.new(); target_bar.show_percentage = false; target_bar.custom_minimum_size = Vector2(222, 11); target_v.add_child(target_bar)
	target_hint = _label(target_v, "", 10); target_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var map_panel = PanelContainer.new(); game_ui.add_child(map_panel)
	map_panel.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	map_panel.offset_left = -176; map_panel.offset_right = -8; map_panel.offset_top = 8; map_panel.offset_bottom = 145
	var map_box = VBoxContainer.new(); map_panel.add_child(map_box)
	minimap = load("res://scripts/map.gd").new(); minimap.compact = true; map_box.add_child(minimap)
	var zoom_row = _row(map_box)
	_button(zoom_row, "−", func(): minimap.change_zoom(1.25)).tooltip_text = "Отдалить миникарту"
	var zoom_label = _label(zoom_row, "×%.1f" % (2.0 / minimap.zoom), 10); zoom_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL; zoom_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_button(zoom_row, "+", func(): minimap.change_zoom(0.8)).tooltip_text = "Приблизить миникарту"
	minimap.zoom_changed.connect(func(value): zoom_label.text = "×%.1f" % (2.0 / value))
	party_summary = Button.new(); party_summary.text = "Пати"; party_summary.position = Vector2(8, 120); party_summary.custom_minimum_size = Vector2(182, 24); game_ui.add_child(party_summary)
	party_summary.pressed.connect(func(): toggle("party"))
	var chat_box = _panel(game_ui, Vector2.ZERO, 282 if not touch else 306)
	chat_box.get_parent().add_theme_stylebox_override("panel", _style(Color(0.03, 0.04, 0.035, 0.26), Color(0.48, 0.43, 0.31, 0.45), 0))
	chat_box.get_parent().set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	chat_box.get_parent().offset_left = 6; chat_box.get_parent().offset_right = 288 if not touch else 312
	chat_frame = chat_box.get_parent()
	chat_box.get_parent().offset_top = -330 if not touch else -476
	chat_box.get_parent().offset_bottom = -8 if not touch else -160
	chat = load("res://scripts/chat_panel.gd").new(); chat_box.add_child(chat)
	chat_log = chat.log_view; chat_input = chat.input; chat_channel = chat.channel
	chat.submitted.connect(func(text): action.emit("chat", text))
	chat.settings_requested.connect(func(): toggle("settings"))
	var bottom = VBoxContainer.new(); game_ui.add_child(bottom)
	bottom.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	bottom.offset_left = -244; bottom.offset_right = 244; bottom.offset_top = -114 if not touch else -132; bottom.offset_bottom = -8
	cast_bar = ProgressBar.new(); cast_bar.custom_minimum_size.y = 9; cast_bar.visible = false; bottom.add_child(cast_bar); cast_bar.show_percentage = false
	cast_text = _label(bottom, "", 11); cast_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; cast_text.hide()
	var actions_panel = PanelContainer.new(); bottom.add_child(actions_panel)
	var actions = _row(actions_panel)
	_button(actions, "Атака F", func(): action.emit("attack", null))
	pickup_button = _button(actions, "Поднять Z", func(): action.emit("pickup", null)); pickup_button.tooltip_text = "Поднять ближайшую доступную добычу"
	_button(actions, "Цель Q", func(): action.emit("target", null))
	autoloot_button = CheckBox.new(); autoloot_button.text = "Автолут"; actions.add_child(autoloot_button)
	autoloot_button.toggled.connect(func(value): action.emit("autoloot", value))
	_button(actions, "Панель…", func(): toggle("actions"))
	hotbar_lock = CheckBox.new(); hotbar_lock.text = "Замок"; hotbar_lock.tooltip_text = "Снимите замок, чтобы перетащить навыки из K и поменять ячейки местами"; actions.add_child(hotbar_lock)
	hotbar_lock.toggled.connect(set_hotbar_locked)
	var hotbar_panel = PanelContainer.new(); bottom.add_child(hotbar_panel)
	var hotbar = _row(hotbar_panel); hotbar.add_theme_constant_override("separation", 2)
	for i in 10:
		var index = i
		var button = load("res://scripts/hotbar_slot.gd").new(); button.index = i
		button.custom_minimum_size = Vector2(42 if not touch else 50, 40 if not touch else 48); button.expand_icon = true; button.add_theme_constant_override("icon_max_width", 30)
		_slot_style(button)
		hotbar.add_child(button); button.pressed.connect(func(): activate_slot(index)); button.swap_requested.connect(swap_slots)
		button.binding_requested.connect(func(slot, id):
			if not hotbar_locked and int(profile.get("skills", {}).get(id, 0)) > 0: assign_slot(slot, id))
		button.add_theme_font_size_override("font_size", 10)
		var number = _label(button, str(i + 1) if i < 9 else "0", 9); number.position = Vector2(3, 0); number.mouse_filter = Control.MOUSE_FILTER_IGNORE
		skill_buttons.append(button); hotbar_labels.append(number)
	quick_hint = _label(bottom, "F — атака · Q — цель · Tab — сумка · Z — подбор · E — разговор", 10); quick_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var commands = PanelContainer.new(); game_ui.add_child(commands)
	commands.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	commands.offset_left = -238; commands.offset_right = -8; commands.offset_top = -43; commands.offset_bottom = -8
	var menu = _row(commands)
	for entry in [["Герой", "character"], ["Сумка", "inventory"], ["Карта", "map"], ["Меню", "menu"]]:
		var button = _button(menu, entry[0], func(): action.emit(entry[1], null)); button.custom_minimum_size = Vector2(51 if not touch else 60, 24 if not touch else 36); button.add_theme_font_size_override("font_size", 11)
	if touch:
		joystick = load("res://scripts/joystick.gd").new(); game_ui.add_child(joystick)
		joystick.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
		joystick.offset_left = 14; joystick.offset_right = 154; joystick.offset_top = -150; joystick.offset_bottom = -10
		joystick.changed.connect(func(value): action.emit("joystick", value))
		quick_hint.text = "Джойстик — идти · Свайп — камера"
	dead_panel = PanelContainer.new(); game_ui.add_child(dead_panel); dead_panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	dead_panel.offset_left = -165; dead_panel.offset_right = 165; dead_panel.offset_top = -65; dead_panel.offset_bottom = 65; dead_panel.hide()
	var death_v = VBoxContainer.new(); dead_panel.add_child(death_v)
	_label(death_v, "Вы пали в бою", 20); _label(death_v, "Возрождение в родном городе.")
	_button(death_v, "Возродиться", func(): action.emit("respawn", null))

func enter(p: Dictionary):
	login_panel.hide(); game_ui.show(); update_profile(p)

func update_profile(p: Dictionary):
	profile = p; current_stats = GameData.stats(p, active_buffs)
	if not enchant_scroll.is_empty() and not p.inv.any(func(e): return e.id == enchant_scroll): enchant_scroll = ""
	if window_kind in ["inventory", "character", "shop", "teleport", "priest", "skills", "craft"]: show_window(window_kind, true)
	if hotbar_class != p.cls:
		hotbar_class = p.cls
		hotbar_bindings = Settings.read_value("hotbar", p.cls, default_bindings()).duplicate()
		if hotbar_bindings.size() != 10: hotbar_bindings = default_bindings()
		var choices = binding_choices()
		for i in 10:
			if hotbar_bindings[i] not in choices: hotbar_bindings[i] = "empty"
		hotbar_locked = bool(Settings.read_value("hotbar", "locked", true))
	autoloot_button.set_pressed_no_signal(p.get("autoloot", true))
	_refresh_hotbar()

func update_values(p: Dictionary, s: Dictionary, pos: Vector3, target, cooldowns: Dictionary, cast_time: float):
	if p.is_empty(): return
	info.text = "Ур. %s   %s" % [int(p.lvl), p.name]
	hp_bar.max_value = s.maxHp; hp_bar.value = p.hp; hp_bar.tooltip_text = "Здоровье: %s / %s" % [int(p.hp), int(s.maxHp)]
	hp_text.text = "HP  %s / %s" % [int(p.hp), int(s.maxHp)]
	mp_bar.max_value = s.maxMp; mp_bar.value = p.mp; mp_bar.tooltip_text = "Мана: %s / %s" % [int(p.mp), int(s.maxMp)]
	mp_text.text = "MP  %s / %s" % [int(p.mp), int(s.maxMp)]
	profile = p; current_stats = s
	xp_text.text = "EXP  %.2f%%" % (100.0 * p.xp / GameData.xp_next(int(p.lvl))) if p.lvl < 40 else "Максимальный уровень"
	var buff_lines: Array[String] = []
	for buff in active_buffs:
		if buff.until > Time.get_ticks_msec(): buff_lines.append("%s · %s с" % [GameData.catalog.SKILLS[buff.id].name, ceili((buff.until - Time.get_ticks_msec()) / 1000.0)])
	buff_text.text = "\n".join(buff_lines); buff_text.visible = not buff_lines.is_empty()
	xp_bar.max_value = GameData.xp_next(int(p.lvl)); xp_bar.value = p.xp
	var z = GameData.zone_at(pos)
	zone.text = z.name + " · " + str(z.lv)
	status_label.text = ("Игроков онлайн: %s" % Network.online_count if Network.authed else "Переподключение…") + "  ·  %s SP" % int(p.get("sp", 0))
	if p.get("karma", 0) > 0: status_label.text += " · Карма %s" % int(p.karma)
	target_panel.visible = is_instance_valid(target) and target.visible
	target_info.text = target.display_name if is_instance_valid(target) else ""
	target_info.modulate = Color("f2c67e") if is_instance_valid(target) and target.kind == "n" else Color("ffdfbc")
	if target_panel.visible: target_hint.text = "Повержен" if target.dead else ("E — разговор" if target.kind == "n" else "HP %s%%  ·  F — атака" % int(target.hp))
	target_bar.visible = is_instance_valid(target) and target.kind != "n"
	if target_bar.visible: target_bar.value = target.hp
	dead_panel.visible = p.get("dead", false)
	cast_bar.visible = cast_time > 0; cast_bar.max_value = maxf(0.01, cast_duration); cast_bar.value = cast_duration - cast_time
	cast_text.visible = cast_time > 0; cast_text.text = "%s · %.1f с" % [cast_name, cast_time]
	for i in hotbar_bindings.size():
		var id = str(hotbar_bindings[i]); var button = skill_buttons[i]
		var unavailable = not Network.authed or p.get("dead", false) or id == "empty"
		if id in GameData.catalog.SKILLS:
			var remaining = maxf(0, (cooldowns.get(id, 0) - Time.get_ticks_msec()) / 1000.0)
			button.text = "%.1f" % remaining if remaining > 0 else ""
			unavailable = unavailable or int(p.get("skills", {}).get(id, 0)) == 0 or remaining > 0
		elif id in GameData.catalog.ITEMS:
			var count = 0
			for item in p.inv:
				if item.id == id: count += int(item.n)
			button.text = str(count); unavailable = unavailable or count == 0
		# Editing must also work on empty cells and skills on cooldown.
		button.disabled = unavailable and hotbar_locked
		button.modulate = Color(0.55, 0.55, 0.55) if unavailable and not hotbar_locked else Color.WHITE
	autoloot_button.disabled = not Network.authed
	pickup_button.disabled = not Network.authed or p.get("dead", false)
	chat.fit_height(get_viewport().get_visible_rect().size.y + chat_frame.offset_bottom - 152 - chat_frame.get_theme_stylebox("panel").get_minimum_size().y)
	chat_frame.offset_top = chat_frame.offset_bottom - chat_frame.get_combined_minimum_size().y
	if is_instance_valid(map_control): map_control.player_position = pos; map_control.queue_redraw()
	minimap.player_position = pos; minimap.queue_redraw()

func log_line(text: String, category = "info"):
	chat.add_message({"ch": "sys", "text": text, "category": category})

func close_window():
	if is_instance_valid(window):
		window_positions[window_kind] = window.position; window.hide(); window.queue_free()
	window = null; window_kind = ""; map_control = null; window_scroll = null

func toggle(kind: String):
	if window_kind == kind: close_window()
	else: show_window(kind)

func show_window(kind: String, refresh = false):
	var search_cursor = bag_search.caret_column if refresh and is_instance_valid(bag_search) and bag_search.has_focus() else -1
	var scroll_y = window_scroll.scroll_vertical if refresh and is_instance_valid(window_scroll) else 0
	close_window(); window_kind = kind
	window = load("res://scripts/window_frame.gd").new(); game_ui.add_child(window)
	window.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	var dimensions = get_viewport().get_visible_rect().size
	var desired = {"inventory": Vector2(490, 478), "character": Vector2(410, 630), "shop": Vector2(500, 540), "map": Vector2(760, 530), "menu": Vector2(360, 405), "settings": Vector2(450, 540), "actions": Vector2(440, 530), "skills": Vector2(530, 570), "teleport": Vector2(480, 470), "priest": Vector2(370, 230), "controls": Vector2(500, 510)}.get(kind, Vector2(500, 520))
	if touch: desired.x += 35; desired.y += 35
	if kind == "inventory" and touch: desired = Vector2(420, 640)
	var half = Vector2(minf(desired.x, dimensions.x - 16), minf(desired.y, dimensions.y - 16)) * 0.5
	window.offset_left = -half.x; window.offset_right = half.x; window.offset_top = -half.y; window.offset_bottom = half.y
	window_body = VBoxContainer.new(); window.add_child(window_body)
	if kind in ["inventory", "character", "skills"]:
		window.position = Vector2(dimensions.x - half.x * 2 - 188, 76)
	if window_positions.has(kind): window.position = window_positions[kind]
	var row = _row(window_body); row.mouse_filter = Control.MOUSE_FILTER_STOP; row.gui_input.connect(window.drag_title)
	var titles = {"inventory": "Инвентарь", "character": "Персонаж", "map": "Карта мира", "shop": "Торговец", "teleport": "Хранитель врат", "priest": "Жрец", "menu": "Меню игры", "settings": "Настройки", "controls": "Управление", "skills": "Умения", "actions": "Панель действий", "craft": "Изготовление", "equipment": "Путь снаряжения", "party": "Группа"}
	var title = _label(row, titles.get(kind, kind), 12); title.size_flags_horizontal = Control.SIZE_EXPAND_FILL; title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; title.modulate = Color("d4c49b")
	_button(row, "×", close_window).tooltip_text = "Закрыть · Esc"
	if kind == "map":
		map_control = load("res://scripts/map.gd").new(); window_body.add_child(map_control); map_control.size_flags_vertical = Control.SIZE_EXPAND_FILL
		_wrapped(window_body, "Красные — мобы · Голубые — игроки · Золотые — NPC · Бирюзовая — вы\nПоказаны живые существа в области видимости сервера.", 13)
		return
	window_scroll = ScrollContainer.new(); window_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	window_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; window_body.add_child(window_scroll)
	var list = VBoxContainer.new(); list.size_flags_horizontal = Control.SIZE_EXPAND_FILL; window_scroll.add_child(list)
	match kind:
		"inventory": _inventory_grid(list)
		"character": _character(list)
		"shop": _shop(list)
		"craft": _craft(list)
		"equipment": _equipment_guide(list)
		"teleport":
			_wrapped(list, "Хранитель перенесёт вас в выбранную область. Возрождение — в родном городе: " + _home_name())
			_label(list, "Монеты: %s" % int(profile.coins))
			for t in GameData.world.teleports:
				var b = _button(list, "%s · %s" % [t.name, "%s мон." % int(t.cost) if t.cost > 0 else "бесплатно"], func(): action.emit("teleport", t.id))
				b.disabled = profile.coins < t.cost or not Network.authed; b.set_meta("teleport", t.id)
		"priest":
			var karma = float(profile.get("karma", 0)); var cost = ceili(karma) * 5
			_label(list, "Карма: %s · Монеты: %s" % [ceili(karma), int(profile.coins)], 20)
			_wrapped(list, "Ваша душа чиста. Очищение не требуется." if karma <= 0 else "Очищение снимет карму за %s монет. Счётчик PK сохраняется." % cost)
			var b = _button(list, "Очистить карму · %s мон." % cost, func(): action.emit("wash", null))
			b.disabled = karma <= 0 or profile.coins < cost or not Network.authed
		"skills": _skills(list)
		"actions": _actions_settings(list)
		"menu":
			_label(list, "Персонаж: %s · %s" % [profile.name, GameData.catalog.CLASSES[profile.cls].name], 20)
			_wrapped(list, "Сервер: %s\n%s · Игроков в мире: %s" % [Network.endpoint, "Подключено" if Network.authed else "Переподключение…", Network.online_count])
			for line in rates_lines(): _wrapped(list, line)
			var grid = GridContainer.new(); grid.columns = 2; list.add_child(grid)
			for entry in [["Сумка · Tab / I", "inventory"], ["Персонаж · C", "character"], ["Умения · K", "skills"], ["Группа / Пати", "party"], ["Панель действий", "actions"], ["Оружие и броня", "equipment"], ["Карта мира · M", "map"], ["Настройки", "settings"], ["Управление", "controls"]]:
				_button(grid, entry[0], func(): show_window(entry[1])).size_flags_horizontal = Control.SIZE_EXPAND_FILL
			_button(list, "Вернуть камеру за спину · V", func(): action.emit("camera", null); close_window())
			_button(list, "Полный экран / окно · F11", func(): action.emit("fullscreen", null))
			_button(list, "Сменить персонажа / сервер", func(): action.emit("logout", null))
			_button(list, "Вернуться в игру", close_window)
		"party": _party(list)
		"settings": _settings(list)
		"controls":
			for line in ["WASD / ЛКМ по земле — движение", "ЛКМ по цели — выбрать; ещё раз — атаковать", "F — атака · Q — следующая цель · E — разговор", "Z / 9 — подобрать ближайшую добычу; клик — подойти и поднять", "1–3 — умения · 4–5 — зелья здоровья и маны", "Tab / I — сумка · C — персонаж · K — умения · M — карта", "ПКМ и движение мыши — камера · Колесо — приближение", "V — камера за спиной · F11 — полный экран · Esc — меню", "Ctrl + атака — PvP; на телефоне включите PvP в окне героя", "Enter — чат · /w Имя текст — ЛС · /r текст — ответ", "+текст — торговый чат · Нажмите на имя в чате для ЛС", "Телефон: джойстик — движение; свайп по миру — камера", "Два пальца — масштаб; двойное нажатие на вещь — действие"]:
				_wrapped(list, line)
	window_scroll.set_deferred("scroll_vertical", scroll_y)
	if search_cursor >= 0 and kind == "inventory": bag_search.grab_focus(); bag_search.caret_column = search_cursor

# Строка действующих рейтов сервера. Только показ: значения приходят в кадре hi,
# клиент по ним ничего не считает. Пустой список — сервер без поддержки рейтов.
const RATE_LABELS = {"xp": "опыт", "sp": "SP", "coins": "монеты", "dropChance": "дроп", "dropAmount": "количество дропа",
	"craftCost": "цена крафта", "enchantChance": "шанс заточки", "sellPrice": "цена продажи", "buyPrice": "цена покупки",
	"respawn": "респавн", "partyBonus": "бонус группы"}
const RATE_MAIN = ["xp", "sp", "coins", "dropChance"]

func rate_text(value: float) -> String:
	return ("%.2f" % value).rstrip("0").rstrip(".").replace(".", ",")

func rates_lines() -> Array:
	var rates = Network.rates
	if rates.is_empty(): return []
	var main = []
	for key in RATE_MAIN:
		if rates.has(key): main.append("%s ×%s" % [RATE_LABELS[key], rate_text(float(rates[key]))])
	if main.is_empty(): return []
	var lines = ["Рейты: " + ", ".join(main)]
	var extra = []
	for key in RATE_LABELS:
		if key in RATE_MAIN or not rates.has(key) or is_equal_approx(float(rates[key]), 1.0): continue
		extra.append("%s ×%s" % [RATE_LABELS[key], rate_text(float(rates[key]))])
	if not extra.is_empty(): lines.append("Ещё: " + ", ".join(extra))
	return lines

func _wrapped(parent: Node, text: String, font_size = 13) -> Label:
	var label = _label(parent, text, font_size); label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return label

func _home_name() -> String:
	for town in GameData.world.towns:
		if town.id == profile.get("home", "harbor"): return town.name
	return "Светлая Гавань"

func _item_row(parent, id: String, text: String) -> HBoxContainer:
	var row = _row(parent)
	var tex = load("res://scripts/skill_icon.gd").new() if GameData.catalog.SKILLS.has(id) else TextureRect.new()
	tex.texture = GameData.icon(id)
	if GameData.catalog.SKILLS.has(id):
		tex.skill_id = id; tex.learned = int(profile.get("skills", {}).get(id, 0)) > 0
		tex.set_meta("skill_icon", id); tex.mouse_filter = Control.MOUSE_FILTER_STOP
		tex.tooltip_text = "Перетащите на разблокированную панель" if tex.learned else "Сначала изучите навык"
	tex.custom_minimum_size = Vector2(36, 36); tex.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; tex.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED; row.add_child(tex)
	var label = _wrapped(row, text, 15); label.tooltip_text = _skill_description(id) if GameData.catalog.SKILLS.has(id) else _item_description(id)
	return row

func _item_description(id: String, ench = 0) -> String:
	var it = GameData.catalog.ITEMS[id]; var result = it.name + (" +%s" % ench if ench > 0 else "")
	if it.has("grade"): result += " · %s" % ("Без ранга" if it.grade == "none" else "Ранг " + str(it.grade).to_upper())
	if it.get("twoHand", false): result += " · Двуручный посох"
	if it.get("robe", false): result += " · Мантия"
	if it.get("full", false): result += " · Полный доспех (занимает поножи)"
	for key in ["patk", "matk", "pdef", "mdef", "hp", "mp", "crit", "lvl", "w"]:
		if not it.has(key): continue
		var value = GameData.ench_value(it, key, ench) if key in ["patk", "matk", "pdef", "mdef"] else float(it[key])
		result += "\n%s: %s" % [STAT_NAMES[key], "%.1f%%" % (value * 100) if key == "crit" else str(snappedf(value, 0.01))]
	if it.get("use") == "ench": result += "\nУсиление: до +%s безопасно; далее %s%% успеха. При неудаче предмет превращается в кристаллы." % [int(GameData.catalog.UI_RULES.safeEnch), int(GameData.catalog.UI_RULES.enchChance * 100)]
	if it.has("slot") and not profile.is_empty():
		var reason = GameData.wear_error(profile, it)
		if not reason.is_empty(): result += "\n" + reason
	for st in GameData.catalog.SETS.values():
		if id in st.parts:
			result += "\nКомплект «%s»: %s" % [st.name, _bonus_text(st.bonus)]
	return result

func _bonus_text(bonus: Dictionary) -> String:
	var parts: Array[String] = []
	for key in bonus:
		parts.append("%s +%s" % [STAT_NAMES.get(key, key), "%.0f%%" % (bonus[key] * 100) if key in ["crit", "cast"] else str(bonus[key])])
	return ", ".join(parts)

func _shop(list):
	_button(list, "Изготовить за материалы…", func(): show_window("craft"))
	_label(list, "Ваши монеты: %s" % int(profile.coins), 20)
	var tabs = _row(list)
	for entry in [["Купить", "buy"], ["Продать", "sell"]]:
		var b = _button(tabs, entry[0], func(): shop_tab = entry[1]; show_window("shop"))
		b.toggle_mode = true; b.button_pressed = shop_tab == entry[1]; b.set_meta("shop_tab", entry[1])
	if shop_tab == "buy":
		for id in GameData.catalog.SHOP:
			var it = GameData.catalog.ITEMS[id]; var row = _item_row(list, id, "%s\n%s мон. · Ур. %s" % [it.name, int(it.price), int(it.get("lvl", 1))])
			var b = _button(row, "Купить", func(): action.emit("buy", id)); b.disabled = profile.coins < it.price or not Network.authed; b.set_meta("buy", id)
			if it.get("stack", false):
				b = _button(row, "×10", func(): action.emit("buy_stack", {"id": id, "n": 10})); b.disabled = profile.coins < it.price * 10 or not Network.authed
	else:
		if profile.inv.is_empty(): _label(list, "В сумке нет вещей для продажи.")
		for i in profile.inv.size():
			var index = i; var item = profile.inv[i]; var it = GameData.catalog.ITEMS[item.id]; var price = GameData.sell_price(item.id)
			var row = _item_row(list, item.id, "%s%s ×%s\n%s мон. за штуку" % [it.name, " +%s" % int(item.e) if item.get("e", 0) > 0 else "", int(item.n), price])
			var b = _button(row, "Продать 1", func(): action.emit("sell", index)); b.set_meta("sell", index); b.disabled = not Network.authed or price <= 0
			if item.n > 1:
				b = _button(row, "Все · %s" % (price * int(item.n)), func(): action.emit("sell_stack", {"idx": index, "n": int(item.n)})); b.set_meta("sell_stack", item.id); b.disabled = not Network.authed or price <= 0

func _character(list):
	var preview = load("res://scripts/character_preview.gd").new(); preview.profile = profile; list.add_child(preview)
	_label(list, "%s · %s · Уровень %s" % [profile.name, GameData.catalog.CLASSES[profile.cls].name, int(profile.lvl)], 22)
	_label(list, "SP: %s · Монеты: %s" % [_money(int(profile.get("sp", 0))), _money(int(profile.coins))])
	_label(list, "Родной город: " + _home_name())
	_label(list, "HP %s / %s · MP %s / %s" % [int(profile.hp), int(current_stats.maxHp), int(profile.mp), int(current_stats.maxMp)])
	_label(list, "Опыт: %s / %s · %.1f%%" % [int(profile.xp), GameData.xp_next(int(profile.lvl)), 100.0 * profile.xp / GameData.xp_next(int(profile.lvl))])
	var b = _button(list, "PvP: ВКЛЮЧЁН" if pvp_enabled else "PvP: выключен", func(): action.emit("pvp", null)); b.set_meta("pvp", true)
	var grid = GridContainer.new(); grid.columns = 2; list.add_child(grid)
	for pair in [["str", "STR · Сила"], ["dex", "DEX · Ловкость"], ["con", "CON · Выносливость"], ["int", "INT · Интеллект"], ["wit", "WIT · Мудрость"], ["men", "MEN · Дух"]]:
		_label(grid, "%s: %s" % [pair[1], int(current_stats.attr[pair[0]])]).size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for key in ["patk", "matk", "pdef", "mdef", "acc", "eva", "crit", "aspd", "cast", "speed", "range"]:
		_label(grid, "%s: %s" % [STAT_NAMES[key], "%.1f%%" % (current_stats[key] * 100) if key == "crit" else "%.2f" % current_stats[key]])
	_label(list, "Вес: %.1f / %s · Убийств мобов: %s" % [current_stats.load, int(current_stats.cap), int(profile.get("kills", 0))])
	_label(list, "Карма: %s · PvP: %s · PK: %s" % [ceili(profile.get("karma", 0)), int(profile.get("pvp", 0)), int(profile.get("pk", 0))])
	if current_stats.sets.is_empty(): _label(list, "Комплекты: нет надетых частей")
	for st in current_stats.sets:
		_wrapped(list, "%s · %s/%s · %s\n%s" % [st.name, int(st.have), st.parts.size(), "Бонус активен" if st.have == st.parts.size() else "Неполный комплект", _bonus_text(st.bonus)])

func _inventory_grid(parent):
	if current_stats.load > current_stats.cap * 0.7: _wrapped(parent, "Перегруз: скорость −40%, восстановление −50%. Освободите сумку.", 13).modulate = Color("f3b37d")
	if enchant_scroll != "":
		_wrapped(parent, "Выберите вещь для усиления. После +3 неудача уничтожает вещь. Шанс успеха: 66%.", 13)
		_button(parent, "Отменить усиление", func(): enchant_scroll = ""; show_window("inventory"))
	var columns: BoxContainer = VBoxContainer.new() if touch else HBoxContainer.new(); parent.add_child(columns)
	columns.add_theme_constant_override("separation", 8)
	var worn = VBoxContainer.new(); columns.add_child(worn); _label(worn, "Снаряжение", 11)
	var equip_grid: Control
	if touch:
		var grid = GridContainer.new(); grid.columns = 6; worn.add_child(grid); equip_grid = grid
	else:
		equip_grid = Control.new(); equip_grid.custom_minimum_size = Vector2(180, 248); worn.add_child(equip_grid)
		var preview = load("res://scripts/character_preview.gd").new(); preview.compact = true; preview.profile = profile
		equip_grid.add_child(preview); preview.position = Vector2(33, 16); preview.size = Vector2(114, 224)
		preview.set_meta("inventory_preview", true)
	var left_slots = ["weapon", "head", "armor", "gloves", "legs", "feet"]
	var right_slots = ["shield", "neck", "ear1", "ear2", "ring1", "ring2"]
	for slot in GameData.catalog.SLOTS:
		var id = profile.equip.get(slot.id)
		var payload = {"source": "inventory", "slot": slot.id, "id": id, "e": profile.get("enc", {}).get(slot.id, 0)} if id != null else {}
		var b = _slot(equip_grid, payload, slot.name); b.slot_type = slot.type; b.set_meta("equipment_slot", slot.id)
		if not touch:
			var left_index = left_slots.find(slot.id)
			b.position = Vector2(0 if left_index >= 0 else 142, (left_index if left_index >= 0 else right_slots.find(slot.id)) * 40)
		if slot.id == "shield" and GameData.catalog.ITEMS.get(profile.equip.get("weapon"), {}).get("twoHand", false): b.text = "2Р"; b.tooltip_text = "Посох занимает обе руки. Надевание щита снимет посох."
		if slot.id == "legs" and GameData.catalog.ITEMS.get(profile.equip.get("armor"), {}).get("full", false): b.text = "Латы"; b.tooltip_text = "Полный доспех занимает этот слот. Надевание поножей снимет доспех."
		b.item_dropped.connect(func(item): action.emit("equip_slot", {"idx": item.idx, "slot": slot.id}))
	var bag = VBoxContainer.new(); bag.size_flags_horizontal = Control.SIZE_EXPAND_FILL; columns.add_child(bag)
	_label(bag, "Предметы   ·   %s ячеек" % profile.inv.size(), 12)
	var filters = _row(bag)
	for i in 4:
		var index = i
		var b = _button(filters, ["Все", "Экип.", "Расход.", "Добыча"][i], func(): bag_filter = index; show_window("inventory", true))
		b.toggle_mode = true; b.button_pressed = bag_filter == i; b.set_meta("bag_filter", i)
	var tools = _row(bag)
	var search = LineEdit.new(); bag_search = search; search.placeholder_text = "Найти предмет…"; search.text = bag_query; search.size_flags_horizontal = Control.SIZE_EXPAND_FILL; tools.add_child(search); search.set_meta("bag_search", true)
	search.text_changed.connect(func(value): bag_query = value; _fill_bag())
	var sort_menu = OptionButton.new(); sort_menu.add_item("Порядок"); sort_menu.add_item("Имя"); sort_menu.add_item("Ранг"); sort_menu.select(bag_sort); tools.add_child(sort_menu)
	sort_menu.item_selected.connect(func(index): bag_sort = index; _fill_bag())
	var scroll = ScrollContainer.new(); scroll.custom_minimum_size = Vector2(0, 220 if not touch else 208); scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL; bag.add_child(scroll)
	bag_grid = GridContainer.new(); bag_grid.columns = 6; bag_grid.add_theme_constant_override("h_separation", 1); bag_grid.add_theme_constant_override("v_separation", 1); scroll.add_child(bag_grid); _fill_bag()
	var selected: Dictionary = {}
	var selected_index = int(selected_item.get("idx", -1))
	if selected_index >= 0 and selected_index < profile.inv.size() and profile.inv[selected_index].id == selected_item.get("id"):
		selected = profile.inv[selected_index].duplicate(); selected.idx = selected_index; selected.source = "inventory"
	if selected_item.has("slot"):
		var slot = selected_item.slot; var id = profile.equip.get(slot)
		if id != null: selected = {"source": "inventory", "slot": slot, "id": id, "e": profile.get("enc", {}).get(slot, 0)}
	item_details = VBoxContainer.new(); item_details.custom_minimum_size.y = 52; parent.add_child(item_details)
	if not selected.is_empty(): _select_item(selected)
	else: selected_item = {}; _wrapped(item_details, "Выберите предмет · двойной щелчок — надеть или использовать.", 11)

	# Fixed wallet stays visible even when the inventory contents scroll.
	var wallet = VBoxContainer.new(); window_body.add_child(wallet)
	wallet_label = _label(wallet, "●  %s  монет" % _money(int(profile.coins)), 13); wallet_label.modulate = Color("e5c779")
	wallet_label.tooltip_text = "Монеты зачисляет сервер: автолут или ручной подбор. Z — ближайшая добыча."
	var weight = ProgressBar.new(); weight.custom_minimum_size.y = 11; weight.max_value = current_stats.cap; weight.value = current_stats.load; wallet.add_child(weight)
	weight.tooltip_text = "Вес: %.1f / %s" % [current_stats.load, int(current_stats.cap)]

func _money(value: int) -> String:
	var digits = str(value); var result = ""
	for i in digits.length():
		if i > 0 and (digits.length() - i) % 3 == 0: result += " "
		result += digits[i]
	return result

func _fill_bag():
	if not is_instance_valid(bag_grid): return
	for child in bag_grid.get_children(): child.free()
	var entries: Array = []
	for i in profile.inv.size():
		var payload = profile.inv[i].duplicate(); var it = GameData.catalog.ITEMS[payload.id]
		if not bag_query.is_empty() and not str(it.name).to_lower().contains(bag_query.to_lower()): continue
		if bag_filter == 1 and not it.has("slot"): continue
		if bag_filter == 2 and not it.has("use"): continue
		if bag_filter == 3 and (it.has("slot") or it.has("use")): continue
		payload.idx = i; payload.source = "inventory"; entries.append(payload)
	if bag_sort > 0:
		entries.sort_custom(func(a, b):
			var ia = GameData.catalog.ITEMS[a.id]; var ib = GameData.catalog.ITEMS[b.id]
			if bag_sort == 2 and ia.get("grade", "none") != ib.get("grade", "none"):
				return ["none", "d", "c", "b", "a", "s"].find(ia.get("grade", "none")) > ["none", "d", "c", "b", "a", "s"].find(ib.get("grade", "none"))
			return str(ia.name).naturalnocasecmp_to(ib.name) < 0)
	for i in maxi(36, ceili(entries.size() / 6.0) * 6):
		var b = _slot(bag_grid, entries[i] if i < entries.size() else {}, ""); b.accept_equipped = true
		b.item_dropped.connect(func(item): action.emit("unequip", item.slot))

func _slot(parent, payload: Dictionary, empty_name: String) -> Button:
	var b = load("res://scripts/item_slot.gd").new(); b.payload = payload
	b.custom_minimum_size = Vector2(36 if not touch else 48, 36 if not touch else 48); b.expand_icon = true; b.add_theme_constant_override("icon_max_width", 30 if not touch else 36); b.clip_text = true; _slot_style(b); parent.add_child(b)
	if payload.is_empty(): b.tooltip_text = empty_name; b.add_theme_font_size_override("font_size", 9)
	else:
		b.icon = GameData.icon(payload.id); b.tooltip_text = _item_description(payload.id, int(payload.get("e", 0)))
		var amount = "×%s" % int(payload.n) if payload.get("n", 1) > 1 else ("+%s" % int(payload.e) if payload.get("e", 0) > 0 else "")
		if not amount.is_empty():
			var count = _label(b, amount, 10); count.mouse_filter = Control.MOUSE_FILTER_IGNORE; count.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
			count.offset_left = -32; count.offset_top = -13; count.offset_right = -2; count.offset_bottom = -1; count.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
			count.add_theme_color_override("font_outline_color", Color.BLACK); count.add_theme_constant_override("outline_size", 2)
		if enchant_scroll != "": b.modulate = Color("ffe0a0") if GameData.enchant_error(payload.id, int(payload.get("e", 0)), enchant_scroll).is_empty() else Color("727d86")
		b.pressed.connect(func(): _select_item(payload)); b.activated.connect(func(): _activate_item(payload))
	return b

func _slot_style(button: Button):
	for state in ["normal", "hover", "pressed", "disabled", "focus"]:
		var s = _style(Color(0.035, 0.05, 0.045, 0.88), Color("b7a473") if state in ["hover", "pressed", "focus"] else Color("535343"), 0)
		s.content_margin_left = 2; s.content_margin_right = 2; s.content_margin_top = 2; s.content_margin_bottom = 2
		button.add_theme_stylebox_override(state, s)

func _activate_item(item: Dictionary):
	if enchant_scroll != "":
		var reason = GameData.enchant_error(item.id, int(item.get("e", 0)), enchant_scroll)
		if not reason.is_empty(): log_line(reason); return
		var ref = {"slot": item.slot} if item.has("slot") else {"bag": item.idx}
		action.emit("enchant", {"scroll": enchant_scroll, "ref": ref}); return
	if item.has("slot"): action.emit("unequip", item.slot); return
	var it = GameData.catalog.ITEMS[item.id]
	if it.has("slot"): action.emit("equip", item.idx)
	elif it.get("use") == "ench": enchant_scroll = item.id; show_window("inventory", true)
	elif it.has("use"): action.emit("use", item.id)

func _select_item(item: Dictionary):
	selected_item = item.duplicate()
	for child in item_details.get_children(): item_details.remove_child(child); child.queue_free()
	var it = GameData.catalog.ITEMS[item.id]
	_wrapped(item_details, _item_description(item.id, int(item.get("e", 0))).replace("\n", " · "), 13)
	var actions = _row(item_details)
	var title = "Усилить" if enchant_scroll != "" else ("Снять" if item.has("slot") else ("Надеть" if it.has("slot") else ("Усиление…" if it.get("use") == "ench" else "Использовать")))
	if it.has("slot") or it.has("use"):
		var b = _button(actions, title, func(): _activate_item(item))
		var reason = GameData.enchant_error(item.id, int(item.get("e", 0)), enchant_scroll) if enchant_scroll != "" else (GameData.wear_error(profile, it) if it.has("slot") and not item.has("slot") else "")
		b.disabled = not reason.is_empty() or not Network.authed; b.tooltip_text = reason; b.set_meta("item_action", item.id)
	if item.has("idx"):
		var b = _button(actions, "Продать · %s мон." % GameData.sell_price(item.id), func(): action.emit("sell", item.idx)); b.tooltip_text = "Подойдите к торговцу"; b.disabled = GameData.sell_price(item.id) <= 0 or not Network.authed

func _skill_description(id: String) -> String:
	var sk = GameData.skill(profile, id)
	var result = "%s · Уровень %s\nМана: %s · Перезарядка: %s с" % [sk.name, int(sk.lvl), int(sk.mp), sk.cd]
	if sk.has("cast"): result += "\nПодготовка: %.2f с" % (sk.cast / maxf(0.1, current_stats.get("cast", 1)))
	if sk.has("mul"): result += "\nСила: ×%s" % sk.mul
	if sk.has("radius"): result += "\nРадиус: %s" % sk.radius
	if sk.has("range"): result += "\nДальность: %s" % sk.range
	if sk.has("dur"): result += "\nДлительность: %s с" % sk.dur
	if sk.kind == "heal": result += "\nВосстанавливает %s%% здоровья" % int(sk.amount * 100)
	return result

func _skills(list):
	_label(list, "Очки навыков: %s SP" % _money(int(profile.get("sp", 0))), 17)
	_wrapped(list, "SP накапливаются за убийства. Новые ранги открываются на указанных уровнях и изучаются здесь. Базовая атака первого уровня уже изучена.", 12)
	_wrapped(list, "Снимите «Замок» над панелью и перетащите иконку изученного навыка в нужную ячейку.", 12)
	for id in GameData.catalog.CLASSES[profile.cls].skills:
		var ranks = GameData.catalog.UI_RULES.skillRanks[id]; var learned = int(profile.get("skills", {}).get(id, 0))
		var row = _item_row(list, id, "%s · Ранг %s/%s" % [GameData.catalog.SKILLS[id].name, learned, ranks.size()])
		var button = _button(row, "Применить", func(): action.emit("skill", id)); button.disabled = learned == 0 or not Network.authed or profile.get("dead", false)
		_wrapped(list, _skill_description(id), 12)
		if learned < ranks.size():
			var next = ranks[learned]; var rank = learned + 1
			var effect = "Сила ×%s" % next.mul if next.has("mul") else "Исцеление %s%%" % int(next.get("amount", 0) * 100)
			_wrapped(list, "Следующий ранг %s · уровень %s · %s SP\n%s · %s MP" % [rank, int(next.lvl), int(next.sp), effect, int(next.mp)], 12)
			button = _button(list, "Изучить ранг %s · %s SP" % [rank, int(next.sp)], func(): action.emit("learn", {"id": id, "rank": rank}))
			button.set_meta("learn", id)
			button.disabled = not Network.authed or profile.get("dead", false) or profile.lvl < next.lvl or profile.get("sp", 0) < next.sp
		else: _label(list, "Все ранги изучены", 12)
		list.add_child(HSeparator.new())

func _settings(list):
	_label(list, "Звук", 20)
	for entry in [["Master", "Общая громкость", 0.75], ["Effects", "Бой и заклинания", 0.65], ["Music", "Музыка", 0.45], ["Ambience", "Окружение", 0.3]]:
		var audio_row = _row(list); _label(audio_row, entry[1], 12).custom_minimum_size.x = 155
		var slider = HSlider.new(); slider.min_value = 0; slider.max_value = 100; slider.step = 1
		slider.value = float(Settings.read_value("audio", entry[0], entry[2])) * 100
		slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL; slider.custom_minimum_size.x = 120
		slider.set_meta("audio_bus", entry[0]); audio_row.add_child(slider)
		var percent = _label(audio_row, "%s%%" % int(slider.value), 12); percent.custom_minimum_size.x = 40
		slider.value_changed.connect(func(value):
			get_parent().game_audio.set_volume(entry[0], value / 100.0); percent.text = "%s%%" % int(value))
	_label(list, "Чат", 20)
	for entry in [["sys", "Системный журнал над чатом"], ["combat", "Журнал: урон и бой"], ["rewards", "Журнал: опыт, SP и добыча"], ["info", "Журнал: уведомления"], ["trade", "Торговый чат во вкладке «Все»"], ["near", "Ближний чат во вкладке «Все»"], ["bubbles", "Сообщения над персонажами"]]:
		var b = CheckButton.new(); b.text = entry[1]; b.button_pressed = chat.preferences[entry[0]]; list.add_child(b)
		b.toggled.connect(func(value): chat.set_preference(entry[0], value))
	var row = _row(list); _label(row, "Размер текста чата")
	var font_size = SpinBox.new(); font_size.min_value = 10; font_size.max_value = 18; font_size.step = 1; font_size.value = chat.preferences.size; row.add_child(font_size)
	font_size.value_changed.connect(func(value): chat.set_preference("size", int(value)))
	for entry in [["system_height", "Высота системного журнала", 54], ["player_height", "Высота обычного чата", 70]]:
		row = _row(list); _label(row, entry[1])
		var height = SpinBox.new(); height.min_value = entry[2]; height.max_value = 420; height.step = 10; height.value = chat.preferences[entry[0]]; row.add_child(height)
		height.value_changed.connect(func(value): chat.set_preference(entry[0], int(value)))
	_wrapped(list, "Потяните ручку над «Система» или «Чат»: высота каждой области меняется отдельно и сохраняется.", 12)
	_label(list, "Изображение", 20)
	_button(list, "Полный экран / окно", func(): action.emit("fullscreen", null))
	_button(list, "Вернуть камеру за спину", func(): action.emit("camera", null))
	_button(list, "Открыть сетевой журнал", func(): OS.shell_open(ProjectSettings.globalize_path("user://network.jsonl")))
	_wrapped(list, "При разрыве связи журнал записывает причину и код ошибки без паролей, токенов и переписки.", 12)
	_wrapped(list, "Настройки чата сохраняются на этом устройстве. Персонаж и весь игровой прогресс сохраняются на сервере.", 14)

func pointer_over_ui(pos: Vector2) -> bool:
	for child in game_ui.get_children():
		if child is Control and child.visible and child.mouse_filter != Control.MOUSE_FILTER_IGNORE and child.get_global_rect().has_point(pos): return true
	return false

func default_bindings() -> Array:
	return GameData.catalog.CLASSES[profile.cls].skills.duplicate() + ["potion_hp", "potion_mp", "attack", "target", "talk", "pickup", "skills"]

func binding_choices() -> Array:
	return GameData.catalog.CLASSES[profile.cls].skills.duplicate() + ["potion_hp", "potion_mp", "scroll_escape"] + ACTION_NAMES.keys()

func binding_name(id: String) -> String:
	if id in GameData.catalog.SKILLS: return GameData.catalog.SKILLS[id].name
	if id in GameData.catalog.ITEMS: return GameData.catalog.ITEMS[id].name
	return ACTION_NAMES.get(id, "Пусто")

func activate_slot(index: int):
	if index < 0 or index >= hotbar_bindings.size(): return
	if not hotbar_locked or not Network.authed or profile.get("dead", false): return
	var id = str(hotbar_bindings[index])
	if id in GameData.catalog.SKILLS: action.emit("skill", id)
	elif id in GameData.catalog.ITEMS: action.emit("use", id)
	elif id != "empty": action.emit(id, null)

func assign_slot(index: int, id: String):
	if id not in binding_choices() or index < 0 or index >= 10: return
	hotbar_bindings[index] = id; _save_hotbar()

func swap_slots(from: int, to: int):
	if hotbar_locked or from < 0 or from >= 10 or to < 0 or to >= 10: return
	var previous = hotbar_bindings[to]; hotbar_bindings[to] = hotbar_bindings[from]; hotbar_bindings[from] = previous; _save_hotbar()

func _save_hotbar():
	Settings.write_value("hotbar", profile.cls, hotbar_bindings); _refresh_hotbar()
	if window_kind == "actions": show_window("actions", true)

func _refresh_hotbar():
	hotbar_lock.set_pressed_no_signal(hotbar_locked)
	for i in hotbar_bindings.size():
		var id = str(hotbar_bindings[i]); var button = skill_buttons[i]
		button.locked = hotbar_locked; button.icon = GameData.icon(id)
		button.text = ""
		if id in ACTION_NAMES and id != "empty": button.icon = load("res://assets/ui/action-" + id + ".svg")
		button.tooltip_text = binding_name(id) + "\nКлавиша: " + (str(i + 1) if i < 9 else "0")
		if id in GameData.catalog.SKILLS: button.tooltip_text += "\n" + _skill_description(id)
		if not hotbar_locked: button.tooltip_text += "\nПеретащите на другую ячейку для обмена"

func _actions_settings(list):
	_wrapped(list, "Выберите содержимое ячеек. Клавиши 1–9 и 0 повторяют панель. После снятия блокировки ячейки можно менять местами перетаскиванием.", 12)
	var lock_button = CheckButton.new(); lock_button.text = "Заблокировать перетаскивание"; lock_button.button_pressed = hotbar_locked; list.add_child(lock_button)
	lock_button.toggled.connect(set_hotbar_locked)
	var choices = binding_choices()
	for i in 10:
		var index = i; var row = _row(list); _label(row, "Ячейка %s" % (str(i + 1) if i < 9 else "0")).custom_minimum_size.x = 88
		var select = OptionButton.new(); select.size_flags_horizontal = Control.SIZE_EXPAND_FILL; row.add_child(select)
		for id in choices: select.add_item(binding_name(id))
		select.select(choices.find(hotbar_bindings[i])); select.item_selected.connect(func(choice): assign_slot(index, choices[choice]))
	_button(list, "Вернуть исходную панель", func(): hotbar_bindings = default_bindings(); _save_hotbar())

func set_hotbar_locked(value: bool):
	hotbar_locked = value; Settings.write_value("hotbar", "locked", value); _refresh_hotbar()
	quick_hint.text = "F — атака · Q — цель · Tab — сумка · Z — подбор · E — разговор" if value else "Редактирование: перетащите навык из K · включите «Замок» для боя"

func _craft(list):
	_label(list, "Монеты: %s" % _money(int(profile.coins)), 16)
	_wrapped(list, "Изготовление у торговца: 100% успех, материалы и монеты расходуются. Печать Короля-лича гарантирована за победу над боссом.", 12)
	for id in GameData.catalog.RECIPES:
		var item = GameData.catalog.ITEMS[id]; var recipe = GameData.catalog.RECIPES[id]
		var row = _item_row(list, id, "%s [%s] · ур. %s" % [item.name, str(item.grade).to_upper(), int(item.lvl)])
		var enough = profile.coins >= recipe.coins and profile.lvl >= item.lvl
		var parts: Array[String] = []
		for part in recipe.materials:
			var have = 0
			for entry in profile.inv:
				if entry.id == part: have += int(entry.n)
			var need = int(recipe.materials[part]); enough = enough and have >= need
			parts.append("%s: %s/%s" % [GameData.catalog.ITEMS[part].name, have, need])
		var button = _button(row, "%s мон." % int(recipe.coins), func(): action.emit("craft", id)); button.set_meta("craft", id)
		button.disabled = not enough or not Network.authed or profile.get("dead", false)
		_wrapped(list, " · ".join(parts), 12); list.add_child(HSeparator.new())

func _equipment_guide(list):
	_wrapped(list, "Собственная прогрессия до 40 уровня. Воин: меч + щит и броня. Маг: двуручный посох и мантия. Полный комплект даёт дополнительный бонус; украшения защищают от магии.", 13)
	for entry in [["D · уровень 8", "Длинный меч / Дубовый жезл. Кожаный / ученический комплект. Покупка у торговца, оружие также из шкур и костей."], ["C · уровень 18", "Кристальный клинок / посох. Кольчужный / мистический комплект. Покупка; оружие также из кристаллов и костей."], ["B · уровень 25", "Клинок дракона / Посох глубин. Костяной / комплект глубин. Дроп с Короля-лича либо гарантированное изготовление за печати, ресурсы и монеты."]]:
		_label(list, entry[0], 17); _wrapped(list, entry[1], 13)
	_wrapped(list, "Усиление: до +3 безопасно. Дальше при неудаче предмет распадается на кристаллы. Сначала соберите базовый комплект и запасное оружие.", 13)
	_button(list, "Рецепты и стоимость", func(): show_window("craft"))

const PARTY_MODES = ["random", "last_hit", "pickup"]
const PARTY_TITLES = ["Случайному участнику", "Добившему моба", "Первому подобравшему"]

func update_party(value: Dictionary):
	party_state = value
	var members = value.get("members", [])
	party_summary.text = "Пати · %s/6" % members.size() if not members.is_empty() else "Пати · пригласить"
	party_summary.tooltip_text = "\n".join(members.map(func(m): return "%s · %s ур. · HP %s/%s · %s м" % [m.name, int(m.lvl), int(m.hp), int(m.maxHp), int(m.distance)]))
	# Rebuild controls only when membership/mode changes; health ticks must not eat typing.
	var signature = str(value.get("id")) + str(value.get("leader")) + str(value.get("mode")) + str(members.map(func(m): return m.id))
	if window_kind == "party":
		if signature != party_signature: show_window("party", true)
		else: _party_members()
	party_signature = signature

func _party(list: VBoxContainer):
	if not party_invite.is_empty():
		_wrapped(list, "%s приглашает вас в группу. Добыча: %s." % [party_invite.name, PARTY_TITLES[maxi(0, PARTY_MODES.find(party_invite.mode))]])
		var invitation_row = _row(list)
		for entry in [["Принять", "accept"], ["Отклонить", "decline"]]:
			_button(invitation_row, entry[0], func():
				action.emit("party_command", {"t": "party", "action": entry[1], "from": party_invite.from}); party_invite = {}; show_window("party", true))
	var members = party_state.get("members", [])
	var leader = party_state.get("leader", -1) == get_parent().own_id
	_wrapped(list, "До 6 участников. Опыт и SP делятся между живыми игроками в 60 м от моба. Общая награда учитывает наибольший уровень в группе рядом с целью.", 13)
	party_members_box = VBoxContainer.new(); list.add_child(party_members_box); _party_members()
	if members.is_empty() or leader:
		var row = _row(list); var invite_name = LineEdit.new(); invite_name.placeholder_text = "Имя персонажа"; invite_name.max_length = 16; invite_name.size_flags_horizontal = Control.SIZE_EXPAND_FILL; row.add_child(invite_name)
		var selected = get_parent().target
		if is_instance_valid(selected) and selected.kind == "p": invite_name.text = selected.display_name
		_button(row, "Пригласить", func(): action.emit("party_command", {"t": "party", "action": "invite", "name": invite_name.text}))
	if not members.is_empty():
		var mode = OptionButton.new()
		for title in PARTY_TITLES: mode.add_item(title)
		mode.select(maxi(0, PARTY_MODES.find(party_state.get("mode", "random")))); mode.disabled = not leader; list.add_child(mode)
		mode.item_selected.connect(func(i): action.emit("party_command", {"t": "party", "action": "mode", "mode": PARTY_MODES[i]}))
		_wrapped(list, "Режим выбирает лидер. «Подобравшему» отключает автолут группы: добыча ждёт на земле. Правила новой добычи фиксируются при смерти моба.", 12)
		_button(list, "Выйти из группы", func(): action.emit("party_command", {"t": "party", "action": "leave"}))

func _party_members():
	if not is_instance_valid(party_members_box): return
	for child in party_members_box.get_children(): child.free()
	for m in party_state.get("members", []):
		var row = _row(party_members_box)
		var info = _label(row, "%s%s · %s ур. · HP %s/%s · %s" % ["♛ " if m.id == party_state.leader else "", m.name, int(m.lvl), int(m.hp), int(m.maxHp), "повержен" if m.dead else str(int(m.distance)) + " м"], 12)
		info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		if party_state.get("leader", -1) == get_parent().own_id and m.id != get_parent().own_id:
			_button(row, "×", func(): action.emit("party_command", {"t": "party", "action": "kick", "id": m.id})).tooltip_text = "Исключить из группы"
