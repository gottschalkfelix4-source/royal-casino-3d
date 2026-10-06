# Royal Casino 3D – Node.js-Server (API, WebSocket, statische Dateien).
# Das 3D-Rendering passiert im Browser der Besucher, der Container braucht keine GPU.
FROM node:24-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
# Optional trusted CA bundle for builds behind a corporate/cloud HTTPS proxy.
# The certificate stays in a BuildKit secret mount and never enters the image.
RUN --mount=type=secret,id=npm_ca_bundle \
    if [ -f /run/secrets/npm_ca_bundle ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca_bundle; fi; \
    npm ci --no-audit --no-fund
COPY scripts/build.js ./scripts/build.js
COPY public ./public
RUN npm run build

FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    CASINO_DATA_DIR=/data \
    CASINO_BOTS=3

COPY package.json package-lock.json ./
RUN --mount=type=secret,id=npm_ca_bundle \
    if [ -f /run/secrets/npm_ca_bundle ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca_bundle; fi; \
    npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY server ./server
COPY public ./public
COPY --from=frontend /app/public/build ./public/build

RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/api/auth/me > /dev/null || exit 1

CMD ["node", "server/index.js"]
