---
node_type: runbook
title: Выкладка на прод
service: server
status: active
updated: 2026-09-18
tags: [deploy, nginx, docker, ops]
links:
  documents: [deploy/deploy.sh, deploy/nginx-realms.conf, Dockerfile, docker-compose.yml]
  depends_on: [docs/gitmark/services/server/README.md]
  relates_to: [docs/gitmark/ops/native-build.md, docs/gitmark/plans/godot-migration.md]
---

# Runbook: выкладка на прод

Прод — https://realms.neuraldeep.ru. Адрес сервера живёт в переменной окружения
`DEPLOY_HOST=user@host` и **в репозиторий не коммитится**, как и `.env`.

```bash
DEPLOY_HOST=... bash deploy/deploy.sh
```

Актуальный конвейер: `deploy/deploy.sh` → `deploy/release.mjs` → `deploy/promote.sh`.

1. Native/server/сайт проверки и обе настольные сборки (`native:verify --headless --offline --release`). С `--verified` допускается готовый успешный отчёт; все хеши входов, результатов и набор файлов проверяются заново.
2. Готовые код, ZIP клиентов и страница скачивания загружаются в `/opt/realms/releases/<commit-time>/`; зависимости устанавливаются в staging.
3. На сервере собирается образ `realms-ws:<release>`; до успешной сборки живой мир не трогается. Снимается копия SQLite из тома (`VACUUM INTO`) и запоминается тег работающего образа — точка отката. Рабочая БД не приезжает с компьютера и не заменяется.
4. После старта проверяется локальное `hi.features.groundLoot:1`, `progression:1`, `nativeOnly:1`, затем внешний TLS из Godot. При сбое promotion код откатывается. Успешный результат записывается в `.native-run/deployment.json`.

`npm run native:verify -- --release` → `npm run deploy -- --verified` позволяет сначала проверить и собрать клиент, затем выпустить те же проверенные файлы. Подробности: [NATIVE_PIPELINE](docs/NATIVE_PIPELINE.md).

`deploy/quick.sh` отключён: завершается с ошибкой, ничего не собирает и не публикует. Единственный путь — native-конвейер.

## Что где на хосте

| | |
|---|---|
| статика | `/opt/realms/dist` |
| сервер | `/opt/realms/server`, запуск `node --no-warnings server/server.js` |
| база | том `realms-data`, внутри контейнера `/data/realms.db` |
| порт | 8790, публикуется только на `127.0.0.1` |
| служба | контейнер `realms-ws` (`docker compose`), `restart: unless-stopped`, пользователь `node` |

Мир работает в контейнере из [`Dockerfile`](Dockerfile) и [`docker-compose.yml`](docker-compose.yml):
образ `node:22.23.2-alpine`, процесс под непривилегированным `node`, `tini` доводит `SIGTERM`
до сервера, healthcheck ждёт кадр `hi`. Автозапуск после перезагрузки даёт `restart: unless-stopped`,
отдельный systemd-юнит больше не нужен. Ручные команды на хосте:

```bash
cd /opt/realms/releases/<release> && docker compose ps
docker compose logs -n 100 realms-ws
docker run --rm -v realms-data:/data -v /root/backup:/backup --entrypoint node node:22.23.2-alpine \
  --input-type=module -e "import{DatabaseSync}from'node:sqlite';const d=new DatabaseSync('/data/realms.db',{readOnly:true});d.exec(\"VACUUM INTO '/backup/world.db'\");d.close()"
```

[`deploy/nginx-realms.conf`](deploy/nginx-realms.conf): 80 → 443 с дыркой под ACME,
сертификаты certbot, корень `/opt/realms/dist`, `index.html` с `no-cache`, `/assets/` на 30 дней,
`location /ws` → `proxy_pass http://127.0.0.1:8790` с заголовками апгрейда,
`X-Forwarded-For $remote_addr` (**именно его читает лимит попыток входа**),
`proxy_read_timeout 3600s`, SPA-фолбэк на `index.html`.

## Важное

- **`DEV_CMD` в проде нет** — отладочная команда `dev` доступна только автотестам.
- Сервер сам пингует клиентов каждые 25 с, чтобы nginx не рвал простаивающие соединения.
- Профили игроков живут в SQLite в томе `realms-data` и rsync-ом **не трогаются** (`server/data` исключён).
- Том переживает пересборку образа и `docker compose down`; уничтожает его только `docker volume rm realms-data`.
  Удалять базу — значит обнулить прогресс всем.
- Сейв версии, отличной от `SAVE_VERSION`, молча пересоздаётся. Поднимая версию, считайте,
  что персонажи будут сброшены.

## Выпуск дропа 18.09.2026

Релиз `b9c7fe7dcbd8-20260918T074147720Z` обновил основной сервер и совместимый web-клиент. Внешняя проверка Godot подтвердила TLS и `groundLoot:1`. Сборки macOS/Windows подготовлены локально. Неподнятый дроп живёт до рестарта мира; поднятая награда сохранена в профиле.

## Текущий сайт

Браузерная игра закрыта. `site/` собирается через `tools/site/build.mjs` в `dist/`: страница скачивания, ZIP обеих платформ, SHA-256 и онлайн через анонимный кадр `hi`. `deploy` заменяет старые файлы с `--delete`. Обновлятора/публичной подписи клиентов пока нет. Полный контракт — [DISTRIBUTION.md](docs/DISTRIBUTION.md).

## Нативный выпуск 18.09.2026

Релиз `9cd55585de6f-20260918T083251064Z` заменил веб-игру страницей скачивания и обновил сервер SP/автолута/крафта. Внешний Godot probe подтвердил все новые feature-флаги; публичные ZIP и манифест проверены. SQLite сохранена на месте. Полная приёмка/ограничения — [CURRENT_TASKS](docs/CURRENT_TASKS.md).

## Выпуск связи и конвейера 18.09.2026

`6495562e6e12-20260918T093707232Z` / код `6495562`: heartbeat, исправление повторных входов, чат и перетаскивание. 13 локальных шагов успешны; Windows/macOS CI проверил упакованные приложения и TLS. Результаты, Git-порядок и границы готовности — `docs/CURRENT_TASKS.md`, `docs/GIT_WORKFLOW.md`. Публичный GitHub в этой итерации не менялся, полный код отправлен в приватный deep-chronicles.
