# Multi-stage build. Stage 1 builds the web app and bundles the Save_API. Stage 2 is a small
# runtime image that serves the built web app and the API from one Node process.
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

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    WEB_DIR=/app/web
# The server bundle is self-contained except for a few native-free runtime deps.
COPY apps/server/package.json ./
RUN npm install --omit=dev --no-audit --no-fund fastify@5.12.8 @fastify/static@10.1.10
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/web/dist ./web
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
