extends Control
var player_position = Vector3.ZERO
var compact = false
var city_focus = false
const Settings = preload("res://scripts/interface_settings.gd")
var zoom = 2.0
signal zoom_changed(value: float)
var mob_markers: Array = []
var player_markers: Array = []
var target_position = Vector3.INF
static var terrain_map: ImageTexture
var origin = Vector2(-800,-800)
var extent = Vector2(1600,1600)

func _ready():
	custom_minimum_size = Vector2(164, 124) if compact else Vector2(600, 410)
	mouse_filter = Control.MOUSE_FILTER_STOP; mouse_force_pass_scroll_events = false; clip_contents = true
	if compact: zoom = clampf(float(Settings.read_value("map", "zoom", 2.0)), 0.5, 8.0)
	if not terrain_map: _bake_terrain()
	if not compact:
		city_focus = GameData.zone_at(player_position).get("town", false)
		var mode = Button.new(); mode.text = "Город / Мир"; mode.position = Vector2(12, 8); add_child(mode)
		mode.pressed.connect(func(): city_focus = not city_focus; queue_redraw())

func _bake_terrain():
	var image = Image.create(400,400,false,Image.FORMAT_RGB8)
	for z in 400:
		for x in 400:
			var p = Vector3(x*4-800,0,z*4-800)
			var h = GameData.height_at(p.x,p.z)
			var zone = GameData.zone_at(p)
			var color = Color("677e48")
			match zone.id:
				"forest": color = Color("344e39")
				"waste": color = Color("aa9365")
				"gorge": color = Color("7d8a86")
				"harbor", "ford": color = Color("929073")
			var slope = GameData.height_at(p.x-3,p.z-3)-GameData.height_at(p.x+3,p.z+3)
			color *= clampf(.94+slope*.035,.6,1.18)
			color = color.lerp(Color("9d9b85"),smoothstep(35,65,h))
			color = color.lerp(Color("e2e1d1"),smoothstep(70,95,h))
			if h < -6.4: color = Color("52838e")
			if h > 12 and fmod(h,12)<.6: color *= .86
			image.set_pixel(x,z,color)
	terrain_map = ImageTexture.create_from_image(image)

func point(x: float, z: float) -> Vector2:
	return (Vector2(x,z)-origin)/extent*size

func update_entities(mobs: Dictionary, players: Dictionary, target):
	mob_markers.clear(); player_markers.clear()
	for actor in mobs.values():
		if actor.visible and not actor.dead and Time.get_ticks_msec() - actor.seen < 1500:
			mob_markers.append(actor.position)
	for actor in players.values():
		if actor.visible and not actor.dead and Time.get_ticks_msec() - actor.seen < 1500:
			player_markers.append({"pos": actor.position, "status": actor.status})
	target_position = target.position if is_instance_valid(target) and target.visible and not target.dead else Vector3.INF
	queue_redraw()

func _draw():
	origin = Vector2(player_position.x,player_position.z)-size*zoom*0.5 if compact else Vector2(-800,-800)
	extent = size*zoom if compact else Vector2(1600,1600)
	if not compact and city_focus and player_position.x < 2100:
		var closest = GameData.world.towns[0]
		for town in GameData.world.towns:
			if Vector2(town.x-player_position.x,town.z-player_position.z).length() < Vector2(closest.x-player_position.x,closest.z-player_position.z).length(): closest = town
		extent = size / minf(size.x,size.y) * (closest.r * 2 + 40)
		origin = Vector2(closest.x,closest.z) - extent * .5
	if not compact and player_position.x > 2100:
		var d = GameData.world.dungeon
		origin = Vector2(d.x0 - d.cell, d.z0 - d.cell); extent = Vector2.ONE * d.cell * (d.n + 2)
	draw_rect(Rect2(Vector2.ZERO,size),Color("182925"))
	if terrain_map and player_position.x < 2100:
		var source = Rect2((origin+Vector2(800,800))*.25,extent*.25)
		draw_texture_rect_region(terrain_map,Rect2(Vector2.ZERO,size),source)
	var font = ThemeDB.fallback_font
	for road in GameData.world.get("townRoads", []):
		if road.has("points"):
			var line = PackedVector2Array()
			for v in road.points: line.append(point(v[0],v[1]))
			draw_polyline(line,Color("b5aa87"),maxf(1,road.width*size.x/extent.x),true)
			continue
		var p = point(road.x,road.z); var width = Vector2(road.w,road.d)/extent*size
		draw_rect(Rect2(p-width*.5,width),Color("b5aa87"))
	for shop in GameData.world.get("townShops", []):
		var p = point(shop.x,shop.z-7*shop.scale); var width = Vector2(shop.get("w",10),shop.get("d",18))*shop.scale/extent*size
		draw_rect(Rect2(p-width*.5,width),Color("715549"))
	for house in GameData.world.get("townHouses", []):
		var corners = PackedVector2Array()
		for offset in [Vector2(-1,-1),Vector2(1,-1),Vector2(1,1),Vector2(-1,1)]:
			var v = (offset*Vector2(house.w,house.d)*.5*house.scale).rotated(-house.rotation)
			corners.append(point(house.x+v.x,house.z+v.y))
		draw_colored_polygon(corners,Color("ad785d"))
	for hall in GameData.world.get("townCivic", []):
		var p = point(hall.x,hall.z); var width = Vector2(hall.w,hall.d)*hall.scale/extent*size
		draw_rect(Rect2(p-width*.5,width),Color("88644c"))
		if not compact and city_focus and Rect2(Vector2.ZERO,size).has_point(p): draw_string(font,p+Vector2(5,-8),hall.name,HORIZONTAL_ALIGNMENT_LEFT,-1,12,Color("fff0bb"))
	for r in GameData.world.get("modelPlacements", []):
		if r[0] in ["oak","pine","bush","rock_a","rock_b","dead_tree"]: continue
		var p=point(r[1],r[3]);var sz=Vector2(r[5],r[7])/extent*size
		draw_rect(Rect2(p-sz*.5,sz),Color("463e32"));draw_rect(Rect2(p-sz*.4,sz*.8),Color("c5b085"))
	for t in GameData.world.towns:
		var p=point(t.x,t.z);var scale_map=size.x/extent.x
		if t.id == "harbor":
			for outline in GameData.world.get("townOutlines", []):
				var line = PackedVector2Array()
				for v in outline.points: line.append(point(v[0],v[1]))
				line.append(line[0]); draw_polyline(line,Color("d8cba6"),2,true)
		else: draw_arc(p,t.r*scale_map,0,TAU,48,Color("d8cba6"),2,true)
		if not compact:
			if city_focus:
				if Rect2(Vector2.ZERO,size).has_point(p): draw_string(font,Vector2(160,27),t.name,HORIZONTAL_ALIGNMENT_LEFT,-1,18,Color("fff0bb"))
			else: draw_string(font,p+Vector2(10,-10),t.name,HORIZONTAL_ALIGNMENT_LEFT,-1,16,Color("fff0bb"))
	if player_position.x>2100:
		for row in GameData.world.shapes:
			if row[9]!="dbrick":continue
			var p=point(row[2],row[4]);var sz=Vector2(row[6],row[8])/extent*size
			draw_rect(Rect2(p-sz*.5,sz),Color("827087"))
	for n in GameData.world.npcs:
		if n.role == "guard": continue
		if n.role == "merchant" and (n.has("building") or n.has("shop") and n.id != "harbor:smith"): continue
		var p = point(n.x,n.z)
		var color = {"merchant":Color("e9c471"),"gatekeeper":Color("85dfea"),"priest":Color("e1c9f7")}.get(n.role,Color.WHITE)
		draw_circle(p,4,color)
		if not compact and city_focus and Rect2(Vector2.ZERO,size).has_point(p):
			draw_string(font,p+Vector2(7,-6),n.name,HORIZONTAL_ALIGNMENT_LEFT,-1,13,color)
	for t in GameData.world.teleports:
		draw_circle(point(t.x,t.z),2 if compact else 3,Color("98d9e6"))
	if not compact and not city_focus and player_position.x < 2100:
		for z in GameData.world.zones:
			var p=point(z.x,z.z)
			draw_string(font,p+Vector2(-50,0),z.name,HORIZONTAL_ALIGNMENT_LEFT,-1,15,Color("f6ebcd"))
			draw_string(font,p+Vector2(-50,20),"Уровни "+z.lv,HORIZONTAL_ALIGNMENT_LEFT,-1,13,Color("d8d5ba"))
	if not compact and player_position.x < 2100:
		for camp in GameData.world.get("huntingCamps", []):
			var p = point(camp.x, camp.z)
			draw_circle(p, 3, Color("ca9970"))
			draw_string(font, p + Vector2(6, -3), camp.name, HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color("e4ccb0"))
	if player_position.x < 2100: _draw_gorge(font)
	var crypt=point(150,250);draw_circle(crypt,4,Color("c899f4"))
	if not compact:draw_string(font,crypt+Vector2(10,4),"Катакомбы",HORIZONTAL_ALIGNMENT_LEFT,-1,14)
	for pos in mob_markers:
		var marker = point(pos.x, pos.z)
		draw_circle(marker, 3.5 if compact else 3, Color("311e1d"))
		draw_circle(marker, 2.5 if compact else 2, Color("ff7965"))
	for entry in player_markers:
		var marker = point(entry.pos.x, entry.pos.z)
		draw_circle(marker, 3, Color("ff5353") if entry.status == 2 else (Color("d99aff") if entry.status == 1 else Color("89bbff")))
	if target_position != Vector3.INF:
		draw_arc(point(target_position.x, target_position.z), 6, 0, TAU, 16, Color("ffe188"), 1.5, true)
	_draw_shops(font)
	var player=point(player_position.x,player_position.z)
	draw_circle(player,7,Color("23352e"));draw_circle(player,4,Color("91ffe1"))
	if compact:draw_string(font,Vector2(size.x*.5-4,14),"С",HORIZONTAL_ALIGNMENT_LEFT,-1,12,Color("eee0b9"))
	elif player_position.x>2100:draw_string(font,Vector2(20,35),"Вы в катакомбах",HORIZONTAL_ALIGNMENT_LEFT,-1,22,Color("bf92ff"))

## Громовое ущелье: река, водопад и ярусы. На полной карте — подписи всех ярусов,
## на миникарте — подпись яруса, если он в кадре.
func _draw_gorge(font: Font):
	var info: Dictionary = GameData.world.get("gorge", {})
	if info.is_empty(): return
	var line = PackedVector2Array()
	for row in info.river: line.append(point(row[0], row[1]))
	draw_polyline(line, Color("5aa7c4"), maxf(1.5, 7.0 * size.x / extent.x), true)
	var falls = point(info.falls.x, info.falls.z)
	draw_circle(falls, 4 if compact else 5, Color("dff6ff"))
	draw_arc(falls, 6 if compact else 8, 0, TAU, 16, Color("5aa7c4"), 1.5, true)
	for tier in info.tiers:
		var p = point(tier.x, tier.z)
		if not Rect2(Vector2(-40, -20), size + Vector2(80, 40)).has_point(p): continue
		var title = "%s · %s–%s" % [tier.name, int(tier.lv[0]), int(tier.lv[1])]
		if compact: draw_string(font, p + Vector2(-44, 0), title, HORIZONTAL_ALIGNMENT_LEFT, 150, 10, Color("f1e6c8"))
		elif not city_focus: draw_string(font, p + Vector2(8, 4), title, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color("e8e2cf"))
	if not compact and not city_focus: draw_string(font, falls + Vector2(9, -6), "Водопад", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color("dff6ff"))

func shop_entrance(shop: Dictionary) -> Vector2:
	if shop.get("frontage",false):
		return Vector2(shop.x+.48*shop.modelScale,shop.z-7*shop.scale+2.6*shop.modelScale)
	return Vector2(shop.x,shop.z+3*shop.scale)

func _draw_shops(font: Font):
	if not compact and not city_focus: return
	var visible_shops: Array = []
	var symbols = {"weapons":"sword_long","clothes":"armor_cloth","alchemy":"potion_hp"}
	for shop in GameData.world.get("townShops",[]):
		var entrance=shop_entrance(shop);var p=point(entrance.x,entrance.y)
		if not Rect2(Vector2.ZERO,size).has_point(p): continue
		visible_shops.append(shop)
		var number=["weapons","clothes","alchemy"].find(shop.id)+1
		var half=8.0 if compact else 12.0
		draw_rect(Rect2(p-Vector2.ONE*(half+2),Vector2.ONE*(half+2)*2),Color("292b30"))
		draw_rect(Rect2(p-Vector2.ONE*(half+2),Vector2.ONE*(half+2)*2),Color("efd28a"),false,1.5)
		var icon=GameData.icon(symbols[shop.id])
		if icon:draw_texture_rect(icon,Rect2(p-Vector2.ONE*half,Vector2.ONE*half*2),false)
		draw_circle(p+Vector2(half,half),6,Color("233d59"))
		draw_string(font,p+Vector2(half-3,half+4),str(number),HORIZONTAL_ALIGNMENT_LEFT,-1,11,Color.WHITE)
	if not compact and not visible_shops.is_empty():
		var left=size.x-215.0
		draw_rect(Rect2(left,43,205,29+visible_shops.size()*23),Color(.086,.137,.16,.94))
		draw_string(font,Vector2(left+9,61),"Магазины · входы",HORIZONTAL_ALIGNMENT_LEFT,-1,14,Color("efd28a"))
		for i in visible_shops.size():
			var shop=visible_shops[i]
			var number=["weapons","clothes","alchemy"].find(shop.id)+1
			var title="Одежда и припасы" if shop.id=="clothes" and shop.town=="harbor" else shop.name
			draw_string(font,Vector2(left+9,84+i*23),str(number)+"  "+title,HORIZONTAL_ALIGNMENT_LEFT,-1,13,Color("fff0cc"))

func change_zoom(factor: float):
	zoom = clampf(zoom * factor, 0.5, 8.0)
	Settings.write_value("map", "zoom", zoom); zoom_changed.emit(zoom); queue_redraw()

func _gui_input(event):
	if event is InputEventMouseMotion:
		tooltip_text = ""
		for shop in GameData.world.get("townShops",[]):
			var door=shop_entrance(shop)
			if point(door.x,door.y).distance_to(event.position)<16:
				tooltip_text=shop.name+" — вход с улицы";return
		for npc in GameData.world.npcs:
			if npc.role != "guard" and point(npc.x,npc.z).distance_to(event.position) < 10: tooltip_text = npc.name; break
	if not compact: return
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP: change_zoom(0.8); accept_event()
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN: change_zoom(1.25); accept_event()
	elif event is InputEventMagnifyGesture: change_zoom(1.0 / event.factor); accept_event()
