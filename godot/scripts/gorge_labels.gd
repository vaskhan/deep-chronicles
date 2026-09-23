extends Node
## Только экранная раскладка ущелья; выбранная цель имеет безусловный приоритет.
## После main._process, до отрисовки. Сервер и акторы не перемещаются.
var game: Node
var active = false
func _ready():
 process_priority=10
 game=get_parent().get_parent().get_parent()

func _process(_dt):
 if not is_instance_valid(game) or not "hero" in game or not is_instance_valid(game.hero): return
 var in_gorge=GameData.zone_at(game.hero.position).id=="gorge"
 if not in_gorge and not active: return
 active=in_gorge
 var camera: Camera3D=game.camera
 var candidates: Array=[]
 for mob in game.mobs.values():
  mob.label.position.y=mob.visual_height+.45
  if mob.health_bar:
   mob.health_bar.position.y=mob.label.position.y-.3; mob.health_fill.position.y=mob.health_bar.position.y
  if not in_gorge: continue
  var distance=game.hero.position.distance_to(mob.position)
  mob.label.visible=mob.visible and not mob.dead and (mob.selected or distance<Tuning.GORGE_LABEL_RANGE) and not camera.is_position_behind(mob.label.global_position)
  if mob.label.visible: candidates.append(mob)
  elif mob.health_bar:
   mob.health_bar.hide(); mob.health_fill.hide()
 if not in_gorge: return
 candidates.sort_custom(func(a,b):
  if a.selected != b.selected: return a.selected
  var da=game.hero.position.distance_squared_to(a.position); var db=game.hero.position.distance_squared_to(b.position)
  return da<db if absf(da-db)>.01 else a.entity_id<b.entity_id)
 var occupied: Array[Rect2]=[]
 for mob in candidates:
  var base: Vector3=mob.label.global_position
  var screen=camera.unproject_position(base)
  var pixels_per_metre=maxf(1.0,screen.distance_to(camera.unproject_position(base+camera.global_basis.x)))
  var vertical_pixels=maxf(1.0,screen.distance_to(camera.unproject_position(base+Vector3.UP)))
  var font=mob.label.font if mob.label.font else ThemeDB.fallback_font
  var width=font.get_string_size(mob.label.text,HORIZONTAL_ALIGNMENT_LEFT,-1,mob.label.font_size).x*mob.label.pixel_size*pixels_per_metre
  var height=(mob.label.font_size+mob.label.outline_size)*mob.label.pixel_size*pixels_per_metre+Tuning.GORGE_LABEL_GAP_PX
  var placed=false
  for level in Tuning.GORGE_LABEL_STACK_LEVELS:
   var offset=level*Tuning.GORGE_LABEL_STACK_PX
   var rect=Rect2(screen-Vector2(width*.5,height*.5+offset),Vector2(width,height)).grow(Tuning.GORGE_LABEL_GAP_PX)
   if not mob.selected and occupied.any(func(other): return other.intersects(rect)): continue
   mob.label.position.y+=offset/vertical_pixels
   occupied.append(rect); placed=true; break
  mob.label.visible=placed
  if mob.health_bar:
   mob.health_bar.position.y=mob.label.position.y-.3; mob.health_fill.position.y=mob.health_bar.position.y
   mob.health_bar.visible=placed and not mob.dead and (mob.selected or mob.hp<100 or mob.windup_remaining>0)
   mob.health_fill.visible=mob.health_bar.visible
