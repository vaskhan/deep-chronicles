extends Node
## Все настраиваемые числа клиента — здесь, литералами, по одному на строку.
## Правила боя, награды и прогресс живут на сервере: сюда их не переносить.
## Ищете, чем крутить камеру, дальность меток или подписи — правьте этот файл,
## а не поиск по коду. Контракт файла проверяет `tests/tuning.test.js`.

# --- Камера ---
const CAMERA_FOV = 55.0
const CAMERA_NEAR = 0.2
const CAMERA_FAR = 1600.0
const CAMERA_YAW_START = 0.45
const CAMERA_PITCH_START = 0.56
const CAMERA_DISTANCE_START = 21.0
## Сброс вида за спину героя (кнопка «камера» и клавиша V).
const CAMERA_PITCH_RESET = 0.65
const CAMERA_DISTANCE_RESET = 24.0
const CAMERA_DISTANCE_MIN = 6.0
const CAMERA_DISTANCE_MAX = 65.0
const CAMERA_ZOOM_STEP = 1.1
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
const QUALITY_MOBILE_LOD_THRESHOLD = 1.0
const QUALITY_PC_LOD_THRESHOLD = 0.5
## Размер карты теней солнца в пикселях; 0 — как в настройках проекта
## (4096 на ПК, 2048 на Android/iOS через переопределение .mobile).
const QUALITY_MOBILE_SHADOW_SIZE = 0
const QUALITY_PC_SHADOW_SIZE = 4096
