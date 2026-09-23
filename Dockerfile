# Игровой сервер «Хроники Глубин»: только WS-мир и SQLite. Статику сайта
# раздаёт nginx с хоста, клиенты Godot собираются отдельно и в образ не входят.
FROM node:22.23.2-alpine

# Сигналы от docker stop должны доходить до node, иначе профили не успевают сохраниться.
RUN apk add --no-cache tini

WORKDIR /app
# Слой зависимостей отдельно от кода: правка правил не пересобирает npm ci.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY src ./src

# База живёт в томе и владельцем должен быть непривилегированный пользователь образа.
RUN mkdir -p /data && chown -R node:node /data /app
USER node

# Внутри контейнера слушаем все интерфейсы (по умолчанию сервер слушает только 127.0.0.1);
# X-Forwarded-For выставляет nginx хоста, другого пути к порту нет.
ENV PORT=8790 DB=/data/realms.db NODE_ENV=production HOST=0.0.0.0 TRUST_PROXY=1
EXPOSE 8790

# Сервер отвечает приветствием сразу после подключения — это и есть признак живого мира.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const{WebSocket}=require('ws');const w=new WebSocket('ws://127.0.0.1:'+process.env.PORT);const t=setTimeout(()=>process.exit(1),4000);w.on('message',()=>{clearTimeout(t);w.close();process.exit(0)});w.on('error',()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--no-warnings", "server/server.js"]
