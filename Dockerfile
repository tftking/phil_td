# Poker TD: one container serving the web client and the game server.
#   docker build -t pokertd .
#   docker run -p 8787:8787 -v pokertd-data:/data pokertd

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/sim/package.json packages/sim/
COPY packages/protocol/package.json packages/protocol/
COPY packages/bots/package.json packages/bots/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN pnpm install --frozen-lockfile
COPY packages packages
COPY apps apps
RUN pnpm --filter @pokertd/client build

FROM node:22-slim
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production \
    PORT=8787 \
    DATA_DIR=/data \
    STATIC_DIR=/app/apps/client/dist
# Production dependencies only; the client ships as the prebuilt static bundle.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/sim/package.json packages/sim/
COPY packages/protocol/package.json packages/protocol/
COPY packages/bots/package.json packages/bots/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN pnpm install --frozen-lockfile --prod --filter @pokertd/server... && pnpm store prune
COPY packages packages
COPY apps/server apps/server
COPY --from=build /app/apps/client/dist apps/client/dist
RUN mkdir -p /data && chown node:node /data
WORKDIR /app/apps/server
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--no-warnings=ExperimentalWarning", "--import", "tsx", "src/main.ts"]
