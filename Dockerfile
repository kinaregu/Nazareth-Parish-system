# ─────────────────────────────────────────────────────────────────────────────
# Nazareth Parish ChMS — production image
#
# Multi-stage build: install → build the Next.js app → minimal runtime image.
# The web app serves both the UI and the REST API (apps/web/app/api/v1/...).
# PostgreSQL is a separate service (see docker-compose.yml) or managed
# (Render / RDS / Supabase …) — point DATABASE_URL at it.
# ─────────────────────────────────────────────────────────────────────────────

FROM node:22-alpine AS deps
WORKDIR /app
# Install all workspace package manifests first for a cacheable layer.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
# Copy the built app (including workspace packages + node_modules).
COPY --from=build /app ./
# Writable locations for uploaded files + backups (mount a volume here).
RUN mkdir -p /data/files /data/backups
VOLUME ["/data"]
EXPOSE 3000

# Idempotent startup: apply any pending migrations, optionally seed demo data
# on first run (SEED_DEMO=true), then start the server. Migrations are
# tracked in schema_migrations, so this is safe to run on every deploy.
CMD ["sh", "-c", "npm run db:migrate && if [ \"$SEED_DEMO\" = \"true\" ]; then npm run db:seed; fi && exec npm run start"]
