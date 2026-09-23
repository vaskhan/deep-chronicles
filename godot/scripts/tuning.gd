extends Node
## Все настраиваемые числа клиента — здесь, литералами, по одному на строку.
## Правила боя, награды и прогресс живут на сервере: сюда их не переносить.
## Ищете, чем крутить камеру, дальность меток или подписи — правьте этот файл,
## а не поиск по коду. Контракт файла проверяет `tests/tuning.test.js`.

# --- Камера ---
const CAMERA_FOV = 55.0
const CAMERA_NEAR = 0.2
const CAMERA_FAR = 3200.0
const CAMERA_YAW_START = 0.45
const CAMERA_PITCH_START = 0.56
const CAMERA_DISTANCE_START = 21.0
## Сброс вида за спину героя (кнопка «камера» и клавиша V).
const CAMERA_PITCH_RESET = 0.65
const CAMERA_DISTANCE_RESET = 24.0
const CAMERA_DISTANCE_MIN = 6.0
const CAMERA_DISTANCE_MAX = 65.0
const CAMERA_ZOOM_STEP = 1.1
const CAMERA_INDOOR_DISTANCE = 2.4
const CAMERA_INDOOR_PITCH = 0.18
const CAMERA_INDOOR_WALL_MARGIN = 0.6
const CAMERA_INDOOR_CEILING = 3.1
const CAMERA_INDOOR_TRACE_STEP = 0.15
const CAMERA_INDOOR_TRACE_RADIUS = 0.2
const CAMERA_PITCH_MIN = 0.18
const CAMERA_PITCH_MAX = 1.4
const CAMERA_MOUSE_YAW = 0.006
const CAMERA_MOUSE_PITCH = 0.005
const CAMERA_TOUCH_YAW = 0.007
const CAMERA_TRACKPAD_YAW = 0.035
const CAMERA_TRACKPAD_PITCH = 0.025

# --- Дальности клиента (метры) ---
## Подписи мобов и игроков, добычи и NPC гаснут за этими расстояниями.
const LABEL_RANGE_ACTOR = 50.0
const LABEL_RANGE_LOOT = 40.0
const LABEL_RANGE_NPC = 60.0
## Автовыбор ближайшей цели и разговор с NPC.
const TARGET_PICK_RANGE = 55.0
const TALK_SEARCH_RANGE = 25.0
const TALK_OPEN_RANGE = 8.0

# --- Окно выбора профессии ---
## Две карточки профессии с описанием, бонусами и умениями помещаются в эти размеры.
const PROFESSION_WINDOW_WIDTH = 530.0
const PROFESSION_WINDOW_HEIGHT = 600.0

# --- Эффекты во времени и ранговые мобы ---
## Сколько значков эффектов помещается в строку у героя и у цели.
const EFFECT_ICONS_MAX = 8
## Радиус ауры элиты и чемпиона в долях радиуса моба.
const ELITE_AURA_SCALE = 1.6

# --- Качество графики (godot/scripts/quality.gd) ---
## Пресет по умолчанию: 0 — мобильный (так игра выглядела до пресетов), 1 — ПК.
## Флаг запуска --quality=pc или --quality=mobile переопределяет значение. Рендерер один — Mobile.
const QUALITY_PRESET = 0
## Сглаживание 3D: 0 — нет, 1 — MSAA 2x, 2 — MSAA 4x.
const QUALITY_MOBILE_MSAA = 1
const QUALITY_PC_MSAA = 2
## Разрешение 3D относительно окна.
const QUALITY_MOBILE_RENDER_SCALE = 1.0
const QUALITY_PC_RENDER_SCALE = 1.0
## Порог упрощения мешей (LOD) в пикселях: меньше — детальнее и дороже.
const QUALITY_MOBILE_LOD_THRESHOLD = 2.0
const QUALITY_PC_LOD_THRESHOLD = 0.5
## Размер карты теней солнца в пикселях; 0 — как в настройках проекта
## (4096 на ПК, 2048 на Android/iOS через переопределение .mobile).
const QUALITY_MOBILE_SHADOW_SIZE = 0
const QUALITY_PC_SHADOW_SIZE = 4096

# --- Детализация мира (godot/scripts/lod.gd) и тени солнца ---
## Повторяющиеся модели собраны в ячейки со стороной LOD_CELL метров; ячейка рисует один
## уровень по расстоянию от камеры до своего центра. Ближе NEAR — полный меш, до FAR — средний
## (доля треугольников LOD_MID_RATIO), дальше — дальний (LOD_FAR_RATIO).
const LOD_CELL = 48.0
const LOD_MID_RATIO = 0.3
const LOD_FAR_RATIO = 0.08
## Листва среднего уровня не прореживается ниже этой доли: иначе крона вблизи заметно редеет.
const LOD_FOLIAGE_MIN_RATIO = 0.3
## Сохраняем крону вдали: сильное прореживание оголяло верхушки.
const LOD_FAR_FOLIAGE_RATIO = 0.3
## Деревья.
const LOD_TREE_NEAR_MOBILE = 180.0
const LOD_TREE_NEAR_PC = 260.0
const LOD_TREE_FAR_MOBILE = 600.0
const LOD_TREE_FAR_PC = 900.0
## Камни, кусты, папоротники.
const LOD_PROP_NEAR_MOBILE = 100.0
const LOD_PROP_NEAR_PC = 140.0
const LOD_PROP_FAR_MOBILE = 260.0
const LOD_PROP_FAR_PC = 350.0
## Мелкие растения со сканов (папоротник ущелья, 5,6 тыс. треугольников): полный меш только у самой камеры.
const LOD_SMALL_NEAR_MOBILE = 75.0
const LOD_SMALL_NEAR_PC = 75.0
const LOD_SMALL_FAR_MOBILE = 120.0
const LOD_SMALL_FAR_PC = 120.0
## Дальше этой дистанции подлесок рисуется упрощёнными кустиками травы.
const UNDERSTORY_LOD_MOBILE = 160.0
const UNDERSTORY_LOD_PC = 160.0
## Каскады теней солнца (2 или 4) и дальность теней; при двух каскадах первый занимает долю SHADOW_FIRST_SPLIT дальности.
const SHADOW_SPLITS_MOBILE = 2
const SHADOW_SPLITS_PC = 4
const SHADOW_DISTANCE_MOBILE = 130.0
const SHADOW_DISTANCE_PC = 160.0
const SHADOW_FIRST_SPLIT = 0.3

# --- Художественный срез ущелья ---
const GORGE_CLIFF_RANGE = 3200.0
const GORGE_FERN_RANGE = 180.0
const GORGE_FERN_COUNT = 1000
const GORGE_AUDIO_RANGE = 110.0
const GORGE_AUDIO_GAIN = -9.0
const GORGE_SUN_PITCH = -0.8
const GORGE_SUN_YAW = -2.5

const GORGE_STONE_RANGE = 155.0
const GORGE_LABEL_RANGE = 32.0
const GORGE_LABEL_STACK_PX = 24.0
const GORGE_LABEL_STACK_LEVELS = 3
const GORGE_LABEL_GAP_PX = 5.0
