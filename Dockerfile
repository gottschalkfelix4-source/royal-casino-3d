# Royal Casino 3D – Node.js-Server (API, WebSocket, statische Dateien).
# Das 3D-Rendering passiert im Browser der Besucher, der Container braucht keine GPU.
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    CASINO_DATA_DIR=/data \
    CASINO_BOTS=3

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY public ./public

RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/api/auth/me > /dev/null || exit 1

CMD ["node", "server/index.js"]
