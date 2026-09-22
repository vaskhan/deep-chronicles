#!/usr/bin/env bash
# Runs remotely after a complete, verified release has been uploaded.
# Мир живёт в контейнере realms-ws, база — в томе realms-data, статику раздаёт nginx с хоста.
set -euo pipefail
release=${1:?release directory required}
case "$release" in /opt/realms/releases/*) ;; *) exit 2 ;; esac
cd /opt/realms
id=$(basename "$release")
backup="${release}/previous"
mkdir -p "$backup"

# Тег работающего образа — точка отката. При первом переезде его ещё нет.
previous=$(docker inspect --format '{{index .Config.Labels "realms.tag"}}' realms-ws 2>/dev/null || true)
echo "${previous}" > "$backup/image-tag"

# Бэкап SQLite снимается на этом хосте из тома; данные игроков с рабочей станции не приходят.
if docker volume inspect realms-data >/dev/null 2>&1; then
  docker run --rm -v realms-data:/data -v "$backup":/backup --entrypoint node node:22.23.2-alpine \
    --input-type=module -e "
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
if (fs.existsSync('/data/realms.db')) {
  const db = new DatabaseSync('/data/realms.db', { readOnly: true });
  db.exec(\"VACUUM INTO '/backup/world.db'\"); db.close();
}
"
fi

# Сборка нового образа до остановки живого мира: неудачная сборка ничего не трогает.
docker build --label "realms.tag=${id}" -t "realms-ws:${id}" "$release"

rollback() {
  trap - ERR
  echo 'Promotion failed; restoring previous container.' >&2
  local tag
  tag=$(cat "$backup/image-tag" 2>/dev/null || true)
  if [ -n "$tag" ]; then
    (cd "$release" && REALMS_TAG="$tag" docker compose up -d --no-build) || true
  fi
  exit 1
}
trap rollback ERR

# Статика сайта: новый dist встаёт только вместе с проверенным образом.
rsync -a --delete "$release/dist/" /opt/realms/dist/

cd "$release"
REALMS_TAG="${id}" docker compose up -d --no-build

# Мир обязан ответить приветствием, иначе откатываемся на прежний образ.
for attempt in $(seq 1 30); do
  state=$(docker inspect --format '{{.State.Health.Status}}' realms-ws 2>/dev/null || echo missing)
  [ "$state" = healthy ] && break
  [ "$attempt" = 30 ] && { echo "Container is not healthy: $state" >&2; false; }
  sleep 2
done

# Освобождаем место: оставляем текущий образ и пять предыдущих сборок.
docker image ls --format '{{.Repository}}:{{.Tag}} {{.CreatedAt}}' realms-ws \
  | sort -k2 -r | tail -n +7 | cut -d' ' -f1 | xargs -r docker image rm >/dev/null 2>&1 || true
echo "Promoted ${id}"
