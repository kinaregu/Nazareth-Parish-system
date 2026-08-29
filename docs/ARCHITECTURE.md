# Nazareth Parish ChMS — Architecture

Church Management System (ChMS) for Nazareth Parish Church: a multi-branch,
multi-campus church administration platform with a **Church Administration**
portal and a **Member Portal**, API-first (REST) so a future mobile app can
consume the same API.

---

## 1. Tech stack

| Layer      | Choice | Why |
|------------|--------|-----|
| Frontend   | Next.js 14 (App Router) + React 18 + TypeScript + Tailwind CSS 3 | One codebase serves UI and API routes; server components for data, client components for interactivity |
| Backend    | Next.js Route Handlers (`apps/web/app/api/v1/**`) over a clean core (`packages/core`) | Zero extra process to host; the service layer is framework-agnostic and unit-testable |
| Domain     | `packages/core` — services, RBAC scoping, audit, reports, workflows | Pure TypeScript, no framework imports → testable with vitest |
| Data       | `packages/db` — `pg` pool, migration runner, DDL, seed, row types | Real migrations (versioned SQL, idempotent), no ORM abstraction over the relational model |
| Contracts  | `packages/shared` — zod schemas, permission catalog, role definitions, i18n | Single source of truth shared by client, API and tests |
| Database   | PostgreSQL 16 | Relational integrity: PK/FK, CHECK constraints, partial indexes, `deleted_at` soft delete, audit columns |
| Auth       | Argon2id password hashing, HTTP-only session cookies + Bearer tokens, CSRF double-submit, login throttling, T2FA-ready | Sessions stored server-side in `sessions` with idle + absolute expiry |
| Files      | Local disk store (`/data/files`) behind `files` API with MIME allow-list + size limit | Swappable to S3-compatible storage without touching callers |
| Reports    | CSV, XLSX (SheetJS), PDF (pdfkit) generated server-side, every export audited | |

Monorepo (npm workspaces, Node ≥ 20):

```
Nazareth-Parish-system/
├── apps/web/            Next.js app: UI pages + /api/v1 route handlers
├── packages/core/       domain services (members, attendance, giving, reports, RBAC…)
├── packages/db/         pg pool, migrations (SQL), seed data, row types
├── packages/shared/     zod schemas, permission/role catalog, i18n, utils
└── scripts/             dev-postgres helper (embedded-postgres for zero-setup dev)
```

---

## 2. Architecture overview

```
Browser (admin UI / member portal / future mobile app)
        │  HTTPS, JSON
        ▼
Next.js (apps/web)
 ├── middleware.ts ........ CSRF double-submit guard (non-GET API calls)
 ├── app/api/v1/** ........ route handlers: auth → rate limit → parse (zod)
 │                          → loadScope(user) → service call → JSON envelope
 └── app/** ............... server-rendered UI (role-aware nav, dashboards)
        │
        ▼
packages/core (services)  ── every query is built from an AccessScope:
  rbac/scope.ts ........... branch / ministry / group / member-level scoping
  *.Service.ts ............ business rules, state machines, audit()
        │
        ▼
packages/db (pg pool) ──► PostgreSQL 16
```

**Request pipeline (every `/api/v1` route):**

1. `getCtx(req)` — resolve session (Bearer header **or** `chms_session` cookie),
   load `AccessScope` (roles → permission set, branch scope, leadership scoping).
2. CSRF check — `middleware.ts` compares an HMAC'd double-submit cookie against
   the `X-CSRF-Token` header for all state-changing requests (skipped when a
   Bearer token is present, for the mobile app).
3. AuthZ — `requirePerm(ctx, '<domain>.<action>')` **at the route** (the UI also
   checks permissions, but the backend is the only authority).
4. Validate — zod schema from `packages/shared` (client + server use the same
   definitions).
5. Scope — the service builds SQL WHERE fragments from the `AccessScope`
   (`branchScopeWhere`, `groupScopeWhere`, `ministryScopeWhere`,
   `memberScopeWhere`). **There is no "find by id" without a scope** — this is
   the IDOR defense.
6. Act + audit — mutations call `audit()` which appends to `audit_logs`
   (who/what/when/where/ip) inside the same transaction where possible.

Response envelope: `{ "data": …, "meta": … }` or
`{ "error": { "code", "message" } }` with HTTP status semantics
(400 validation · 401 unauthenticated · 403 forbidden · 404 not found ·
409 state conflict · 422 workflow violation · 429 throttled).

---

## 3. Data model (ERD)

53 tables across nine domains. Conventions: `uuid` PKs, `org_id` on every
tenant table, FKs with sensible `ON DELETE`, `deleted_at` (soft delete) on
all entity tables, `created_at/updated_at` + `created_by/updated_by` audit
columns, CHECK constraints on enums/statuses, partial + composite indexes on
hot paths (search, per-branch lists, attendance lookups).

### 3.1 Identity & tenancy
```
organizations ──< branches ─< users ─┬─< user_roles >─ roles
              │                      ├─< sessions
              │                      ├─< password_reset_tokens
              │                      ├─< email_verification_tokens
              │                      └─< login_attempts (throttle window)
              └─< permissions >─ role_permissions
```

### 3.2 People
```
members ─┬─< member_status_changes (status history, reason, actor)
         ├─< member_relationships  (parent/child/spouse…)
         ├─< families ─< family_members
         ├─< ministry_members >─ ministries
         ├─< department_members >─ departments
         ├─< group_members >─ groups (cells)
         ├─< member_registrations (approval workflow → members + users)
         ├─< visitors ─< visitor_followups   (conversion keeps full history)
         └─< giving_transactions (opt-in "my giving" visibility)
visitors ───────────> converts_to: members.id  (history preserved, never deleted)
```

### 3.3 Worship & events
```
services ─< attendance_sessions ─< attendance_records ─> members
events ─< event_registrations ─> users/members
announcements (targeted: role/branch/department/ministry/group)
notifications ── per-user fan-out of published announcements & system events
notification_preferences (per user, per channel)
message_templates (subject/body, merge fields {{name}}, {{service}}…)
```

### 3.4 Pastoral care (strict permissions, separate domain)
```
pastoral_cases ─< pastoral_notes        (visibility: case team only)
prayer_requests (public/leader_only/private visibility)
followups (generic: any source — case, prayer, absence…) ─< followup_notes
attendance_records ── absence detection engine (2/4/8-week thresholds)
                        creates followups automatically
```

### 3.5 Finance
```
giving_funds ─< giving_transactions (tithe/offering/donation/campaign,
                    anonymous flag, receipt → financial_receipts)
expense_categories ─< expenses (draft → submitted → approved/rejected → paid;
                    submitted_by ≠ approved_by enforced, audit on each transition)
audit_logs, saved_report_filters, backup_logs
```

### 3.6 Platform
```
files (secure storage: kind, mime, size, owner, audit)
dev_outbox (console-mail / log-SMS providers capture here in dev)
integration_configs (future email/SMS provider keys)
schema_migrations (migration runner state)
```

Full DDL: [`packages/db/migrations/0001_init.sql`](../packages/db/migrations/0001_init.sql).

---

## 4. Roles & permissions matrix

8 system roles, 51 fine-grained permissions (`packages/shared/src/permissions.ts`
is the catalog; the DB mirrors it). `✓` = granted by default.

| Permission | super\_admin | pastor | admin | finance | ministry\_leader | group\_leader | member | visitor |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| members.view | ✓ | ✓ | ✓ | | ✓¹ | ✓¹ | self | |
| members.view_sensitive (DOB, contacts, finance) | ✓ | ✓ | ✓ | | | | self | |
| members.create / edit / delete / manage_status / import / export | ✓ | ✓ | ✓ | | | | | |
| families.\* (view/create/edit/delete) | ✓ | ✓ | ✓ | | | | | |
| visitors.\* + visitors.convert | ✓ | ✓ | ✓ | | ✓¹ | ✓¹ | | |
| attendance.view / manage / export | ✓ | ✓ | ✓ | | ✓¹ | ✓¹ | | |
| ministries.view / departments.view / groups.view | ✓ | ✓ | ✓ | | ✓¹ | ✓¹ | ✓ (join) | |
| ministries.manage / departments.manage / groups.manage | ✓ | | ✓ | | own only | own only | | |
| events.view / register | ✓ | ✓ | ✓ | | ✓¹ | ✓¹ | ✓ | ✓ |
| events.manage / manage_registrations | ✓ | ✓ | ✓ | | own only | own only | | |
| announcements.view / manage | ✓ | ✓ | ✓ | | ✓¹ | ✓¹ | ✓ | ✓ (public) |
| templates.manage | ✓ | | ✓ | | | | | |
| pastoral.view / manage | ✓ | ✓ | | | | | | |
| prayer.view / create / manage | ✓ | ✓ | | | ✓¹ | ✓¹ | create+own | |
| followups.\* | ✓ | ✓ | ✓ | | ✓¹ | ✓¹ | | |
| giving.view / create / export | ✓ | | | ✓ | | | own (opt-in) | |
| funds.manage | ✓ | | | ✓ | | | | |
| expenses.view / create / approve / export | ✓ | | | ✓ | | | | |
| finance.view (dashboards/reports) | ✓ | | | ✓ | | | | |
| reports.view | ✓ | ✓ | ✓ | ✓ | ✓¹ | ✓¹ | | |
| users.manage / roles.manage / settings.manage / audit.view / backups.manage | ✓ | | | | | | | |
| registrations.review | ✓ | ✓ | ✓ | | | | | |

¹ *Scoped* — ministry leaders see **their** ministries and their members; group
leaders see **their** groups. Scoping is enforced in SQL (see §5), not in the
UI.

**Separation of duties:** an expense's `submitted_by` can never approve it
(422 at the service layer). Approvals are additionally permission-gated
(`expenses.approve` ≠ `expenses.create` holders by default: finance creates,
super_admin approves — both configurations supported).

---

## 5. Access scoping (the IDOR barrier)

`loadScope(userId)` resolves one object per request:

```ts
{
  userId, orgId,
  branchIds: string[] | null,   // null = all branches (super/admin-global)
  roleCodes, permissions: Set<string>,
  ministryIds: string[],        // ministries the user leads
  groupIds: string[],           // groups the user leads
  memberIds: string[] | null,   // null = branch-wide visibility;
                                // array = exactly these members (leaders, members)
  isSuper, linkedMemberId
}
```

Every repository query appends a generated WHERE fragment:

- `branchScopeWhere(scope, 'alias.column')` — `AND <col> = ANY($n::uuid[])`
- `groupScopeWhere(scope, col, idCol)` — group leaders: `AND <id> = ANY($1)`,
  others: branch fragment
- `ministryScopeWhere(scope, col, idCol)` — same pattern for ministries
- `memberScopeWhere(scope)` — member-level restriction for people queries

Empty scopes use a **nil-UUID sentinel** inside `ANY(…)` so the fragment always
has the same shape (and matches nothing). Because fragments carry positional
parameters, every query that has its own leading params (e.g. `WHERE id = $1`)
shifts the fragment indices by +1 — covered by unit tests
(`packages/core/src/rbac/__tests__/scope.test.ts`).

Consequences (all covered by the API sweep + tests):
- A group leader requesting `/api/v1/members/<other-branch-member-id>` → **404**
  (not 403, so existence is not leaked).
- A finance officer is branch-scoped: creating an expense for another branch → **403**.
- Super admin (`branchIds = null`) gets an empty fragment — no accidental restriction.

---

## 6. API structure (REST, `/api/v1`)

Base: `/api/v1` · JSON · `Authorization: Bearer <token>` **or** session cookie ·
`X-CSRF-Token` for cookie-authenticated mutations · pagination `?page&pageSize`
(returns `meta: { total, page, pageSize, totalPages }`).

| Domain | Routes |
|---|---|
| Auth | `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` · `POST /auth/password` · `POST /auth/password/reset` (+`/request`) |
| Users & roles | `GET/POST /users` · `GET/PUT/DELETE /users/:id` · `PUT /users/:id/roles` · `GET /roles` · `GET /permissions` |
| Org | `GET /branches` · `GET /settings` · `PUT /settings` |
| Members | `GET/POST /members` · `GET/PUT/DELETE /members/:id` · `PUT /members/:id/status` · `GET /members/:id/timeline` · `GET /members/duplicates` · `POST /members/import` · `POST /members/export` |
| Registrations | `GET /registrations` · `GET /registrations/pending` · `POST /registrations/:id/review` (approve/reject) |
| Families | `GET/POST /families` · `GET/PUT/DELETE /families/:id` |
| Visitors | `GET/POST /visitors` · `GET/PUT/DELETE /visitors/:id` · `POST /visitors/:id/convert` · `GET /visitors/:id/followups` · `POST /visitors/:id/followups` |
| Attendance | `GET /attendance/services` · `GET/POST /attendance/sessions` · `POST /attendance/sessions/:id/records` (bulk check-in) · `GET /attendance/stats` |
| Ministries | `GET/POST /ministries` · `GET/PUT/DELETE /ministries/:id` · `PUT /ministries/:id/members` |
| Departments | same shape as ministries |
| Groups | `GET/POST /groups` · `GET/PUT/DELETE /groups/:id` · `PUT /groups/:id/members` |
| Events | `GET/POST /events` · `GET/PUT/DELETE /events/:id` · `GET /events/calendar` (month/week/day) · `POST /events/:id/register` · `GET /events/:id/registrations` · `PUT /events/:id/registrations/:rid` |
| Announcements | `GET/POST /announcements` · `GET/PUT/DELETE /announcements/:id` · `PUT /announcements/:id/publish` · `PUT /announcements/:id/schedule` |
| Communication | `GET/POST /templates` · `PUT /templates/:id` · `POST /broadcast` · `GET /notifications` · `PUT /notifications/read` · `GET/PUT /notification-prefs` |
| Pastoral | `GET/POST /pastoral/cases` · `GET /pastoral/cases/:id` · `PUT /pastoral/cases/:id` · `POST /pastoral/cases/:id/notes` · `GET/POST /pastoral/prayers` · `PUT /pastoral/prayers/:id` · `GET/POST /pastoral/followups` · `GET/PUT /pastoral/followups/:id` |
| Giving | `GET /funds` · `PUT /funds/:id` · `GET/POST /giving` · `GET /giving/:id` · `GET /giving/my` (opt-in) · `POST /giving/:id/receipt` |
| Expenses | `GET/POST /expenses` · `GET /expenses/:id` · `PUT /expenses/:id` · `POST /expenses/:id/submit` · `POST /expenses/:id/approve` · `POST /expenses/:id/reject` · `POST /expenses/:id/pay` · `GET /expenses/categories` |
| Reports | `GET /reports?keys=membership_summary,attendance_summary,…` · `GET /reports/filters` · `POST /reports/filters` · `DELETE /reports/filters/:id` |
| Exports | `GET /export/csv?report=` · `GET /export/xlsx?report=` · `GET /export/pdf?report=` (each audited) |
| Search | `GET /search?q=` (global: members, events, announcements, groups) |
| Files | `POST /files` (multipart) · `GET /files/:id` · `DELETE /files/:id` |
| Backups | `POST /backups` (pg_dump, retention-managed) · `GET /backups` |
| Audit | `GET /audit-logs` (super admin) |

---

## 7. Frontend route structure

```
/login                     (public; role-aware landing after auth)
/dashboard                 (role-customized: KPI cards + charts + quick actions)
/members  /members/:id     (profile, status history, timeline, duplicates, import)
/families  /visitors  /attendance
/ministries  /departments  /groups
/events  /events/:id  /calendar  (month/week/day/list)
/announcements  /templates  /notifications
/pastoral  /pastoral/cases/:id  /pastoral/prayers  /pastoral/followups
/giving  /funds  /expenses  /expenses/:id
/reports  /reports/saved
/audit  /backups  /settings  /users  /profile
/portal                      (member portal home)
/portal/profile  /portal/events  /portal/giving  /portal/prayers  /portal/announcements
```

Navigation is permission-filtered (menu items hidden without the permission),
but hiding is cosmetic — the API enforces the same matrix.

---

## 8. Security model

- **Passwords:** Argon2id (memory 19 MiB, 2 iterations, parallelism 1); no
  plaintext at rest, bcrypt/argon2 auto-detected on verify.
- **Sessions:** 128-bit random tokens, HTTP-only `SameSite=Lax` cookie +
  optional Bearer; idle expiry (24 h default) + absolute expiry; revocable
  (`logout`); `login_attempts` throttling (5 min window) + lockout.
- **CSRF:** HMAC double-submit cookie verified in middleware for cookie-auth
  mutations; Bearer auth exempt (mobile).
- **SQL injection:** 100% parameterized queries (no string-built values).
- **IDOR:** scope fragments on every read by id (§5).
- **XSS:** React escaping; no `dangerouslySetInnerHTML` with user data.
- **Headers:** `X-Content-Type-Options`, `X-Frame-Options DENY`,
  `Referrer-Policy`, CSP in `next.config` — hardened defaults.
- **Least privilege:** pastoral + financial data behind separate permission
  codes; `view_sensitive` gates DOB/contacts; anonymous giving supported.
- **Audit:** every mutation, login, export, role change, setting change →
  `audit_logs` (actor, action, entity, id, IP, metadata JSONB).
- **Secrets:** env-only; `.env` git-ignored; `.env.example` documents each key.

---

## 9. Workflows (state machines)

| Workflow | States / rules |
|---|---|
| Member registration | `pending → approved` (creates member + optional user + temp password) / `rejected` (reason recorded) |
| Visitor → member | `POST /visitors/:id/convert` — visitor is **kept** (`converted_to` link), full follow-up history preserved |
| Attendance absence | records feed a 2 / 4 / 8-week threshold engine → auto-creates followups (one per tier, no duplicates) |
| Expense approval | `draft → submitted → approved / rejected → paid`; submitter ≠ approver (SoD), each transition audited with actor + IP |
| Event lifecycle | `draft → published → (registration open) → completed/cancelled`; capacity + registration audit |
| Announcements | `draft → scheduled → published → expired`; targeting by role/branch/ministry/group; fan-out to `notifications` respecting per-user channel prefs |

---

## 10. Testing strategy

- **Unit (vitest):** RBAC scope fragments & index shifting, permission checks —
  no DB needed.
- **Schema contracts (vitest):** zod schemas (login, member, expense, pay) —
  shared by client & server, so both sides can't drift.
- **Integration (vitest + PostgreSQL):** migrations applied, seed invariants,
  and **IDOR guards** — scoped fragments provably return only in-scope rows.
- **API sweep (manual/CI-extendable):** every route × every role; asserts
  2xx/4xx (never 5xx) and correct 403s for cross-domain access.
- **Workflow scripts:** end-to-end expense lifecycle, registration review,
  exports (content-type + size checks) — see `docs/DEPLOYMENT.md §Smoke test`.

---

## 11. Development phases (how it was built / how to extend)

1. **Foundation** — repo, workspaces, pg pool, migration runner, DDL, seed
   framework, auth (login/sessions/CSRF/throttle), RBAC scoping, audit.
2. **People** — members (+status history, duplicates, import), families,
   visitors (+conversion), registrations workflow.
3. **Worship** — services/sessions/records, absence thresholds, ministries/
   departments/groups, events + calendar + registration.
4. **Communication** — announcements, templates, broadcast, notifications +
   preferences, follow-ups, global search.
5. **Pastoral** — cases, notes, prayers, visibility levels (strict perms).
6. **Finance** — funds, giving (+anonymous, receipts, my-giving), expenses
   workflow, financial reports, exports (CSV/XLSX/PDF, audited).
7. **Platform** — reports engine + saved filters, user/role management,
   settings, audit log, backups, files, dashboards, i18n scaffolding,
   hardening (headers, rate limits), docs + tests.
8. **Delivery** — Dockerfile, compose, GitHub Actions CI, deployment docs,
   production build verification.

---

## 12. Documented assumptions

1. **Logo/branding:** no logo file was supplied; a placeholder mark was
   generated and a Nazarene palette used (deep blue `#1e3a5f` primary, warm
   gold `#c9a227` accent, warm paper background). Swap
   `apps/web/app/logo.svg` + the Tailwind theme tokens when the real logo
   arrives.
2. **Currency/timezone:** default `SSP` / Africa/Juba per deployment context;
   both are settings-managed (i18n scaffolding in `packages/shared/i18n`).
3. **Email/SMS:** provider-agnostic; `console`/`log` providers write to
   `dev_outbox` in dev so the whole communication flow is demonstrable without
   credentials. SMTP/SMS keys slot into `integration_configs`.
4. **Hosting:** single container + managed PostgreSQL (Render recommended);
   file storage on a persistent volume.
5. **Scale target:** a parish of ~1k–5k members, tens of concurrent staff
   users — comfortably within one Postgres + one app instance.
6. **`visitor` role** exists as a *public account* level (register interest,
   public events); most visitors are tracked as records without accounts.
