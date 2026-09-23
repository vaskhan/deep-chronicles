extends Button
signal swap_requested(from: int, to: int)
signal binding_requested(to: int, binding: String)
var index = 0
var locked = true

func _get_drag_data(_position):
	if locked: return null
	var preview = Label.new(); preview.text = tooltip_text.split("\n")[0]; set_drag_preview(preview)
	return {"hotbar_slot": index}

func _can_drop_data(_position, data):
	return not locked and data is Dictionary and (data.has("hotbar_slot") or data.has("skill_id") or (data.get("source") == "inventory" and GameData.catalog.ITEMS.get(data.get("id", ""), {}).get("use", "") in ["hp", "mp", "escape"]))

func _drop_data(_position, data):
	if not _can_drop_data(_position, data): return
	if data.has("hotbar_slot"): swap_requested.emit(int(data.hotbar_slot), index)
	else: binding_requested.emit(index, str(data.get("skill_id", data.get("id", ""))))
