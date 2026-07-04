FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npx prisma generate
RUN npm run build
# Compile the seed script to plain JS so we don't need ts-node at runtime
RUN npx tsc -p prisma/tsconfig.json

FROM node:20-alpine AS production
RUN apk add --no-cache curl openssl
# Run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=backend-builder /app/backend/node_modules ./node_modules
COPY --from=backend-builder /app/backend/prisma ./prisma
COPY --from=frontend-builder /app/frontend/dist ./public
COPY backend/package.json ./
COPY backend/tsconfig.json ./
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3001

# Disable Prisma's update check / telemetry so the CLI never tries to write to a
# cache dir at runtime (would fail or hang for the non-root user).
ENV CHECKPOINT_DISABLE=1
ENV PRISMA_HIDE_UPDATE_MESSAGE=1
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# exec replaces sh with node, making node PID 1 so SIGTERM is received properly.
# Seed runs as plain compiled JS (no ts-node); it self-handles errors and is idempotent.
CMD ["sh", "-c", "node node_modules/.bin/prisma migrate deploy && node prisma/dist/seed.js && exec node dist/index.js"]
