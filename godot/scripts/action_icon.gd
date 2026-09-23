extends Button
var binding = ""

func _get_drag_data(_position):
	var preview = TextureRect.new(); preview.texture = icon
	preview.custom_minimum_size = Vector2(40,40); preview.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	set_drag_preview(preview)
	return {"skill_id": binding}
