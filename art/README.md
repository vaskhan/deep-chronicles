# Графика нативной игры

Готовые ресурсы находятся в `godot/assets/`. Они коммитятся и работают без доступа к сервисам генерации. `godot/assets/manifest.json` связывает игровые типы с моделями и анимациями.

## Источники

- Звук и музыка: 67 файлов CC0 из Kenney, artisticdude, rubberduck, cynicmusic, TinyWorlds, MintoDog, SketchMan3/JaggedStone. Старые 13 синтетических WAV удалены. Источники/лицензии/хеши — `godot/assets/audio/manifest.json` и `CREDITS.md`, сведение и воспроизведение — `docs/SOUND_DESIGN.md`.

- 30 исходных концептов персонажей, монстров, построек и природы созданы для проекта через существующий `tools/gen-models.mjs` / OpenRouter. Конкретные промпты находятся в `MODELS` этого файла. Концепты сохранены в `art/concepts/`.
- `mage_native.png` и семь материалов земли созданы встроенным инструментом **imagegen** 2026-09-18. Промпты: `art/imagegen-prompts.json`. Материалы: трава, грунт, лесная подстилка, песок, скала, снег, брусчатка. Это albedo; шейдер смешивает их по рельефу и зонам, без выдуманных normal/PBR-карт.
- Концепты преобразованы в текстурированные GLB через TRELLIS.2 на подключённом GPU. Воин, торговец и хранитель получены первоначальным режимом высокого разрешения; остальная очередь — 512 с текстурами 1024, для мелких объектов 512. Оригиналы в `tools/models-out/` являются промежуточными локальными файлами.
- Гуманоидный скелет и клипы — существующая в проекте [Quaternius Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html), **CC0**. Используется файл `public/assets/anims/AnimationLibrary_Godot_Standard.nofingers.gltf` и его бинарный буфер.
- Жрец — Cleric из [Quaternius RPG Characters](https://quaternius.com/packs/rpgcharacters.html), **CC0**. Исходный текст лицензии: `art/licenses/quaternius-rpg.txt`.
- Скелеты и восемь клипов животных/членистоногих создаются нашим `tools/godot/rig-creature.py`. Гуманоиды подготавливаются `rig.py` и получают клипы общей библиотеки в `art_assets.gd`.

## Обновление модели

1. Подготовить концепт с целым объектом на однотонном фоне; сохранить в `art/concepts/<id>.png`. Гуманоиды требуют явной A- или T-позы. Не вкладывать оружие в руку основной модели.
2. Поднять SSH-туннель к TRELLIS либо задать `TRELLIS_URL`. `TRELLIS_SSH` допускает параметры SSH; значения хранятся в `.env` и не попадают в git.
3. `node --env-file=.env tools/gen-3d.mjs <id>` создаёт `tools/models-out/<id>.glb`. Резервный источник концепта — `art/concepts/`.
4. `npm run native:art -- <id>` подготавливает модель Blender, переносит веса, ограничивает число треугольников статических объектов и обновляет manifest. Для нового типа добавить параметры в `tools/godot/prepare-art.mjs`.
5. `npm run native:assets`; `npm run native:gallery -- --models=<id>`. Проверить силуэт, материалы, масштаб и клипы в игре. После изменения файлов Godot должен завершить импорт до запуска следующей сборки/теста.
6. `npm test`; `npm run native:build -- macos`; открыть приложение. Новые модели и `.import`-настройки сохранить в git.

## Что ещё требует ручной художественной работы

Сгенерированные формы и автоматический перенос весов дают рабочую базу. Профессиональный финальный результат потребует ретопологии, ручной доводки весов и модульной одежды под каждый слот. Сейчас у воина есть тканевый и тяжёлый варианты; показатели всех вещей считаются сервером, но отдельной геометрии для каждой пары перчаток/ботинок пока нет. Анимации животных базовые; их можно заменить авторскими без изменения протокола.

Карта остаётся детерминированной: 155 точек спавна и 3251 серверное препятствие. Визуальная замена не должна произвольно менять проходимость. Деревья и скалы объединяются в MultiMesh по пространственным блокам и имеют дальность отображения; Godot генерирует LOD при импорте.

Исходные формы пяти животных закреплены в `art/sources/creatures/`: `native:art -- wolf rabbit boar spider scorpion` полностью пересобирает новые idle/walk/run/windup/attack/cast/hit/death локально, без TRELLIS/OCR. Геометрия/UV сохраняются, это улучшение анимации существующих форм, а не новая ручная ретопология.

## Интерфейс по новым референсам

`godot/assets/ui/bronze-*.svg` — собственные девятисегментные рамки/кнопки, `action-*.svg` — собственные пиктограммы действий. Силуэты пустых мест экипировки рисует `item_slot.gd`. Всё хранится исходным текстом и импортируется штатным Godot; графический редактор, внешняя генерация и OCR GPU не нужны. Четыре изображения пользователя служат ориентиром композиции и не включаются в игровые пакеты. Подробности: `docs/UI_STYLE.md`.

### Материалы окружения: ambientCG

18.09.2026 добавлены исходные карты 1K albedo / NormalGL / roughness: [PavingStones131](https://ambientcg.com/view?id=PavingStones131), [Ground037](https://ambientcg.com/view?id=Ground037), [Bricks097](https://ambientcg.com/view?id=Bricks097). [CC0-1.0](https://docs.ambientcg.com/license/), автор ambientCG/Lennart Demes. Без заимствования ресурсов Lineage. Архивы и каждый файл закреплены SHA-256 в `godot/assets/materials/manifest.json`, восстановление `npm run native:materials -- --fetch`, проверка `--check`. Цветовые изменения выполнены шейдером; исходные фотографии не менялись. Подробнее `docs/FARMING_AND_PARTY.md`.

## Ландшафт и смешанная растительность — 18.09.2026

- `terrain/pbr/meadow-albedo.png`, `badlands-albedo.png`, `elm-leaf.png`, `spruce-spray.png`: новые изображения, созданные встроенным imagegen для этого проекта, 1254×1254. Лист и хвойная ветка имеют настоящий alpha-канал. Промпты — `art/sources/botanical-prompts.json`. Это не сканированные PBR-наборы: у нарисованной луговой земли только приближённый микрорельеф в шейдере.
- `terrain/pbr/forrest_ground_01_*_2k.jpg`: Forest Ground 01, Rob Tuytel / Poly Haven, CC0, https://polyhaven.com/a/forrest_ground_01 . Согласованные diffuse, OpenGL normal, roughness и displacement, 2048×2048; ссылки и SHA-256 — `godot/assets/terrain/pbr/sources.json`.
- `elm_field`, `elm_slender`, `alder_round`, `pine_natural`, `shrub_hazel`, `shrub_wild`, `shrub_dry`: оригинальные модели, воспроизводимые через `tools/godot/build-botanical.py` в Blender. Кора использует прежнюю собственную текстуру проекта `generated/tex/bark.png` с цветовым множителем. Эти названия — художественные варианты, не ботаническая верификация пород.
- Существующие точки деревьев и серверные препятствия сохранены. В каждой природной зоне смешиваются разные силуэты; новые низкие декоративные кусты, травы и цветы не имеют коллизий. Подлесок зависит от пятен шума, уклона и расстояния до деревьев, исключает города/воду/препятствия.
- Подлесок ограничен 25 участками вокруг камеры, создаётся по одному участку за кадр, исчезает вдалеке. Импорт текстур с mipmaps; модели — с штатными Godot LOD. Производительность на Android/iOS ещё не проверялась.

## Нижнее Громовое ущелье — сканированные ресурсы

- **Coastal Cliff 02**, Rob Tuytel / Poly Haven — https://polyhaven.com/a/coastal_cliff_02, **CC0-1.0**. Исходный glTF 1K, сетка сокращена до 9999 треугольников перед добавлением нижнего края, открытая нижняя граница продлена в грунт. Форма нормализована для модульной расстановки; UV сохранены.
- **Fern 02**, Rob Tuytel (сканирование), Rico Cilliers (моделирование) / Poly Haven — https://polyhaven.com/a/fern_02, **CC0-1.0**. Первый куст набора инстансится в локальных участках; ветер и отсечение выполняет шейдер.
- **Rock Moss Set 01**, авторы указаны в `godot/assets/gorge/manifest.json`, Poly Haven — https://polyhaven.com/a/rock_moss_set_01, **CC0-1.0**. Второй валун набора, бюджет 2400 треугольников. Заменяет внешний вид камней нижнего яруса без переноса точек.
- **Rock Face**, **Mossy Rock**, **Dry Ground 01** / Poly Haven: https://polyhaven.com/a/rock_face, https://polyhaven.com/a/mossy_rock, https://polyhaven.com/a/dry_ground_01 — **CC0-1.0**. Девять исходных карт 1K diffuse / OpenGL normal / ARM из локального набора Poly Haven. ARM: красный — AO, зелёный — roughness, синий — metallic. Mipmaps и анизотропная фильтрация включены; цветовая корректировка только в шейдере.
- **Stream sounds / waterfall1.ogg**, **kurt** — https://opengameart.org/content/stream-sounds, **CC-BY-3.0**, https://creativecommons.org/licenses/by/3.0/ . Исходная запись не изменена; повтор, громкость и расстояние задаёт клиент. Атрибуция также в `godot/assets/audio/CREDITS.md`, SHA-256 архива и файла — в аудиоманифесте. Это исключение из прежнего полностью CC0-банка.

Файлы, источники, лицензии и SHA-256: `godot/assets/gorge/manifest.json`; связь с основным реестром — `godot/assets/manifest.json::environment.gorge`. Локальная подготовка: `tools/godot/prepare-gorge.py`. Встроенные картинки GLB Godot извлекает в соседние файлы: они включены в манифест и хранятся вместе с моделями. Чужие игровые ресурсы не используются.
