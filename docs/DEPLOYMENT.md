# Deployment

Two supported paths: **Render** (recommended, managed, free-tier-friendly) or
**Docker** anywhere (VPS / self-hosted). Both use the same image/environment.

---

## 1. Render (recommended)

### 1.1 Postgres
1. New → **PostgreSQL** → free plan is fine to start.
2. Note the *Internal Database URL* (e.g.
   `postgresql://user:pass@host:5432/db?sslmode=require`) — this is
   `DATABASE_URL`.

### 1.2 Web service
1. New → **Web Service** → connect this repo (branch `main`).
2. **Runtime: Docker** (the `Dockerfile` at the repo root is used
   automatically; build is `docker build`, start is the image `CMD`).
3. Environment variables (Service → Environment):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | the Postgres connection string (with `?sslmode=require`) |
   | `CSRF_SECRET` | `openssl rand -hex 32` (any 64-hex string) |
   | `APP_URL` | your service URL, e.g. `https://nazareth-chms.onrender.com` |
   | `NODE_ENV` | `production` (Render sets this) |
   | `SEED_DEMO` | `true` for the **first** deploy (loads the demo data + demo logins), then change to `false` |
   | `SESSION_IDLE_MINUTES` | `1440` (default) |
   | `SESSION_REMEMBER_DAYS` | `30` (default) |
   | `FILE_STORAGE_PATH` | `/data/files` |
   | `BACKUP_PATH` | `/data/backups` |
   | `MAIL_PROVIDER` | `console` (or `smtp` + `SMTP_*` vars when you have credentials) |

   > ⚠️ `SEED_DEMO=true` truncates and re-seeds. Use it once (or whenever you
   > want a factory-reset demo), then set it to `false` — every Render deploy
   > runs the image `CMD`, which migrates (idempotent) and seeds **only** when
   > `SEED_DEMO=true`.

4. **Disk** (Render → Disks): attach a small persistent disk at mount path
   `/data` so uploaded files and backups survive redeploys/restarts.
5. **Health check path:** `/api/v1/health` (200 JSON), interval 60 s.
6. Deploy. First boot: migrations apply → seed (if enabled) → `next start`.

### 1.3 Free-tier note
Render's free web service sleeps after ~15 min idle; the first request after
sleep takes ~30 s. For a parish production instance, the $7/mo starter plan
removes the sleep.

---

## 2. Docker (anywhere)

### 2.1 One-command local/staging stack
```bash
cp .env.example .env
# edit .env: CSRF_SECRET (openssl rand -hex 32), POSTGRES_PASSWORD, SEED_DEMO
docker compose up --build -d
# → http://localhost:3000  (db + one-shot migrate/seed + web)
```
Volumes: `pgdata` (Postgres), `appdata` (files + backups).

### 2.2 Bare VPS (systemd or docker run)
```bash
docker pull <your-registry>/nazareth-chms:latest
docker run -d --name chms \
  -p 3000:3000 -v chms-data:/data \
  -e DATABASE_URL="postgresql://user:pass@dbhost:5432/nazareth?sslmode=require" \
  -e CSRF_SECRET="$(openssl rand -hex 32)" \
  -e APP_URL="https://chms.yourdomain.org" \
  -e SEED_DEMO=false \
  nazareth-chms
```
Put nginx/Caddy in front for TLS, and point the origin at port 3000.

### 2.3 Image build (verified in CI)
```bash
docker build -t nazareth-chms .
```
The image is multi-stage (deps → build → minimal `node:22-alpine` runtime),
runs migrations idempotently on start, and serves both UI and API on `:3000`.

---

## 3. Environment reference

All variables (defaults in `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | — | **required** Postgres connection string |
| `CSRF_SECRET` | — | **required** HMAC key for CSRF double-submit tokens |
| `APP_URL` | `http://localhost:3000` | public base URL (emails/links) |
| `PORT` | `3000` | listen port |
| `SESSION_IDLE_MINUTES` | `1440` | sliding session idle expiry |
| `SESSION_REMEMBER_DAYS` | `30` | “remember me” lifetime |
| `DB_POOL_SIZE` | `10` | pg pool size |
| `MAIL_PROVIDER` | `console` | `console` \| `smtp` (+ `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM`) |
| `SMS_PROVIDER` | `log` | `log` (writes to `dev_outbox`) |
| `FILE_STORAGE_PATH` | `/data/files` (image) | upload directory |
| `FILE_MAX_SIZE_MB` | `8` | upload limit |
| `FILE_ALLOWED_MIMES` | png,jpeg,webp,pdf | upload allow-list |
| `BACKUP_PATH` | `/data/backups` | pg_dump destination |
| `BACKUP_RETENTION` | `7` | dumps kept |
| `BACKUP_HOUR` | `2` | nightly backup hour (manual trigger available at `POST /api/v1/backups`) |
| `SEED_DEMO` | `false` | `true` → truncate & load demo data (first-run / factory reset) |

Secrets live **only** in the environment — never in the repo.

---

## 4. Backups & restore

- `POST /api/v1/backups` (super admin) runs `pg_dump -Fc` into `BACKUP_PATH`,
  prunes to `BACKUP_RETENTION`, and records the dump in `backup_logs` + audit.
- Off-box strategy: cron `docker exec chms pg_dump … | s3cmd put`, or Render
  Postgres *automated daily backups* (preferred — the database itself is
  managed).
- Restore: `pg_restore -d nazareth --clean <dump>`, then redeploy (migrations
  are idempotent).

## 5. Observability

- Request logs: stdout (Render/Vercel/Docker log drivers).
- `/api/v1/health` → `{ status: 'ok', db: 'ok' }` (use for health checks).
- `audit_logs` table: every sensitive action with actor + IP (super admin UI
  at **Audit**).

## 6. Smoke test after a fresh deploy

1. `GET /api/v1/health` → 200.
2. Log in with a demo account (when `SEED_DEMO=true`; all passwords
   `Password123`):
   - `superadmin@nazarethparish.org` (Super Admin)
   - `pastor@nazarethparish.org` (Pastor)
   - `secretary@nazarethparish.org` (Administrator)
   - `finance@nazarethparish.org` (Finance)
   - `youth.leader@nazarethparish.org` / `worship.leader@…` (Ministry Leaders)
   - `cell.leader1@nazarethparish.org` / `cell.leader2@…` (Group Leaders)
   - `member@nazarethparish.org` (Member portal)
3. As finance: create + submit an expense → as super admin: approve → as
   finance: pay (status `paid`).
4. As super admin: Reports → export CSV/PDF/XLSX (each export shows in Audit).
5. As a group leader: try `/api/v1/members` → only your group’s members.

## 7. CI (GitHub Actions)

`.github/workflows/ci.yml` runs on every push/PR to `main`:

1. `npm ci`
2. Typecheck (`packages/core`, `apps/web`)
3. Postgres 16 service → migrate + seed the test DB
4. `vitest` (unit + schema + integration, incl. IDOR guards)
5. `next build` (production build)
6. On `main`: `docker build` (validates the Dockerfile; no push)

To publish images, add `docker/build-push-action` + registry secrets — the
Dockerfile is already CI-verified.
