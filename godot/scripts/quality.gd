extends RefCounted
## Пресеты качества графики на одном рендерере Mobile: мобильный (по умолчанию) и ПК.
## Числа — в tuning.gd. Тяжёлые возможности Forward+ (SDFGI, объёмный туман, SSR) сюда не входят:
## ПК-пресет только поднимает сглаживание, детализацию LOD и карту теней.
## Мобильный пресет повторяет настройки проекта, поэтому поведение по умолчанию не меняется.

const MOBILE = 0
const PC = 1
const NAMES = ["mobile", "pc"]

## Пресет из флагов запуска (--quality=pc|mobile) или значение по умолчанию.
static func preset_from_args(args: PackedStringArray, fallback: int) -> int:
	for a in args:
		if a == "--quality=pc": return PC
		if a == "--quality=mobile": return MOBILE
	return fallback

## Применить пресет к окну; возвращает применённые значения для журнала и профиля.
static func apply(viewport: Viewport, preset: int) -> Dictionary:
	var pc = preset == PC
	var values = {
		"preset": NAMES[PC if pc else MOBILE],
		"msaa": Tuning.QUALITY_PC_MSAA if pc else Tuning.QUALITY_MOBILE_MSAA,
		"render_scale": Tuning.QUALITY_PC_RENDER_SCALE if pc else Tuning.QUALITY_MOBILE_RENDER_SCALE,
		"lod_threshold": Tuning.QUALITY_PC_LOD_THRESHOLD if pc else Tuning.QUALITY_MOBILE_LOD_THRESHOLD,
		"shadow_size": Tuning.QUALITY_PC_SHADOW_SIZE if pc else Tuning.QUALITY_MOBILE_SHADOW_SIZE,
	}
	viewport.msaa_3d = values.msaa
	viewport.scaling_3d_scale = values.render_scale
	viewport.mesh_lod_threshold = values.lod_threshold
	if values.shadow_size > 0: RenderingServer.directional_shadow_atlas_set_size(values.shadow_size, true)
	else: values.shadow_size = int(ProjectSettings.get_setting_with_override("rendering/lights_and_shadows/directional_shadow/size"))
	return values
