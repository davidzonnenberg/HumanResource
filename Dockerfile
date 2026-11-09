# Stage 1: build the web app and server
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/content/package.json packages/content/
COPY packages/sim/package.json packages/sim/
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/

RUN npm ci

COPY . .

RUN npm run build --workspace @hr/web \
 && npm run build --workspace @hr/server


# Stage 2: production runtime
FROM node:24-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    WEB_DIR=/app/web

# Install only the real registry-based runtime dependencies.
# @hr/shared is bundled into the server during Stage 1.
RUN npm init -y \
 && npm install --omit=dev --no-audit --no-fund \
      fastify@5.12.8 \
      @fastify/static@10.1.10 \
      zod@4.6.7

COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/web/dist ./web

RUN mkdir -p /data \
 && chown -R node:node /data /app

USER node

VOLUME ["/data"]

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]