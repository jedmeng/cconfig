# syntax=docker/dockerfile:1

FROM node:22-alpine AS web-build
ARG CCONFIG_BASE_PATH=/
WORKDIR /app/web
COPY web/package.json ./
RUN npm install
COPY web/ ./
ENV CCONFIG_BASE_PATH=${CCONFIG_BASE_PATH}
RUN npm run build

FROM node:22-alpine AS server-build
WORKDIR /app/server
COPY server/package.json ./
RUN npm install
COPY server/tsconfig.json ./
COPY server/data ./data
COPY server/src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app/server

ENV NODE_ENV=production \
    PORT=8787 \
    CCONFIG_DATA_DIR=/config \
    CCONFIG_CONFIG_DIR=/config \
    TRUST_PROXY=1

RUN apk add --no-cache tini su-exec \
  && addgroup -S cconfig && adduser -S cconfig -G cconfig \
  && chown -R cconfig:cconfig /app

COPY --from=server-build /app/server/package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=server-build /app/server/dist ./dist
COPY --from=server-build /app/server/data ./data
COPY --from=web-build /app/web/dist ../web/dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8787

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
