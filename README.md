# Nazareth Parish Church — Church Management System (ChMS)

A production-grade, multi-branch **Church Management System** for Nazareth
Parish Church: members, families, visitors, attendance, ministries, groups,
events, announcements, pastoral care, prayer, giving, expenses, reports,
audit, and more — with a **Church Administration portal** and a **Member
portal**, built API-first (REST) so a future mobile app can use the same API.

> Deep-dive docs: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·
> [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

---

## Feature highlights

- **People** — full member profiles, status history, families, duplicate
  detection, CSV import, member-registration approval workflow, visitors with
  conversion (history preserved), global search.
- **Worship** — services, attendance sessions + bulk check-in, stats,
  automatic absence-threshold follow-ups (2 / 4 / 8 weeks).
- **Org** — branches, ministries, departments, groups/cells with leadership
  scoping.
- **Events** — calendar (month/week/day/list), registrations, capacity.
- **Communication** — targeted announcements (draft→scheduled→published→
  expired), templates, broadcast, per-user notifications + channel
  preferences (in-app now; email/SMS provider-agnostic).
- **Pastoral care** — cases + notes, prayer requests with visibility levels,
  generic follow-ups — strict permission boundaries.
- **Finance** — funds, tithes/offerings/donations/campaigns, anonymous giving,
  receipts, member own-giving view (opt-in), expense approval workflow
  (draft→submitted→approved/rejected→paid, submitter≠approver).
- **Reports & exports** — centralized report engine, saved filters, CSV /
  XLSX / PDF exports (every export audited).
- **Administration** — users, 8 roles × 51 permissions (checked in the
  backend, not just the UI), church settings, audit log, backups.
- **Security** — Argon2id, session + Bearer auth, CSRF double-submit, login
  throttling, parameterized SQL, IDOR-proof scope fragments, security
  headers, least-privilege data access.
- **Quality** — vitest unit + schema + integration tests (incl. IDOR guards),
  GitHub Actions CI, Docker image, real versioned migrations.

## Stack

Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS 3 ·
PostgreSQL 16 · `pg` · zod · vitest · Docker · GitHub Actions
(npm-workspaces monorepo, Node ≥ 20).

## Quick start (development)

Prereq: **Node 20+**. An embedded Postgres is started for you — no local
database needed.

```bash
npm install
npm run db:up        # starts embedded Postgres on :5432
npm run db:setup     # migrations + demo seed
npm run dev          # http://localhost:3000
```

Run the tests:

```bash
npm test             # core (unit + schema + integration) + web
```

### Demo logins (seeded; password `Password123` for all)

| Login | Role |
|---|---|
| `superadmin@nazarethparish.org` | Super Administrator |
| `pastor@nazarethparish.org` | Pastor |
| `secretary@nazarethparish.org` | Church Administrator |
| `finance@nazarethparish.org` | Finance Officer |
| `youth.leader@nazarethparish.org` | Ministry Leader (Youth) |
| `worship.leader@nazarethparish.org` | Ministry Leader (Worship) |
| `cell.leader1@nazarethparish.org` | Group Leader (Main Campus) |
| `cell.leader2@nazarethparish.org` | Group Leader (East Branch) |
| `member@nazarethparish.org` | Member (Member Portal) |

## Quick start (Docker)

```bash
cp .env.example .env   # set CSRF_SECRET (openssl rand -hex 32)
docker compose up --build -d
# → http://localhost:3000  (db + migrate/seed + web)
```

## Deploy

**Render (recommended)** or **Docker anywhere** — step-by-step in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). CI (GitHub Actions) typechecks,
tests against a real Postgres, runs the production build, and validates the
Dockerfile on every push/PR to `main`.

## Repository layout

```
apps/web/               UI + REST API (Next.js App Router)
packages/core/          domain services, RBAC scoping, reports, workflows
packages/db/            pg pool, migrations (SQL), seed, row types
packages/shared/        zod schemas, permission/role catalog, i18n
scripts/                embedded-postgres dev helper
docs/                   architecture + deployment guides
.github/workflows/      CI
Dockerfile, docker-compose.yml
```

## Notes & assumptions

- Branding uses a placeholder logo and a Nazarene palette (deep blue + warm
  gold) pending the official logo — see `docs/ARCHITECTURE.md §12`.
- Email/SMS run on console/log providers by default (visible in
  `dev_outbox`); SMTP/SMS credentials slot in via environment without code
  changes.
- All seeded rows are flagged `is_demo` for safe factory resets.
